import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NOT_FOR_PRODUCTION_SHA256,
  NOT_FOR_PRODUCTION_SIZE_BYTES,
  PAYLOAD_METADATA,
} from '../constants.js';
import {
  buildCanonicalPacketContentV2,
  computeIdempotencyFingerprint,
  generateFactoryPacketV2,
} from '../generator.js';
import {
  encodeDerSignature,
  GOLDEN_RUN,
  GOLDEN_SIGNING_IDENTITY,
  loadGoldenInput,
  SequenceSigner,
} from './fixtures.js';

const schemaRoot = new URL('../../../../../docs/specs/schemas/', import.meta.url);

function loadSchema(name: string): Record<string, any> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(name, schemaRoot)), 'utf8')) as Record<string, any>;
}

describe('S17-4 approved schema-bundle binding', () => {
  it('emits only the required closed manifest and payload top-level fields', () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const manifestSchema = loadSchema('packet-manifest.schema.json');
    expect(Object.keys(content.manifest).sort()).toEqual([...manifestSchema.required].sort());
    for (const file of content.fileEntries) {
      expect(Object.keys(file).sort()).toEqual(
        [...manifestSchema.properties.files.items.required].sort(),
      );
    }

    const schemaByPath: Record<string, string> = {
      'connector-ops.json': 'connector-ops.schema.json',
      'connectors.minifix.json': 'connectors-minifix.schema.json',
      'cutlist.json': 'cutlist.schema.json',
      'drillmap.json': 'drillmap.schema.json',
      'gate-result.json': 'gate-result.schema.json',
    };
    for (const [path, schemaName] of Object.entries(schemaByPath)) {
      const schema = loadSchema(schemaName);
      const payload = JSON.parse(new TextDecoder().decode(content.payloadBytes.get(path)!));
      expect(schema.additionalProperties, path).toBe(false);
      expect(Object.keys(payload).sort(), path).toEqual([...schema.required].sort());
      expect(payload.schema, path).toBe(PAYLOAD_METADATA[path as keyof typeof PAYLOAD_METADATA].contentSchema);
    }
  });

  it('emits the exact approved attestation signature encoding contract', async () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const fingerprint = computeIdempotencyFingerprint(
      { actorSubjectId: GOLDEN_RUN.actorSubjectId, authorizationContextId: GOLDEN_RUN.authorizationContextId },
      content,
    );
    const packet = await generateFactoryPacketV2(
      content,
      { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
      GOLDEN_SIGNING_IDENTITY,
      new SequenceSigner([encodeDerSignature(1n, 2n)]),
    );
    const schema = loadSchema('packet-attestation.schema.json');
    expect(Object.keys(packet.attestation).sort()).toEqual([...schema.required].sort());
    expect(packet.attestation.signature.protected.algorithm).toBe(
      schema.properties.signature.properties.protected.properties.algorithm.const,
    );
    const signatureSchema = schema.properties.signature.properties.valueBase64;
    expect(packet.attestation.signature.valueBase64).toMatch(new RegExp(signatureSchema.pattern));
    expect(signatureSchema['x-monolith-signatureEncoding']).toBe('IEEE_P1363_RAW_R_S_64_BYTES');
    expect(signatureSchema['x-monolith-requireLowS']).toBe(true);
    expect(signatureSchema['x-monolith-kmsSigningAlgorithm']).toBe('ECDSA_SHA_256');
  });

  it('pins the NFP byte contract to the approved schema', () => {
    const schema = loadSchema('nfp-marker.schema.json');
    expect(schema['x-monolith-exactSizeBytes']).toBe(NOT_FOR_PRODUCTION_SIZE_BYTES);
    expect(schema['x-monolith-sha256']).toBe(NOT_FOR_PRODUCTION_SHA256);
    expect(schema['x-monolith-lineEnding']).toBe('LF');
    expect(schema['x-monolith-trailingLf']).toBe(false);
  });
});
