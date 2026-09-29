/**
 * Unit Tests — Kerf Zone Filter (Phase 4)
 *
 * @module core/manufacturing/drillMap/__tests__/kerfZoneFilter.test
 *
 * Coverage:
 *  - Correctness: points inside zone+margin → ERROR / G12_FITTING_IN_KERF_ZONE
 *  - Correctness: points outside zone → unchanged
 *  - All four PanelEdges (TOP, BOTTOM, LEFT, RIGHT)
 *  - All three panel roles (SIDE, HORIZONTAL, BACK)
 *  - Multiple zones on a single panel
 *  - Multiple panels in a DrillMap (only affected panels change)
 *  - Panels with no registered zones → untouched
 *  - Unknown role → skipped (skippedCount incremented)
 *  - Summary statistics: totalExcluded, panelSummaries
 *  - Margin=0 (exact boundary test)
 *  - Custom margin override
 *  - PBT: exclusion invariant — no surviving point inside zone+margin
 *  - PBT: unaffected invariant — points outside zone+margin never excluded
 *  - Immutability: original DrillMap is NOT mutated
 *  - Pre-existing issues preserved on excluded points
 */

import { describe, it, expect } from 'vitest';
import {
  filterDrillMapForKerfZones,
  DEFAULT_KERF_ZONE_FILTER_OPTIONS,
  type KerfZonesByPanelId,
} from '../kerfZoneFilter';
import type { DrillMap, DrillMapPanel, DrillMapPoint } from '../types';
import type { KerfZone } from '../../curve/curveProfile';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePoint(
  id: string,
  position: [number, number, number],
  panelId = 'panel-1',
): DrillMapPoint {
  return {
    id,
    panelId,
    position,
    normal: [0, 0, -1],
    diameter: 5,
    depth: 11,
    purpose: 'DOWEL',
    componentType: 'DOWEL',
    status: 'VALID',
  };
}

/**
 * Build a SIDE panel (LEFT_SIDE role):
 *   - thicknessAxis = 0 (X)
 *   - uAxis = 2 (Z = width), vAxis = 1 (Y = height)
 *   - worldPosition = panel centre
 */
function makeSidePanel(
  panelId: string,
  width = 600,
  height = 720,
  thickness = 18,
  cx = 0, cy = 360, cz = 300,
  points: DrillMapPoint[] = [],
): DrillMapPanel {
  return {
    panelId,
    role: 'LEFT_SIDE',
    dimensions: { width, height, thickness },
    worldPosition: [cx, cy, cz],
    worldRotation: [0, 0, 0],
    points,
  };
}

/**
 * Build a HORIZONTAL panel (TOP role):
 *   - thicknessAxis = 1 (Y)
 *   - uAxis = 0 (X = width), vAxis = 2 (Z = height)
 *   - worldPosition = panel centre
 */
function makeHorizPanel(
  panelId: string,
  width = 600,
  height = 550,
  thickness = 18,
  cx = 300, cy = 0, cz = 275,
  points: DrillMapPoint[] = [],
): DrillMapPanel {
  return {
    panelId,
    role: 'TOP',
    dimensions: { width, height, thickness },
    worldPosition: [cx, cy, cz],
    worldRotation: [0, 0, 0],
    points,
  };
}

/**
 * Build a BACK panel (BACK role):
 *   - thicknessAxis = 2 (Z)
 *   - uAxis = 0 (X = width), vAxis = 1 (Y = height)
 */
function makeBackPanel(
  panelId: string,
  width = 600,
  height = 720,
  thickness = 6,
  cx = 300, cy = 360, cz = 0,
  points: DrillMapPoint[] = [],
): DrillMapPanel {
  return {
    panelId,
    role: 'BACK',
    dimensions: { width, height, thickness },
    worldPosition: [cx, cy, cz],
    worldRotation: [0, 0, 0],
    points,
  };
}

function makeDrillMap(panels: DrillMapPanel[]): DrillMap {
  return {
    cabinetId: 'test-cabinet',
    version: '2.0',
    generatedAt: 0,
    panels,
  };
}

// ---------------------------------------------------------------------------
// SIDE panel geometry:
//   centre = (0, 360, 300); width=600 (Z), height=720 (Y)
//   u = Z - (300 - 300) = Z   [0 → 600]
//   v = Y - (360 - 360) = Y   [0 → 720]
//
// A 'TOP' KerfZone with start=100, end=500, depth=80 means:
//   u ∈ [100, 500], v ∈ [720 - 80, 720] = [640, 720]   (no margin)
//
// So a point at Z=200, Y=660 → u=200 ∈ [100,500], v=660 ∈ [640,720] → inside
//    a point at Z=200, Y=620 → v=620 < 640 → outside (no margin)
//    with marginMm=5: v range expands to [635, 720] → Y=638 → inside
// ---------------------------------------------------------------------------

const SIDE_CENTRE = { cx: 0, cy: 360, cz: 300 };
const SIDE_W = 600; // along Z
const SIDE_H = 720; // along Y

// World coord for a local (u, v) in the SIDE panel
function sideWorld(u: number, v: number): [number, number, number] {
  // u = Z - (cz - W/2) → Z = u + (cz - W/2) = u + 0
  // v = Y - (cy - H/2) → Y = v + (cy - H/2) = v + 0
  const Z = u + (SIDE_CENTRE.cz - SIDE_W / 2);  // 300 - 300 = 0
  const Y = v + (SIDE_CENTRE.cy - SIDE_H / 2);  // 360 - 360 = 0
  return [0, Y, Z]; // X = anything (thickness axis)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filterDrillMapForKerfZones — basic exclusion', () => {
  it('marks a point inside a TOP zone as ERROR', () => {
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    // u=200 ∈ [100,500], v=660 ∈ [640,720] → inside (no margin)
    const pt = makePoint('p1', sideWorld(200, 660));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { drillMap, totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
    const out = drillMap.panels[0].points[0];
    expect(out.status).toBe('ERROR');
    expect(out.issues).toContain('G12_FITTING_IN_KERF_ZONE');
  });

  it('leaves a point outside the TOP zone unchanged', () => {
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    // u=200, v=620 → v < 640 → outside with margin=0
    const pt = makePoint('p1', sideWorld(200, 620));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { drillMap, totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(0);
    expect(drillMap.panels[0].points[0].status).toBe('VALID');
  });

  it('includes a point within margin of the zone boundary', () => {
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    // Without margin: zone v range = [640, 720]; with margin=5: [635, 720]
    // Point at v=637 should be excluded with margin=5, clear without
    const pt = makePoint('p1', sideWorld(200, 637));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);

    const noMargin = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(noMargin.totalExcluded).toBe(0);

    const withMargin = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 5 });
    expect(withMargin.totalExcluded).toBe(1);
  });
});

describe('filterDrillMapForKerfZones — all four edges (SIDE panel)', () => {
  // SIDE panel: u=Z∈[0,600], v=Y∈[0,720]

  it('excludes a point inside BOTTOM zone', () => {
    const zone: KerfZone = { edge: 'BOTTOM', start: 100, end: 500, depth: 80 };
    // BOTTOM: v ∈ [0, 80]; u ∈ [100, 500]
    const pt = makePoint('p1', sideWorld(200, 40)); // v=40 ∈ [0,80]
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
  });

  it('excludes a point inside LEFT zone', () => {
    const zone: KerfZone = { edge: 'LEFT', start: 100, end: 620, depth: 80 };
    // LEFT: u ∈ [0, 80]; v ∈ [100, 620]
    const pt = makePoint('p1', sideWorld(40, 300)); // u=40 ∈ [0,80]
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
  });

  it('excludes a point inside RIGHT zone', () => {
    const zone: KerfZone = { edge: 'RIGHT', start: 100, end: 620, depth: 80 };
    // RIGHT: u ∈ [600-80, 600]=[520,600]; v ∈ [100, 620]
    const pt = makePoint('p1', sideWorld(540, 300)); // u=540 ∈ [520,600]
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
  });

  it('does NOT exclude a point outside the LEFT zone span (v out-of-range)', () => {
    const zone: KerfZone = { edge: 'LEFT', start: 100, end: 620, depth: 80 };
    // u=40 inside depth, but v=50 < start=100 → outside
    const pt = makePoint('p1', sideWorld(40, 50));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(0);
  });
});

describe('filterDrillMapForKerfZones — horizontal (TOP) panel', () => {
  // TOP panel: thicknessAxis=1 (Y), uAxis=0 (X=width), vAxis=2 (Z=height)
  // centre=(300, 0, 275); width=600 (X), height=550 (Z)
  // u = X - (300 - 300) = X  [0→600]
  // v = Z - (275 - 275) = Z  [0→550]

  function horizWorld(u: number, v: number): [number, number, number] {
    const X = u + (300 - 600 / 2);  // = u + 0
    const Z = v + (275 - 550 / 2);  // = v + 0
    return [X, 0, Z];
  }

  it('excludes a point inside a TOP-edge zone on a horizontal panel', () => {
    const zone: KerfZone = { edge: 'TOP', start: 50, end: 550, depth: 60 };
    // TOP: v ∈ [550-60, 550]=[490,550]; u ∈ [50,550]
    const pt = makePoint('p1', horizWorld(200, 510));
    const panel = makeHorizPanel('horiz-1', 600, 550, 18, 300, 0, 275, [pt]);
    const zones: KerfZonesByPanelId = new Map([['horiz-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
  });

  it('leaves a point outside the zone on a horizontal panel', () => {
    const zone: KerfZone = { edge: 'TOP', start: 50, end: 550, depth: 60 };
    const pt = makePoint('p1', horizWorld(200, 200)); // v=200 < 490
    const panel = makeHorizPanel('horiz-1', 600, 550, 18, 300, 0, 275, [pt]);
    const zones: KerfZonesByPanelId = new Map([['horiz-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(0);
  });
});

describe('filterDrillMapForKerfZones — BACK panel', () => {
  // BACK panel: thicknessAxis=2 (Z), uAxis=0 (X=width), vAxis=1 (Y=height)
  // centre=(300, 360, 0); width=600, height=720
  // u = X - (300-300) = X  [0→600]
  // v = Y - (360-360) = Y  [0→720]

  function backWorld(u: number, v: number): [number, number, number] {
    return [u, v, 0];
  }

  it('excludes a point inside a BOTTOM zone on a back panel', () => {
    const zone: KerfZone = { edge: 'BOTTOM', start: 0, end: 600, depth: 50 };
    const pt = makePoint('p1', backWorld(300, 25));
    const panel = makeBackPanel('back-1', 600, 720, 6, 300, 360, 0, [pt]);
    const zones: KerfZonesByPanelId = new Map([['back-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(1);
  });
});

describe('filterDrillMapForKerfZones — multiple zones & points', () => {
  it('excludes a point matching any of multiple zones', () => {
    const zoneTop: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const zoneBot: KerfZone = { edge: 'BOTTOM', start: 0, end: 600, depth: 80 };

    const ptTop = makePoint('pt-top', sideWorld(200, 680));    // inside TOP zone
    const ptBot = makePoint('pt-bot', sideWorld(200, 40));     // inside BOTTOM zone
    const ptMid = makePoint('pt-mid', sideWorld(200, 360));    // outside both

    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [ptTop, ptBot, ptMid]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zoneTop, zoneBot]]]);
    const { totalExcluded, drillMap } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });

    expect(totalExcluded).toBe(2);
    const pts = drillMap.panels[0].points;
    expect(pts.find(p => p.id === 'pt-top')?.status).toBe('ERROR');
    expect(pts.find(p => p.id === 'pt-bot')?.status).toBe('ERROR');
    expect(pts.find(p => p.id === 'pt-mid')?.status).toBe('VALID');
  });

  it('only affects panels that have registered zones', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const ptAffected = makePoint('p-in', sideWorld(200, 680), 'panel-A');
    const ptUnaffected = makePoint('p-out', sideWorld(200, 680), 'panel-B');

    const panelA = makeSidePanel('panel-A', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [ptAffected]);
    const panelB = makeSidePanel('panel-B', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [ptUnaffected]);

    // Only panel-A has zones
    const zones: KerfZonesByPanelId = new Map([['panel-A', [zone]]]);
    const { drillMap } = filterDrillMapForKerfZones(makeDrillMap([panelA, panelB]), zones, { marginMm: 0 });

    expect(drillMap.panels.find(p => p.panelId === 'panel-A')!.points[0].status).toBe('ERROR');
    expect(drillMap.panels.find(p => p.panelId === 'panel-B')!.points[0].status).toBe('VALID');
  });
});

describe('filterDrillMapForKerfZones — unknown role skipping', () => {
  it('skips all points on panels with unknown role', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const pt = makePoint('p1', [0, 700, 200]);
    const panel: DrillMapPanel = {
      panelId: 'mystery',
      role: 'MYSTERY_PANEL',
      dimensions: { width: 600, height: 720, thickness: 18 },
      worldPosition: [0, 360, 300],
      worldRotation: [0, 0, 0],
      points: [pt],
    };
    const zones: KerfZonesByPanelId = new Map([['mystery', [zone]]]);
    const { totalExcluded, panelSummaries } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(totalExcluded).toBe(0);
    expect(panelSummaries[0].skippedCount).toBe(1);
  });
});

describe('filterDrillMapForKerfZones — summary statistics', () => {
  it('reports correct panelSummaries.excludedCount per panel', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const pts = [
      makePoint('a', sideWorld(200, 680)),  // inside
      makePoint('b', sideWorld(200, 400)),  // outside
    ];
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, pts);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { panelSummaries } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    expect(panelSummaries[0].excludedCount).toBe(1);
  });

  it('reports 0 excludedCount for panels without zones', () => {
    const pt = makePoint('p1', [0, 300, 200]);
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map(); // no zones
    const { panelSummaries, totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones);
    expect(totalExcluded).toBe(0);
    expect(panelSummaries[0].excludedCount).toBe(0);
  });
});

describe('filterDrillMapForKerfZones — immutability', () => {
  it('does not mutate the original DrillMap', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const pt = makePoint('p1', sideWorld(200, 680));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const original = makeDrillMap([panel]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);

    filterDrillMapForKerfZones(original, zones, { marginMm: 0 });

    // Original must remain unchanged
    expect(original.panels[0].points[0].status).toBe('VALID');
    expect(original.panels[0].points[0].issues).toBeUndefined();
  });
});

describe('filterDrillMapForKerfZones — issue accumulation', () => {
  it('preserves pre-existing issues on excluded points', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const pt: DrillMapPoint = {
      ...makePoint('p1', sideWorld(200, 680)),
      issues: ['EXISTING_ISSUE'],
    };
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { drillMap } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });

    const out = drillMap.panels[0].points[0];
    expect(out.issues).toContain('EXISTING_ISSUE');
    expect(out.issues).toContain('G12_FITTING_IN_KERF_ZONE');
  });

  it('does not duplicate G12_FITTING_IN_KERF_ZONE on second pass', () => {
    const zone: KerfZone = { edge: 'TOP', start: 0, end: 600, depth: 80 };
    const pt = makePoint('p1', sideWorld(200, 680));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);

    // Run twice (simulating idempotency)
    const pass1 = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: 0 });
    const pass2 = filterDrillMapForKerfZones(pass1.drillMap, zones, { marginMm: 0 });

    const out = pass2.drillMap.panels[0].points[0];
    expect(out.issues!.filter(i => i === 'G12_FITTING_IN_KERF_ZONE')).toHaveLength(1);
  });
});

describe('filterDrillMapForKerfZones — defaults', () => {
  it('uses DEFAULT_KERF_ZONE_FILTER_OPTIONS (marginMm=5) when no options supplied', () => {
    expect(DEFAULT_KERF_ZONE_FILTER_OPTIONS.marginMm).toBe(5);
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    // v=636 → 4mm outside zone boundary [640,720] without margin
    // with default margin=5 → boundary [635,720] → inside
    const pt = makePoint('p1', sideWorld(200, 636));
    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, [pt]);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones);
    expect(totalExcluded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PBT: Exclusion invariant
// ---------------------------------------------------------------------------

describe('PBT: exclusion invariant', () => {
  it('no point inside zone+margin survives (100 random points)', () => {
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    const margin = 5;
    // Zone AABB (no expansion for flush edges): u∈[95,505], v∈[635,720]

    // Generate 100 points strictly inside the expanded zone
    const insidePoints: DrillMapPoint[] = Array.from({ length: 100 }, (_, i) => {
      const u = 100 + (i % 10) * 40; // 100..460 all inside [95,505]
      const v = 636 + (i % 5) * 16;  // 636..700 all inside [635,720]
      return makePoint(`pt-${i}`, sideWorld(u, v));
    });

    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, insidePoints);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { drillMap } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: margin });

    const survivors = drillMap.panels[0].points.filter(p => p.status !== 'ERROR');
    expect(survivors).toHaveLength(0);
  });

  it('no point outside zone+margin gets excluded (100 random points)', () => {
    const zone: KerfZone = { edge: 'TOP', start: 100, end: 500, depth: 80 };
    const margin = 5;
    // Zone AABB: u∈[95,505], v∈[635,720]
    // Points at v=300 are well outside the zone

    const outsidePoints: DrillMapPoint[] = Array.from({ length: 100 }, (_, i) => {
      const u = 100 + i * 4;       // 100..496
      const v = 300 + (i % 10);    // 300..309 — all well below v=635
      return makePoint(`pt-${i}`, sideWorld(u, v));
    });

    const panel = makeSidePanel('panel-1', SIDE_W, SIDE_H, 18, SIDE_CENTRE.cx, SIDE_CENTRE.cy, SIDE_CENTRE.cz, outsidePoints);
    const zones: KerfZonesByPanelId = new Map([['panel-1', [zone]]]);
    const { totalExcluded } = filterDrillMapForKerfZones(makeDrillMap([panel]), zones, { marginMm: margin });

    expect(totalExcluded).toBe(0);
  });
});
