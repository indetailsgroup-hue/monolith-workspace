/**
 * minifixPreviewGuard.test.ts — Regression guards for PR#2 (Preview-only Transform)
 *
 * Ensures preview-only fields (flip, rotate, move) never leak into
 * manufacturing config or affect CNC drilling output.
 *
 * @see MinifixPreviewState, PREVIEW_KEYS, stripPreviewFields() in MinifixConfigPanel.tsx
 */

import { describe, it, expect } from 'vitest';
import {
  PREVIEW_KEYS,
  stripPreviewFields,
  DEFAULT_PREVIEW_STATE,
  type MinifixPreviewState,
  type MinifixFullConfig,
} from '../MinifixConfigPanel';
import { getMinifixFullConfigForThickness } from '@/core/manufacturing/hardware/minifixDefaults';

// ============================================================================
// Test 1: Copy Config excludes preview fields
// ============================================================================

describe('stripPreviewFields (Copy Config guard)', () => {
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

    const stripped = stripPreviewFields(configWithPreview);

    // Assert: no preview keys remain
    for (const key of PREVIEW_KEYS) {
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

    const stripped = stripPreviewFields(configWithPreview);

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

  it('PREVIEW_KEYS matches MinifixPreviewState keys exactly', () => {
    // Guard: if someone adds a preview field to the interface but forgets PREVIEW_KEYS
    const previewStateKeys = Object.keys(DEFAULT_PREVIEW_STATE).sort();
    const registeredKeys = [...PREVIEW_KEYS].sort();

    expect(registeredKeys).toEqual(previewStateKeys);
  });
});

// ============================================================================
// Test 2: Manufacturing config unaffected by preview state
// ============================================================================

describe('Manufacturing config unaffected by preview state', () => {
  it('stripPreviewFields produces identical output regardless of preview values', () => {
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

    const strippedA = stripPreviewFields(configA);
    const strippedB = stripPreviewFields(configB);

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

      const stripped = stripPreviewFields(withPreview);

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
