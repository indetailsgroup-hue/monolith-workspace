/**
 * DrillMap Index Tests
 *
 * Tests for the Index Resolver pattern used in Minifix validation.
 * Covers: index building, duplicate detection, patch path generation.
 *
 * v1.0: Initial test suite
 */

import { describe, it, expect } from 'vitest';
import {
  buildDrillMapIndex,
  buildDrillMapIndexWithDuplicateCheck,
  flattenDrillMapPoints,
  patchPathForPoint,
  patchPathForBoltY,
  patchPathForBoltAxis,
  patchPathForBoltPosition,
  buildValidationContext,
  getPointLocationInfo,
  AXIS,
} from '../drillMapIndex';
import type { DrillMap, DrillMapPoint } from '../../../../core/manufacturing/drillMap/types';

// ============================================
// TEST FIXTURES
// ============================================

function makePoint(overrides: Partial<DrillMapPoint> & { id: string }): DrillMapPoint {
  const { id } = overrides; // Extract id first to avoid duplicate property
  return {
    id,
    panelId: overrides.panelId ?? 'test-panel-001',
    operationId: overrides.operationId ?? `op-${id}`,
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
  };
}

function makeDrillMap(panels: Array<{ panelId: string; points: DrillMapPoint[] }>): DrillMap {
  return {
    version: 'drillmap.v1',
    jobId: 'test-job',
    createdAt: new Date().toISOString(),
    panels: panels.map((p) => ({
      panelId: p.panelId,
      cabinetId: 'cab-1',
      role: 'SHELF',
      worldPosition: [0, 0, 0] as [number, number, number],
      worldRotation: [0, 0, 0] as [number, number, number],
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

const mockDrillMap = makeDrillMap([
  {
    panelId: 'panel-A',
    points: [
      makePoint({ id: 'cam-1', position: [0, 100, 0], componentType: 'HOUSING' }),
      makePoint({ id: 'bolt-1', position: [10, 98, 0], componentType: 'BOLT' }),
    ],
  },
  {
    panelId: 'panel-B',
    points: [makePoint({ id: 'bolt-2', position: [20, 100, 0], componentType: 'BOLT' })],
  },
]);

// ============================================
// AXIS CONSTANT TESTS
// ============================================

describe('AXIS constant', () => {
  it('defines correct indices for Y-up coordinate system', () => {
    expect(AXIS.X).toBe(0);
    expect(AXIS.Y).toBe(1);
    expect(AXIS.Z).toBe(2);
  });

  it('Y is the height axis in Y-up system', () => {
    // In Y-up: Y is vertical (height)
    const position: [number, number, number] = [10, 200, 30];
    expect(position[AXIS.Y]).toBe(200); // height
  });
});

// ============================================
// FLATTEN TESTS
// ============================================

describe('flattenDrillMapPoints', () => {
  it('flattens nested drillMap into flat points array', () => {
    const flat = flattenDrillMapPoints(mockDrillMap);
    expect(flat.map((p) => p.id)).toEqual(['cam-1', 'bolt-1', 'bolt-2']);
  });

  it('returns empty array for null drillMap', () => {
    const flat = flattenDrillMapPoints(null);
    expect(flat).toEqual([]);
  });

  it('returns empty array for drillMap with no panels', () => {
    const emptyMap = makeDrillMap([]);
    const flat = flattenDrillMapPoints(emptyMap);
    expect(flat).toEqual([]);
  });
});

// ============================================
// INDEX BUILDER TESTS
// ============================================

describe('buildDrillMapIndex', () => {
  it('builds deterministic index with panelIdx and pointIdx', () => {
    const index = buildDrillMapIndex(mockDrillMap);

    expect(index.get('cam-1')).toEqual({
      panelIdx: 0,
      pointIdx: 0,
      panelId: 'panel-A',
    });

    expect(index.get('bolt-1')).toEqual({
      panelIdx: 0,
      pointIdx: 1,
      panelId: 'panel-A',
    });

    expect(index.get('bolt-2')).toEqual({
      panelIdx: 1,
      pointIdx: 0,
      panelId: 'panel-B',
    });
  });

  it('returns empty index for null drillMap', () => {
    const index = buildDrillMapIndex(null);
    expect(index.size).toBe(0);
  });

  it('handles points without id gracefully', () => {
    const mapWithMissingId = makeDrillMap([
      {
        panelId: 'P1',
        points: [
          makePoint({ id: 'valid-point' }),
          { ...makePoint({ id: '' }), id: undefined as any }, // Simulate missing id
        ],
      },
    ]);

    const index = buildDrillMapIndex(mapWithMissingId);
    expect(index.has('valid-point')).toBe(true);
    expect(index.size).toBe(1); // Only valid point indexed
  });
});

// ============================================
// DUPLICATE DETECTION TESTS
// ============================================

describe('buildDrillMapIndexWithDuplicateCheck', () => {
  it('detects duplicate DrillMapPoint ids', () => {
    const badDrillMap = makeDrillMap([
      { panelId: 'P1', points: [makePoint({ id: 'dup', position: [0, 0, 0] })] },
      { panelId: 'P2', points: [makePoint({ id: 'dup', position: [1, 1, 1] })] },
    ]);

    const result = buildDrillMapIndexWithDuplicateCheck(badDrillMap);

    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].pointId).toBe('dup');
    expect(result.duplicates[0].locations.length).toBe(2);
  });

  it('stores FIRST occurrence for deterministic behavior', () => {
    const badDrillMap = makeDrillMap([
      { panelId: 'P1', points: [makePoint({ id: 'dup', position: [0, 0, 0] })] },
      { panelId: 'P2', points: [makePoint({ id: 'dup', position: [1, 1, 1] })] },
    ]);

    const result = buildDrillMapIndexWithDuplicateCheck(badDrillMap);

    // First occurrence should be stored
    expect(result.index.get('dup')).toEqual({
      panelIdx: 0,
      pointIdx: 0,
      panelId: 'P1',
    });
  });

  it('returns empty duplicates array when no duplicates exist', () => {
    const result = buildDrillMapIndexWithDuplicateCheck(mockDrillMap);
    expect(result.duplicates).toEqual([]);
  });

  it('tracks all occurrences of duplicate id', () => {
    const tripledup = makeDrillMap([
      { panelId: 'P1', points: [makePoint({ id: 'triple' })] },
      { panelId: 'P2', points: [makePoint({ id: 'triple' })] },
      { panelId: 'P3', points: [makePoint({ id: 'triple' })] },
    ]);

    const result = buildDrillMapIndexWithDuplicateCheck(tripledup);

    expect(result.duplicates[0].locations.length).toBe(3);
  });
});

// ============================================
// PATCH PATH TESTS
// ============================================

describe('patchPathForPoint', () => {
  it('returns deterministic patch path for a point property', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForPoint(index, 'bolt-1', 'position/1');

    expect(path).toBe('/useDrillMapStore/drillMap/panels/0/points/1/position/1');
  });

  it('returns null patch path if point id not found', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForPoint(index, 'missing-id', 'position/1');

    expect(path).toBeNull();
  });

  it('handles nested property paths', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForPoint(index, 'cam-1', 'geometry/pocketCenter');

    expect(path).toBe('/useDrillMapStore/drillMap/panels/0/points/0/geometry/pocketCenter');
  });
});

describe('patchPathForBoltY', () => {
  it('builds Y-axis patch path for bolt position', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForBoltY(index, 'bolt-2');

    expect(path).toBe('/useDrillMapStore/drillMap/panels/1/points/0/position/1');
  });

  it('uses AXIS.Y (1) for Y-up coordinate system', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForBoltY(index, 'bolt-1');

    // Should end with position/1 (Y axis)
    expect(path?.endsWith(`position/${AXIS.Y}`)).toBe(true);
  });

  it('returns null for missing bolt', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForBoltY(index, 'nonexistent');

    expect(path).toBeNull();
  });
});

describe('patchPathForBoltAxis', () => {
  it('builds path for any axis', () => {
    const index = buildDrillMapIndex(mockDrillMap);

    expect(patchPathForBoltAxis(index, 'bolt-1', AXIS.X)).toBe(
      '/useDrillMapStore/drillMap/panels/0/points/1/position/0'
    );
    expect(patchPathForBoltAxis(index, 'bolt-1', AXIS.Y)).toBe(
      '/useDrillMapStore/drillMap/panels/0/points/1/position/1'
    );
    expect(patchPathForBoltAxis(index, 'bolt-1', AXIS.Z)).toBe(
      '/useDrillMapStore/drillMap/panels/0/points/1/position/2'
    );
  });
});

describe('patchPathForBoltPosition', () => {
  it('builds path for entire position array', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const path = patchPathForBoltPosition(index, 'bolt-1');

    expect(path).toBe('/useDrillMapStore/drillMap/panels/0/points/1/position');
  });
});

// ============================================
// VALIDATION CONTEXT TESTS
// ============================================

describe('buildValidationContext', () => {
  it('creates context with flattened points and index', () => {
    const ctx = buildValidationContext(mockDrillMap);

    expect(ctx).not.toBeNull();
    expect(ctx!.drillMap).toBe(mockDrillMap);
    expect(ctx!.pointsFlat.length).toBe(3);
    expect(ctx!.index.size).toBe(3);
  });

  it('returns null for null drillMap', () => {
    const ctx = buildValidationContext(null);
    expect(ctx).toBeNull();
  });
});

// ============================================
// UTILITY TESTS
// ============================================

describe('getPointLocationInfo', () => {
  it('returns human-readable location string', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const info = getPointLocationInfo(index, 'bolt-1');

    expect(info).toBe('panel[0].points[1] (panelId: panel-A)');
  });

  it('returns "not found" message for missing point', () => {
    const index = buildDrillMapIndex(mockDrillMap);
    const info = getPointLocationInfo(index, 'missing');

    expect(info).toContain('not found');
    expect(info).toContain('missing');
  });
});
