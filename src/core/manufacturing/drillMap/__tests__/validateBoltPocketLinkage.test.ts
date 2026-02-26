import { describe, test, expect } from 'vitest';
import {
  validateBoltPocketLinkage,
  type BoltPointLike,
} from '../validateBoltPocketLinkage';
import type { Vec3Tuple } from '../types';

function makeBolt(overrides: Partial<BoltPointLike> = {}): BoltPointLike {
  return {
    id: 'bolt-1',
    purpose: 'BOLT',
    position: [0, 0, 0] as Vec3Tuple,
    targetPocketCenter: [10, 0, 0] as Vec3Tuple,
    boltDirection: [1, 0, 0] as Vec3Tuple,
    pairKeyV2: 'pair2-TOP_LEFT-A-37',
    cornerType: 'TOP_LEFT',
    ...overrides,
  };
}

describe('validateBoltPocketLinkage', () => {
  test('passes when boltDirection points entry → pocket', () => {
    const issues = validateBoltPocketLinkage([makeBolt()]);
    expect(issues).toHaveLength(0);
  });

  test('passes for all 4 corners with correct direction', () => {
    const points: BoltPointLike[] = [
      makeBolt({ id: 'tl', position: [24, 700, 37], targetPocketCenter: [0, 693.75, 37], boltDirection: [-0.968, -0.25, 0], cornerType: 'TOP_LEFT' }),
      makeBolt({ id: 'tr', position: [576, 700, 37], targetPocketCenter: [600, 693.75, 37], boltDirection: [0.968, -0.25, 0], cornerType: 'TOP_RIGHT' }),
      makeBolt({ id: 'bl', position: [24, 100, 37], targetPocketCenter: [0, 106.25, 37], boltDirection: [-0.968, 0.25, 0], cornerType: 'BOTTOM_LEFT' }),
      makeBolt({ id: 'br', position: [576, 100, 37], targetPocketCenter: [600, 106.25, 37], boltDirection: [0.968, 0.25, 0], cornerType: 'BOTTOM_RIGHT' }),
    ];
    const issues = validateBoltPocketLinkage(points);
    expect(issues).toHaveLength(0);
  });

  test('fails when boltDirection points away from pocket (reversed)', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({ boltDirection: [-1, 0, 0] }), // pocket at +X but dir is -X
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('DRILLMAP:BOLT_POCKET_LINKAGE_BAD_DOT');
    expect(issues[0]!.details?.dot).toBeLessThan(0);
  });

  test('fails when targetPocketCenter exists but boltDirection is null', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({ boltDirection: null }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('DRILLMAP:BOLT_POCKET_LINKAGE_MISSING_DIR');
  });

  test('fails when targetPocketCenter exists but boltDirection is undefined', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({ boltDirection: undefined }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('DRILLMAP:BOLT_POCKET_LINKAGE_MISSING_DIR');
  });

  test('skips non-BOLT points', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({ purpose: 'CAM_LOCK' }),
      makeBolt({ purpose: 'DOWEL' }),
    ]);
    expect(issues).toHaveLength(0);
  });

  test('skips BOLT points without targetPocketCenter', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({ targetPocketCenter: null }),
      makeBolt({ targetPocketCenter: undefined }),
    ]);
    expect(issues).toHaveLength(0);
  });

  test('includes pairKeyV2 and cornerType in issue for debugging', () => {
    const issues = validateBoltPocketLinkage([
      makeBolt({
        boltDirection: [-1, 0, 0],
        pairKeyV2: 'pair2-BOTTOM_RIGHT-A-243',
        cornerType: 'BOTTOM_RIGHT',
      }),
    ]);
    expect(issues[0]!.pairKeyV2).toBe('pair2-BOTTOM_RIGHT-A-243');
    expect(issues[0]!.cornerType).toBe('BOTTOM_RIGHT');
  });
});
