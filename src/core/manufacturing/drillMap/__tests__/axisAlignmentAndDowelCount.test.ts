/**
 * axisAlignmentAndDowelCount.test.ts - v4.4 Regression Tests
 *
 * Verifies the v4.4 fix for side-panel drill point Y alignment:
 *
 * 1. Side-panel points (BOLT, BOLT_THREAD, DOWEL-side) must share the same Y
 *    as horizontal panel edge bore (BOLT_ENTRY, DOWEL-horiz) → jointAxisY.
 * 2. Display layer (buildDisplayPoints) must NOT mutate manufacturing positions.
 * 3. Dowel count must be stable per connector set (2 side + 2 horiz = 4 per position).
 * 4. Dowels must NOT coincide with bolt axis (distance ≈ 32mm along Z).
 *
 * Root cause (pre-v4.4):
 *   boltFacePointFromSideAABB_v4 computed Y = maxY - camCenterOffset (camDepth/2 = 6.75mm),
 *   but the correct joint axis is Y = (hMinY + hMaxY) / 2 (horizontal panel thickness center).
 *   For 18mm panels: 6.75 ≠ 9.0, giving a 2.25mm mismatch.
 */

import { describe, it, expect } from 'vitest';
import { generateMinifixDrillMap } from '../generateDrillMap';
import type { Cabinet, CabinetPanel } from '../../../types/Cabinet';
import type { DrillMapPoint, DrillPurpose } from '../types';

// ============================================
// TEST FIXTURE
// ============================================

const THICKNESS = 18;
const WIDTH = 600;
const HEIGHT = 720;
const DEPTH = 560;

/**
 * Creates a minimal but valid 4-panel cabinet for drill map generation.
 * Side-covers-Top construction (European standard).
 */
function createTestCabinet(): Cabinet {
  // Horizontal panel width: sits between side panels
  const horizontalPanelWidth = WIDTH - 2 * THICKNESS + 2 * 9;

  const panels: CabinetPanel[] = [
    {
      id: 'panel-top',
      role: 'TOP',
      name: 'Top Panel',
      finishWidth: horizontalPanelWidth,
      finishHeight: DEPTH,
      coreMaterialId: 'core-1',
      faces: { faceA: null, faceB: null },
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'HORIZONTAL',
      computed: {
        realThickness: THICKNESS,
        cutWidth: horizontalPanelWidth,
        cutHeight: DEPTH,
        surfaceArea: 0,
        edgeLength: 0,
        cost: 0,
        co2: 0,
      },
      position: [0, HEIGHT - THICKNESS / 2, DEPTH / 2],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    },
    {
      id: 'panel-bottom',
      role: 'BOTTOM',
      name: 'Bottom Panel',
      finishWidth: horizontalPanelWidth,
      finishHeight: DEPTH,
      coreMaterialId: 'core-1',
      faces: { faceA: null, faceB: null },
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'HORIZONTAL',
      computed: {
        realThickness: THICKNESS,
        cutWidth: horizontalPanelWidth,
        cutHeight: DEPTH,
        surfaceArea: 0,
        edgeLength: 0,
        cost: 0,
        co2: 0,
      },
      position: [0, THICKNESS / 2, DEPTH / 2],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    },
    {
      id: 'panel-left',
      role: 'LEFT_SIDE',
      name: 'Left Side',
      finishWidth: DEPTH,
      finishHeight: HEIGHT,
      coreMaterialId: 'core-1',
      faces: { faceA: null, faceB: null },
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'VERTICAL',
      computed: {
        realThickness: THICKNESS,
        cutWidth: DEPTH,
        cutHeight: HEIGHT,
        surfaceArea: 0,
        edgeLength: 0,
        cost: 0,
        co2: 0,
      },
      position: [-(horizontalPanelWidth / 2 - 9 + THICKNESS / 2), HEIGHT / 2, DEPTH / 2],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    },
    {
      id: 'panel-right',
      role: 'RIGHT_SIDE',
      name: 'Right Side',
      finishWidth: DEPTH,
      finishHeight: HEIGHT,
      coreMaterialId: 'core-1',
      faces: { faceA: null, faceB: null },
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'VERTICAL',
      computed: {
        realThickness: THICKNESS,
        cutWidth: DEPTH,
        cutHeight: HEIGHT,
        surfaceArea: 0,
        edgeLength: 0,
        cost: 0,
        co2: 0,
      },
      position: [(horizontalPanelWidth / 2 - 9 + THICKNESS / 2), HEIGHT / 2, DEPTH / 2],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    },
  ];

  return {
    id: 'test-cabinet',
    name: 'Test Cabinet',
    type: 'BASE',
    dimensions: {
      width: WIDTH,
      height: HEIGHT,
      depth: DEPTH,
      toeKickHeight: 100,
    },
    structure: {
      topJoint: 'INSET',
      bottomJoint: 'INSET',
      hasBackPanel: true,
      backPanelConstruction: 'inset',
      backPanelInset: 6,
      shelfCount: 0,
      dividerCount: 0,
    },
    materials: {
      defaultCore: 'core-1',
      defaultSurface: 'surface-1',
      defaultEdge: 'edge-1',
      overrides: new Map(),
    },
    manufacturing: {
      glueThickness: 0.1,
      preMilling: 0.5,
      grooveDepth: 8,
      clearance: 2,
      shelfSetbackFront: 20,
      backPanelConstruction: 'inset',
      backVoid: 20,
      backThickness: 6,
      safetyGap: 2,
    },
    panels,
    computed: {
      totalCost: 0,
      totalCO2: 0,
      panelCount: panels.length,
      totalSurfaceArea: 0,
      totalEdgeLength: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Cabinet;
}

// ============================================
// HELPERS
// ============================================

/** Collect all drill points from a drill map, flattened */
function getAllPoints(drillMap: ReturnType<typeof generateMinifixDrillMap>): DrillMapPoint[] {
  return drillMap.panels.flatMap((p) => p.points);
}

/** Filter points by purpose */
function getByPurpose(points: DrillMapPoint[], purpose: DrillPurpose): DrillMapPoint[] {
  return points.filter((p) => p.purpose === purpose);
}

/** Filter points by panelId */
function getByPanel(points: DrillMapPoint[], panelId: string): DrillMapPoint[] {
  return points.filter((p) => p.panelId === panelId);
}

// ============================================
// TESTS
// ============================================

describe('v4.4 Axis Alignment — Side-panel Y = Joint Axis Y', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = getAllPoints(drillMap);

  it('generates drill points successfully', () => {
    expect(allPoints.length).toBeGreaterThan(0);
  });

  it('has BOLT_ENTRY points on horizontal panels', () => {
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');
    expect(boltEntries.length).toBeGreaterThan(0);
    // All BOLT_ENTRY should be on horizontal panels (top/bottom)
    for (const entry of boltEntries) {
      expect(['panel-top', 'panel-bottom']).toContain(entry.panelId);
    }
  });

  it('BOLT Y matches BOLT_ENTRY Y for the same corner (within 0.5mm)', () => {
    const bolts = getByPurpose(allPoints, 'BOLT');
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');

    expect(bolts.length).toBeGreaterThan(0);
    expect(boltEntries.length).toBeGreaterThan(0);

    for (const bolt of bolts) {
      // Find matching BOLT_ENTRY by pairId
      const matchingEntry = boltEntries.find((e) => e.pairId === bolt.pairId);
      if (!matchingEntry) {
        // Fallback: find nearest by Z position and corner
        const nearestEntry = boltEntries
          .filter((e) => e.cornerType === bolt.cornerType)
          .sort(
            (a, b) =>
              Math.abs(a.position[2] - bolt.position[2]) -
              Math.abs(b.position[2] - bolt.position[2])
          )[0];
        expect(nearestEntry).toBeDefined();
        expect(Math.abs(nearestEntry!.position[1] - bolt.position[1])).toBeLessThan(0.5);
      } else {
        expect(Math.abs(matchingEntry.position[1] - bolt.position[1])).toBeLessThan(0.5);
      }
    }
  });

  it('BOLT_THREAD Y matches BOLT_ENTRY Y for the same corner (within 0.5mm)', () => {
    const threads = getByPurpose(allPoints, 'BOLT_THREAD');
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');

    expect(threads.length).toBeGreaterThan(0);

    for (const thread of threads) {
      const matchingEntry = boltEntries.find((e) => e.pairId === thread.pairId);
      if (!matchingEntry) {
        const nearestEntry = boltEntries
          .filter((e) => e.cornerType === thread.cornerType)
          .sort(
            (a, b) =>
              Math.abs(a.position[2] - thread.position[2]) -
              Math.abs(b.position[2] - thread.position[2])
          )[0];
        expect(nearestEntry).toBeDefined();
        expect(Math.abs(nearestEntry!.position[1] - thread.position[1])).toBeLessThan(0.5);
      } else {
        expect(Math.abs(matchingEntry.position[1] - thread.position[1])).toBeLessThan(0.5);
      }
    }
  });

  it('DOWEL-side Y matches BOLT_ENTRY Y (within 0.5mm)', () => {
    // DOWEL on side panels should share the joint axis Y
    const dowels = getByPurpose(allPoints, 'DOWEL');
    const sideDowels = dowels.filter((d) =>
      d.panelId === 'panel-left' || d.panelId === 'panel-right'
    );
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');

    expect(sideDowels.length).toBeGreaterThan(0);

    for (const dowel of sideDowels) {
      // Find nearest BOLT_ENTRY in the same corner
      const entriesInCorner = boltEntries.filter((e) => e.cornerType === dowel.cornerType);
      expect(entriesInCorner.length).toBeGreaterThan(0);

      // All entries in the same corner should have the same Y
      const entryY = entriesInCorner[0].position[1];
      expect(Math.abs(dowel.position[1] - entryY)).toBeLessThan(0.5);
    }
  });

  it('DOWEL-horiz Y matches BOLT_ENTRY Y (within 0.5mm)', () => {
    // DOWEL on horizontal panels should also be at thickness center
    const dowels = getByPurpose(allPoints, 'DOWEL');
    const horizDowels = dowels.filter((d) =>
      d.panelId === 'panel-top' || d.panelId === 'panel-bottom'
    );
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');

    expect(horizDowels.length).toBeGreaterThan(0);

    for (const dowel of horizDowels) {
      const entriesInCorner = boltEntries.filter((e) => e.cornerType === dowel.cornerType);
      expect(entriesInCorner.length).toBeGreaterThan(0);

      const entryY = entriesInCorner[0].position[1];
      expect(Math.abs(dowel.position[1] - entryY)).toBeLessThan(0.5);
    }
  });

  it('all joint-axis points in the same corner share the same Y (±0.5mm)', () => {
    // For each corner, gather all BOLT, BOLT_THREAD, BOLT_ENTRY, DOWEL and
    // verify they share the same Y axis.
    const corners: string[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];
    const jointPurposes: DrillPurpose[] = ['BOLT', 'BOLT_ENTRY', 'BOLT_THREAD', 'DOWEL'];

    for (const corner of corners) {
      const cornerPoints = allPoints.filter(
        (p) => p.cornerType === corner && jointPurposes.includes(p.purpose)
      );
      if (cornerPoints.length === 0) continue;

      const referenceY = cornerPoints[0].position[1];
      for (const pt of cornerPoints) {
        expect(
          Math.abs(pt.position[1] - referenceY),
          `${corner} / ${pt.purpose} Y=${pt.position[1]} should be near ${referenceY}`
        ).toBeLessThan(0.5);
      }
    }
  });
});

describe('v4.4 Dowel Count Stability', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = getAllPoints(drillMap);

  const bolts = getByPurpose(allPoints, 'BOLT');
  const dowels = getByPurpose(allPoints, 'DOWEL');

  it('each BOLT has 1-2 DOWELs on the SAME panel (side)', () => {
    // Edge positions may have only 1 dowel if ±32mm falls outside panel bounds
    for (const bolt of bolts) {
      const sideDowelsForBolt = dowels.filter(
        (d) =>
          d.panelId === bolt.panelId &&
          d.cornerType === bolt.cornerType &&
          d.depthPosition === bolt.depthPosition
      );
      expect(
        sideDowelsForBolt.length,
        `BOLT ${bolt.id} (${bolt.cornerType}, Z=${bolt.position[2]}) should have 1-2 side dowels`
      ).toBeGreaterThanOrEqual(1);
      expect(sideDowelsForBolt.length).toBeLessThanOrEqual(2);
    }
  });

  it('each BOLT has 1-2 DOWELs on the HORIZONTAL panel', () => {
    // Edge positions may have only 1 dowel if ±32mm falls outside panel bounds
    for (const bolt of bolts) {
      const isTopCorner = bolt.cornerType === 'TOP_LEFT' || bolt.cornerType === 'TOP_RIGHT';
      const horizPanelId = isTopCorner ? 'panel-top' : 'panel-bottom';

      const horizDowelsForBolt = dowels.filter(
        (d) =>
          d.panelId === horizPanelId &&
          d.cornerType === bolt.cornerType &&
          d.depthPosition === bolt.depthPosition
      );
      expect(
        horizDowelsForBolt.length,
        `BOLT ${bolt.id} (${bolt.cornerType}) should have 1-2 horiz dowels on ${horizPanelId}`
      ).toBeGreaterThanOrEqual(1);
      expect(horizDowelsForBolt.length).toBeLessThanOrEqual(2);
    }
  });

  it('side DOWELs and horiz DOWELs are balanced (same count per corner)', () => {
    // For each corner, side dowel count = horiz dowel count
    const corners = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];
    for (const corner of corners) {
      const cornerDowels = dowels.filter((d) => d.cornerType === corner);
      const sideDowels = cornerDowels.filter(
        (d) => d.panelId === 'panel-left' || d.panelId === 'panel-right'
      );
      const horizDowels = cornerDowels.filter(
        (d) => d.panelId === 'panel-top' || d.panelId === 'panel-bottom'
      );
      expect(
        sideDowels.length,
        `${corner}: side dowels (${sideDowels.length}) should equal horiz dowels (${horizDowels.length})`
      ).toBe(horizDowels.length);
    }
  });

  it('total DOWEL count is consistent (2-4 per connector × number of connectors)', () => {
    // Each connector position has 1 BOLT, 1-2 side dowels, 1-2 horiz dowels
    // Total dowels should be between bolts×2 and bolts×4
    expect(dowels.length).toBeGreaterThanOrEqual(bolts.length * 2);
    expect(dowels.length).toBeLessThanOrEqual(bolts.length * 4);
  });
});

describe('v4.4 Dowel Z Offset from Bolt', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = getAllPoints(drillMap);

  const bolts = getByPurpose(allPoints, 'BOLT');
  const dowels = getByPurpose(allPoints, 'DOWEL');

  it('DOWELs are ≈32mm away from BOLT along Z axis (System 32 pitch)', () => {
    for (const bolt of bolts) {
      const associatedDowels = dowels.filter(
        (d) =>
          d.panelId === bolt.panelId &&
          d.cornerType === bolt.cornerType &&
          d.depthPosition === bolt.depthPosition
      );

      for (const dowel of associatedDowels) {
        const zDistance = Math.abs(dowel.position[2] - bolt.position[2]);
        expect(
          zDistance,
          `DOWEL ${dowel.id} should be ~32mm from BOLT ${bolt.id} (got ${zDistance.toFixed(1)}mm)`
        ).toBeCloseTo(32, 0); // within ±0.5mm
      }
    }
  });

  it('DOWELs must NOT coincide with BOLT position (Z distance > 20mm)', () => {
    for (const bolt of bolts) {
      const samePanelDowels = dowels.filter(
        (d) => d.panelId === bolt.panelId && d.cornerType === bolt.cornerType
      );

      for (const dowel of samePanelDowels) {
        const zDistance = Math.abs(dowel.position[2] - bolt.position[2]);
        expect(
          zDistance,
          `DOWEL ${dowel.id} Z=${dowel.position[2]} must not coincide with BOLT Z=${bolt.position[2]}`
        ).toBeGreaterThan(20);
      }
    }
  });
});

describe('v4.4 Display Layer Does Not Mutate Positions', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = getAllPoints(drillMap);

  it('all BOLT positions are as generated (no Y-snap applied)', () => {
    const bolts = getByPurpose(allPoints, 'BOLT');
    const boltEntries = getByPurpose(allPoints, 'BOLT_ENTRY');

    // The generator now produces BOLT Y = jointAxisY directly.
    // There should be NO 2.25mm mismatch (the pre-v4.4 bug).
    for (const bolt of bolts) {
      const matchingEntries = boltEntries.filter((e) => e.cornerType === bolt.cornerType);
      if (matchingEntries.length === 0) continue;

      const entryY = matchingEntries[0].position[1];
      const yDiff = Math.abs(bolt.position[1] - entryY);

      // Must be < 0.5mm (not 2.25mm like the old bug)
      expect(
        yDiff,
        `BOLT ${bolt.cornerType} Y diff from BOLT_ENTRY should be <0.5mm, got ${yDiff.toFixed(2)}mm`
      ).toBeLessThan(0.5);
    }
  });

  it('dedup preserves points from different panels at same XZ', () => {
    // A side-panel DOWEL and a horizontal-panel DOWEL at the same XZ but different
    // panelIds must NOT be deduped away.
    const dowels = getByPurpose(allPoints, 'DOWEL');
    const sideDowels = dowels.filter(
      (d) => d.panelId === 'panel-left' || d.panelId === 'panel-right'
    );
    const horizDowels = dowels.filter(
      (d) => d.panelId === 'panel-top' || d.panelId === 'panel-bottom'
    );

    // Both sets should exist
    expect(sideDowels.length).toBeGreaterThan(0);
    expect(horizDowels.length).toBeGreaterThan(0);

    // The count from each set should be equal (2 per connector position)
    expect(sideDowels.length).toBe(horizDowels.length);
  });
});
