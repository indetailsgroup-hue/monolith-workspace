// S17-5 test fixture — a fully coherent shadow-mode packet built from the spec
// alone (§6 layout, §7 canonical bytes, §8.2 content-id recipe). Independent
// verifier-track tooling: NEVER derived from S17-4 generator output (SoD).

import { jcsSerialize } from '../canonical/jcs';
import { sha256Hex } from '../crypto/sha256';
import type { JsonValue } from '../canonical/strictJson';
import type { ZipEntry } from '../container/zipStrictReader';
import { validateManifestShape, validateAttestationShape, type PacketManifest, type PacketAttestation } from '../shapes/shapes';

const te = new TextEncoder();

export interface PacketFixture {
  entries: ZipEntry[];
  manifestBytes: Uint8Array;
  manifestValue: JsonValue;
  manifest: PacketManifest;
  attestationBytes: Uint8Array;
  attestation: PacketAttestation;
}

/** canonical payload contents (JCS-canonical JSON + LF text marker) */
function payloadBytes(): Map<string, { bytes: Uint8Array; mediaType: 'application/json' | 'text/plain; charset=utf-8'; contentSchema: string }> {
  const m = new Map<string, { bytes: Uint8Array; mediaType: 'application/json' | 'text/plain; charset=utf-8'; contentSchema: string }>();
  m.set('NOT_FOR_PRODUCTION.txt', {
    bytes: te.encode('NOT FOR PRODUCTION\nshadow mode packet\n'),
    mediaType: 'text/plain; charset=utf-8',
    contentSchema: 'monolith.nfp-marker@1.0',
  });
  const json = (v: JsonValue) => te.encode(jcsSerialize(v));
  m.set('connector-ops.json', { bytes: json({ ops: [] }), mediaType: 'application/json', contentSchema: 'monolith.connector-ops@2.0' });
  m.set('connectors.minifix.json', { bytes: json({ connectors: [] }), mediaType: 'application/json', contentSchema: 'monolith.connectors-minifix@2.0' });
  m.set('cutlist.json', { bytes: json({ parts: [] }), mediaType: 'application/json', contentSchema: 'monolith.cutlist@2.0' });
  m.set('drillmap.json', { bytes: json({ holes: [] }), mediaType: 'application/json', contentSchema: 'monolith.drillmap@2.0' });
  m.set('gate-result.json', { bytes: json({ result: 'PASS' }), mediaType: 'application/json', contentSchema: 'monolith.gate-result@2.0' });
  return m;
}

/** canonical UTF-8 byte order for payload paths */
const PAYLOAD_ORDER = [
  'NOT_FOR_PRODUCTION.txt',
  'connector-ops.json',
  'connectors.minifix.json',
  'cutlist.json',
  'drillmap.json',
  'gate-result.json',
] as const;

export async function makePacketFixture(): Promise<PacketFixture> {
  const payloads = payloadBytes();

  const files = [] as { path: string; mediaType: string; contentSchema: string; sizeBytes: number; sha256: string }[];
  for (const path of PAYLOAD_ORDER) {
    const p = payloads.get(path) as NonNullable<ReturnType<typeof payloads.get>>;
    files.push({
      path,
      mediaType: p.mediaType,
      contentSchema: p.contentSchema,
      sizeBytes: p.bytes.length,
      sha256: await sha256Hex(p.bytes),
    });
  }

  const descriptor: { [k: string]: JsonValue } = {
    schema: 'monolith.factory.packet@2.0',
    manifestVersion: '2.0.0',
    releasedRevision: { projectId: 'proj-001', revisionId: 'rev-001', state: 'RELEASED' },
    machineProfile: { id: 'kdt_mvp_v1', version: '1.0.0', sha256: 'sha256:' + 'a'.repeat(64) },
    exporter: {
      id: 'monolith.factory-exporter',
      version: '2.0.0',
      buildCommit: 'b'.repeat(40),
      artifactSha256: 'sha256:' + 'c'.repeat(64),
    },
    files: files as unknown as JsonValue,
  };
  // §8.2: contentDescriptor omits only packetContentId
  const packetContentId = 'sha256:' + (await sha256Hex(te.encode(jcsSerialize(descriptor))));
  const manifestValue: JsonValue = { ...descriptor, packetContentId };
  const manifestBytes = te.encode(jcsSerialize(manifestValue));

  const gateBytes = (payloads.get('gate-result.json') as NonNullable<ReturnType<typeof payloads.get>>).bytes;
  const attestationValue: JsonValue = {
    schema: 'monolith.factory.packet-attestation@1.0',
    jobRunId: '123e4567-e89b-42d3-a456-426614174000',
    packetContentId,
    manifestSha256: 'sha256:' + (await sha256Hex(manifestBytes)),
    issuedAt: '2026-07-17T12:00:00.000Z',
    actorSubjectId: 'actor-001',
    authorizationContextId: 'authz-001',
    idempotencyFingerprint: 'sha256:' + 'd'.repeat(64),
    releasedRevision: { projectId: 'proj-001', revisionId: 'rev-001', state: 'RELEASED' },
    machineProfile: { id: 'kdt_mvp_v1', version: '1.0.0', sha256: 'sha256:' + 'a'.repeat(64) },
    exporter: {
      id: 'monolith.factory-exporter',
      version: '2.0.0',
      buildCommit: 'b'.repeat(40),
      artifactSha256: 'sha256:' + 'c'.repeat(64),
    },
    packetSchema: 'monolith.factory.packet@2.0',
    gate: {
      result: 'PASS',
      policyVersion: '1.0.0',
      evidenceFile: 'gate-result.json',
      evidenceSha256: 'sha256:' + (await sha256Hex(gateBytes)),
    },
    signature: {
      protected: { algorithm: 'ECDSA_P256_SHA256', keyId: 'key-001', registryVersion: '1.0.0' },
      valueBase64: 'A'.repeat(85) + 'Q==',
    },
  };
  const attestationBytes = te.encode(jcsSerialize(attestationValue));

  const mShape = validateManifestShape(manifestValue);
  if (!mShape.ok) throw new Error('fixture manifest failed shape: ' + mShape.detail);
  const aShape = validateAttestationShape(attestationValue);
  if (!aShape.ok) throw new Error('fixture attestation failed shape: ' + aShape.detail);

  const entries: ZipEntry[] = [
    { name: 'manifest.json', bytes: manifestBytes },
    ...PAYLOAD_ORDER.map((path) => ({
      name: path,
      bytes: (payloads.get(path) as NonNullable<ReturnType<typeof payloads.get>>).bytes,
    })),
    { name: 'attestation.json', bytes: attestationBytes },
  ];

  return {
    entries,
    manifestBytes,
    manifestValue,
    manifest: mShape.value,
    attestationBytes,
    attestation: aShape.value,
  };
}
