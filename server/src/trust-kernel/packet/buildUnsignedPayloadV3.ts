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
      canonicalJson(capabilityReport),
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
