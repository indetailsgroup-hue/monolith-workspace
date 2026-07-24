/**
 * buildUnsignedPayloadV3.ts - Canonical unsigned FactoryPacket payload (design §8, §11.1)
 *
 * `PacketBuilderV3` (design §8): from an approved snapshot and its capability
 * report it produces the canonical unsigned payload - the exact set of declared
 * files plus a content binding. The unsigned manifest lists, for every file, its
 * POSIX path, byte length, SHA-256, media type, and artifact class, and carries
 * the `NOT_FOR_PRODUCTION` marker (design §8, §9). Construction is a pure,
 * deterministic function of the two inputs: no clock, locale, or randomness.
 *
 * The payload files are DERIVED from the trust inputs (the canonical snapshot and
 * capability report, plus a fixed marker), so the bytes are a pure function of
 * the release inputs exactly as §11.1 requires. `contentHash` binds the tenant
 * scope, candidate/profile/report hashes, and the sorted per-file digests; the
 * release certificate binds this same `contentHash`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import { computeSnapshotHash } from '../snapshot/buildReleaseSnapshot.js';
import type {
  ReleaseSnapshotV3,
  CapabilityReportV1,
  TenantScopeV1,
  Sha256Hex,
  ArtifactClass,
} from '../contracts/protocolV3.js';

export const CONTENT_DOMAIN = 'MONOLITH/FactoryPacketContent/V3';

/** Fixed, LF-only shadow marker. Never CRLF, so bytes are identical on Windows and POSIX. */
export const NOT_FOR_PRODUCTION_MARKER =
  'NOT_FOR_PRODUCTION\n' +
  'MONOLITH FactoryPacket V3 shadow artifact.\n' +
  'Not authorized for production, Factory delivery, or machine execution.\n';

/** One declared payload file: its manifest metadata plus its exact bytes. */
export interface UnsignedPacketFileV3 {
  path: string;
  mediaType: string;
  artifactClass: ArtifactClass;
  sha256: Sha256Hex;
  bytes: number;
  contentEncoding: 'utf8' | 'base64';
  content: string;
}

/** The canonical unsigned payload: the declared files plus the content binding. */
export interface UnsignedPacketV3 {
  schemaVersion: 'V3';
  notForProduction: true;
  tenantScope: TenantScopeV1;
  candidateHash: Sha256Hex;
  snapshotHash: Sha256Hex;
  machineProfileHash: Sha256Hex;
  capabilityReportHash: Sha256Hex;
  /** Declared files, sorted by POSIX path. */
  files: UnsignedPacketFileV3[];
  /** Binds tenant scope, candidate/profile/report hashes, and the sorted file digests. */
  contentHash: Sha256Hex;
}

/**
 * Normalize a capability report's SET-LIKE arrays so the canonical bytes are
 * independent of the caller's array order (PGB-1). The builder is the determinism
 * authority (design §11.1); it must not let input order leak into the packet even
 * when an upstream compiler happens to pre-sort.
 *
 * Sorted (set-like — order is not semantically significant):
 *   - `blockers`: a SET of capability findings, each identified by its content;
 *     sorted by the finding's own canonical JSON so a permutation cannot change bytes.
 *   - `checkedOperationIds`: the exhaustive SET of checked operation ids
 *     (present on a `CompiledCapabilityReportV1`); sorted by UTF-16 code unit.
 *
 * Returns a COPY; the input report is never mutated. `reportHash` is embedded as an
 * opaque field and is NOT recomputed here, so normalization only reorders the
 * declared set members, never their membership.
 */
export function normalizeCapabilityReportV1<T extends CapabilityReportV1>(report: T): T {
  const copy: Record<string, unknown> = { ...(report as Record<string, unknown>) };
  if (Array.isArray(copy.blockers)) {
    copy.blockers = [...(copy.blockers as unknown[])].sort((a, b) => {
      const ka = canonicalJson(a);
      const kb = canonicalJson(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }
  if (Array.isArray(copy.checkedOperationIds)) {
    copy.checkedOperationIds = [...(copy.checkedOperationIds as string[])].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
  }
  return copy as T;
}

function utf8File(
  path: string,
  mediaType: string,
  artifactClass: ArtifactClass,
  text: string,
): UnsignedPacketFileV3 {
  return {
    path,
    mediaType,
    artifactClass,
    sha256: sha256Hex(text),
    bytes: Buffer.byteLength(text, 'utf-8'),
    contentEncoding: 'utf8',
    content: text,
  };
}

/**
 * Build the canonical unsigned payload from an approved snapshot and its
 * capability report, or return a stable reason code. Fails closed if the snapshot
 * does not self-bind or the report is bound to a different machine profile.
 */
export function buildUnsignedPayloadV3(
  snapshot: ReleaseSnapshotV3,
  capabilityReport: CapabilityReportV1,
): TrustResult<UnsignedPacketV3> {
  // Integrity: the snapshot's own hash must bind its fields.
  if (computeSnapshotHash(snapshot) !== snapshot.snapshotHash) {
    return err('PACKET_HASH_MISMATCH', { reason: 'snapshotHash does not bind snapshot fields' });
  }
  // The capability report must be bound to the same machine profile as the snapshot.
  if (capabilityReport.machineProfileHash !== snapshot.machineProfileHash) {
    return err('CAP_PROFILE_MISMATCH', {
      reason: 'capability report machineProfileHash does not match snapshot',
    });
  }

  // PGB-3: fail closed. Only a PASS report may become a packet. A report carrying
  // any hard blocker is gated (GATE_HARD_BLOCKER); a report flagged unsupported
  // with no listed blockers still fails closed (CAP_UNSUPPORTED_OPERATION). The
  // wired worker path never reaches here with a non-PASS report (the compiler
  // fails closed upstream), but the exported builder must re-enforce the invariant.
  if (Array.isArray(capabilityReport.blockers) && capabilityReport.blockers.length > 0) {
    return err('GATE_HARD_BLOCKER', {
      reason: 'capability report carries hard blockers; not a PASS',
      blockerCount: String(capabilityReport.blockers.length),
    });
  }
  if (capabilityReport.supported !== true) {
    return err('CAP_UNSUPPORTED_OPERATION', {
      reason: 'capability report is not a PASS (supported !== true)',
    });
  }

  const files = [
    utf8File(
      'NOT_FOR_PRODUCTION.txt',
      'text/plain; charset=utf-8',
      'P1_REVIEW',
      NOT_FOR_PRODUCTION_MARKER,
    ),
    utf8File('payload/snapshot.json', 'application/json', 'P1_REVIEW', canonicalJson(snapshot)),
    utf8File(
      'payload/capability-report.json',
      'application/json',
      'P1_REVIEW',
      // PGB-1: normalize set-like arrays on a COPY before canonicalizing so the
      // embedded bytes are independent of the caller's array order. The snapshot is
      // intentionally NOT re-normalized here: its `contentRefs` are bound by
      // `snapshotHash` (verified above) and sorted by the snapshot builder;
      // re-sorting the embedded copy would desync snapshot.json from its own hash.
      canonicalJson(normalizeCapabilityReportV1(capabilityReport)),
    ),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const manifestFiles = files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes }));

  const contentHash = sha256Hex(
    canonicalJson({
      domain: CONTENT_DOMAIN,
      schemaVersion: 'V3',
      notForProduction: true,
      tenantScope: snapshot.tenantScope,
      candidateHash: snapshot.candidateHash,
      snapshotHash: snapshot.snapshotHash,
      machineProfileHash: snapshot.machineProfileHash,
      capabilityReportHash: capabilityReport.reportHash,
      files: manifestFiles,
    }),
  );

  return ok({
    schemaVersion: 'V3',
    notForProduction: true,
    tenantScope: snapshot.tenantScope,
    candidateHash: snapshot.candidateHash,
    snapshotHash: snapshot.snapshotHash,
    machineProfileHash: snapshot.machineProfileHash,
    capabilityReportHash: capabilityReport.reportHash,
    files,
    contentHash,
  });
}
