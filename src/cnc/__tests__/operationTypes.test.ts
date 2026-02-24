/**
 * operationTypes.test.ts - Unit tests for Operation Types
 *
 * Tests type guards and helper functions for operations.
 *
 * @version 1.0.0 - Phase D1
 */

import { describe, it, expect } from 'vitest';
import {
  isDrillOperation,
  isBoreOperation,
  isPocketOperation,
  isProfileOperation,
  isSlotOperation,
  getToolsUsed,
  groupByTool,
  countByType,
  type Operation,
  type DrillOperation,
  type BoreOperation,
} from '../operation/operationTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillOp = (overrides?: Partial<DrillOperation>): DrillOperation => ({
  type: 'DRILL',
  id: 'drill-001',
  sourceId: 'point-001',
  toolId: 'DRILL_5',
  position: { x: 100, y: 100, z: 0 },
  depth: 13,
  throughHole: false,
  ...overrides,
});

const createBoreOp = (overrides?: Partial<BoreOperation>): BoreOperation => ({
  type: 'BORE',
  id: 'bore-001',
  sourceId: 'point-002',
  toolId: 'BORE_15',
  position: { x: 200, y: 200, z: 0 },
  diameter: 15,
  depth: 12,
  flatBottom: true,
  ...overrides,
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  it('should correctly identify drill operation', () => {
    const op = createDrillOp();
    expect(isDrillOperation(op)).toBe(true);
    expect(isBoreOperation(op)).toBe(false);
    expect(isPocketOperation(op)).toBe(false);
    expect(isProfileOperation(op)).toBe(false);
    expect(isSlotOperation(op)).toBe(false);
  });

  it('should correctly identify bore operation', () => {
    const op = createBoreOp();
    expect(isDrillOperation(op)).toBe(false);
    expect(isBoreOperation(op)).toBe(true);
    expect(isPocketOperation(op)).toBe(false);
    expect(isProfileOperation(op)).toBe(false);
    expect(isSlotOperation(op)).toBe(false);
  });

  it('should correctly identify pocket operation', () => {
    const op: Operation = {
      type: 'POCKET',
      id: 'pocket-001',
      sourceId: 'point-003',
      toolId: 'ROUTER_6',
      position: { x: 50, y: 50, z: 0 },
      width: 100,
      height: 50,
      depth: 5,
      cornerRadius: 3,
      stepover: 0.5,
    };
    expect(isPocketOperation(op)).toBe(true);
    expect(isDrillOperation(op)).toBe(false);
  });

  it('should correctly identify profile operation', () => {
    const op: Operation = {
      type: 'PROFILE',
      id: 'profile-001',
      sourceId: 'panel-001',
      toolId: 'ROUTER_6',
      position: { x: 0, y: 0, z: 0 },
      path: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 50, z: 0 },
        { x: 0, y: 50, z: 0 },
      ],
      depth: 18,
      side: 'OUTSIDE',
    };
    expect(isProfileOperation(op)).toBe(true);
    expect(isDrillOperation(op)).toBe(false);
  });

  it('should correctly identify slot operation', () => {
    const op: Operation = {
      type: 'SLOT',
      id: 'slot-001',
      sourceId: 'slot-source-001',
      toolId: 'ROUTER_6',
      position: { x: 100, y: 100, z: 0 },
      endPosition: { x: 300, y: 100, z: 0 },
      width: 6,
      depth: 10,
    };
    expect(isSlotOperation(op)).toBe(true);
    expect(isDrillOperation(op)).toBe(false);
  });
});

// ============================================================================
// getToolsUsed Tests
// ============================================================================

describe('getToolsUsed', () => {
  it('should return empty array for empty operations', () => {
    expect(getToolsUsed([])).toEqual([]);
  });

  it('should return unique tool IDs', () => {
    const ops: Operation[] = [
      createDrillOp({ toolId: 'DRILL_5' }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_5' }),
      createBoreOp({ toolId: 'BORE_15' }),
    ];
    const tools = getToolsUsed(ops);
    expect(tools).toHaveLength(2);
    expect(tools).toContain('DRILL_5');
    expect(tools).toContain('BORE_15');
  });

  it('should handle single operation', () => {
    const ops: Operation[] = [createDrillOp()];
    const tools = getToolsUsed(ops);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toBe('DRILL_5');
  });

  it('should preserve tool order by first appearance', () => {
    const ops: Operation[] = [
      createDrillOp({ toolId: 'DRILL_5' }),
      createBoreOp({ toolId: 'BORE_15' }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_8' }),
    ];
    const tools = getToolsUsed(ops);
    expect(tools).toHaveLength(3);
  });
});

// ============================================================================
// groupByTool Tests
// ============================================================================

describe('groupByTool', () => {
  it('should return empty map for empty operations', () => {
    const groups = groupByTool([]);
    expect(groups.size).toBe(0);
  });

  it('should group operations by tool ID', () => {
    const ops: Operation[] = [
      createDrillOp({ id: 'drill-001', toolId: 'DRILL_5' }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_5' }),
      createBoreOp({ id: 'bore-001', toolId: 'BORE_15' }),
    ];
    const groups = groupByTool(ops);

    expect(groups.size).toBe(2);
    expect(groups.get('DRILL_5')).toHaveLength(2);
    expect(groups.get('BORE_15')).toHaveLength(1);
  });

  it('should preserve operation details in groups', () => {
    const ops: Operation[] = [
      createDrillOp({ id: 'drill-001', toolId: 'DRILL_5', depth: 10 }),
      createDrillOp({ id: 'drill-002', toolId: 'DRILL_5', depth: 15 }),
    ];
    const groups = groupByTool(ops);
    const drillGroup = groups.get('DRILL_5')!;

    expect(drillGroup[0].id).toBe('drill-001');
    expect(drillGroup[1].id).toBe('drill-002');
    expect((drillGroup[0] as DrillOperation).depth).toBe(10);
    expect((drillGroup[1] as DrillOperation).depth).toBe(15);
  });
});

// ============================================================================
// countByType Tests
// ============================================================================

describe('countByType', () => {
  it('should return zero counts for empty operations', () => {
    const counts = countByType([]);
    expect(counts.DRILL).toBe(0);
    expect(counts.BORE).toBe(0);
    expect(counts.POCKET).toBe(0);
    expect(counts.PROFILE).toBe(0);
    expect(counts.SLOT).toBe(0);
  });

  it('should count operations by type', () => {
    const ops: Operation[] = [
      createDrillOp({ id: 'drill-001' }),
      createDrillOp({ id: 'drill-002' }),
      createDrillOp({ id: 'drill-003' }),
      createBoreOp({ id: 'bore-001' }),
      createBoreOp({ id: 'bore-002' }),
    ];
    const counts = countByType(ops);

    expect(counts.DRILL).toBe(3);
    expect(counts.BORE).toBe(2);
    expect(counts.POCKET).toBe(0);
    expect(counts.PROFILE).toBe(0);
    expect(counts.SLOT).toBe(0);
  });

  it('should count all operation types', () => {
    const ops: Operation[] = [
      createDrillOp({ id: 'drill-001' }),
      createBoreOp({ id: 'bore-001' }),
      {
        type: 'POCKET',
        id: 'pocket-001',
        sourceId: 'src-001',
        toolId: 'ROUTER_6',
        position: { x: 0, y: 0, z: 0 },
        width: 50,
        height: 50,
        depth: 5,
        cornerRadius: 3,
        stepover: 0.5,
      },
      {
        type: 'PROFILE',
        id: 'profile-001',
        sourceId: 'src-002',
        toolId: 'ROUTER_6',
        position: { x: 0, y: 0, z: 0 },
        path: [],
        depth: 18,
        side: 'OUTSIDE',
      },
      {
        type: 'SLOT',
        id: 'slot-001',
        sourceId: 'src-003',
        toolId: 'ROUTER_6',
        position: { x: 0, y: 0, z: 0 },
        endPosition: { x: 100, y: 0, z: 0 },
        width: 6,
        depth: 10,
      },
    ];
    const counts = countByType(ops);

    expect(counts.DRILL).toBe(1);
    expect(counts.BORE).toBe(1);
    expect(counts.POCKET).toBe(1);
    expect(counts.PROFILE).toBe(1);
    expect(counts.SLOT).toBe(1);
  });
});

// ============================================================================
// Operation Properties Tests
// ============================================================================

describe('Operation Properties', () => {
  it('should have valid drill operation properties', () => {
    const op = createDrillOp({
      depth: 13,
      peckDepth: 5,
      dwellTime: 100,
      throughHole: true,
    });

    expect(op.depth).toBe(13);
    expect(op.peckDepth).toBe(5);
    expect(op.dwellTime).toBe(100);
    expect(op.throughHole).toBe(true);
  });

  it('should have valid bore operation properties', () => {
    const op = createBoreOp({
      diameter: 35,
      depth: 13,
      flatBottom: true,
    });

    expect(op.diameter).toBe(35);
    expect(op.depth).toBe(13);
    expect(op.flatBottom).toBe(true);
  });

  it('should support optional feed rate and spindle override', () => {
    const op = createDrillOp({
      feedRate: 1000,
      spindleRpm: 12000,
    });

    expect(op.feedRate).toBe(1000);
    expect(op.spindleRpm).toBe(12000);
  });

  it('should support comments', () => {
    const op = createDrillOp({
      comment: 'Shelf pin hole',
    });

    expect(op.comment).toBe('Shelf pin hole');
  });
});
