import { describe, expect, it } from 'vitest';
import {
  asJsonValue,
  decimalMillimetresToMicrometres,
  jcs,
  jcsBytes,
  sha256Id,
} from '../canonical.js';
import {
  NOT_FOR_PRODUCTION_SHA256,
  NOT_FOR_PRODUCTION_SIZE_BYTES,
} from '../constants.js';
import { buildCanonicalPacketContentV2 } from '../generator.js';
import { loadGoldenInput } from './fixtures.js';

describe('S17-4 canonical content', () => {
  it('implements JCS key ordering and rejects non-I-JSON numeric values', () => {
    expect(jcs(asJsonValue({ z: 1, a: { y: true, x: 'ไทย' } }))).toBe(
      '{"a":{"x":"ไทย","y":true},"z":1}',
    );
    expect(() => jcs(Number.NaN as never)).toThrow(/not finite/);
    expect(() => jcs(-0 as never)).toThrow(/negative zero/);
    expect(() => jcs(Number.MAX_SAFE_INTEGER + 1 as never)).toThrow(/unsafe integer/);
  });

  it('converts decimal millimetres to integer micrometres exactly', () => {
    expect(decimalMillimetresToMicrometres('1.234')).toBe(1234);
    expect(decimalMillimetresToMicrometres('18')).toBe(18000);
    expect(decimalMillimetresToMicrometres('-0.001')).toBe(-1);
    expect(() => decimalMillimetresToMicrometres('1.2345')).toThrow(/invalid syntax/);
    expect(() => decimalMillimetresToMicrometres('1e3')).toThrow(/invalid syntax/);
    expect(() => decimalMillimetresToMicrometres('01.2')).toThrow(/invalid syntax/);
    expect(() => decimalMillimetresToMicrometres('-0.000')).toThrow(/negative zero/);
  });

  it('sorts every schema-owned array before JCS and is stable across input order', () => {
    const firstInput = loadGoldenInput();
    const secondInput = structuredClone(firstInput);
    secondInput.payloads.cutlist.parts.reverse();
    secondInput.payloads.drillmap.panels[0].points.reverse();
    secondInput.payloads.connectorOps.operations.reverse();
    secondInput.payloads.connectorOps.operations[0].tags.reverse();
    secondInput.payloads.gateResult.findings.reverse();
    secondInput.machineProfile.parameters.supportedFaces.reverse();

    const first = buildCanonicalPacketContentV2(firstInput);
    const second = buildCanonicalPacketContentV2(secondInput);

    expect(Buffer.from(first.manifestBytes)).toEqual(Buffer.from(second.manifestBytes));
    expect(first.packetContentId).toBe(second.packetContentId);
    for (const [path, bytes] of first.payloadBytes) {
      expect(Buffer.from(bytes), path).toEqual(Buffer.from(second.payloadBytes.get(path)!));
    }
  });

  it('computes packetContentId from the full path-aware descriptor only', () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const { packetContentId: omitted, ...descriptor } = content.manifest;
    expect(omitted).toBe(content.packetContentId);
    expect(sha256Id(jcsBytes(asJsonValue(descriptor)))).toBe(content.packetContentId);
    expect(content.manifest).not.toHaveProperty('createdAt');
    expect(content.manifest).not.toHaveProperty('jobRunId');

    const changed = loadGoldenInput();
    changed.payloads.cutlist.parts[0].materialId = 'plywood-18';
    expect(buildCanonicalPacketContentV2(changed).packetContentId).not.toBe(content.packetContentId);
  });

  it('always embeds the exact approved NFP marker as a manifest-listed payload', () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const marker = content.payloadBytes.get('NOT_FOR_PRODUCTION.txt')!;
    const entry = content.fileEntries.find((file) => file.path === 'NOT_FOR_PRODUCTION.txt')!;
    expect(marker.byteLength).toBe(NOT_FOR_PRODUCTION_SIZE_BYTES);
    expect(entry.sha256).toBe(NOT_FOR_PRODUCTION_SHA256);
    expect(entry.sizeBytes).toBe(NOT_FOR_PRODUCTION_SIZE_BYTES);
    expect(entry.contentSchema).toBe('monolith.factory.nfp-marker@1.0');
    expect(Buffer.from(marker).includes(Buffer.from('\r'))).toBe(false);
    expect(marker[marker.length - 1]).not.toBe(0x0a);
  });

  it('rejects unknown fields, duplicate canonical keys, non-RELEASED state, and unsafe dimensions', () => {
    const unknown = loadGoldenInput() as unknown as Record<string, unknown>;
    unknown.clientJobRunId = 'attacker';
    expect(() => buildCanonicalPacketContentV2(unknown as never)).toThrow(/unknown fields/);

    const duplicate = loadGoldenInput();
    duplicate.payloads.connectorOps.operations[0].tags = ['bolt', 'bolt'];
    expect(() => buildCanonicalPacketContentV2(duplicate)).toThrow(/duplicate bolt/);

    const draft = loadGoldenInput();
    (draft.releasedRevision as { state: string }).state = 'DRAFT';
    expect(() => buildCanonicalPacketContentV2(draft)).toThrow(/must equal RELEASED/);

    const fractional = loadGoldenInput();
    fractional.payloads.cutlist.parts[0].finishWidthUm = 600000.5;
    expect(() => buildCanonicalPacketContentV2(fractional)).toThrow(/safe integer/);
  });
});
