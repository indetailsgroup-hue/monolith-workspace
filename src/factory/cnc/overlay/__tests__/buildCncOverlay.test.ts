/**
 * buildCncOverlay.test.ts - Unit tests for CNC Overlay Builder
 *
 * Tests that overlay points are correctly derived from OperationGraph
 * with proper policy integration.
 *
 * @version 1.0.0 - Phase D4.x
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildCncOverlay, isOverlayEmpty, getPointsByPanel, getThroughHolePoints } from '../buildCncOverlay';
import { filterOverlayPoints, calculateOverlayStats, DEFAULT_OVERLAY_FILTER } from '../cncOverlayTypes';
import type { CncOverlayFilter } from '../cncOverlayTypes';
import type { OperationGraph, DrillOperation, BoreOperation } from '../../../../cnc/operation/operationTypes';
import { KDT_MACHINE } from '../../../../cnc/machine/presets/kdt';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockDrillOperation = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  id: 'drill-001',
  type: 'DRILL',
  sourceId: 'source-001',
  toolId: 'DRILL_5',
  position: { x: 100, y: 200, z: 0 },
  depth: 13,
  throughHole: false,
  workpieceContext: {
    panelId: 'panel-001',
    face: 'TOP',
    appliedOffset: { x: 0, y: 0, z: 0 },
  },
  ...overrides,
});

const createMockBoreOperation = (overrides?: Partial<BoreOperation>): BoreOperation => ({
  id: 'bore-001',
  type: 'BORE',
  sourceId: 'source-002',
  toolId: 'BORE_15',
  position: { x: 300, y: 50, z: 0 },
  diameter: 15,
  depth: 12,
  flatBottom: true,
  workpieceContext: {
    panelId: 'panel-001',
    face: 'TOP',
    appliedOffset: { x: 0, y: 0, z: 0 },
  },
  ...overrides,
});

const createMockOperationGraph = (
  operations?: (DrillOperation | BoreOperation)[]
): OperationGraph => ({
  machineId: 'KDT',
  safeZ: 50,
  rapidZ: 60,
  operations: operations !== undefined ? operations : [
    createMockDrillOperation(),
    createMockDrillOperation({ id: 'drill-002', position: { x: 200, y: 200, z: 0 } }),
    createMockBoreOperation(),
  ],
  metadata: {
    jobId: 'job-001',
    sourceContentHash: 'hash-abc123',
    builtAt: '2024-01-01T00:00:00Z',
    toolVersion: 'test@1.0.0',
  },
  toolsUsed: ['DRILL_5', 'BORE_15'],
  estimatedTimeSeconds: 120,
});

// ============================================================================
// Basic Build Tests
// ============================================================================

describe('buildCncOverlay - Basic Build', () => {
  it('should build overlay from operation graph', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result).toBeDefined();
    expect(result.points.length).toBeGreaterThan(0);
  });

  it('should return correct number of points', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'drill-1' }),
      createMockDrillOperation({ id: 'drill-2' }),
      createMockBoreOperation({ id: 'bore-1' }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points).toHaveLength(3);
  });

  it('should preserve operation IDs', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'my-drill-id' }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].id).toBe('my-drill-id');
  });

  it('should preserve operation positions', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ position: { x: 123, y: 456, z: 789 } }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].position).toEqual({ x: 123, y: 456, z: 789 });
  });
});

// ============================================================================
// Policy Integration Tests
// ============================================================================

describe('buildCncOverlay - Policy Integration', () => {
  it('should attach cycle type from policy', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ depth: 5 }), // Shallow - should be G81
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].cycle).toBeDefined();
    expect(['G81', 'G82', 'G83']).toContain(result.points[0].cycle);
  });

  it('should attach feed rate from policy', () => {
    const graph = createMockOperationGraph([createMockDrillOperation()]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].feedRate).toBeGreaterThan(0);
  });

  it('should attach RPM from policy', () => {
    const graph = createMockOperationGraph([createMockDrillOperation()]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].rpm).toBeGreaterThan(0);
  });

  it('should classify hole kind correctly', () => {
    const graph = createMockOperationGraph([
      createMockBoreOperation({ diameter: 15 }), // Cam housing
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].holeKind).toBe('CAM_HOUSING');
  });

  it('should detect through-holes', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ depth: 18, throughHole: true }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].throughHole).toBe(true);
  });
});

// ============================================================================
// Metadata Tests
// ============================================================================

describe('buildCncOverlay - Metadata', () => {
  it('should include job ID', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.jobId).toBe('job-001');
  });

  it('should include machine ID', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.machineId).toBe('KDT');
  });

  it('should include build timestamp', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.builtAt).toBeDefined();
    expect(new Date(result.builtAt).getTime()).toBeGreaterThan(0);
  });

  it('should include content hash', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.contentHash).toBeDefined();
    expect(result.contentHash.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('buildCncOverlay - Statistics', () => {
  it('should calculate total points', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.stats.totalPoints).toBe(result.points.length);
  });

  it('should count by type', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'drill-1' }),
      createMockDrillOperation({ id: 'drill-2' }),
      createMockBoreOperation({ id: 'bore-1' }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.stats.byType.DRILL).toBe(2);
    expect(result.stats.byType.BORE).toBe(1);
  });

  it('should count by face', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({
        id: 'drill-top',
        workpieceContext: { panelId: 'p1', face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
      createMockDrillOperation({
        id: 'drill-bottom',
        workpieceContext: { panelId: 'p1', face: 'BOTTOM', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.stats.byFace.TOP).toBe(1);
    expect(result.stats.byFace.BOTTOM).toBe(1);
  });

  it('should count through-holes', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'drill-through', throughHole: true, depth: 18 }),
      createMockDrillOperation({ id: 'drill-blind', throughHole: false, depth: 13 }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.stats.throughHoleCount).toBe(1);
  });

  it('should calculate total depth', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'drill-1', depth: 10 }),
      createMockDrillOperation({ id: 'drill-2', depth: 15 }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.stats.totalDepth).toBe(25);
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe('buildCncOverlay - Determinism', () => {
  it('should produce identical results for same input', () => {
    const graph = createMockOperationGraph();

    const result1 = buildCncOverlay(graph, { machine: KDT_MACHINE });
    const result2 = buildCncOverlay(graph, { machine: KDT_MACHINE });

    // Compare points (excluding timestamp-dependent fields)
    expect(result1.points.length).toBe(result2.points.length);
    for (let i = 0; i < result1.points.length; i++) {
      expect(result1.points[i].id).toBe(result2.points[i].id);
      expect(result1.points[i].position).toEqual(result2.points[i].position);
      expect(result1.points[i].cycle).toBe(result2.points[i].cycle);
      expect(result1.points[i].feedRate).toBe(result2.points[i].feedRate);
    }
  });

  it('should produce different hashes for different inputs', () => {
    const graph1 = createMockOperationGraph([createMockDrillOperation({ id: 'drill-1' })]);
    const graph2 = createMockOperationGraph([createMockDrillOperation({ id: 'drill-2' })]);

    const result1 = buildCncOverlay(graph1, { machine: KDT_MACHINE });
    const result2 = buildCncOverlay(graph2, { machine: KDT_MACHINE });

    expect(result1.contentHash).not.toBe(result2.contentHash);
  });
});

// ============================================================================
// Filter Tests
// ============================================================================

describe('filterOverlayPoints', () => {
  let testPoints: ReturnType<typeof buildCncOverlay>['points'];

  beforeEach(() => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({
        id: 'drill-top',
        throughHole: false,
        workpieceContext: { panelId: 'p1', face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
      createMockDrillOperation({
        id: 'drill-through',
        throughHole: true,
        depth: 18,
        workpieceContext: { panelId: 'p1', face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
      createMockBoreOperation({
        id: 'bore-bottom',
        workpieceContext: { panelId: 'p2', face: 'BOTTOM', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });
    testPoints = result.points;
  });

  it('should return all points with default filter', () => {
    const filtered = filterOverlayPoints(testPoints, DEFAULT_OVERLAY_FILTER);
    expect(filtered.length).toBe(3);
  });

  it('should filter by type - drill only', () => {
    const filter: CncOverlayFilter = {
      ...DEFAULT_OVERLAY_FILTER,
      showDrill: true,
      showBore: false,
    };
    const filtered = filterOverlayPoints(testPoints, filter);

    expect(filtered.every((p) => p.type === 'DRILL')).toBe(true);
  });

  it('should filter by type - bore only', () => {
    const filter: CncOverlayFilter = {
      ...DEFAULT_OVERLAY_FILTER,
      showDrill: false,
      showBore: true,
    };
    const filtered = filterOverlayPoints(testPoints, filter);

    expect(filtered.every((p) => p.type === 'BORE')).toBe(true);
  });

  it('should filter through-holes only', () => {
    const filter: CncOverlayFilter = {
      ...DEFAULT_OVERLAY_FILTER,
      throughHolesOnly: true,
    };
    const filtered = filterOverlayPoints(testPoints, filter);

    expect(filtered.every((p) => p.throughHole)).toBe(true);
  });

  it('should filter by face', () => {
    const filter: CncOverlayFilter = {
      ...DEFAULT_OVERLAY_FILTER,
      faceFilter: 'TOP',
    };
    const filtered = filterOverlayPoints(testPoints, filter);

    expect(filtered.every((p) => p.face === 'TOP')).toBe(true);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('isOverlayEmpty', () => {
  it('should return true for empty overlay', () => {
    const graph = createMockOperationGraph([]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(isOverlayEmpty(result)).toBe(true);
  });

  it('should return false for non-empty overlay', () => {
    const graph = createMockOperationGraph();
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(isOverlayEmpty(result)).toBe(false);
  });
});

describe('getPointsByPanel', () => {
  it('should return points for specific panel', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({
        id: 'drill-p1',
        workpieceContext: { panelId: 'panel-001', face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
      createMockDrillOperation({
        id: 'drill-p2',
        workpieceContext: { panelId: 'panel-002', face: 'TOP', appliedOffset: { x: 0, y: 0, z: 0 } },
      }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    const panel1Points = getPointsByPanel(result, 'panel-001');
    expect(panel1Points).toHaveLength(1);
    expect(panel1Points[0].id).toBe('drill-p1');
  });
});

describe('getThroughHolePoints', () => {
  it('should return only through-holes', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'drill-through', throughHole: true, depth: 18 }),
      createMockDrillOperation({ id: 'drill-blind', throughHole: false }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    const throughHoles = getThroughHolePoints(result);
    expect(throughHoles).toHaveLength(1);
    expect(throughHoles[0].id).toBe('drill-through');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('buildCncOverlay - Edge Cases', () => {
  it('should handle empty operation graph', () => {
    const graph = createMockOperationGraph([]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points).toHaveLength(0);
    expect(result.stats.totalPoints).toBe(0);
  });

  it('should handle operations without workpieceContext', () => {
    const opWithoutContext = createMockDrillOperation();
    delete (opWithoutContext as any).workpieceContext;

    const graph = createMockOperationGraph([opWithoutContext]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    // Should still work, using defaults
    expect(result.points).toHaveLength(1);
    expect(result.points[0].panelId).toBe('unknown');
    expect(result.points[0].face).toBe('TOP');
  });

  it('should generate human-readable labels', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ depth: 10 }),
      createMockBoreOperation({ diameter: 35 }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });

    expect(result.points[0].label).toContain('Drill');
    expect(result.points[0].label).toContain('mm');
    expect(result.points[1].label).toContain('Bore');
    expect(result.points[1].label).toContain('35');
  });
});

// ============================================================================
// Stats Calculation Tests
// ============================================================================

describe('calculateOverlayStats', () => {
  it('should calculate correct stats from points', () => {
    const graph = createMockOperationGraph([
      createMockDrillOperation({ id: 'd1', depth: 10, throughHole: false }),
      // depth 18 >= 18mm default panel thickness - 0.5mm allowance = through-hole
      createMockDrillOperation({ id: 'd2', depth: 18, throughHole: true }),
      createMockBoreOperation({ id: 'b1', depth: 12 }),
    ]);
    const result = buildCncOverlay(graph, { machine: KDT_MACHINE });
    const stats = calculateOverlayStats(result.points);

    expect(stats.totalPoints).toBe(3);
    expect(stats.byType.DRILL).toBe(2);
    expect(stats.byType.BORE).toBe(1);
    expect(stats.throughHoleCount).toBe(1);
    expect(stats.totalDepth).toBe(40); // 10 + 18 + 12
  });
});
