// S17-5 checks 9–11 (spec §12.9–§12.11) — authoritative state, run/replay,
// shadow policy. All authority comes from INJECTED interfaces (the verifier
// owns no state); every lookup failure is fail-closed PKT_AUTHORITY_UNAVAILABLE
// — never "warn and pass" (§12).

import type { PacketManifest, PacketAttestation } from '../shapes/shapes';
import type { CheckOutcome } from './identityChecks';
import { NFP_FILENAME_REGEX } from '../codes';
import { sha256Hex } from '../crypto/sha256';

// ---------------------------------------------------------------- check 9
export type Unavailable = 'unavailable';

export interface AuthorityLookups {
  /** Track A authoritative revision state (§8.1): affirmative state or failure. */
  revisionState(projectId: string, revisionId: string): Promise<'RELEASED' | 'NOT_RELEASED' | Unavailable>;
  /** Factory-Owner approved machine-profile registry: exact id+version+digest. */
  machineProfileAllowed(id: string, version: string, sha256: string): Promise<boolean | Unavailable>;
  /** Trusted build pipeline allowlist: exact build + artifact digest. */
  exporterAllowed(id: string, version: string, buildCommit: string, artifactSha256: string): Promise<boolean | Unavailable>;
  /** §10.2 anti-rollback: is this registryVersion >= the pinned minimum? */
  registryVersionCurrent(registryVersion: string): Promise<boolean | Unavailable>;
  /** Supported gate policy versions. */
  gatePolicySupported(policyVersion: string): Promise<boolean | Unavailable>;
}

export async function checkAuthoritative(
  manifest: PacketManifest,
  attestation: PacketAttestation,
  authority: AuthorityLookups,
): Promise<CheckOutcome> {
  const unavailable = (what: string): CheckOutcome => ({
    ok: false, code: 'PKT_AUTHORITY_UNAVAILABLE', detail: `${what} lookup failed (fail-closed)`,
  });

  const rev = await authority.revisionState(manifest.releasedRevision.projectId, manifest.releasedRevision.revisionId);
  if (rev === 'unavailable') return unavailable('revision');
  if (rev !== 'RELEASED') {
    return { ok: false, code: 'PKT_REVISION_NOT_RELEASED', detail: 'revision is not RELEASED per authoritative lookup' };
  }

  const mp = manifest.machineProfile;
  const profileOk = await authority.machineProfileAllowed(mp.id, mp.version, mp.sha256);
  if (profileOk === 'unavailable') return unavailable('machine profile');
  if (!profileOk) {
    return { ok: false, code: 'PKT_MACHINE_PROFILE_MISMATCH', detail: 'machine profile id/version/digest not allowlisted' };
  }

  const ex = manifest.exporter;
  const exporterOk = await authority.exporterAllowed(ex.id, ex.version, ex.buildCommit, ex.artifactSha256);
  if (exporterOk === 'unavailable') return unavailable('exporter');
  if (!exporterOk) {
    return { ok: false, code: 'PKT_EXPORTER_UNTRUSTED', detail: 'exporter build/artifact not allowlisted' };
  }

  const regOk = await authority.registryVersionCurrent(attestation.signature.protected.registryVersion);
  if (regOk === 'unavailable') return unavailable('trusted-key registry version');
  if (!regOk) {
    // §10.2 anti-rollback: a registry version below the pinned minimum can
    // never establish trust — the referenced key is unusable.
    return { ok: false, code: 'PKT_KEY_UNKNOWN', detail: 'registry version below pinned minimum (anti-rollback)' };
  }

  const gateOk = await authority.gatePolicySupported(attestation.gate.policyVersion);
  if (gateOk === 'unavailable') return unavailable('gate policy');
  if (!gateOk) {
    return { ok: false, code: 'PKT_GATE_FAILED', detail: 'gate policy version not supported' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- check 10
export interface RunRegistry {
  /** existing content binding for a jobRunId (one-to-one per §9.8), if any */
  bindingForRun(jobRunId: string): Promise<{ packetContentId: string } | null | Unavailable>;
  /** existing run binding for an idempotency fingerprint (§9.7), if any */
  bindingForFingerprint(fingerprint: string): Promise<{ jobRunId: string } | null | Unavailable>;
}

export async function checkRunReplay(
  attestation: PacketAttestation,
  runs: RunRegistry,
): Promise<CheckOutcome> {
  const run = await runs.bindingForRun(attestation.jobRunId);
  if (run === 'unavailable') {
    return { ok: false, code: 'PKT_AUTHORITY_UNAVAILABLE', detail: 'run registry lookup failed (fail-closed)' };
  }
  if (run !== null && run.packetContentId !== attestation.packetContentId) {
    return { ok: false, code: 'PKT_JOB_RUN_CONFLICT', detail: 'jobRunId is bound to a different packetContentId' };
  }
  const fp = await runs.bindingForFingerprint(attestation.idempotencyFingerprint);
  if (fp === 'unavailable') {
    return { ok: false, code: 'PKT_AUTHORITY_UNAVAILABLE', detail: 'fingerprint registry lookup failed (fail-closed)' };
  }
  if (fp !== null && fp.jobRunId !== attestation.jobRunId) {
    return { ok: false, code: 'PKT_IDEMPOTENCY_CONFLICT', detail: 'idempotency fingerprint bound to a different jobRunId' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- check 11
/** NFP marker byte contract — pinned by nfp-marker.schema.json (verified to
 *  match src/core/config/shadowMode NOT_FOR_PRODUCTION_NOTICE byte-for-byte). */
export const NFP_MARKER_SIZE_BYTES = 824;
export const NFP_MARKER_SHA256 = '40a4d63fccde43c92e2f9ca3a0284db61254cd5b03d5eac072f33b2dc507d68a';

/** §5 prose (normative): the NFP marker's manifest entry uses exactly this contentSchema. */
export const NFP_CONTENT_SCHEMA = 'monolith.factory.nfp-marker@1.0';

export interface GovernanceMode {
  /** v1: always true — flips only via governance config after the real-cut gate */
  shadowMode: boolean;
}

export async function checkShadowPolicy(
  sourceFilename: string,
  markerBytes: Uint8Array | undefined,
  manifest: PacketManifest,
  attestation: PacketAttestation,
  governance: GovernanceMode,
): Promise<CheckOutcome> {
  if (!governance.shadowMode) {
    // A production governance profile does not exist in this normative version;
    // an NFP-marked packet under non-shadow governance is a policy mismatch.
    return {
      ok: false, code: 'PKT_NFP_POLICY_MISMATCH',
      detail: 'non-shadow governance mode is not defined in this normative version',
    };
  }
  if (markerBytes === undefined) {
    return { ok: false, code: 'PKT_FILE_MISSING', detail: 'NFP marker bytes unavailable at shadow-policy check' };
  }
  // pinned byte contract (kills a generator that lies consistently in the manifest)
  if (markerBytes.length !== NFP_MARKER_SIZE_BYTES || (await sha256Hex(markerBytes)) !== NFP_MARKER_SHA256) {
    return {
      ok: false, code: 'PKT_NFP_POLICY_MISMATCH',
      detail: 'NFP marker bytes do not match the pinned nfp-marker@1.0 contract',
    };
  }
  // §5 prose is normative even where packet-manifest leaves contentSchema free:
  // the marker's manifest entry must be labelled monolith.factory.nfp-marker@1.0
  // (interop finding 2026-07-18 — machine-readable schema alone does not pin it)
  const markerEntry = manifest.files.find((f) => f.path === 'NOT_FOR_PRODUCTION.txt');
  if (markerEntry === undefined || markerEntry.contentSchema !== NFP_CONTENT_SCHEMA) {
    return {
      ok: false, code: 'PKT_NFP_POLICY_MISMATCH',
      detail: `NFP marker manifest entry must use contentSchema ${NFP_CONTENT_SCHEMA}`,
    };
  }
  // filename ↔ attestation consistency: NFP-factory-packet-<jobRunId>-<contentHex12>.zip
  const m = NFP_FILENAME_REGEX.exec(sourceFilename);
  if (m === null) {
    return { ok: false, code: 'PKT_FILENAME_INVALID', detail: 'source filename lost its NFP shape' };
  }
  const expected = `NFP-factory-packet-${attestation.jobRunId}-${attestation.packetContentId.slice('sha256:'.length, 'sha256:'.length + 12)}.zip`;
  if (sourceFilename !== expected) {
    return {
      ok: false, code: 'PKT_NFP_POLICY_MISMATCH',
      detail: 'source filename ids do not match the attested jobRunId/packetContentId',
    };
  }
  return { ok: true };
}
