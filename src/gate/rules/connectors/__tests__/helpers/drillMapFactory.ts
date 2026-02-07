/**
 * DrillMap Test Factory
 *
 * Provides helper functions for creating test fixtures.
 * Reduces boilerplate and ensures consistent test data.
 *
 * Usage:
 * ```ts
 * const cam = makeCam({ pairedHoleId: 'bolt-1', y: 100 });
 * const bolt = makeBolt({ id: 'bolt-1', y: 100 });
 * const drillMap = onePanel([cam, bolt]);
 * ```
 *
 * v1.0: Initial implementation
 */

import type { DrillMap, DrillMapPoint, Vec3Tuple } from '../../../../../core/manufacturing/drillMap/types';

// ============================================
// TYPES
// ============================================

export type PartialPoint = Partial<DrillMapPoint> & { id?: string };

// ============================================
// AXIS CONSTANTS (Re-export for convenience)
// ============================================

export const AXIS = { X: 0, Y: 1, Z: 2 } as const;

// ============================================
// VECTOR HELPERS
// ============================================

/**
 * Create a Vec3Tuple from x, y, z values.
 * Defaults to origin [0, 0, 0].
 */
export function v(x = 0, y = 0, z = 0): Vec3Tuple {
  return [x, y, z];
}

// ============================================
// UID GENERATOR
// ============================================

let seq = 0;

/**
 * Generate a unique ID with prefix.
 * @example uid('cam') => 'cam-1', 'cam-2', ...
 */
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/**
 * Reset the UID sequence (call in beforeEach if needed).
 */
export function resetUidSequence(): void {
  seq = 0;
}

// ============================================
// POINT FACTORIES
// ============================================

/**
 * Create a base DrillMapPoint with sensible defaults.
 */
export function makePoint(overrides: PartialPoint & { id: string }): DrillMapPoint {
  return {
    id: overrides.id,
    panelId: overrides.panelId ?? 'test-panel-001',
    operationId: overrides.operationId ?? `op-${overrides.id}`,
    position: overrides.position ?? [0, 100, 0],
    normal: overrides.normal ?? [0, 1, 0],
    diameter: overrides.diameter ?? 15,
    depth: overrides.depth ?? 12.5,
    throughHole: overrides.throughHole ?? false,
    purpose: overrides.purpose ?? 'MINIFIX',
    face: overrides.face ?? 'TOP',
    status: overrides.status ?? 'VALID',
    componentType: overrides.componentType ?? 'HOUSING',
    pairedHoleId: overrides.pairedHoleId,
    edgeDistance: overrides.edgeDistance,
    connectedPanelRole: overrides.connectedPanelRole,
  };
}

/**
 * Create a Cam (HOUSING) DrillMapPoint.
 *
 * Geometry defaults (Y-up):
 * - Position: [0, y, 0]
 * - Normal: [0, -1, 0] (drills down into horizontal panel)
 * - camDepth: 13.5mm → pocket center Y = y - 6.75 (18mm wood default)
 */
export function makeCam(opts: {
  id?: string;
  y?: number;
  position?: Vec3Tuple;
  normal?: Vec3Tuple;
  pairedHoleId?: string;
} = {}): DrillMapPoint {
  const id = opts.id ?? uid('cam');
  const y = opts.y ?? 100;

  return makePoint({
    id,
    componentType: 'HOUSING',
    purpose: 'MINIFIX',
    position: opts.position ?? [0, y, 0],
    normal: opts.normal ?? [0, -1, 0], // Cam drills DOWN into horizontal panel
    diameter: 15, // Minifix housing is 15mm
    depth: 13.5, // Standard cam depth (18mm wood per Häfele FF 3.10)
    face: 'BOTTOM', // Cam drills into bottom face of horizontal panel
    pairedHoleId: opts.pairedHoleId,
  });
}

/**
 * Create a Bolt DrillMapPoint.
 *
 * Geometry defaults (Y-up):
 * - Position: [10, y, 0]
 * - Normal: [-1, 0, 0] (drills horizontally into vertical panel, toward cam)
 * - ballHeadOffset: 9.5mm → ball center is at position + normal * offset
 */
export function makeBolt(opts: {
  id?: string;
  y?: number;
  position?: Vec3Tuple;
  normal?: Vec3Tuple;
} = {}): DrillMapPoint {
  const id = opts.id ?? uid('bolt');
  const y = opts.y ?? 100;

  return makePoint({
    id,
    componentType: 'BOLT',
    purpose: 'MINIFIX',
    position: opts.position ?? [10, y, 0],
    normal: opts.normal ?? [-1, 0, 0], // Bolt drills HORIZONTALLY into vertical panel
    diameter: 10, // Bolt hole is typically 10mm
    depth: 34, // Standard bolt hole depth
    face: 'LEFT', // Bolt drills into edge of vertical panel
  });
}

// ============================================
// DRILLMAP FACTORIES
// ============================================

/**
 * Create a full DrillMap structure.
 */
export function makeDrillMap(
  panels: Array<{ panelId: string; points: DrillMapPoint[] }>
): DrillMap {
  return {
    version: 'drillmap.v1',
    jobId: 'test-job',
    createdAt: new Date().toISOString(),
    panels: panels.map((p) => ({
      panelId: p.panelId,
      cabinetId: 'cab-1',
      role: 'SHELF',
      worldPosition: [0, 0, 0] as Vec3Tuple,
      worldRotation: [0, 0, 0] as Vec3Tuple,
      dimensions: { width: 600, height: 400, thickness: 18 },
      points: p.points,
      grooves: [],
    })),
    summary: {
      totalDrills: panels.reduce((acc, p) => acc + p.points.length, 0),
      totalBores: 0,
      totalGrooves: 0,
      toolChanges: 0,
      estimatedTime: 0,
      byPurpose: {},
      byDiameter: {},
    },
    tools: [],
    warnings: [],
  };
}

/**
 * Create a DrillMap with a single panel.
 * Most common test case.
 */
export function onePanel(points: DrillMapPoint[], panelId = 'panel-A'): DrillMap {
  return makeDrillMap([{ panelId, points }]);
}

/**
 * Create a DrillMap with two panels.
 * Useful for testing cross-panel validation.
 */
export function twoPanels(
  pointsA: DrillMapPoint[],
  pointsB: DrillMapPoint[],
  panelIdA = 'panel-A',
  panelIdB = 'panel-B'
): DrillMap {
  return makeDrillMap([
    { panelId: panelIdA, points: pointsA },
    { panelId: panelIdB, points: pointsB },
  ]);
}

// ============================================
// PAIRING HELPERS
// ============================================

/**
 * Link a cam to a bolt using pairedHoleId.
 * Mutates the cam in place and returns both for chaining.
 */
export function pairCamToBolt(
  cam: DrillMapPoint,
  bolt: DrillMapPoint
): { cam: DrillMapPoint; bolt: DrillMapPoint } {
  cam.pairedHoleId = bolt.id;
  return { cam, bolt };
}

/**
 * Create a valid cam-bolt pair that should pass validation.
 *
 * Geometry (Y-up):
 * - Cam at [0, 100, 0] with normal [0, -1, 0]
 * - Cam pocket center Y = 100 - 6.75 = 93.25 (camDepth=13.5 for 18mm wood)
 * - Bolt at [10, 93.25, 0] so ball center Y matches cam pocket center
 * - Bolt normal [-1, 0, 0] points toward cam
 */
export function makeValidPair(suffix = '1'): { cam: DrillMapPoint; bolt: DrillMapPoint } {
  const camY = 100;
  const camPocketCenterY = camY - 13.5 / 2; // 93.25 (camDepth=13.5 for 18mm wood)

  const cam = makeCam({
    id: `cam-${suffix}`,
    y: camY,
    pairedHoleId: `bolt-${suffix}`,
  });

  const bolt = makeBolt({
    id: `bolt-${suffix}`,
    y: camPocketCenterY, // Ball center Y matches cam pocket center Y
    normal: [-1, 0, 0],
  });

  return { cam, bolt };
}

/**
 * Create an invalid cam-bolt pair with Y mismatch.
 */
export function makeYMismatchPair(
  yOffset: number,
  suffix = '1'
): { cam: DrillMapPoint; bolt: DrillMapPoint } {
  const camY = 100;
  const camPocketCenterY = camY - 13.5 / 2; // 93.25 (camDepth=13.5 for 18mm wood)

  const cam = makeCam({
    id: `cam-${suffix}`,
    y: camY,
    pairedHoleId: `bolt-${suffix}`,
  });

  const bolt = makeBolt({
    id: `bolt-${suffix}`,
    y: camPocketCenterY + yOffset, // Intentional Y offset
    normal: [-1, 0, 0],
  });

  return { cam, bolt };
}

// ============================================
// BATCH GENERATORS (for multi-pair tests)
// ============================================

/**
 * Generate N valid cam-bolt pairs.
 */
export function generateValidPairs(count: number): Array<{ cam: DrillMapPoint; bolt: DrillMapPoint }> {
  return Array.from({ length: count }, (_, i) => makeValidPair(String(i + 1)));
}

/**
 * Generate N cam-bolt pairs with random Y offsets.
 * Returns pairs and expected failure count.
 */
export function generateMixedPairs(
  count: number,
  yOffsets: number[]
): {
  pairs: Array<{ cam: DrillMapPoint; bolt: DrillMapPoint }>;
  expectedFailures: number;
} {
  const tolerance = 0.2;
  let expectedFailures = 0;

  const pairs = yOffsets.slice(0, count).map((offset, i) => {
    if (Math.abs(offset) > tolerance) {
      expectedFailures++;
    }
    return makeYMismatchPair(offset, String(i + 1));
  });

  return { pairs, expectedFailures };
}
