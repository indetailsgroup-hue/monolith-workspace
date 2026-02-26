/**
 * DrillMap Golden Snapshot — A-run INSET 600×720×560 18mm
 *
 * End-to-end regression test that generates a full DrillMap from a reference
 * cabinet and compares against a committed golden JSON.
 *
 * Usage:
 *   Normal run:  npx vitest run drillMapGolden
 *   Update:      UPDATE_GOLDEN=1 npx vitest run drillMapGolden
 *
 * What it catches:
 *   - Point count / purpose distribution changes
 *   - Position / normal / boltDirection / targetPocketCenter drift
 *   - Diameter / depth changes
 *   - Bolt→pocket linkage contract violations
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { generateMinifixDrillMap } from '../generateDrillMap';
import { validateBoltPocketLinkage } from '../validateBoltPocketLinkage';
import type { Cabinet, CabinetPanel } from '../../../types/Cabinet';
import type { DrillMapPoint, Vec3Tuple } from '../types';

// ============================================
// FIXTURE: A-run INSET 600×720×560 18mm
// (copied from axisAlignmentAndDowelCount.test.ts — single source of truth for this config)
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
// GOLDEN HELPERS
// ============================================

const GOLDEN_PATH = path.join(
  __dirname,
  '..',
  '__fixtures__',
  'A_RUN_INSET_600x720x560_18mm.golden.json',
);

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const roundV3 = (v: Vec3Tuple): Vec3Tuple => [round3(v[0]), round3(v[1]), round3(v[2])];

/** Keep only stable, contract-relevant fields (avoid churn from debug fields / timestamps) */
function normalizePoint(p: DrillMapPoint) {
  return {
    id: p.id,
    purpose: p.purpose,
    panelId: p.panelId ?? null,
    cornerType: p.cornerType ?? null,
    pairKeyV2: p.pairKeyV2 ?? null,
    position: roundV3(p.position),
    normal: p.normal ? roundV3(p.normal) : null,
    boltDirection: p.boltDirection ? roundV3(p.boltDirection as Vec3Tuple) : null,
    targetPocketCenter: p.targetPocketCenter ? roundV3(p.targetPocketCenter as Vec3Tuple) : null,
    diameter: typeof p.diameter === 'number' ? round3(p.diameter) : null,
    depth: typeof p.depth === 'number' ? round3(p.depth) : null,
  };
}

/** Deterministic ordering: purpose → panelId → cornerType → pairKeyV2 → id */
function stableSort(points: ReturnType<typeof normalizePoint>[]) {
  return [...points].sort((a, b) => {
    const ka = `${a.purpose}|${a.panelId}|${a.cornerType}|${a.pairKeyV2}|${a.id}`;
    const kb = `${b.purpose}|${b.panelId}|${b.cornerType}|${b.pairKeyV2}|${b.id}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function readGolden(): any {
  return JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
}

function writeGolden(payload: any) {
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

// ============================================
// TESTS
// ============================================

describe('DrillMap Golden — A-run INSET 600×720×560 18mm', () => {
  const cabinet = createTestCabinet();
  const drillMap = generateMinifixDrillMap(cabinet);
  const allPoints = drillMap.panels.flatMap(p => p.points);

  test('bolt→pocket linkage invariant holds for all BOLT points', () => {
    const issues = validateBoltPocketLinkage(allPoints as any, 0.99);
    expect(issues).toEqual([]);
  });

  test('every BOLT with targetPocketCenter has valid boltDirection', () => {
    for (const p of allPoints) {
      if (p.purpose !== 'BOLT') continue;
      if (!p.targetPocketCenter) continue;
      expect(p.boltDirection, `${p.pairKeyV2}: boltDirection must exist`).toBeTruthy();
      expect(
        (p.boltDirection as Vec3Tuple).length,
        `${p.pairKeyV2}: boltDirection must be Vec3`,
      ).toBe(3);
    }
  });

  test('matches golden snapshot (normalized + stable-sorted)', () => {
    const normalized = stableSort(allPoints.map(normalizePoint));

    const golden = readGolden();
    const nextGolden = {
      ...golden,
      points: normalized,
    };

    // Update mode: UPDATE_GOLDEN=1 npx vitest run drillMapGolden
    if (process.env.UPDATE_GOLDEN === '1') {
      writeGolden(nextGolden);
      // Re-read to ensure we compare what was written
      const freshGolden = readGolden();
      expect(nextGolden).toEqual(freshGolden);
      return;
    }

    expect(nextGolden).toEqual(golden);
  });
});
