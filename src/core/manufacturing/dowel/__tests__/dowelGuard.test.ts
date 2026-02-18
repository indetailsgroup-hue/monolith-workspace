/**
 * dowelGuard.test.ts — Tests for Dowel preview-only guard
 *
 * Ensures:
 * 1. dowelGuard.sanitize() strips all 8 preview-only keys
 * 2. Sanitized output contains zero preview keys in JSON string
 * 3. dowelGuard.assertClean() passes for clean config
 * 4. dowelGuard.assertClean() throws for contaminated config (dev mode)
 * 5. Guard keys match DOWEL_PREVIEW_ONLY_KEYS constant
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import { dowelGuard } from '../dowelGuard';
import {
  DOWEL_PREVIEW_ONLY_KEYS,
  DEFAULT_DOWEL_CONFIG,
  DEFAULT_DOWEL_PREVIEW_STATE,
} from '../types';
import type { DowelConfig, DowelPreviewState } from '../types';

// ============================================================================
// Test Data
// ============================================================================

/** Full editor state = DowelConfig + DowelPreviewState (simulates UI state) */
function makeEditorState() {
  return {
    ...DEFAULT_DOWEL_CONFIG,
    ...DEFAULT_DOWEL_PREVIEW_STATE,
    // Override some preview fields to non-default values
    flipVertical: true,
    rotationX: 45,
    moveZ: 10,
  };
}

// ============================================================================
// 1. sanitize() strips preview keys
// ============================================================================

describe('dowelGuard.sanitize', () => {
  it('strips all 8 preview-only keys from editor state', () => {
    const editorState = makeEditorState();
    const clean = dowelGuard.sanitize(editorState);

    for (const key of DOWEL_PREVIEW_ONLY_KEYS) {
      expect(clean).not.toHaveProperty(key as string);
    }
  });

  it('preserves all manufacturing config keys', () => {
    const editorState = makeEditorState();
    const clean = dowelGuard.sanitize(editorState);

    // All DowelConfig keys should survive
    const configKeys: (keyof DowelConfig)[] = [
      'dowelDia', 'dowelLength', 'depthFaceBore', 'depthEdgeBore',
      'endOffset', 'pitch', 'woodThickness', 'minDowelCount',
    ];

    for (const key of configKeys) {
      expect(clean).toHaveProperty(key as string);
    }
  });

  it('produces JSON with zero preview keys (string guard)', () => {
    const editorState = makeEditorState();
    const clean = dowelGuard.sanitize(editorState);
    const json = JSON.stringify(clean);

    for (const key of DOWEL_PREVIEW_ONLY_KEYS) {
      expect(json).not.toContain(`"${key as string}"`);
    }
  });
});

// ============================================================================
// 2. assertClean()
// ============================================================================

describe('dowelGuard.assertClean', () => {
  it('passes silently for clean manufacturing config', () => {
    const cleanConfig = { ...DEFAULT_DOWEL_CONFIG };

    // Should not throw
    expect(() => {
      dowelGuard.assertClean(cleanConfig as unknown as Record<string, unknown>, 'test');
    }).not.toThrow();
  });

  it('throws when preview key is present (dev mode)', () => {
    // import.meta.env.DEV is true in vitest
    const contaminated = {
      ...DEFAULT_DOWEL_CONFIG,
      flipVertical: true, // preview key leaked!
    };

    expect(() => {
      dowelGuard.assertClean(contaminated as unknown as Record<string, unknown>, 'test');
    }).toThrow(/Preview-only key "flipVertical" leaked/);
  });
});

// ============================================================================
// 3. Guard keys alignment
// ============================================================================

describe('dowelGuard.keys', () => {
  it('matches DOWEL_PREVIEW_ONLY_KEYS', () => {
    expect([...dowelGuard.keys]).toEqual([...DOWEL_PREVIEW_ONLY_KEYS]);
  });

  it('contains exactly 8 keys', () => {
    expect(dowelGuard.keys).toHaveLength(8);
  });

  it('keys match DowelPreviewState fields', () => {
    const previewKeys = Object.keys(DEFAULT_DOWEL_PREVIEW_STATE);
    expect(dowelGuard.keys).toHaveLength(previewKeys.length);
    for (const key of dowelGuard.keys) {
      expect(previewKeys).toContain(key as string);
    }
  });
});
