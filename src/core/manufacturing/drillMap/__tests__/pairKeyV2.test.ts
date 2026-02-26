import { describe, it, expect } from 'vitest';
import { buildPairKeyV2, isPairKeyV2, isRunAxis, PAIR_KEY_V2_RE } from '../pairKeyV2';

describe('buildPairKeyV2', () => {
  it('produces correct format for System32 grid positions', () => {
    expect(buildPairKeyV2('TOP_RIGHT', 37)).toBe('pair2-TOP_RIGHT-37');
    expect(buildPairKeyV2('BOTTOM_LEFT', 69)).toBe('pair2-BOTTOM_LEFT-69');
    expect(buildPairKeyV2('TOP_LEFT', 101)).toBe('pair2-TOP_LEFT-101');
    expect(buildPairKeyV2('BOTTOM_RIGHT', 133)).toBe('pair2-BOTTOM_RIGHT-133');
  });

  it('rounds floating-point noise', () => {
    expect(buildPairKeyV2('TOP_RIGHT', 36.9999999)).toBe('pair2-TOP_RIGHT-37');
    expect(buildPairKeyV2('TOP_RIGHT', 37.0000001)).toBe('pair2-TOP_RIGHT-37');
  });

  it('handles non-grid centre positions', () => {
    expect(buildPairKeyV2('TOP_LEFT', 250)).toBe('pair2-TOP_LEFT-250');
    expect(buildPairKeyV2('TOP_LEFT', 250.5)).toBe('pair2-TOP_LEFT-251');
  });

  it('is deterministic (same inputs → same output)', () => {
    const a = buildPairKeyV2('BOTTOM_RIGHT', 133);
    const b = buildPairKeyV2('BOTTOM_RIGHT', 133);
    expect(a).toBe(b);
  });

  it('different corners at same position produce different keys', () => {
    const a = buildPairKeyV2('TOP_LEFT', 37);
    const b = buildPairKeyV2('TOP_RIGHT', 37);
    expect(a).not.toBe(b);
  });

  it('same corner at different positions produce different keys', () => {
    const a = buildPairKeyV2('TOP_LEFT', 37);
    const b = buildPairKeyV2('TOP_LEFT', 69);
    expect(a).not.toBe(b);
  });

  it('B-run keys include axis tag', () => {
    expect(buildPairKeyV2('TOP_RIGHT', 37, 'B')).toBe('pair2-TOP_RIGHT-B-37');
    expect(buildPairKeyV2('BOTTOM_LEFT', 527, 'B')).toBe('pair2-BOTTOM_LEFT-B-527');
  });

  it('A-run keys omit axis tag (backward compatible)', () => {
    expect(buildPairKeyV2('TOP_LEFT', 37, 'A')).toBe('pair2-TOP_LEFT-37');
    expect(buildPairKeyV2('TOP_LEFT', 37)).toBe('pair2-TOP_LEFT-37');
  });

  it('B-run and A-run at same position produce different keys', () => {
    const a = buildPairKeyV2('TOP_LEFT', 37);
    const b = buildPairKeyV2('TOP_LEFT', 37, 'B');
    expect(a).not.toBe(b);
  });
});

describe('isPairKeyV2', () => {
  it('returns true for v2 keys', () => {
    expect(isPairKeyV2('pair2-TOP_LEFT-37')).toBe(true);
    expect(isPairKeyV2('pair2-BOTTOM_RIGHT-133')).toBe(true);
  });

  it('returns false for v1 keys', () => {
    expect(isPairKeyV2('pair-TOP_LEFT-0')).toBe(false);
  });

  it('returns false for pointId keys', () => {
    expect(isPairKeyV2('cam_lock-TOP_LEFT-0')).toBe(false);
  });

  it('returns false for connector compiler keys', () => {
    expect(isPairKeyV2('PAIR_J1_0')).toBe(false);
  });
});

describe('PAIR_KEY_V2_RE (format golden)', () => {
  it('A-run root keys match regex', () => {
    for (const key of ['pair2-TOP_LEFT-37', 'pair2-BOTTOM_RIGHT-133', 'pair2-TOP_RIGHT-250']) {
      expect(key, `${key} must match`).toMatch(PAIR_KEY_V2_RE);
    }
  });

  it('B-run root keys match regex', () => {
    for (const key of ['pair2-TOP_LEFT-B-37', 'pair2-BOTTOM_RIGHT-B-527']) {
      expect(key, `${key} must match`).toMatch(PAIR_KEY_V2_RE);
    }
  });

  it('suffixed keys still match (regex anchors on root)', () => {
    expect('pair2-TOP_LEFT-37-dowel-side').toMatch(PAIR_KEY_V2_RE);
    expect('pair2-TOP_LEFT-B-37-dowel-brun-horiz').toMatch(PAIR_KEY_V2_RE);
  });

  it('extracts correct capture groups', () => {
    const mA = PAIR_KEY_V2_RE.exec('pair2-BOTTOM_LEFT-69');
    expect(mA).not.toBeNull();
    expect(mA![1]).toBe('BOTTOM_LEFT');
    expect(mA![2]).toBeUndefined(); // no axis tag → A-run
    expect(mA![3]).toBe('69');

    const mB = PAIR_KEY_V2_RE.exec('pair2-TOP_RIGHT-B-527-dowel-brun-side');
    expect(mB).not.toBeNull();
    expect(mB![1]).toBe('TOP_RIGHT');
    expect(mB![2]).toBe('B');
    expect(mB![3]).toBe('527');
  });

  it('rejects malformed keys', () => {
    expect(PAIR_KEY_V2_RE.test('pair-TOP_LEFT-37')).toBe(false);  // v1 format
    expect(PAIR_KEY_V2_RE.test('cam_lock-TOP_LEFT-0')).toBe(false);
    expect(PAIR_KEY_V2_RE.test('')).toBe(false);
  });
});

describe('isRunAxis (parse-based)', () => {
  it('correctly identifies A-run keys', () => {
    expect(isRunAxis('pair2-TOP_LEFT-37', 'A')).toBe(true);
    expect(isRunAxis('pair2-TOP_LEFT-37-dowel-side', 'A')).toBe(true);
    expect(isRunAxis('pair2-BOTTOM_RIGHT-133', 'A')).toBe(true);
  });

  it('correctly identifies B-run keys', () => {
    expect(isRunAxis('pair2-TOP_LEFT-B-37', 'B')).toBe(true);
    expect(isRunAxis('pair2-TOP_LEFT-B-37-dowel-brun-horiz', 'B')).toBe(true);
    expect(isRunAxis('pair2-BOTTOM_RIGHT-B-527', 'B')).toBe(true);
  });

  it('A-run keys are NOT B-run', () => {
    expect(isRunAxis('pair2-TOP_LEFT-37', 'B')).toBe(false);
    expect(isRunAxis('pair2-BOTTOM_RIGHT-133-dowel-horiz', 'B')).toBe(false);
  });

  it('B-run keys are NOT A-run', () => {
    expect(isRunAxis('pair2-TOP_LEFT-B-37', 'A')).toBe(false);
    expect(isRunAxis('pair2-TOP_LEFT-B-37-dowel-brun-side', 'A')).toBe(false);
  });

  it('returns false for non-pairKeyV2 strings', () => {
    expect(isRunAxis('', 'A')).toBe(false);
    expect(isRunAxis('pair-TOP_LEFT-0', 'B')).toBe(false);
    expect(isRunAxis('PAIR_J1_0', 'A')).toBe(false);
  });

  it('no false positive from corner types containing B (e.g. BOTTOM)', () => {
    // BOTTOM_LEFT A-run: "pair2-BOTTOM_LEFT-37" should NOT be detected as B-run
    expect(isRunAxis('pair2-BOTTOM_LEFT-37', 'B')).toBe(false);
    expect(isRunAxis('pair2-BOTTOM_LEFT-37', 'A')).toBe(true);
    // BOTTOM_RIGHT B-run: must correctly detect
    expect(isRunAxis('pair2-BOTTOM_RIGHT-B-37', 'B')).toBe(true);
    expect(isRunAxis('pair2-BOTTOM_RIGHT-B-37', 'A')).toBe(false);
  });
});
