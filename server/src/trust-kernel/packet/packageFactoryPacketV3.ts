/**
 * packageFactoryPacketV3.ts - Deterministic final packet assembly (design §10.2, §11.1)
 *
 * The last builder stage: given the canonical unsigned payload and the persisted
 * release certificate, assemble the final FactoryPacket V3 bytes. Per the release
 * choreography the final content is "unsigned payload plus persisted certificate
 * only" (design §10.2 step 6): the payload files, a `manifest.json` describing
 * them, and `release-certificate.json`, packaged with the fixed store-only ZIP
 * profile. The bytes are a pure function of `(unsigned, certificate)` - identical
 * inputs give an identical packet and SHA-256 (design §11.1).
 *
 * The certificate is bound to THIS payload: its `contentHash` must equal the
 * unsigned payload's `contentHash`, else assembly fails closed. `expectedPacketHash`
 * is a Task-8 worker field computed over the FINAL bytes AFTER assembly (§10.2
 * step 6); it is carried verbatim and is deliberately NOT re-derived or verified
 * here (doing so would be circular - the certificate is inside the packet).
 *
 * Phase: NOT_FOR_PRODUCTION. Async only to match the port shape; the work is pure.
 *
 * @version 0.13.2
 */

import { canonicalJson } from '../canonical/canonicalJson.js';
import type {
  ReleaseCertificateV1,
  FactoryPacketManifestV3,
  PacketFileEntryV3,
} from '../contracts/protocolV3.js';
import type { UnsignedPacketV3, UnsignedPacketFileV3 } from './buildUnsignedPayloadV3.js';
import { buildFixedZip, ZipProfileError, type ZipEntry } from './fixedZipProfile.js';

export const MANIFEST_PATH = 'manifest.json';
export const CERTIFICATE_PATH = 'release-certificate.json';

/**
 * The exact file allowlist for a FactoryPacket V3: the three declared payload
 * files plus the manifest and certificate envelope. `buildFixedZip` rejects any
 * entry outside this set (builder all-or-nothing, design §12).
 */
export const FACTORY_PACKET_V3_ALLOWLIST = [
  'NOT_FOR_PRODUCTION.txt',
  'manifest.json',
  'payload/capability-report.json',
  'payload/snapshot.json',
  'release-certificate.json',
] as const;

/**
 * Build the embedded `FactoryPacketManifestV3` from the unsigned payload and the
 * authority-issued release revision id. `contentHash` is the payload's content
 * hash (what the certificate binds); the manifest describes the payload files
 * only (not the manifest or certificate envelope).
 */
export function buildFactoryManifestV3(
  unsigned: UnsignedPacketV3,
  releaseRevisionId: string,
): FactoryPacketManifestV3 {
  const files: PacketFileEntryV3[] = unsigned.files
    .map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    schemaVersion: 'V3',
    tenantScope: unsigned.tenantScope,
    releaseRevisionId,
    candidateHash: unsigned.candidateHash,
    files,
    contentHash: unsigned.contentHash,
  };
}

function decodeFile(file: UnsignedPacketFileV3): Uint8Array {
  const encoding = file.contentEncoding === 'base64' ? 'base64' : 'utf-8';
  return new Uint8Array(Buffer.from(file.content, encoding));
}

/**
 * Assemble the final FactoryPacket V3 bytes. Deterministic and pure; async only
 * to match the port shape used downstream.
 */
export async function packageFactoryPacketV3(
  unsigned: UnsignedPacketV3,
  certificate: ReleaseCertificateV1,
): Promise<Uint8Array> {
  // The persisted certificate must be bound to THIS canonical content.
  if (certificate.contentHash !== unsigned.contentHash) {
    throw new ZipProfileError(
      'PACKET_HASH_MISMATCH',
      'certificate.contentHash does not match unsigned payload contentHash',
    );
  }

  const manifest = buildFactoryManifestV3(unsigned, certificate.releaseRevisionId);
  const manifestBytes = new Uint8Array(Buffer.from(canonicalJson(manifest), 'utf-8'));
  const certificateBytes = new Uint8Array(Buffer.from(canonicalJson(certificate), 'utf-8'));

  const entries: ZipEntry[] = [
    { path: MANIFEST_PATH, bytes: manifestBytes },
    { path: CERTIFICATE_PATH, bytes: certificateBytes },
    ...unsigned.files.map((f) => ({ path: f.path, bytes: decodeFile(f) })),
  ];

  return buildFixedZip(entries, FACTORY_PACKET_V3_ALLOWLIST);
}
