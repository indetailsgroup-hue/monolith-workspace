// S17-5 check 2/6/7 support — typed shape validation for the two control files,
// hand-coded EXACTLY from the approved schema bundle (aggregate aed32029…f55):
//   docs/specs/schemas/packet-manifest.schema.json    (monolith.factory.packet@2.0)
//   docs/specs/schemas/packet-attestation.schema.json (monolith.factory.packet-attestation@1.0)
// additionalProperties:false everywhere → unknown keys are rejected.
// Stable-code mapping: unsupported schema/version consts → PKT_SCHEMA_UNSUPPORTED;
// manifest shape violations → PKT_SCHEMA_UNSUPPORTED (not conforming to the
// supported schema); attestation shape violations → PKT_ATTESTATION_INVALID (§13).

import type { JsonValue } from '../canonical/strictJson';
import type { PacketFailureCode } from '../codes';
import { validateCanonicalPath } from './canonicalPath';
import { isCanonicalTimestamp } from '../canonical/formats';

// --- common.schema.json $defs (transcribed verbatim) ---
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SHA256_ID = /^sha256:[0-9a-f]{64}$/;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP_MS_UTC =
  /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
const BUILD_COMMIT = /^[0-9a-f]{40}$/;
const SIGNATURE_B64 = /^[A-Za-z0-9+/]{85}[AQgw]==$/;

export interface ReleasedRevision { projectId: string; revisionId: string; state: 'RELEASED' }
export interface MachineProfileRef { id: string; version: string; sha256: string }
export interface ExporterRef {
  id: 'monolith.factory-exporter'; version: string; buildCommit: string; artifactSha256: string;
}
export interface ManifestFile {
  path: string;
  mediaType: 'application/json' | 'text/plain; charset=utf-8';
  contentSchema: string;
  sizeBytes: number;
  sha256: string;
}
export interface PacketManifest {
  schema: 'monolith.factory.packet@2.0';
  manifestVersion: '2.0.0';
  packetContentId: string;
  releasedRevision: ReleasedRevision;
  machineProfile: MachineProfileRef;
  exporter: ExporterRef;
  files: ManifestFile[];
}
export interface PacketAttestation {
  schema: 'monolith.factory.packet-attestation@1.0';
  jobRunId: string;
  packetContentId: string;
  manifestSha256: string;
  issuedAt: string;
  actorSubjectId: string;
  authorizationContextId: string;
  idempotencyFingerprint: string;
  releasedRevision: ReleasedRevision;
  machineProfile: MachineProfileRef;
  exporter: ExporterRef;
  packetSchema: 'monolith.factory.packet@2.0';
  gate: { result: 'PASS'; policyVersion: string; evidenceFile: 'gate-result.json'; evidenceSha256: string };
  signature: {
    protected: { algorithm: 'ECDSA_P256_SHA256'; keyId: string; registryVersion: string };
    valueBase64: string;
  };
}

export type ShapeResult<T> = { ok: true; value: T } | { ok: false; code: PacketFailureCode; detail: string };

type Obj = { [k: string]: JsonValue };

function isObj(v: JsonValue): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class ShapeError extends Error {
  /** codeOverride: a §13 stable code more specific than the wrapper default
   *  (e.g. PKT_SIGNATURE_MISSING — review 2026-07-18 F-06) */
  constructor(public readonly detail: string, public readonly codeOverride?: PacketFailureCode) { super(detail); }
}

function need(o: Obj, allowed: readonly string[], required: readonly string[], where: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) throw new ShapeError(`${where}: unknown key "${k}" (additionalProperties:false)`);
  }
  for (const k of required) {
    if (!(k in o)) throw new ShapeError(`${where}: missing required "${k}"`);
  }
}

function str(o: Obj, k: string, re: RegExp, where: string, maxLen = 128): string {
  const v = o[k];
  if (typeof v !== 'string') throw new ShapeError(`${where}.${k}: not a string`);
  if (v.length === 0 || v.length > maxLen) throw new ShapeError(`${where}.${k}: length out of range`);
  if (!re.test(v)) throw new ShapeError(`${where}.${k}: does not match required pattern`);
  return v;
}

function constStr<T extends string>(o: Obj, k: string, expected: T, where: string): T {
  if (o[k] !== expected) throw new ShapeError(`${where}.${k}: must be exactly "${expected}"`);
  return expected;
}

function releasedRevision(v: JsonValue, where: string): ReleasedRevision {
  if (!isObj(v)) throw new ShapeError(`${where}: not an object`);
  need(v, ['projectId', 'revisionId', 'state'], ['projectId', 'revisionId', 'state'], where);
  return {
    projectId: str(v, 'projectId', OPAQUE_ID, where),
    revisionId: str(v, 'revisionId', OPAQUE_ID, where),
    state: constStr(v, 'state', 'RELEASED', where),
  };
}

function machineProfile(v: JsonValue, where: string): MachineProfileRef {
  if (!isObj(v)) throw new ShapeError(`${where}: not an object`);
  need(v, ['id', 'version', 'sha256'], ['id', 'version', 'sha256'], where);
  return {
    id: str(v, 'id', OPAQUE_ID, where),
    version: str(v, 'version', SEMVER, where),
    sha256: str(v, 'sha256', SHA256_ID, where),
  };
}

function exporter(v: JsonValue, where: string): ExporterRef {
  if (!isObj(v)) throw new ShapeError(`${where}: not an object`);
  need(v, ['id', 'version', 'buildCommit', 'artifactSha256'], ['id', 'version', 'buildCommit', 'artifactSha256'], where);
  return {
    id: constStr(v, 'id', 'monolith.factory-exporter', where),
    version: str(v, 'version', SEMVER, where),
    buildCommit: str(v, 'buildCommit', BUILD_COMMIT, where, 40),
    artifactSha256: str(v, 'artifactSha256', SHA256_ID, where),
  };
}

function utf8Compare(a: string, b: string): number {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) if (ab[i] !== bb[i]) return ab[i] - bb[i];
  return ab.length - bb.length;
}

export function validateManifestShape(v: JsonValue): ShapeResult<PacketManifest> {
  try {
    if (!isObj(v)) throw new ShapeError('manifest: not an object');
    const allowed = ['schema', 'manifestVersion', 'packetContentId', 'releasedRevision', 'machineProfile', 'exporter', 'files'];
    need(v, allowed, allowed, 'manifest');
    constStr(v, 'schema', 'monolith.factory.packet@2.0', 'manifest');
    constStr(v, 'manifestVersion', '2.0.0', 'manifest');
    const files = v.files;
    if (!Array.isArray(files)) throw new ShapeError('manifest.files: not an array');
    if (files.length < 6 || files.length > 30) throw new ShapeError('manifest.files: length outside 6..30');
    const out: ManifestFile[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const where = `manifest.files[${i}]`;
      if (!isObj(f)) throw new ShapeError(`${where}: not an object`);
      const fk = ['path', 'mediaType', 'contentSchema', 'sizeBytes', 'sha256'];
      need(f, fk, fk, where);
      const path = f.path;
      if (typeof path !== 'string') throw new ShapeError(`${where}.path: not a string`);
      // full canonicalPath contract (common.schema.json, review 2026-07-18
      // F-02): NFC, forbidden characters, Windows reserved device names,
      // trailing dot/space — the SAME validator the ZIP layer uses.
      const pathVerdict = validateCanonicalPath(path);
      if (!pathVerdict.ok) throw new ShapeError(`${where}.path: ${pathVerdict.detail}`);
      if (path.includes('/')) {
        throw new ShapeError(`${where}.path: must be a root-level canonical name`);
      }
      const mediaType = f.mediaType;
      if (mediaType !== 'application/json' && mediaType !== 'text/plain; charset=utf-8') {
        throw new ShapeError(`${where}.mediaType: not in enum`);
      }
      const contentSchema = f.contentSchema;
      if (typeof contentSchema !== 'string' || contentSchema.length < 1 || contentSchema.length > 96) {
        throw new ShapeError(`${where}.contentSchema: invalid`);
      }
      const sizeBytes = f.sizeBytes;
      if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 16777216) {
        throw new ShapeError(`${where}.sizeBytes: invalid`);
      }
      const sha = f.sha256;
      if (typeof sha !== 'string' || !SHA256_HEX.test(sha)) throw new ShapeError(`${where}.sha256: invalid`);
      if (seen.has(path)) throw new ShapeError(`${where}.path: duplicate`);
      seen.add(path);
      if (i > 0 && utf8Compare(out[i - 1].path, path) >= 0) {
        throw new ShapeError('manifest.files: not in canonical UTF-8 byte order (x-monolith-orderBy)');
      }
      out.push({ path, mediaType, contentSchema, sizeBytes, sha256: sha });
    }
    return {
      ok: true,
      value: {
        schema: 'monolith.factory.packet@2.0',
        manifestVersion: '2.0.0',
        packetContentId: str(v, 'packetContentId', SHA256_ID, 'manifest'),
        releasedRevision: releasedRevision(v.releasedRevision, 'manifest.releasedRevision'),
        machineProfile: machineProfile(v.machineProfile, 'manifest.machineProfile'),
        exporter: exporter(v.exporter, 'manifest.exporter'),
        files: out,
      },
    };
  } catch (e) {
    if (e instanceof ShapeError) return { ok: false, code: 'PKT_SCHEMA_UNSUPPORTED', detail: e.detail };
    throw e;
  }
}

export function validateAttestationShape(v: JsonValue): ShapeResult<PacketAttestation> {
  try {
    if (!isObj(v)) throw new ShapeError('attestation: not an object');
    const allowed = [
      'schema', 'jobRunId', 'packetContentId', 'manifestSha256', 'issuedAt', 'actorSubjectId',
      'authorizationContextId', 'idempotencyFingerprint', 'releasedRevision', 'machineProfile',
      'exporter', 'packetSchema', 'gate', 'signature',
    ];
    need(v, allowed, allowed, 'attestation');
    // schema consts are version gates → PKT_SCHEMA_UNSUPPORTED on mismatch
    if (v.schema !== 'monolith.factory.packet-attestation@1.0' || v.packetSchema !== 'monolith.factory.packet@2.0') {
      return { ok: false, code: 'PKT_SCHEMA_UNSUPPORTED', detail: 'attestation schema/packetSchema version not supported' };
    }
    const gate = v.gate;
    if (!isObj(gate)) throw new ShapeError('attestation.gate: not an object');
    const gk = ['result', 'policyVersion', 'evidenceFile', 'evidenceSha256'];
    need(gate, gk, gk, 'attestation.gate');
    const sig = v.signature;
    if (!isObj(sig)) throw new ShapeError('attestation.signature: not an object');
    // §13 (review 2026-07-18 F-06): an otherwise well-formed signature object
    // that simply LACKS the value gets its own stable code — the absence of a
    // signature is a distinct condition from a malformed attestation.
    if (!('valueBase64' in sig)) {
      throw new ShapeError('attestation.signature.valueBase64: missing', 'PKT_SIGNATURE_MISSING');
    }
    need(sig, ['protected', 'valueBase64'], ['protected', 'valueBase64'], 'attestation.signature');
    const prot = sig.protected;
    if (!isObj(prot)) throw new ShapeError('attestation.signature.protected: not an object');
    const pk = ['algorithm', 'keyId', 'registryVersion'];
    need(prot, pk, pk, 'attestation.signature.protected');
    // §7.10 + review 2026-07-18 F-04: the regex shape alone admits impossible
    // calendar dates (2026-02-30) — require a real calendar instant.
    const issuedAt = str(v, 'issuedAt', TIMESTAMP_MS_UTC, 'attestation', 24);
    if (!isCanonicalTimestamp(issuedAt)) {
      throw new ShapeError('attestation.issuedAt: not a real calendar instant');
    }
    return {
      ok: true,
      value: {
        schema: 'monolith.factory.packet-attestation@1.0',
        jobRunId: str(v, 'jobRunId', UUID_V4, 'attestation', 36),
        packetContentId: str(v, 'packetContentId', SHA256_ID, 'attestation'),
        manifestSha256: str(v, 'manifestSha256', SHA256_ID, 'attestation'),
        issuedAt,
        actorSubjectId: str(v, 'actorSubjectId', OPAQUE_ID, 'attestation'),
        authorizationContextId: str(v, 'authorizationContextId', OPAQUE_ID, 'attestation'),
        idempotencyFingerprint: str(v, 'idempotencyFingerprint', SHA256_ID, 'attestation'),
        releasedRevision: releasedRevision(v.releasedRevision, 'attestation.releasedRevision'),
        machineProfile: machineProfile(v.machineProfile, 'attestation.machineProfile'),
        exporter: exporter(v.exporter, 'attestation.exporter'),
        packetSchema: 'monolith.factory.packet@2.0',
        gate: {
          result: constStr(gate, 'result', 'PASS', 'attestation.gate'),
          policyVersion: str(gate, 'policyVersion', SEMVER, 'attestation.gate'),
          evidenceFile: constStr(gate, 'evidenceFile', 'gate-result.json', 'attestation.gate'),
          evidenceSha256: str(gate, 'evidenceSha256', SHA256_ID, 'attestation.gate'),
        },
        signature: {
          protected: {
            algorithm: constStr(prot, 'algorithm', 'ECDSA_P256_SHA256', 'attestation.signature.protected'),
            keyId: str(prot, 'keyId', OPAQUE_ID, 'attestation.signature.protected'),
            registryVersion: str(prot, 'registryVersion', SEMVER, 'attestation.signature.protected'),
          },
          valueBase64: str(sig, 'valueBase64', SIGNATURE_B64, 'attestation.signature', 88),
        },
      },
    };
  } catch (e) {
    if (e instanceof ShapeError) {
      return { ok: false, code: e.codeOverride ?? 'PKT_ATTESTATION_INVALID', detail: e.detail };
    }
    throw e;
  }
}
