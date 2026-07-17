// S17-5 Full Verifier — orchestrator (spec §12, all 12 checks, first-fail-wins)
//
// The primary result code comes from the FIRST failing check in ladder order;
// later diagnostics never replace or downgrade it (§12 tail). Success under
// shadow governance is exactly {VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY} — PKT_OK
// is unreachable by construction (absent from the code union).
//
// Check 12 (audit) always runs: every verification — pass or fail — appends an
// audit record via the injected sink without overwriting prior evidence.

import { readPacketZip, type ZipEntry } from './container/zipStrictReader';
import { parseCanonicalJson, parseCanonicalTextFile } from './canonical/canonical';
import {
  validateManifestShape, validateAttestationShape,
  type PacketManifest, type PacketAttestation,
} from './shapes/shapes';
import {
  checkExactFileSet, checkByteIntegrity, checkContentIdentity, checkManifestBinding,
  type CheckOutcome,
} from './checks/identityChecks';
import { checkIdentityConsistency } from './checks/consistencyCheck';
import { checkSignature, type TrustedKeyRegistry } from './checks/signatureCheck';
import {
  checkAuthoritative, checkRunReplay, checkShadowPolicy,
  type AuthorityLookups, type RunRegistry, type GovernanceMode,
} from './checks/policyChecks';
import {
  failure, shadowSuccess, NFP_FILENAME_REGEX,
  type VerifierResult, type CheckName,
} from './codes';
import type { JsonValue } from './canonical/strictJson';

/** aggregate digest of the approved schema bundle this verifier was built against */
export const SUPPORTED_SCHEMA_BUNDLE_AGGREGATE =
  'sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55';
export const VERIFIER_VERSION = '0.1.0';

export interface AuditRecord {
  verifierVersion: string;
  schemaBundleAggregate: string;
  timestamp: string;
  sourceFilename: string | null;
  integrityStatus: VerifierResult['integrityStatus'];
  operationalDisposition: VerifierResult['operationalDisposition'];
  code: VerifierResult['code'];
  failedCheck?: CheckName;
  packetContentId?: string;
  manifestSha256?: string;
  jobRunId?: string;
  registryVersion?: string;
  diagnostics: readonly string[];
}

export interface AuditSink {
  /** append-only: implementations MUST NOT overwrite prior records (§12.12) */
  append(record: AuditRecord): Promise<void>;
}

export interface VerifierDeps {
  keyRegistry: TrustedKeyRegistry;
  authority: AuthorityLookups;
  runRegistry: RunRegistry;
  governance: GovernanceMode;
  auditSink: AuditSink;
  /** injected clock (audit timestamps only — never part of any judgment) */
  now(): string;
}

export interface VerifyOutcome {
  result: VerifierResult;
  audit: AuditRecord;
}

interface ParsedControlFiles {
  manifestBytes: Uint8Array;
  manifestValue: JsonValue;
  manifest: PacketManifest;
  attestationValue: JsonValue;
  attestation: PacketAttestation;
}

function fail(code: Parameters<typeof failure>[0], check: CheckName, detail: string): VerifierResult {
  return failure(code, check, [detail]);
}

/** checks 2 — strict parse of both control files + every JSON payload + marker text */
function runStrictParse(entries: readonly ZipEntry[]): ParsedControlFiles | VerifierResult {
  const byName = new Map(entries.map((e) => [e.name, e.bytes] as const));
  const manifestBytes = byName.get('manifest.json') as Uint8Array; // presence = container rule r2
  const attestationBytes = byName.get('attestation.json') as Uint8Array;

  const manifestParsed = parseCanonicalJson(manifestBytes);
  if (!manifestParsed.ok) return fail(manifestParsed.code, 'strict_parse', `manifest.json: ${manifestParsed.detail}`);
  const manifestShape = validateManifestShape(manifestParsed.value);
  if (!manifestShape.ok) return fail(manifestShape.code, 'strict_parse', manifestShape.detail);

  const attParsed = parseCanonicalJson(attestationBytes);
  if (!attParsed.ok) return fail(attParsed.code, 'strict_parse', `attestation.json: ${attParsed.detail}`);
  const attShape = validateAttestationShape(attParsed.value);
  if (!attShape.ok) return fail(attShape.code, 'strict_parse', attShape.detail);

  // every JSON payload must be canonical bytes; text payloads must be LF/no-BOM (§7.1/§7.4)
  for (const f of manifestShape.value.files) {
    const bytes = byName.get(f.path);
    if (bytes === undefined) continue; // absence resolves at check 3 with its own code
    if (f.mediaType === 'application/json') {
      const p = parseCanonicalJson(bytes);
      if (!p.ok) return fail(p.code, 'strict_parse', `${f.path}: ${p.detail}`);
    } else {
      const t = parseCanonicalTextFile(bytes);
      if (!t.ok) return fail(t.code, 'strict_parse', `${f.path}: ${t.detail}`);
    }
  }

  return {
    manifestBytes,
    manifestValue: manifestParsed.value,
    manifest: manifestShape.value,
    attestationValue: attParsed.value,
    attestation: attShape.value,
  };
}

export async function verifyPacket(
  zip: Uint8Array,
  sourceFilename: string | null,
  deps: VerifierDeps,
): Promise<VerifyOutcome> {
  let packetContentId: string | undefined;
  let manifestSha256: string | undefined;
  let jobRunId: string | undefined;
  let registryVersion: string | undefined;

  const result = await (async (): Promise<VerifierResult> => {
    // ---- pre-parse: shadow source filename is a mandatory verifier input (§6) ----
    if (deps.governance.shadowMode) {
      if (sourceFilename === null) {
        return fail('PKT_FILENAME_INVALID', 'container_safety', 'source filename not provided (fail-closed in shadow mode)');
      }
      if (!NFP_FILENAME_REGEX.test(sourceFilename)) {
        return fail('PKT_FILENAME_INVALID', 'container_safety', 'source filename does not match the NFP shadow shape');
      }
    }

    // ---- check 1: container safety ----
    const zipRead = readPacketZip(zip);
    if (!zipRead.ok) return fail(zipRead.code, 'container_safety', zipRead.detail);
    const entries = zipRead.entries;

    // ---- check 2: strict parse ----
    const parsed = runStrictParse(entries);
    if ('integrityStatus' in parsed) return parsed;
    const { manifestBytes, manifestValue, manifest, attestationValue, attestation } = parsed;
    packetContentId = manifest.packetContentId;
    manifestSha256 = attestation.manifestSha256;
    jobRunId = attestation.jobRunId;
    registryVersion = attestation.signature.protected.registryVersion;

    // ---- check 3: exact file set ----
    const c3 = checkExactFileSet(entries, manifest, { shadowMode: deps.governance.shadowMode });
    if (!c3.ok) return fail(c3.code, 'exact_file_set', c3.detail);

    // ---- check 4: byte integrity ----
    const c4 = await checkByteIntegrity(entries, manifest);
    if (!c4.ok) return fail(c4.code, 'byte_integrity', c4.detail);

    // ---- check 5: content identity ----
    const c5 = await checkContentIdentity(manifestValue, manifest);
    if (!c5.ok) return fail(c5.code, 'content_identity', c5.detail);

    // ---- check 6: manifest binding ----
    const c6 = await checkManifestBinding(manifestBytes, manifest, attestation);
    if (!c6.ok) return fail(c6.code, 'manifest_binding', c6.detail);

    // ---- check 7: identity consistency ----
    const c7 = checkIdentityConsistency(manifest, attestation);
    if (!c7.ok) return fail(c7.code, 'identity_consistency', c7.detail);

    // ---- check 8: signature ----
    const c8 = await checkSignature(attestationValue, attestation, deps.keyRegistry);
    if (!c8.ok) return fail(c8.code, 'signature', c8.detail);

    // ---- check 9: authoritative state ----
    const c9 = await checkAuthoritative(manifest, attestation, deps.authority);
    if (!c9.ok) return fail(c9.code, 'authoritative', c9.detail);

    // ---- check 10: run / replay ----
    const c10 = await checkRunReplay(attestation, deps.runRegistry);
    if (!c10.ok) return fail(c10.code, 'run_replay', c10.detail);

    // ---- check 11: shadow policy ----
    const marker = entries.find((e) => e.name === 'NOT_FOR_PRODUCTION.txt')?.bytes;
    const c11 = await checkShadowPolicy(sourceFilename as string, marker, attestation, deps.governance);
    if (!c11.ok) return fail(c11.code, 'shadow_policy', c11.detail);

    return shadowSuccess();
  })();

  // ---- check 12: audit result — always, append-only ----
  const audit: AuditRecord = {
    verifierVersion: VERIFIER_VERSION,
    schemaBundleAggregate: SUPPORTED_SCHEMA_BUNDLE_AGGREGATE,
    timestamp: deps.now(),
    sourceFilename,
    integrityStatus: result.integrityStatus,
    operationalDisposition: result.operationalDisposition,
    code: result.code,
    failedCheck: result.failedCheck,
    packetContentId,
    manifestSha256,
    jobRunId,
    registryVersion,
    diagnostics: result.diagnostics,
  };
  await deps.auditSink.append(audit);
  return { result, audit };
}
