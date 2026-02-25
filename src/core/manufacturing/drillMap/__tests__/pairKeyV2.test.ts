import { describe, it, expect } from 'vitest';
import { buildPairKeyV2, isPairKeyV2 } from '../pairKeyV2';

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
