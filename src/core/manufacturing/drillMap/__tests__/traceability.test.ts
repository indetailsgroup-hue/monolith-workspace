/**
 * traceability.test.ts — Tests for DrillMap audit hashing and metadata
 *
 * Ensures:
 * 1. stableStringify is key-order invariant (deterministic)
 * 2. sha256HexSync produces correct 64-char hex and is deterministic
 * 3. Meta hashes change when config changes (sensitivity)
 * 4. Meta hashes are stable across calls with same inputs (ignoring timestamps)
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  stableStringify,
  sha256HexSync,
  buildDrillMapMeta,
} from '../traceability';

// ============================================================================
// 1. stableStringify — key-order invariance
// ============================================================================

describe('stableStringify', () => {
  it('produces identical output regardless of key insertion order', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    const objC = { m: 3, z: 1, a: 2 };

    const strA = stableStringify(objA);
    const strB = stableStringify(objB);
    const strC = stableStringify(objC);

    expect(strA).toBe(strB);
    expect(strB).toBe(strC);
    // Keys must be sorted alphabetically
    expect(strA).toBe('{"a":2,"m":3,"z":1}');
  });

  it('handles nested objects with sorted keys', () => {
    const obj = { b: { z: 1, a: 2 }, a: 3 };
    const result = stableStringify(obj);

    expect(result).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it('handles arrays (preserves order)', () => {
    const obj = { items: [3, 1, 2] };
    expect(stableStringify(obj)).toBe('{"items":[3,1,2]}');
  });

  it('handles null, boolean, string, number primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(42)).toBe('42');
  });

  it('handles empty object and empty array', () => {
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify([])).toBe('[]');
  });
});

// ============================================================================
// 2. sha256HexSync — correctness and determinism
// ============================================================================

describe('sha256HexSync', () => {
  it('produces a 64-character hex string', () => {
    const hash = sha256HexSync('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches known SHA-256 test vector', () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256HexSync('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );

    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(sha256HexSync('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('is deterministic (same input → same output)', () => {
    const input = stableStringify({ camDia: 15, woodThickness: 18 });
    const hash1 = sha256HexSync(input);
    const hash2 = sha256HexSync(input);

    expect(hash1).toBe(hash2);
  });

  it('differs for different inputs', () => {
    const hashA = sha256HexSync(stableStringify({ camDia: 15 }));
    const hashB = sha256HexSync(stableStringify({ camDia: 12 }));

    expect(hashA).not.toBe(hashB);
  });
});

// ============================================================================
// 3. buildDrillMapMeta — hash sensitivity
// ============================================================================

describe('buildDrillMapMeta', () => {
  const baseConfig = {
    camDia: 15,
    camDepth: 13.5,
    woodThickness: 18,
    drillingDistanceB: 24,
  };

  const baseParams = {
    firstHoleZ: 37,
    drillingDistanceB: 24,
  };

  it('produces meta with valid hash lengths', () => {
    const meta = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: baseConfig,
      fullParams: baseParams,
      connectorCount: 2,
    });

    expect(meta.inputs.configHash).toHaveLength(64);
    expect(meta.inputs.paramsHash).toHaveLength(64);
    expect(meta.inputs.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.inputs.paramsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.generator.name).toBe('generateMinifixDrillMap');
    expect(meta.inputs.connectorCount).toBe(2);
  });

  it('config hash changes when config field changes', () => {
    const metaA = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: { ...baseConfig, camDia: 15 },
      fullParams: baseParams,
    });
    const metaB = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: { ...baseConfig, camDia: 12 },
      fullParams: baseParams,
    });

    expect(metaA.inputs.configHash).not.toBe(metaB.inputs.configHash);
    // params hash unchanged
    expect(metaA.inputs.paramsHash).toBe(metaB.inputs.paramsHash);
  });

  it('params hash changes when params field changes', () => {
    const metaA = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: baseConfig,
      fullParams: { ...baseParams, firstHoleZ: 37 },
    });
    const metaB = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: baseConfig,
      fullParams: { ...baseParams, firstHoleZ: 40 },
    });

    expect(metaA.inputs.paramsHash).not.toBe(metaB.inputs.paramsHash);
    // config hash unchanged
    expect(metaA.inputs.configHash).toBe(metaB.inputs.configHash);
  });
});

// ============================================================================
// 4. buildDrillMapMeta — hash stability (same inputs → same hashes)
// ============================================================================

describe('buildDrillMapMeta stability', () => {
  it('produces identical hashes across calls with same inputs', () => {
    const args = {
      generatorName: 'generateMinifixDrillMap',
      fullConfig: { camDia: 15, camDepth: 13.5, woodThickness: 18 },
      fullParams: { firstHoleZ: 37, drillingDistanceB: 24 },
      connectorCount: 2,
    };

    const meta1 = buildDrillMapMeta(args);
    const meta2 = buildDrillMapMeta(args);

    // Hashes must be stable (timestamps may differ but are NOT in hash)
    expect(meta1.inputs.configHash).toBe(meta2.inputs.configHash);
    expect(meta1.inputs.paramsHash).toBe(meta2.inputs.paramsHash);
  });

  it('key insertion order does not affect hash', () => {
    const configA = { z: 1, a: 2, m: 3, camDia: 15 };
    const configB = { camDia: 15, a: 2, z: 1, m: 3 };

    const metaA = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: configA,
      fullParams: { firstHoleZ: 37 },
    });
    const metaB = buildDrillMapMeta({
      generatorName: 'generateMinifixDrillMap',
      fullConfig: configB,
      fullParams: { firstHoleZ: 37 },
    });

    expect(metaA.inputs.configHash).toBe(metaB.inputs.configHash);
  });
});
