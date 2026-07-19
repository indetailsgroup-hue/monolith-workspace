/**
 * deriveRuns — adjacency graph, connected components, per-yaw segmentation.
 *
 * Geometry convention is pinned by conventionPin.test.ts: scenePosition X/Z are
 * the footprint CENTRE. Every coordinate below is written against that.
 */

import { describe, it, expect } from 'vitest';
import { deriveRuns } from '../deriveRuns';
import { makePlacements, STRAIGHT_RUN_OF_THREE } from './testFixtures';

const HALF_PI = Math.PI / 2;

describe('deriveRuns — straight runs', () => {
  it('merges three abutting 600mm cabinets into one run with one segment', () => {
    const runs = deriveRuns(makePlacements(STRAIGHT_RUN_OF_THREE));

    expect(runs).toHaveLength(1);
    expect(runs[0].segments).toHaveLength(1);

    const seg = runs[0].segments[0];
    expect(seg.members.map(m => m.cabinetId)).toEqual(['c1', 'c2', 'c3']);
    expect(seg.u0).toBeCloseTo(-300, 6);
    expect(seg.u1).toBeCloseTo(1500, 6);
    expect(seg.nBack).toBeCloseTo(-280, 6);
    expect(seg.nFront).toBeCloseTo(280, 6);
    expect(seg.carcassTopY).toBeCloseTo(820, 6);
    expect(seg.hostCabinetId).toBe('c1');
  });

  it('sorts members along u regardless of input order', () => {
    const shuffled = [
      STRAIGHT_RUN_OF_THREE[2],
      STRAIGHT_RUN_OF_THREE[0],
      STRAIGHT_RUN_OF_THREE[1],
    ];
    const runs = deriveRuns(makePlacements(shuffled));
    expect(runs[0].segments[0].members.map(m => m.cabinetId)).toEqual(['c1', 'c2', 'c3']);
    expect(runs[0].segments[0].hostCabinetId).toBe('c1');
  });

  it('still merges across a 5mm gap but splits across a 40mm gap', () => {
    const near = makePlacements([
      { id: 'a', pos: [0, 0, 0] },
      { id: 'b', pos: [605, 0, 0] },
    ]);
    expect(deriveRuns(near)).toHaveLength(1);

    const far = makePlacements([
      { id: 'a', pos: [0, 0, 0] },
      { id: 'b', pos: [640, 0, 0] },
    ]);
    expect(deriveRuns(far)).toHaveLength(2);
  });
});

describe('deriveRuns — separation rules', () => {
  it('does NOT merge two back-to-back rows whose fronts face away', () => {
    // A faces +Z at z = 0 (front plane z = +280, back plane z = -280).
    // B faces -Z at z = -560 (front plane z = -840, back plane z = -280).
    // Their backs touch, so SAT says "touching", but the front planes are
    // 1120mm apart — these are two kitchens, not one.
    const placements = makePlacements([
      { id: 'front', pos: [0, 0, 0], yaw: 0 },
      { id: 'back', pos: [0, 0, -560], yaw: Math.PI },
    ]);
    const runs = deriveRuns(placements);
    expect(runs).toHaveLength(2);
  });

  it('does NOT merge a wall cabinet into a base run (different Y band)', () => {
    const placements = makePlacements([
      { id: 'base', pos: [0, 0, 0] },                       // carcassTop 820
      { id: 'wall', pos: [0, 1400, 0], height: 700, depth: 350, toeKickHeight: 0 },
    ]);
    const runs = deriveRuns(placements);
    expect(runs).toHaveLength(2);
    // and the WALL-typed cabinet is excluded entirely
    const typed = makePlacements([
      { id: 'base', pos: [0, 0, 0] },
      { id: 'w', pos: [0, 1400, 0], type: 'WALL', height: 700, depth: 350, toeKickHeight: 0 },
    ]);
    const typedRuns = deriveRuns(typed);
    expect(typedRuns).toHaveLength(1);
    expect(typedRuns[0].cabinetIds).toEqual(['base']);
  });

  it('gives a detached island its own run', () => {
    const placements = makePlacements([
      ...STRAIGHT_RUN_OF_THREE,
      { id: 'isl1', pos: [600, 0, 2000] },
      { id: 'isl2', pos: [1200, 0, 2000] },
    ]);
    const runs = deriveRuns(placements);
    expect(runs).toHaveLength(2);

    const island = runs.find(r => r.cabinetIds.includes('isl1'))!;
    expect(island.cabinetIds).toEqual(['isl1', 'isl2']);
    expect(island.segments).toHaveLength(1);
  });
});

describe('deriveRuns — L corner', () => {
  it('yields exactly one run with exactly two segments', () => {
    // Leg A: yaw 0, centres x = 0, 600, 1200 -> u-extent [-300, 1500], front z = +280.
    // Leg B: yaw pi/2 (faces +X). Its local +X points to world -Z, +Z points to +X.
    // Place it so its footprint abuts the end of leg A.
    const placements = makePlacements([
      ...STRAIGHT_RUN_OF_THREE,
      { id: 'L1', pos: [1220, 0, -580], yaw: HALF_PI },
      { id: 'L2', pos: [1220, 0, -1180], yaw: HALF_PI },
    ]);

    const runs = deriveRuns(placements);
    expect(runs).toHaveLength(1);
    expect(runs[0].segments).toHaveLength(2);

    const yaws = runs[0].segments.map(s => s.yaw).sort((a, b) => a - b);
    expect(yaws[0]).toBeCloseTo(0, 6);
    expect(yaws[1]).toBeCloseTo(HALF_PI, 6);
  });

  it('is deterministic: shuffled input gives identical run and segment ids', () => {
    const specs = [
      ...STRAIGHT_RUN_OF_THREE,
      { id: 'L1', pos: [1220, 0, -580] as [number, number, number], yaw: HALF_PI },
      { id: 'L2', pos: [1220, 0, -1180] as [number, number, number], yaw: HALF_PI },
    ];
    const a = deriveRuns(makePlacements(specs));
    const b = deriveRuns(makePlacements([...specs].reverse()));

    expect(b.map(r => r.runId)).toEqual(a.map(r => r.runId));
    expect(b[0].segments.map(s => s.segmentId)).toEqual(a[0].segments.map(s => s.segmentId));
  });
});

describe('deriveRuns — degenerate input', () => {
  it('returns no runs for an empty scene', () => {
    expect(deriveRuns([])).toEqual([]);
  });

  it('flags a mixed-depth segment rather than silently mis-sizing it', () => {
    const placements = makePlacements([
      { id: 'd1', pos: [0, 0, 0], depth: 560 },
      { id: 'd2', pos: [600, 0, 20], depth: 600 }, // fronts still coplanar at z = 320? no
    ]);
    // Shift d2 so both front planes land at z = +280: centre z = 280 - 300 = -20.
    const coplanar = makePlacements([
      { id: 'd1', pos: [0, 0, 0], depth: 560 },
      { id: 'd2', pos: [600, 0, -20], depth: 600 },
    ]);
    const runs = deriveRuns(coplanar);
    expect(runs).toHaveLength(1);
    expect(runs[0].segments[0].mixedDepth).toBe(true);
    // Slab must cover the DEEPEST member, never the shallowest.
    expect(runs[0].segments[0].nBack).toBeCloseTo(-320, 6);
    expect(runs[0].segments[0].nFront).toBeCloseTo(280, 6);
    expect(placements).toHaveLength(2);
  });
});
