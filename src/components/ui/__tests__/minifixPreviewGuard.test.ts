/**
 * minifixPreviewGuard.test.ts — Regression guards for PR#2 (Preview-only Transform)
 *
 * Ensures preview-only fields (flip, rotate, move) never leak into
 * manufacturing config or affect CNC drilling output.
 *
 * @see MinifixPreviewState, MINIFIX_PREVIEW_ONLY_KEYS, sanitizeManufacturingConfig()
 */

import { describe, it, expect } from 'vitest';
import {
  MINIFIX_PREVIEW_ONLY_KEYS,
  sanitizeManufacturingConfig,
  assertNoPreviewKeys,
  DEFAULT_PREVIEW_STATE,
  type MinifixFullConfig,
} from '../MinifixConfigPanel';
import { getMinifixFullConfigForThickness } from '@/core/manufacturing/hardware/minifixDefaults';

// ============================================================================
// Test 1: Copy Config excludes preview fields
// ============================================================================

describe('sanitizeManufacturingConfig (Copy Config guard)', () => {
  it('removes all preview keys from config', () => {
    // Create a config with NON-DEFAULT preview values
    const configWithPreview: MinifixFullConfig = {
      ...getMinifixFullConfigForThickness(18),
      flipVertical: true,
      flipHorizontal: true,
      rotationX: 45,
      rotationY: 90,
      rotationZ: 180,
      moveX: 10,
      moveY: -5,
      moveZ: 20,
    };

    const stripped = sanitizeManufacturingConfig(configWithPreview);

    // Assert: no preview keys remain
    for (const key of MINIFIX_PREVIEW_ONLY_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
  });

  it('preserves all manufacturing fields', () => {
    const base = getMinifixFullConfigForThickness(18);
    const configWithPreview: MinifixFullConfig = {
      ...base,
      flipVertical: true,
      rotationX: 45,
      moveZ: 20,
    };

    const stripped = sanitizeManufacturingConfig(configWithPreview);

    // Assert: critical manufacturing fields are unchanged
    expect(stripped.camDia).toBe(base.camDia);
    expect(stripped.camDepth).toBe(base.camDepth);
    expect(stripped.camHeight).toBe(base.camHeight);
    expect(stripped.sleeveDia).toBe(base.sleeveDia);
    expect(stripped.sleeveLength).toBe(base.sleeveLength);
    expect(stripped.shaftDia).toBe(base.shaftDia);
    expect(stripped.shaftLength).toBe(base.shaftLength);
    expect(stripped.dowelDia).toBe(base.dowelDia);
    expect(stripped.dowelLength).toBe(base.dowelLength);
    expect(stripped.dowelOffset).toBe(base.dowelOffset);
    expect(stripped.drillingDistanceB).toBe(base.drillingDistanceB);
    expect(stripped.woodThickness).toBe(base.woodThickness);
  });

  it('MINIFIX_PREVIEW_ONLY_KEYS matches MinifixPreviewState keys exactly', () => {
    // Guard: if someone adds a preview field to the interface but forgets MINIFIX_PREVIEW_ONLY_KEYS
    const previewStateKeys = Object.keys(DEFAULT_PREVIEW_STATE).sort();
    const registeredKeys = [...MINIFIX_PREVIEW_ONLY_KEYS].sort();

    expect(registeredKeys).toEqual(previewStateKeys);
  });
});

// ============================================================================
// Test 2: Manufacturing config unaffected by preview state
// ============================================================================

describe('Manufacturing config unaffected by preview state', () => {
  it('sanitizeManufacturingConfig produces identical output regardless of preview values', () => {
    const base = getMinifixFullConfigForThickness(18);

    // Config A: default preview state
    const configA: MinifixFullConfig = {
      ...base,
      ...DEFAULT_PREVIEW_STATE,
    };

    // Config B: wildly different preview state
    const configB: MinifixFullConfig = {
      ...base,
      flipVertical: true,
      flipHorizontal: true,
      rotationX: 999,
      rotationY: -45,
      rotationZ: 360,
      moveX: 100,
      moveY: -200,
      moveZ: 50,
    };

    const strippedA = sanitizeManufacturingConfig(configA);
    const strippedB = sanitizeManufacturingConfig(configB);

    // Manufacturing output must be byte-identical
    expect(JSON.stringify(strippedA)).toBe(JSON.stringify(strippedB));
  });

  it('works for all supported wood thicknesses', () => {
    const thicknesses = [12, 13, 15, 16, 18, 19, 22, 23, 26, 29];

    for (const thickness of thicknesses) {
      const base = getMinifixFullConfigForThickness(thickness);
      const withPreview: MinifixFullConfig = {
        ...base,
        flipVertical: true,
        rotationX: 90,
        moveZ: 50,
      };

      const stripped = sanitizeManufacturingConfig(withPreview);

      // No preview contamination
      expect(stripped).not.toHaveProperty('flipVertical');
      expect(stripped).not.toHaveProperty('rotationX');
      expect(stripped).not.toHaveProperty('moveZ');

      // Manufacturing values preserved
      expect(stripped.woodThickness).toBe(thickness);
      expect(stripped.camDia).toBe(15); // Minifix 15 standard
    }
  });
});

// ============================================================================
// Test 3: Serialized JSON string contains no preview keys
// ============================================================================

describe('Serialized JSON guard (anti-serialize-before-strip)', () => {
  it('JSON.stringify of sanitized config contains zero preview key names', () => {
    const config: MinifixFullConfig = {
      ...getMinifixFullConfigForThickness(18),
      flipVertical: true,
      flipHorizontal: true,
      rotationX: 999,
      rotationY: -45,
      rotationZ: 360,
      moveX: 100,
      moveY: -200,
      moveZ: 50,
    };

    const jsonString = JSON.stringify(sanitizeManufacturingConfig(config));

    // Verify at the STRING level — catches "serialize before strip" bugs
    for (const key of MINIFIX_PREVIEW_ONLY_KEYS) {
      expect(jsonString).not.toContain(`"${key}"`);
    }
  });

  it('JSON output matches copyConfig() pattern exactly', () => {
    const config: MinifixFullConfig = {
      ...getMinifixFullConfigForThickness(18),
      rotationX: 90,
      moveZ: 50,
    };

    // Simulate what copyConfig() does
    const configForExport = sanitizeManufacturingConfig(config);
    const clipboardContent = JSON.stringify(configForExport, null, 2);

    // Parse back and verify no preview contamination round-tripped
    const parsed = JSON.parse(clipboardContent);
    for (const key of MINIFIX_PREVIEW_ONLY_KEYS) {
      expect(parsed).not.toHaveProperty(key);
    }
  });
});

// ============================================================================
// Test 4: assertNoPreviewKeys runtime guard
// ============================================================================

describe('assertNoPreviewKeys (compiler boundary guard)', () => {
  it('does not throw for clean manufacturing config', () => {
    const clean = sanitizeManufacturingConfig(getMinifixFullConfigForThickness(18));
    expect(() => {
      assertNoPreviewKeys(clean as unknown as Record<string, unknown>, 'test');
    }).not.toThrow();
  });

  it('throws if preview key is present', () => {
    const leaked = {
      ...sanitizeManufacturingConfig(getMinifixFullConfigForThickness(18)),
      rotationX: 45,  // <-- leaked preview key
    } as unknown as Record<string, unknown>;

    expect(() => {
      assertNoPreviewKeys(leaked, 'test');
    }).toThrow(/Preview-only key "rotationX" leaked/);
  });
});
