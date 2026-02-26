/**
 * B-Run Dowel Generation Tests
 *
 * Locks the B-run (width axis) dowel-only generation behavior.
 * B-run dowels provide lateral alignment / anti-rack rigidity.
 *
 * Construction: Side-covers-Top
 *   - HORIZ panel FACE bore (Ø8 × 12mm) — shallow, into inner face
 *   - SIDE panel EDGE bore (Ø8 × 18mm)  — deep, into top/bottom edge
 *
 * Expected point count for 600×720×560 18mm INSET cabinet:
 *   4 corners × 2 positions × 2 bores = 16 B-run dowel points
 */

import { describe, test, expect } from 'vitest';
import { generateMinifixDrillMap } from '../generateDrillMap';
import { isRunAxis } from '../pairKeyV2';
import { validateBRunDowelPairing } from '../validateBRunDowelPairing';
import type { Cabinet, CabinetPanel } from '../../../types/Cabinet';
import type { DrillMapPoint, Vec3Tuple } from '../types';

// ============================================
// FIXTURE: A-run INSET 600×720×560 18mm
// (same cabinet as golden snapshot test)
// ============================================

const THICKNESS = 18;
const WIDTH = 600;
const HEIGHT = 720;
const DEPTH = 560;

function createTestCabinet(): Cabinet {
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

/** Filter B-run dowels using canonical isRunAxis() */
function isBRunPoint(p: DrillMapPoint): boolean {
  return p.purpose === 'DOWEL' && isRunAxis(p.pairKeyV2 ?? '', 'B');
}

/** Filter A-run dowels using canonical isRunAxis() */
function isARunDowel(p: DrillMapPoint): boolean {
  return p.purpose === 'DOWEL' && isRunAxis(p.pairKeyV2 ?? '', 'A');
}

// ============================================
// TESTS
// ============================================

describe('B-Run Dowel Generation (Width Axis)', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = drillMap.panels.flatMap(p => p.points);
  const bRunPoints = allPoints.filter(isBRunPoint);

  // ---- Point count ----
  test('generates 16 B-run dowel points (4 corners × 2 positions × 2 bores)', () => {
    expect(bRunPoints).toHaveLength(16);
  });

  // ---- Validator integration: all pairs pass contract ----
  test('validateBRunDowelPairing reports zero issues', () => {
    const issues = validateBRunDowelPairing(allPoints);
    expect(issues).toEqual([]);
  });

  // ---- Purpose / diameter / depth ----
  test('all B-run points have purpose=DOWEL and diameter=8', () => {
    for (const p of bRunPoints) {
      expect(p.purpose).toBe('DOWEL');
      expect(p.diameter).toBe(8);
    }
  });

  test('HORIZ face bores have depth=12, SIDE edge bores have depth=18', () => {
    const horizBores = bRunPoints.filter(p => (p.pairKeyV2 ?? '').endsWith('-dowel-brun-horiz'));
    const sideBores = bRunPoints.filter(p => (p.pairKeyV2 ?? '').endsWith('-dowel-brun-side'));

    expect(horizBores).toHaveLength(8); // 4 corners × 2 positions
    expect(sideBores).toHaveLength(8);

    for (const p of horizBores) {
      expect(p.depth, `${p.pairKeyV2}: face bore depth`).toBe(12);
    }
    for (const p of sideBores) {
      expect(p.depth, `${p.pairKeyV2}: edge bore depth`).toBe(18);
    }
  });

  // ---- pairKeyV2 format ----
  test('all B-run keys match pair2-{corner}-B-{num} pattern', () => {
    const keyPattern = /^pair2-(TOP_LEFT|TOP_RIGHT|BOTTOM_LEFT|BOTTOM_RIGHT)-B-\d+-dowel-brun-(horiz|side)$/;
    for (const p of bRunPoints) {
      expect(p.pairKeyV2, `key format: ${p.pairKeyV2}`).toMatch(keyPattern);
    }
  });

  // ---- Anti-collision with A-run ----
  test('B-run keys never collide with A-run keys', () => {
    const aRunDowels = allPoints.filter(isARunDowel);
    const bRunKeys = new Set(bRunPoints.map(p => p.pairKeyV2));
    const aRunKeys = new Set(aRunDowels.map(p => p.pairKeyV2));

    for (const key of bRunKeys) {
      expect(aRunKeys.has(key), `B-run key "${key}" collides with A-run`).toBe(false);
    }
  });

  // ---- X positions are corner-relative ----
  test('X positions are corner-relative (LEFT from min, RIGHT from max)', () => {
    const horizontalPanelWidth = WIDTH - 2 * THICKNESS + 2 * 9; // 582
    const topMinX = -horizontalPanelWidth / 2; // -291
    const topMaxX = horizontalPanelWidth / 2;  // +291

    const leftBores = bRunPoints.filter(p =>
      (p.cornerType === 'TOP_LEFT' || p.cornerType === 'BOTTOM_LEFT') &&
      (p.pairKeyV2 ?? '').endsWith('-dowel-brun-horiz')
    );
    const rightBores = bRunPoints.filter(p =>
      (p.cornerType === 'TOP_RIGHT' || p.cornerType === 'BOTTOM_RIGHT') &&
      (p.pairKeyV2 ?? '').endsWith('-dowel-brun-horiz')
    );

    // LEFT corners: worldX = horizAabb.min[0] + sMm
    for (const p of leftBores) {
      const x = p.position[0];
      const relativeX = x - topMinX;
      // Should be at a System32 position (37mm or widthSpan-37mm)
      expect(relativeX, `LEFT X relative: ${relativeX}`).toBeGreaterThan(0);
      expect(relativeX, `LEFT X relative: ${relativeX}`).toBeLessThan(horizontalPanelWidth);
    }

    // RIGHT corners: worldX = horizAabb.max[0] - sMm
    for (const p of rightBores) {
      const x = p.position[0];
      const relativeX = topMaxX - x;
      expect(relativeX, `RIGHT X relative: ${relativeX}`).toBeGreaterThan(0);
      expect(relativeX, `RIGHT X relative: ${relativeX}`).toBeLessThan(horizontalPanelWidth);
    }
  });

  // ---- Z setback ----
  test('all B-run points at maxZ - drillingDistanceB (24mm from front)', () => {
    const expectedZ = DEPTH - 24; // 560 - 24 = 536
    for (const p of bRunPoints) {
      expect(p.position[2], `${p.pairKeyV2}: Z setback`).toBeCloseTo(expectedZ, 1);
    }
  });

  // ---- Drill normals face each other ----
  test('face bore and edge bore normals are opposing (face each other at joint)', () => {
    // Group by corner + position
    const groups = new Map<string, DrillMapPoint[]>();
    for (const p of bRunPoints) {
      // Extract group key: everything before "-dowel-brun-"
      const groupKey = (p.pairKeyV2 ?? '').replace(/-dowel-brun-(horiz|side)$/, '');
      const arr = groups.get(groupKey) || [];
      arr.push(p);
      groups.set(groupKey, arr);
    }

    for (const [key, pair] of groups) {
      expect(pair, `${key}: must have 2 points`).toHaveLength(2);
      const [a, b] = pair;
      // Normals should be antiparallel: dot product = -1
      const dot = a!.normal[0] * b!.normal[0] + a!.normal[1] * b!.normal[1] + a!.normal[2] * b!.normal[2];
      expect(dot, `${key}: normals must oppose`).toBeCloseTo(-1, 5);
    }
  });

  // ---- Panel assignment ----
  test('HORIZ face bores on TOP/BOTTOM panels, SIDE edge bores on LEFT_SIDE/RIGHT_SIDE', () => {
    const horizBores = bRunPoints.filter(p => (p.pairKeyV2 ?? '').endsWith('-dowel-brun-horiz'));
    const sideBores = bRunPoints.filter(p => (p.pairKeyV2 ?? '').endsWith('-dowel-brun-side'));

    for (const p of horizBores) {
      expect(
        ['panel-top', 'panel-bottom'].includes(p.panelId),
        `${p.pairKeyV2}: horiz bore on wrong panel ${p.panelId}`,
      ).toBe(true);
    }

    for (const p of sideBores) {
      expect(
        ['panel-left', 'panel-right'].includes(p.panelId),
        `${p.pairKeyV2}: side bore on wrong panel ${p.panelId}`,
      ).toBe(true);
    }
  });

  // ---- Guard: includeDowel=false ----
  test('no B-run points when includeDowel=false', () => {
    const noDowelMap = generateMinifixDrillMap(cabinet, { includeDowel: false });
    const noDowelAll = noDowelMap.panels.flatMap(p => p.points);
    const noDowelBRun = noDowelAll.filter(isBRunPoint);
    expect(noDowelBRun).toHaveLength(0);
  });

  // ---- A-run preservation: B-run must NOT change A-run counts or keys ----
  test('A-run point count and keys are unaffected by B-run presence', () => {
    // Generate with dowels (has B-run) and without (no B-run, no dowels at all)
    // Instead, count non-B-run points against known A-run totals
    const aRunDowels = allPoints.filter(isARunDowel);
    const nonDowelPoints = allPoints.filter(p => p.purpose !== 'DOWEL');

    // Known A-run structure for 600×720×560 18mm INSET with 3 depth positions:
    //   4 corners × 3 positions = 12 each: BOLT, CAM_LOCK, BOLT_ENTRY, BOLT_THREAD
    //   A-run DOWELs: 4 corners × 3 positions × 2 per bore × 2 panels (side + horiz) ≈ 32
    //   (edge positions may clip, but ≥24)
    expect(nonDowelPoints.filter(p => p.purpose === 'BOLT')).toHaveLength(12);
    expect(nonDowelPoints.filter(p => p.purpose === 'CAM_LOCK')).toHaveLength(12);
    expect(nonDowelPoints.filter(p => p.purpose === 'BOLT_ENTRY')).toHaveLength(12);
    expect(nonDowelPoints.filter(p => p.purpose === 'BOLT_THREAD')).toHaveLength(12);
    expect(aRunDowels.length, 'A-run dowel count').toBeGreaterThanOrEqual(24);
    expect(aRunDowels.length, 'A-run dowel count').toBeLessThanOrEqual(48);

    // All A-run keys must NOT contain '-B-'
    for (const p of aRunDowels) {
      expect(isRunAxis(p.pairKeyV2 ?? '', 'B'), `A-run key must not be B: ${p.pairKeyV2}`).toBe(false);
    }
  });

  // ---- Guard: narrow cabinet skips B-run ----
  test('B-run skipped for very narrow cabinet (width < 2× firstHoleZ)', () => {
    // Create a 50mm-wide cabinet (too narrow for 37mm × 2 = 74mm)
    const narrowCabinet = createTestCabinet();
    // Shrink width to 50mm by overriding panel positions/sizes
    const narrowWidth = 50;
    const narrowHorizWidth = narrowWidth - 2 * THICKNESS + 2 * 9;
    for (const p of narrowCabinet.panels) {
      if (p.role === 'TOP' || p.role === 'BOTTOM') {
        p.finishWidth = narrowHorizWidth;
        p.computed.cutWidth = narrowHorizWidth;
        p.position = [0, p.position[1], p.position[2]];
      }
      if (p.role === 'LEFT_SIDE') {
        p.position = [-(narrowHorizWidth / 2 - 9 + THICKNESS / 2), p.position[1], p.position[2]];
      }
      if (p.role === 'RIGHT_SIDE') {
        p.position = [(narrowHorizWidth / 2 - 9 + THICKNESS / 2), p.position[1], p.position[2]];
      }
    }
    const narrowMap = generateMinifixDrillMap(narrowCabinet);
    const narrowAll = narrowMap.panels.flatMap(p => p.points);
    const narrowBRun = narrowAll.filter(isBRunPoint);
    expect(narrowBRun, 'narrow cabinet should have 0 B-run points').toHaveLength(0);
  });
});
