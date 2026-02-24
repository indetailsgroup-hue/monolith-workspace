/**
 * normalizeOperations.test.ts - Unit tests for Operation Normalization
 *
 * Tests deterministic ordering and tool grouping.
 *
 * @version 1.0.0 - Phase D2
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeOperations,
  groupOperationsByTool,
  getToolOrder,
  countToolChanges,
  calculateTravelDistance,
} from '../post/normalizeOperations';
import type { Operation, DrillOperation, BoreOperation } from '../operation/operationTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillOp = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  id: 'drill-001',
  type: 'DRILL',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  feedRate: 500,
  throughHole: false,
  sourceId: 'point-001',
  ...overrides,
});

const createBoreOp = (overrides?: Partial<BoreOperation>): BoreOperation => ({
  id: 'bore-001',
  type: 'BORE',
  toolId: 'BORE_15',
  position: { x: 200, y: 200, z: 0 },
  depth: 12,
  diameter: 15,
  feedRate: 300,
  flatBottom: true,
  sourceId: 'cam-001',
  ...overrides,
});

// ============================================================================
// Basic Normalization Tests
// ============================================================================

describe('normalizeOperations - Basic', () => {
  it('should return copy of operations', () => {
    const ops = [createDrillOp()];
    const result = normalizeOperations(ops);

    expect(result).not.toBe(ops);
    expect(result).toHaveLength(1);
  });

  it('should preserve order when preserveOrder is true', () => {
    const ops = [
      createBoreOp({ id: 'bore-001' }),
      createDrillOp({ id: 'drill-001' }),
    ];
    const result = normalizeOperations(ops, { preserveOrder: true });

    expect(result[0].id).toBe('bore-001');
    expect(result[1].id).toBe('drill-001');
  });

  it('should group by tool by default', () => {
    const ops = [
      createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
      createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_5' }),
    ];
    const result = normalizeOperations(ops);

    // All DRILL_5 ops should be together
    const drill5Indices = result
      .map((op, i) => (op.toolId === 'DRILL_5' ? i : -1))
      .filter((i) => i >= 0);

    expect(Math.max(...drill5Indices) - Math.min(...drill5Indices)).toBe(1);
  });
});

// ============================================================================
// Deterministic Ordering Tests
// ============================================================================

describe('normalizeOperations - Determinism', () => {
  it('should produce same output for same input', () => {
    const ops = [
      createDrillOp({ id: 'drill-001', position: { x: 100, y: 100, z: 0 } }),
      createBoreOp({ id: 'bore-001', position: { x: 200, y: 200, z: 0 } }),
      createDrillOp({ id: 'drill-002', position: { x: 300, y: 100, z: 0 } }),
    ];

    const result1 = normalizeOperations(ops);
    const result2 = normalizeOperations(ops);

    expect(result1.map((o) => o.id)).toEqual(result2.map((o) => o.id));
  });

  it('should produce same output regardless of input order', () => {
    const ops1 = [
      createDrillOp({ id: 'drill-001' }),
      createBoreOp({ id: 'bore-001' }),
      createDrillOp({ id: 'drill-002' }),
    ];

    const ops2 = [
      createBoreOp({ id: 'bore-001' }),
      createDrillOp({ id: 'drill-002' }),
      createDrillOp({ id: 'drill-001' }),
    ];

    const result1 = normalizeOperations(ops1);
    const result2 = normalizeOperations(ops2);

    expect(result1.map((o) => o.id)).toEqual(result2.map((o) => o.id));
  });

  it('should sort by type within tool group', () => {
    const ops = [
      createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
      createDrillOp({ id: 'drill-001', toolId: 'BORE_15', type: 'DRILL' } as any),
    ];
    const result = normalizeOperations(ops);

    // DRILL should come before BORE
    const drillIndex = result.findIndex((o) => o.type === 'DRILL');
    const boreIndex = result.findIndex((o) => o.type === 'BORE');
    expect(drillIndex).toBeLessThan(boreIndex);
  });

  it('should sort by Y position within same type', () => {
    const ops = [
      createDrillOp({ id: 'drill-002', position: { x: 100, y: 200, z: 0 } }),
      createDrillOp({ id: 'drill-001', position: { x: 100, y: 100, z: 0 } }),
    ];
    const result = normalizeOperations(ops);

    // Lower Y should come first
    expect(result[0].id).toBe('drill-001');
    expect(result[1].id).toBe('drill-002');
  });

  it('should sort by X position when Y is same', () => {
    const ops = [
      createDrillOp({ id: 'drill-002', position: { x: 200, y: 100, z: 0 } }),
      createDrillOp({ id: 'drill-001', position: { x: 100, y: 100, z: 0 } }),
    ];
    const result = normalizeOperations(ops);

    // Lower X should come first
    expect(result[0].id).toBe('drill-001');
    expect(result[1].id).toBe('drill-002');
  });
});

// ============================================================================
// Tool Grouping Tests
// ============================================================================

describe('groupOperationsByTool', () => {
  it('should group operations by tool ID', () => {
    const ops = [
      createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
      createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_5' }),
    ];
    const groups = groupOperationsByTool(ops);

    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['DRILL_5']).toHaveLength(2);
    expect(groups['BORE_15']).toHaveLength(1);
  });

  it('should handle single tool', () => {
    const ops = [
      createDrillOp({ id: 'drill-001' }),
      createDrillOp({ id: 'drill-002' }),
    ];
    const groups = groupOperationsByTool(ops);

    expect(Object.keys(groups)).toHaveLength(1);
    expect(groups['DRILL_5']).toHaveLength(2);
  });

  it('should handle empty array', () => {
    const groups = groupOperationsByTool([]);
    expect(Object.keys(groups)).toHaveLength(0);
  });
});

// ============================================================================
// Tool Order Tests
// ============================================================================

describe('getToolOrder', () => {
  it('should return tools in order of first appearance', () => {
    const ops = [
      createDrillOp({ toolId: 'DRILL_5' }),
      createBoreOp({ toolId: 'BORE_15' }),
      createDrillOp({ toolId: 'DRILL_5' }),
      createDrillOp({ toolId: 'DRILL_8' }),
    ];
    const order = getToolOrder(ops);

    expect(order).toEqual(['DRILL_5', 'BORE_15', 'DRILL_8']);
  });

  it('should return empty array for no operations', () => {
    expect(getToolOrder([])).toEqual([]);
  });
});

// ============================================================================
// Tool Change Count Tests
// ============================================================================

describe('countToolChanges', () => {
  it('should count tool changes', () => {
    const ops = [
      createDrillOp({ toolId: 'DRILL_5' }),
      createDrillOp({ toolId: 'DRILL_5' }),
      createBoreOp({ toolId: 'BORE_15' }),
      createDrillOp({ toolId: 'DRILL_5' }),
    ];

    expect(countToolChanges(ops)).toBe(2);
  });

  it('should return 0 for single tool', () => {
    const ops = [
      createDrillOp(),
      createDrillOp(),
    ];

    expect(countToolChanges(ops)).toBe(0);
  });

  it('should return 0 for empty array', () => {
    expect(countToolChanges([])).toBe(0);
  });

  it('should return 0 for single operation', () => {
    expect(countToolChanges([createDrillOp()])).toBe(0);
  });
});

// ============================================================================
// Travel Distance Tests
// ============================================================================

describe('calculateTravelDistance', () => {
  it('should calculate distance from start', () => {
    const ops = [
      createDrillOp({ position: { x: 100, y: 0, z: 0 } }),
    ];

    expect(calculateTravelDistance(ops, { x: 0, y: 0 })).toBe(100);
  });

  it('should calculate total travel distance', () => {
    const ops = [
      createDrillOp({ position: { x: 100, y: 0, z: 0 } }),
      createDrillOp({ position: { x: 200, y: 0, z: 0 } }),
    ];

    // 0->100 + 100->200 = 100 + 100 = 200
    expect(calculateTravelDistance(ops, { x: 0, y: 0 })).toBe(200);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTravelDistance([])).toBe(0);
  });

  it('should use custom start position', () => {
    const ops = [
      createDrillOp({ position: { x: 100, y: 0, z: 0 } }),
    ];

    // Distance from (50,0) to (100,0) = 50
    expect(calculateTravelDistance(ops, { x: 50, y: 0 })).toBe(50);
  });
});

// ============================================================================
// Path Optimization Tests
// ============================================================================

describe('normalizeOperations - Path Optimization', () => {
  it('should reduce travel distance with optimization', () => {
    // Create ops in worst-case order (zigzag)
    const ops = [
      createDrillOp({ id: 'd1', position: { x: 0, y: 0, z: 0 } }),
      createDrillOp({ id: 'd4', position: { x: 300, y: 300, z: 0 } }),
      createDrillOp({ id: 'd2', position: { x: 100, y: 0, z: 0 } }),
      createDrillOp({ id: 'd3', position: { x: 200, y: 300, z: 0 } }),
    ];

    const unoptimized = normalizeOperations(ops, { optimizePath: false });
    const optimized = normalizeOperations(ops, { optimizePath: true });

    const distUnopt = calculateTravelDistance(unoptimized);
    const distOpt = calculateTravelDistance(optimized);

    // Optimized should have shorter or equal travel distance
    expect(distOpt).toBeLessThanOrEqual(distUnopt);
  });

  it('should still group by tool when optimizing', () => {
    const ops = [
      createDrillOp({ id: 'd1', toolId: 'DRILL_5' }),
      createBoreOp({ id: 'b1', toolId: 'BORE_15' }),
      createDrillOp({ id: 'd2', toolId: 'DRILL_5' }),
    ];

    const result = normalizeOperations(ops, { optimizePath: true, groupByTool: true });

    // All DRILL_5 should be together
    const drill5Ops = result.filter((o) => o.toolId === 'DRILL_5');
    const firstDrill5 = result.indexOf(drill5Ops[0]);
    const lastDrill5 = result.indexOf(drill5Ops[drill5Ops.length - 1]);

    expect(lastDrill5 - firstDrill5).toBe(drill5Ops.length - 1);
  });
});
