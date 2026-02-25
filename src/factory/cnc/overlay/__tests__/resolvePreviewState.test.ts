/**
 * resolvePreviewState.test.ts - Per-Connector Preview State Resolution
 *
 * Tests the resolution chain defined in HARDWARE_PREVIEW_KEYS.md:
 *   1. hardwareOverrides[pairKeyV2]?.previewState  (v2 content-addressed)
 *   2. hardwareOverrides[pairId]?.previewState      (v1 legacy fallback)
 *   3. globalConfig (cabinet.hardware.minifixConfig) (global)
 *   4. null  (identity / no-op)
 *
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { resolvePreviewState, isIdentityPreview } from '../resolvePreviewState';
import type { HardwarePointOverrides } from '../../../../core/types/Cabinet';

// ============================================================================
// Fixtures
// ============================================================================

function createOverrides(entries: Record<string, { flipVertical?: boolean; flipHorizontal?: boolean }>): HardwarePointOverrides {
  const result: HardwarePointOverrides = {};
  for (const [key, val] of Object.entries(entries)) {
    result[key] = {
      previewState: {
        flipVertical: val.flipVertical,
        flipHorizontal: val.flipHorizontal,
      },
    };
  }
  return result;
}

const GLOBAL_CONFIG = {
  flipVertical: false,
  flipHorizontal: true,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 10,
};

// ============================================================================
// Test 1: Resolver precedence (v1 — pairId only, pairKeyV2 = undefined)
// ============================================================================

describe('resolvePreviewState - precedence (v1)', () => {
  it('returns per-connector override when pairId matches', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true, flipHorizontal: false },
    });

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, GLOBAL_CONFIG);

    // Per-connector override wins over global
    expect(result).not.toBeNull();
    expect(result!.flipVertical).toBe(true);
    expect(result!.flipHorizontal).toBe(false);
  });

  it('falls back to global when pairId has no override', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
    });

    const result = resolvePreviewState(undefined, 'pair-BOTTOM_LEFT-0', overrides, GLOBAL_CONFIG);

    // No override for this pairId → global wins
    expect(result).not.toBeNull();
    expect(result!.flipHorizontal).toBe(true);
    expect(result!.rotationZ).toBe(10);
  });

  it('falls back to global when pairId is undefined', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
    });

    const result = resolvePreviewState(undefined, undefined, overrides, GLOBAL_CONFIG);

    expect(result).not.toBeNull();
    expect(result!.flipHorizontal).toBe(true);
  });

  it('returns null when no override and no global config', () => {
    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', undefined, null);

    expect(result).toBeNull();
  });

  it('returns null when all inputs are undefined/null', () => {
    const result = resolvePreviewState(undefined, undefined, undefined, null);

    expect(result).toBeNull();
  });
});

// ============================================================================
// Test 2: Group consistency — same pairId → same state
// ============================================================================

describe('resolvePreviewState - group consistency', () => {
  it('CAM and BOLT with same pairId get identical preview state', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
    });

    // CAM point has pointId = "cam_lock-TOP_LEFT-0" but pairId = "pair-TOP_LEFT-0"
    const camResult = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, GLOBAL_CONFIG);

    // BOLT point has pointId = "bolt-TOP_LEFT-0" but pairId = "pair-TOP_LEFT-0"
    const boltResult = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, GLOBAL_CONFIG);

    expect(camResult).toEqual(boltResult);
    expect(camResult!.flipVertical).toBe(true);
  });

  it('different pairIds get different states', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
      'pair-TOP_LEFT-1': { flipVertical: false },
    });

    const result0 = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, null);
    const result1 = resolvePreviewState(undefined, 'pair-TOP_LEFT-1', overrides, null);

    expect(result0!.flipVertical).toBe(true);
    expect(result1!.flipVertical).toBe(false);
  });
});

// ============================================================================
// Test 3: Fallback chain
// ============================================================================

describe('resolvePreviewState - fallback', () => {
  it('uses global config when overrides map is empty', () => {
    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', {}, GLOBAL_CONFIG);

    expect(result).not.toBeNull();
    expect(result!.flipHorizontal).toBe(true);
    expect(result!.rotationZ).toBe(10);
  });

  it('uses global config when override exists but has no previewState', () => {
    const overrides: HardwarePointOverrides = {
      'pair-TOP_LEFT-0': {
        rotation: { rotX: 0, rotY: 0, rotZ: 1.5 }, // has rotation but no previewState
      },
    };

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, GLOBAL_CONFIG);

    // No previewState on the override → falls back to global
    expect(result!.flipHorizontal).toBe(true);
    expect(result!.rotationZ).toBe(10);
  });

  it('defaults missing fields to false/0', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
      // flipHorizontal not set, rotationX/Y/Z not set
    });

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true);
    expect(result!.flipHorizontal).toBe(false);
    expect(result!.rotationX).toBe(0);
    expect(result!.rotationY).toBe(0);
    expect(result!.rotationZ).toBe(0);
  });
});

// ============================================================================
// Test 4: isIdentityPreview utility
// ============================================================================

describe('isIdentityPreview', () => {
  it('returns true for null', () => {
    expect(isIdentityPreview(null)).toBe(true);
  });

  it('returns true for all-default state', () => {
    expect(isIdentityPreview({
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    })).toBe(true);
  });

  it('returns false when flipVertical is true', () => {
    expect(isIdentityPreview({
      flipVertical: true,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    })).toBe(false);
  });

  it('returns false when rotation is non-zero', () => {
    expect(isIdentityPreview({
      flipVertical: false,
      flipHorizontal: false,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 5,
    })).toBe(false);
  });

  it('returns false when flipHorizontal is true', () => {
    expect(isIdentityPreview({
      flipVertical: false,
      flipHorizontal: true,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    })).toBe(false);
  });
});

// ============================================================================
// Test 5: flipHorizontal support
// ============================================================================

describe('resolvePreviewState - flipHorizontal', () => {
  it('returns flipHorizontal from per-connector override', () => {
    const overrides: HardwarePointOverrides = {
      'pair-TOP_RIGHT-0': {
        previewState: { flipHorizontal: true },
      },
    };

    const result = resolvePreviewState(undefined, 'pair-TOP_RIGHT-0', overrides, null);

    expect(result).not.toBeNull();
    expect(result!.flipHorizontal).toBe(true);
    expect(result!.flipVertical).toBe(false);
  });

  it('supports both flipVertical and flipHorizontal independently', () => {
    const overrides: HardwarePointOverrides = {
      'pair-TOP_LEFT-0': {
        previewState: { flipVertical: true, flipHorizontal: true },
      },
    };

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true);
    expect(result!.flipHorizontal).toBe(true);
  });

  it('defaults flipHorizontal to false when only flipVertical is set', () => {
    const overrides: HardwarePointOverrides = {
      'pair-TOP_LEFT-0': {
        previewState: { flipVertical: true },
      },
    };

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true);
    expect(result!.flipHorizontal).toBe(false);
  });
});

// ============================================================================
// Test 6: pairKeyV2 dual-key resolution
// ============================================================================

describe('resolvePreviewState - pairKeyV2 precedence', () => {
  it('v2 key takes precedence over v1 key', () => {
    const overrides = createOverrides({
      'pair2-TOP_LEFT-37': { flipVertical: true },
      'pair-TOP_LEFT-0': { flipVertical: false },
    });

    const result = resolvePreviewState('pair2-TOP_LEFT-37', 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true); // v2 wins
  });

  it('falls back to v1 key when v2 key has no override', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
    });

    const result = resolvePreviewState('pair2-TOP_LEFT-37', 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true); // v1 fallback
  });

  it('falls back to global when neither v2 nor v1 key has override', () => {
    const result = resolvePreviewState('pair2-TOP_LEFT-37', 'pair-TOP_LEFT-0', {}, GLOBAL_CONFIG);

    expect(result!.flipHorizontal).toBe(true); // global fallback
    expect(result!.rotationZ).toBe(10);
  });

  it('works with undefined pairKeyV2 (backward compat)', () => {
    const overrides = createOverrides({
      'pair-TOP_LEFT-0': { flipVertical: true },
    });

    const result = resolvePreviewState(undefined, 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true); // v1 still works when v2 absent
  });

  it('v2 override with no previewState falls through to v1', () => {
    const overrides: HardwarePointOverrides = {
      'pair2-TOP_LEFT-37': {
        rotation: { rotX: 0, rotY: 0, rotZ: 1.5 }, // no previewState
      },
      'pair-TOP_LEFT-0': {
        previewState: { flipVertical: true },
      },
    };

    const result = resolvePreviewState('pair2-TOP_LEFT-37', 'pair-TOP_LEFT-0', overrides, null);

    expect(result!.flipVertical).toBe(true); // v1 fallback because v2 has no previewState
  });
});
