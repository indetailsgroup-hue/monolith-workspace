/**
 * mapDrillMapToOps.test.ts - Unit tests for DrillMap to Operations Mapper
 *
 * Tests conversion of factory packet drill maps to CNC operations.
 *
 * @version 1.0.0 - Phase D1
 */

import { describe, it, expect } from 'vitest';
import { mapDrillMapToOps, getDrillMapStats } from '../mapping/mapDrillMapToOps';
import { KDT_MACHINE } from '../machine/presets/kdt';
import type { PacketDrillMap, PacketDrillPoint } from '../../factory/packet/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createDrillPoint = (overrides?: Partial<PacketDrillPoint>): PacketDrillPoint => ({
  id: 'point-001',
  panelId: 'panel-001',
  position: [100, 100, 0],
  normal: [0, 0, 1],
  diameter: 5,
  depth: 13,
  face: 'A',
  purpose: 'shelf_pin',
  throughHole: false,
  ...overrides,
});

const createDrillMap = (points: PacketDrillPoint[]): PacketDrillMap => ({
  version: 'drillmap.v1',
  panels: [
    {
      panelId: 'panel-001',
      cabinetId: 'cabinet-001',
      role: 'LEFT_SIDE',
      dimensions: [600, 800, 18],
      points,
    },
  ],
  summary: {
    totalDrills: points.length,
    totalBores: 0,
    byPurpose: {},
    byDiameter: {},
  },
  tools: [],
});

// ============================================================================
// Basic Mapping Tests
// ============================================================================

describe('mapDrillMapToOps - Basic Mapping', () => {
  it('should map single drill point to drill operation', () => {
    const drillMap = createDrillMap([createDrillPoint()]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('DRILL');
    expect(result.unmappedPoints).toHaveLength(0);
  });

  it('should preserve position from drill point', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ position: [250, 350, 0] }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].position).toEqual({ x: 250, y: 350, z: 0 });
  });

  it('should preserve depth from drill point', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ depth: 15 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect((result.operations[0] as any).depth).toBe(15);
  });

  it('should map multiple drill points', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ id: 'point-001' }),
      createDrillPoint({ id: 'point-002', position: [200, 100, 0] }),
      createDrillPoint({ id: 'point-003', position: [300, 100, 0] }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations).toHaveLength(3);
  });
});

// ============================================================================
// Tool Selection Tests
// ============================================================================

describe('mapDrillMapToOps - Tool Selection', () => {
  it('should select 5mm drill tool for 5mm diameter point', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].toolId).toBe('DRILL_5');
  });

  it('should select 8mm drill tool for 8mm diameter point', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 8 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].toolId).toBe('DRILL_8');
  });

  it('should create bore operation for large diameter (>=15mm)', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 15 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].type).toBe('BORE');
    expect(result.operations[0].toolId).toBe('BORE_15');
  });

  it('should use diameter tolerance for tool selection', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5.3 }), // Slightly off from 5mm
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      diameterTolerance: 0.5,
    });

    expect(result.operations).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('5.3mm'))).toBe(true);
  });

  it('should mark unmapped for non-matching diameter', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 7 }), // No 7mm drill in KDT
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      diameterTolerance: 0.5,
    });

    expect(result.operations).toHaveLength(0);
    expect(result.unmappedPoints).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('7mm'))).toBe(true);
  });
});

// ============================================================================
// Peck Drilling Tests
// ============================================================================

describe('mapDrillMapToOps - Peck Drilling', () => {
  it('should enable peck drilling for deep holes', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5, depth: 20 }), // Deep hole
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      usePeckDrilling: true,
      peckDepthRatio: 1.5,
    });

    const op = result.operations[0] as any;
    expect(op.peckDepth).toBeDefined();
    expect(op.peckDepth).toBeGreaterThan(0);
  });

  it('should not use peck drilling for shallow holes', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5, depth: 5 }), // Shallow hole
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      usePeckDrilling: true,
      peckDepthRatio: 1.5,
    });

    const op = result.operations[0] as any;
    expect(op.peckDepth).toBeUndefined();
  });

  it('should disable peck drilling when option is false', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5, depth: 20 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      usePeckDrilling: false,
    });

    const op = result.operations[0] as any;
    expect(op.peckDepth).toBeUndefined();
  });
});

// ============================================================================
// Through Hole Tests
// ============================================================================

describe('mapDrillMapToOps - Through Holes', () => {
  it('should preserve through hole flag', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ throughHole: true }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect((result.operations[0] as any).throughHole).toBe(true);
  });

  it('should set through hole to false by default', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ throughHole: false }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect((result.operations[0] as any).throughHole).toBe(false);
  });
});

// ============================================================================
// Warning Tests
// ============================================================================

describe('mapDrillMapToOps - Warnings', () => {
  it('should warn when depth exceeds tool max depth', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5, depth: 100 }), // Very deep
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.warnings.some((w) => w.includes('exceeds'))).toBe(true);
  });

  it('should warn when tool substitution happens', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 4.8 }), // Slightly off
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      diameterTolerance: 0.5,
    });

    expect(result.warnings.some((w) => w.includes('4.8mm'))).toBe(true);
  });
});

// ============================================================================
// Multi-Panel Tests
// ============================================================================

describe('mapDrillMapToOps - Multi-Panel', () => {
  it('should flatten points from multiple panels', () => {
    const drillMap: PacketDrillMap = {
      panels: [
        {
          panelId: 'panel-001',
          points: [createDrillPoint({ id: 'p1-point1' })],
        },
        {
          panelId: 'panel-002',
          points: [
            createDrillPoint({ id: 'p2-point1' }),
            createDrillPoint({ id: 'p2-point2' }),
          ],
        },
      ],
    };
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations).toHaveLength(3);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('getDrillMapStats', () => {
  it('should calculate correct statistics', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ id: 'point-001', diameter: 5 }),
      createDrillPoint({ id: 'point-002', diameter: 5 }),
      createDrillPoint({ id: 'point-003', diameter: 15 }), // Bore
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);
    const stats = getDrillMapStats(result);

    expect(stats.totalPoints).toBe(3);
    expect(stats.drillOps).toBe(2);
    expect(stats.boreOps).toBe(1);
    expect(stats.unmapped).toBe(0);
  });

  it('should count unmapped points', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5 }),
      createDrillPoint({ diameter: 7 }), // Unmappable
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE, {
      diameterTolerance: 0.3,
    });
    const stats = getDrillMapStats(result);

    expect(stats.unmapped).toBe(1);
    expect(stats.drillOps).toBe(1);
  });
});

// ============================================================================
// Operation ID Generation Tests
// ============================================================================

describe('mapDrillMapToOps - Operation IDs', () => {
  it('should generate unique operation IDs', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ id: 'point-001' }),
      createDrillPoint({ id: 'point-002' }),
      createDrillPoint({ id: 'point-003' }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    const ids = result.operations.map((op) => op.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should include source ID in operation', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ id: 'my-point-123' }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].sourceId).toBe('my-point-123');
  });
});

// ============================================================================
// Feed Rate Tests
// ============================================================================

describe('mapDrillMapToOps - Feed Rate', () => {
  it('should use tool default feed rate', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ diameter: 5 }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].feedRate).toBeDefined();
    expect(result.operations[0].feedRate).toBeGreaterThan(0);
  });
});

// ============================================================================
// Comment Tests
// ============================================================================

describe('mapDrillMapToOps - Comments', () => {
  it('should include purpose and face in comment', () => {
    const drillMap = createDrillMap([
      createDrillPoint({ purpose: 'shelf_pin', face: 'A' }),
    ]);
    const result = mapDrillMapToOps(drillMap, KDT_MACHINE);

    expect(result.operations[0].comment).toContain('shelf_pin');
    expect(result.operations[0].comment).toContain('A');
  });
});
