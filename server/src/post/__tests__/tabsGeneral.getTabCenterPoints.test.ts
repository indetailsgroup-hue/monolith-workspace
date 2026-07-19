/**
 * Regression guard for getTabCenterPoints().
 *
 * This function used to call `require('./pathParam')` from inside an ESM
 * module (server/package.json is "type": "module"), so every call threw
 * "require is not defined". The fix — a static import of pointAtDistance —
 * had no test and no in-repo caller beyond the barrel re-export in
 * post/index.ts, so nothing would have caught it coming back.
 *
 * These tests call the function for real. If the require() ever returns, the
 * first test throws instead of failing an assertion.
 */

import { describe, it, expect } from 'vitest';
import { getTabCenterPoints } from '../tabsGeneral.js';
import type { Path, TabConfig } from '../planTypes.js';

/** A closed 100 x 100 square, CCW, perimeter 400mm. */
function square(): Path {
  return {
    closed: true,
    winding: 'CCW',
    segs: [
      { kind: 'LINE', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { kind: 'LINE', a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
      { kind: 'LINE', a: { x: 100, y: 100 }, b: { x: 0, y: 100 } },
      { kind: 'LINE', a: { x: 0, y: 100 }, b: { x: 0, y: 0 } },
    ],
  };
}

function tabs(over: Partial<TabConfig> = {}): TabConfig {
  return {
    enabled: true,
    count: 4,
    lengthMm: 10,
    insetMm: 0,
    strategy: 'UNIFORM',
    ...over,
  };
}

describe('getTabCenterPoints', () => {
  it('returns a point per tab instead of throwing (the require() regression)', () => {
    const pts = getTabCenterPoints(square(), tabs());
    expect(pts).toHaveLength(4);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('places 4 uniform tabs at the midpoint of each edge of a square', () => {
    // Perimeter 400, inset 0, spacing 100 → centers at 50, 150, 250, 350,
    // which are the edge midpoints walking CCW from the origin.
    const pts = getTabCenterPoints(square(), tabs());
    expect(pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [50, 0],
      [100, 50],
      [50, 100],
      [0, 50],
    ]);
  });

  it('every returned point lies on the path outline', () => {
    const pts = getTabCenterPoints(square(), tabs({ count: 7 }));
    expect(pts).toHaveLength(7);
    for (const p of pts) {
      const onEdge =
        Math.abs(p.x) < 1e-6 ||
        Math.abs(p.x - 100) < 1e-6 ||
        Math.abs(p.y) < 1e-6 ||
        Math.abs(p.y - 100) < 1e-6;
      expect(onEdge).toBe(true);
    }
  });

  it('returns [] when tabs are disabled or count is zero', () => {
    expect(getTabCenterPoints(square(), tabs({ enabled: false }))).toEqual([]);
    expect(getTabCenterPoints(square(), tabs({ count: 0 }))).toEqual([]);
  });

  it('honours insetMm by keeping tabs away from the path start', () => {
    const pts = getTabCenterPoints(square(), tabs({ count: 1, insetMm: 40 }));
    expect(pts).toHaveLength(1);
    // effectiveLength 320, single centre at 40 + 160 = 200 → halfway round,
    // which on a 100x100 square walking CCW is the far corner (100,100).
    expect([Math.round(pts[0].x), Math.round(pts[0].y)]).toEqual([100, 100]);
  });
});
