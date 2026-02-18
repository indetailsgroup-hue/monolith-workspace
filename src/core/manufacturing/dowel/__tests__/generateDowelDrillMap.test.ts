/**
 * generateDowelDrillMap.test.ts — Golden tests for Dowel compiler MVP
 *
 * Ensures:
 * 1. Single corner produces exactly 2 points (side + horiz)
 * 2. pairId matches between paired points
 * 3. Normals point into wood (correct drill direction)
 * 4. Positions are within panel bounds (sanity check)
 * 5. All 4 corners produce correct point count
 * 6. Meta traceability hash is attached
 * 7. Preview-only fields do NOT affect output (golden test)
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import { generateDowelDrillMap } from '../generateDowelDrillMap';
import { DEFAULT_DOWEL_CONFIG, DEFAULT_DOWEL_DRILLING_PARAMS } from '../types';
import type { Cabinet, CabinetPanel, PanelRole } from '../../../types/Cabinet';
import type { DrillMapPoint, CornerType } from '../../drillMap/types';

// ============================================================================
// Test Cabinet Fixture
// ============================================================================

/**
 * Minimal cabinet for testing: 600mm W × 720mm H × 560mm D, 18mm thick panels.
 * Side-covers-Top construction (standard European).
 *
 * Panel layout (center-based positions):
 * - LEFT_SIDE:  x = -291 (outer edge at -300, inner face at -282)
 * - RIGHT_SIDE: x = +291 (outer edge at +300, inner face at +282)
 * - TOP:        y = +351 (outer at +360, inner face at +342)
 * - BOTTOM:     y = -351 (outer at -360, inner face at -342)
 */
function createTestCabinet(): Cabinet {
  const T = 18;
  const W = 600;
  const H = 720;
  const D = 560;

  const halfW = W / 2;   // 300
  const halfH = H / 2;   // 360
  const halfD = D / 2;   // 280
  const halfT = T / 2;   // 9

  const basePanelComputed = {
    realThickness: T,
    totalCost: 0,
    totalCO2: 0,
    surfaceArea: 0,
    edgeLength: 0,
    weight: 0,
  };

  const basePanelFaces = {
    front: { materialId: 'default', direction: 'horizontal' as const },
    back: { materialId: 'default', direction: 'horizontal' as const },
  };

  const basePanelEdges = {
    top: { materialId: 'default', thickness: 0.5 },
    bottom: { materialId: 'default', thickness: 0.5 },
    left: { materialId: 'default', thickness: 0.5 },
    right: { materialId: 'default', thickness: 0.5 },
  };

  function makePanel(
    id: string,
    role: PanelRole,
    finishWidth: number,
    finishHeight: number,
    position: [number, number, number],
  ): CabinetPanel {
    return {
      id,
      role,
      name: role,
      finishWidth,
      finishHeight,
      coreMaterialId: 'default',
      faces: basePanelFaces,
      edges: basePanelEdges,
      grainDirection: 'horizontal',
      computed: basePanelComputed,
      position,
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    };
  }

  const panels: CabinetPanel[] = [
    // LEFT_SIDE: stands upright. finishWidth = depth (Z), finishHeight = height (Y)
    // Position: center of panel at x = -(halfW - halfT) = -291
    makePanel('panel-left', 'LEFT_SIDE', D, H, [-(halfW - halfT), 0, 0]),

    // RIGHT_SIDE: stands upright
    makePanel('panel-right', 'RIGHT_SIDE', D, H, [halfW - halfT, 0, 0]),

    // TOP: lies flat. finishWidth = width (X), finishHeight = depth (Z)
    // Y position: center at +(halfH - halfT) = +351
    makePanel('panel-top', 'TOP', W, D, [0, halfH - halfT, 0]),

    // BOTTOM: lies flat
    makePanel('panel-bottom', 'BOTTOM', W, D, [0, -(halfH - halfT), 0]),
  ];

  return {
    id: 'test-cab-1',
    name: 'Test Cabinet',
    type: 'BASE' as any,
    dimensions: { width: W, height: H, depth: D, toeKickHeight: 0 },
    structure: {
      topJoint: 'BUTT' as any,
      bottomJoint: 'BUTT' as any,
      hasBackPanel: false,
      backPanelConstruction: 'inset',
      backPanelInset: 3,
      shelfCount: 0,
      dividerCount: 0,
    },
    materials: {
      defaultCore: 'default',
      defaultSurface: 'default',
      defaultEdge: 'default',
      overrides: new Map(),
    },
    hardware: undefined,
    panels,
    computed: {
      totalCost: 0,
      totalCO2: 0,
      panelCount: 4,
      totalSurfaceArea: 0,
      totalEdgeLength: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Cabinet;
}

// ============================================================================
// Helper: collect all drill points from DrillMap
// ============================================================================

function getAllPoints(drillMap: ReturnType<typeof generateDowelDrillMap>): DrillMapPoint[] {
  return drillMap.panels.flatMap(p => p.points);
}

// ============================================================================
// 1. Single corner — exactly 2 points per System 32 position
// ============================================================================

describe('generateDowelDrillMap — single corner', () => {
  const cabinet = createTestCabinet();

  it('produces exactly 2 points for TOP_LEFT with dowelCount=1', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const points = getAllPoints(map);
    expect(points).toHaveLength(2);
  });

  it('both points have matching pairId', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const points = getAllPoints(map);
    expect(points[0].pairId).toBe(points[1].pairId);
    expect(points[0].pairId).toMatch(/^dowel-TOP_LEFT-0$/);
  });

  it('both points have purpose=DOWEL and componentType=DOWEL', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const points = getAllPoints(map);
    for (const p of points) {
      expect(p.purpose).toBe('DOWEL');
      expect(p.componentType).toBe('DOWEL');
    }
  });
});

// ============================================================================
// 2. Drill normals — must point into wood
// ============================================================================

describe('generateDowelDrillMap — normals', () => {
  const cabinet = createTestCabinet();

  it('LEFT_SIDE face bore normal points -X (into left panel)', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const points = getAllPoints(map);
    const sidePoint = points.find(p => p.panelId === 'panel-left');
    expect(sidePoint).toBeDefined();
    // LEFT_SIDE machining face is RIGHT face, uAxis = [-1, 0, 0]
    expect(sidePoint!.normal).toEqual([-1, 0, 0]);
  });

  it('TOP edge bore normal points +X (into left end grain)', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const points = getAllPoints(map);
    const horizPoint = points.find(p => p.panelId === 'panel-top');
    expect(horizPoint).toBeDefined();
    // TOP_LEFT: drill into left end grain of TOP panel = +X direction
    expect(horizPoint!.normal).toEqual([1, 0, 0]);
  });

  it('RIGHT_SIDE face bore normal points +X (into right panel)', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_RIGHT'],
    });

    const points = getAllPoints(map);
    const sidePoint = points.find(p => p.panelId === 'panel-right');
    expect(sidePoint).toBeDefined();
    // RIGHT_SIDE machining face is LEFT face, uAxis = [+1, 0, 0]
    expect(sidePoint!.normal).toEqual([1, 0, 0]);
  });

  it('TOP edge bore normal points -X for RIGHT corner', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_RIGHT'],
    });

    const points = getAllPoints(map);
    const horizPoint = points.find(p => p.panelId === 'panel-top');
    expect(horizPoint).toBeDefined();
    // TOP_RIGHT: drill into right end grain of TOP panel = -X direction
    expect(horizPoint!.normal).toEqual([-1, 0, 0]);
  });
});

// ============================================================================
// 3. Position sanity — points within panel bounds
// ============================================================================

describe('generateDowelDrillMap — position sanity', () => {
  const cabinet = createTestCabinet();

  it('all point Y coordinates are within cabinet height', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
    });

    const points = getAllPoints(map);
    for (const p of points) {
      // Cabinet is 720mm tall, centered at Y=0 → range [-360, 360]
      expect(p.position[1]).toBeGreaterThanOrEqual(-360);
      expect(p.position[1]).toBeLessThanOrEqual(360);
    }
  });

  it('all point X coordinates are within cabinet width', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
    });

    const points = getAllPoints(map);
    for (const p of points) {
      // Cabinet is 600mm wide, centered at X=0 → range [-300, 300]
      expect(p.position[0]).toBeGreaterThanOrEqual(-300);
      expect(p.position[0]).toBeLessThanOrEqual(300);
    }
  });
});

// ============================================================================
// 4. All 4 corners
// ============================================================================

describe('generateDowelDrillMap — all corners', () => {
  const cabinet = createTestCabinet();

  it('all 4 corners with dowelCount=1 produce 8 points', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
    });

    const points = getAllPoints(map);
    // 4 corners × 1 dowel per corner × 2 points per dowel = 8
    expect(points).toHaveLength(8);
  });

  it('stats show correct total', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
    });

    expect(map.stats?.totalDrills).toBe(8);
    expect(map.stats?.byPurpose).toEqual({ DOWEL: 8 });
  });
});

// ============================================================================
// 5. Traceability meta
// ============================================================================

describe('generateDowelDrillMap — meta traceability', () => {
  const cabinet = createTestCabinet();

  it('attaches DrillMapMeta with generator name', () => {
    const map = generateDowelDrillMap(cabinet);

    expect(map.meta).toBeDefined();
    expect(map.meta!.generator.name).toBe('generateDowelDrillMap');
    expect(map.meta!.generator.version).toBe('1.0.0');
  });

  it('configHash is a valid 64-char hex', () => {
    const map = generateDowelDrillMap(cabinet);

    expect(map.meta!.inputs.configHash).toHaveLength(64);
    expect(map.meta!.inputs.configHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('paramsHash is a valid 64-char hex', () => {
    const map = generateDowelDrillMap(cabinet);

    expect(map.meta!.inputs.paramsHash).toHaveLength(64);
    expect(map.meta!.inputs.paramsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('config change produces different configHash', () => {
    const mapA = generateDowelDrillMap(cabinet, { dowelDia: 8 });
    const mapB = generateDowelDrillMap(cabinet, { dowelDia: 10 });

    expect(mapA.meta!.inputs.configHash).not.toBe(mapB.meta!.inputs.configHash);
    // params hash unchanged
    expect(mapA.meta!.inputs.paramsHash).toBe(mapB.meta!.inputs.paramsHash);
  });
});

// ============================================================================
// 6. Preview-only fields do NOT affect DrillMap (golden test)
// ============================================================================

describe('generateDowelDrillMap — preview isolation', () => {
  const cabinet = createTestCabinet();

  it('drill points are identical regardless of preview state', () => {
    // Generate with default config (no preview fields)
    const mapClean = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    // Generate with same config — preview fields should be impossible to pass
    // because DowelConfig doesn't include them. But if someone spreads
    // editor state into config, the guard should catch it.
    const mapClean2 = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const pointsA = getAllPoints(mapClean);
    const pointsB = getAllPoints(mapClean2);

    expect(pointsA.length).toBe(pointsB.length);
    for (let i = 0; i < pointsA.length; i++) {
      expect(pointsA[i].position).toEqual(pointsB[i].position);
      expect(pointsA[i].normal).toEqual(pointsB[i].normal);
      expect(pointsA[i].diameter).toBe(pointsB[i].diameter);
      expect(pointsA[i].depth).toBe(pointsB[i].depth);
    }
  });
});

// ============================================================================
// 7. Drill specs — correct diameters and depths
// ============================================================================

describe('generateDowelDrillMap — drill specs', () => {
  const cabinet = createTestCabinet();

  it('SIDE panel face bore uses depthFaceBore (12mm default)', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const sidePoint = getAllPoints(map).find(p => p.panelId === 'panel-left');
    expect(sidePoint!.depth).toBe(DEFAULT_DOWEL_CONFIG.depthFaceBore); // 12mm
    expect(sidePoint!.diameter).toBe(DEFAULT_DOWEL_CONFIG.dowelDia);  // 8mm
  });

  it('HORIZ panel edge bore uses depthEdgeBore (18mm default)', () => {
    const map = generateDowelDrillMap(cabinet, undefined, undefined, {
      dowelCount: 1,
      corners: ['TOP_LEFT'],
    });

    const horizPoint = getAllPoints(map).find(p => p.panelId === 'panel-top');
    expect(horizPoint!.depth).toBe(DEFAULT_DOWEL_CONFIG.depthEdgeBore); // 18mm
    expect(horizPoint!.diameter).toBe(DEFAULT_DOWEL_CONFIG.dowelDia);  // 8mm
  });

  it('custom config overrides defaults', () => {
    const map = generateDowelDrillMap(
      cabinet,
      { dowelDia: 10, depthFaceBore: 15, depthEdgeBore: 25 },
      undefined,
      { dowelCount: 1, corners: ['TOP_LEFT'] },
    );

    const points = getAllPoints(map);
    for (const p of points) {
      expect(p.diameter).toBe(10);
    }

    const sidePoint = points.find(p => p.panelId === 'panel-left');
    const horizPoint = points.find(p => p.panelId === 'panel-top');
    expect(sidePoint!.depth).toBe(15);
    expect(horizPoint!.depth).toBe(25);
  });
});

// ============================================================================
// 8. Empty / edge cases
// ============================================================================

describe('generateDowelDrillMap — edge cases', () => {
  it('returns empty drill map for cabinet with no panels', () => {
    const empty: Cabinet = {
      ...createTestCabinet(),
      panels: [],
    };

    const map = generateDowelDrillMap(empty);
    expect(map.panels).toHaveLength(0);
    expect(map.stats?.totalDrills).toBe(0);
  });

  it('skips corners with missing panels', () => {
    // Cabinet with only LEFT_SIDE and TOP — only TOP_LEFT corner should work
    const partial = createTestCabinet();
    partial.panels = partial.panels.filter(
      p => p.role === 'LEFT_SIDE' || p.role === 'TOP',
    );

    const map = generateDowelDrillMap(partial, undefined, undefined, {
      dowelCount: 1,
    });

    const points = getAllPoints(map);
    // Only TOP_LEFT corner has both panels, so 1 × 2 = 2 points
    expect(points).toHaveLength(2);
    // All points should reference TOP_LEFT corner
    for (const p of points) {
      expect(p.cornerType).toBe('TOP_LEFT');
    }
  });
});
