/**
 * mapDrillMapToOps.d4.test.ts - D4 Workpiece Transform Tests
 *
 * Tests for workpiece coordinate transformation during drill map mapping.
 *
 * @version 1.0.0 - Phase D4
 */

import { describe, it, expect } from 'vitest';
import { mapDrillMapToOps } from '../mapDrillMapToOps';
import type { DrillMap, DrillMapPanel, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';
import type { MachineProfile } from '../../machine/machineProfile';
import type { WorkpieceTransformContext } from '../../transform/workpieceTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockMachine(): MachineProfile {
  return {
    id: 'GENERIC',
    name: 'Test CNC',
    manufacturer: 'Test',
    units: 'mm',
    axis: {
      x: { min: 0, max: 3000 },
      y: { min: 0, max: 1500 },
      z: { min: -100, max: 100 },
    },
    spindle: {
      maxRpm: 24000,
      minRpm: 1000,
      defaultRpm: 18000,
    },
    tools: [
      {
        toolId: 'drill-5mm',
        type: 'DRILL',
        diameter: 5,
        maxDepth: 50,
        supportsPeck: true,
        supportsBore: false,
        defaultFeedRate: 1000,
        defaultPlungeRate: 500,
      },
    ],
    defaultSafeZ: 50,
    coordinateSystem: 'Y_UP',
    dialect: 'FANUC',
    supportsToolChange: true,
    toolMagazineSize: 12,
  };
}

function createMockDrillPoint(overrides?: Partial<DrillMapPoint>): DrillMapPoint {
  return {
    id: 'point-001',
    position: [50, 30, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number],
    diameter: 5,
    depth: 10,
    purpose: 'SHELF_PIN',
    face: 'A',
    throughHole: false,
    status: 'VALID',
    ...overrides,
  } as DrillMapPoint;
}

function createMockPanel(points: DrillMapPoint[], overrides?: Partial<DrillMapPanel>): DrillMapPanel {
  return {
    panelId: 'panel-001',
    role: 'SIDE_LEFT',
    dimensions: { width: 600, height: 400, thickness: 18 },
    worldPosition: [0, 0, 0] as [number, number, number],
    worldRotation: [0, 0, 0] as [number, number, number],
    points,
    face: 'TOP',
    ...overrides,
  } as DrillMapPanel;
}

function createMockDrillMap(panels: DrillMapPanel[]): DrillMap {
  return {
    version: '1.0',
    panels,
    stats: {
      totalPoints: panels.reduce((sum, p) => sum + p.points.length, 0),
      byPurpose: { SHELF_PIN: 1 },
      byFace: { A: 1 },
    },
  } as DrillMap;
}

// ============================================================================
// D4 Workpiece Transform Tests
// ============================================================================

describe('mapDrillMapToOps - D4 Workpiece Transforms', () => {
  const machine = createMockMachine();

  describe('transform application', () => {
    it('should apply offset transform when workpiece context provided', () => {
      const point = createMockDrillPoint({ position: [50, 30, 0] });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      const transforms = new Map<string, WorkpieceTransformContext>([
        ['panel-001', {
          panelId: 'panel-001',
          frame: {
            datum: 'FRONT_LEFT',
            face: 'TOP',
            dimensions: { length: 600, width: 400, thickness: 18 },
          },
          placement: {
            offset: { x: 100, y: 200, z: 0 },
            rotationZ: 0,
          },
        }],
      ]);

      const result = mapDrillMapToOps(drillMap, machine, {
        workpieceTransforms: transforms,
        attachWorkpieceContext: true,
      });

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // Position should be transformed: (50, 30, 0) + (100, 200, 0) = (150, 230, 0)
      expect(op.position.x).toBe(150);
      expect(op.position.y).toBe(230);
      expect(op.position.z).toBe(0);

      // Workpiece context should have original position
      expect(op.workpieceContext).toBeDefined();
      expect(op.workpieceContext?.workpiecePosition).toEqual({ x: 50, y: 30, z: 0 });
      expect(op.workpieceContext?.appliedOffset).toEqual({ x: 100, y: 200, z: 0 });
    });

    it('should NOT apply transform when workpiece context not provided', () => {
      const point = createMockDrillPoint({ position: [50, 30, 0] });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      const result = mapDrillMapToOps(drillMap, machine, {
        attachWorkpieceContext: false,
      });

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // Position should remain unchanged (workpiece coordinates)
      expect(op.position.x).toBe(50);
      expect(op.position.y).toBe(30);
      expect(op.position.z).toBe(0);

      // No workpiece context
      expect(op.workpieceContext).toBeUndefined();
    });

    it('should maintain backward compatibility when transforms not enabled', () => {
      const point = createMockDrillPoint({ position: [100, 50, 0] });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      // No options at all
      const result = mapDrillMapToOps(drillMap, machine);

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // Position unchanged
      expect(op.position).toEqual({ x: 100, y: 50, z: 0 });
      expect(op.workpieceContext).toBeUndefined();
    });
  });

  describe('BOTTOM face transform', () => {
    it('should apply BOTTOM face transform with Y mirror and Z adjustment', () => {
      const point = createMockDrillPoint({
        position: [50, 30, 0],
        face: 'B', // BOTTOM face
      });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      const transforms = new Map<string, WorkpieceTransformContext>([
        ['panel-001', {
          panelId: 'panel-001',
          frame: {
            datum: 'FRONT_LEFT',
            face: 'BOTTOM',
            dimensions: { length: 600, width: 400, thickness: 18 },
          },
          placement: {
            offset: { x: 0, y: 0, z: 0 },
            rotationZ: 0,
          },
        }],
      ]);

      const result = mapDrillMapToOps(drillMap, machine, {
        workpieceTransforms: transforms,
        attachWorkpieceContext: true,
      });

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // Y should be mirrored: width - y = 400 - 30 = 370
      expect(op.position.y).toBe(370);
      // Face should be BOTTOM in context
      expect(op.workpieceContext?.face).toBe('BOTTOM');
    });
  });

  describe('rotation transform', () => {
    it('should apply 90-degree CCW rotation', () => {
      const point = createMockDrillPoint({ position: [100, 0, 0] });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      const transforms = new Map<string, WorkpieceTransformContext>([
        ['panel-001', {
          panelId: 'panel-001',
          frame: {
            datum: 'FRONT_LEFT',
            face: 'TOP',
            dimensions: { length: 600, width: 400, thickness: 18 },
          },
          placement: {
            offset: { x: 0, y: 0, z: 0 },
            rotationZ: Math.PI / 2, // 90 degrees CCW
          },
        }],
      ]);

      const result = mapDrillMapToOps(drillMap, machine, {
        workpieceTransforms: transforms,
        attachWorkpieceContext: true,
      });

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // After 90 CCW rotation: (100, 0) -> (0, 100)
      expect(op.position.x).toBeCloseTo(0, 5);
      expect(op.position.y).toBeCloseTo(100, 5);
    });
  });

  describe('combined transforms', () => {
    it('should apply rotation then offset', () => {
      const point = createMockDrillPoint({ position: [100, 0, 0] });
      const panel = createMockPanel([point]);
      const drillMap = createMockDrillMap([panel]);

      const transforms = new Map<string, WorkpieceTransformContext>([
        ['panel-001', {
          panelId: 'panel-001',
          frame: {
            datum: 'FRONT_LEFT',
            face: 'TOP',
            dimensions: { length: 600, width: 400, thickness: 18 },
          },
          placement: {
            offset: { x: 50, y: 50, z: 0 },
            rotationZ: Math.PI / 2, // 90 CCW
          },
        }],
      ]);

      const result = mapDrillMapToOps(drillMap, machine, {
        workpieceTransforms: transforms,
        attachWorkpieceContext: true,
      });

      expect(result.operations.length).toBe(1);
      const op = result.operations[0];

      // (100, 0) -> rotate 90 CCW -> (0, 100) -> offset (50, 50) -> (50, 150)
      expect(op.position.x).toBeCloseTo(50, 5);
      expect(op.position.y).toBeCloseTo(150, 5);
    });
  });

  describe('multiple panels', () => {
    it('should apply different transforms to different panels', () => {
      const point1 = createMockDrillPoint({ id: 'p1', position: [10, 10, 0] });
      const point2 = createMockDrillPoint({ id: 'p2', position: [10, 10, 0] });

      const panel1 = createMockPanel([point1], { panelId: 'panel-001' });
      const panel2 = createMockPanel([point2], { panelId: 'panel-002' });
      const drillMap = createMockDrillMap([panel1, panel2]);

      const transforms = new Map<string, WorkpieceTransformContext>([
        ['panel-001', {
          panelId: 'panel-001',
          frame: { datum: 'FRONT_LEFT', face: 'TOP', dimensions: { length: 600, width: 400, thickness: 18 } },
          placement: { offset: { x: 0, y: 0, z: 0 }, rotationZ: 0 },
        }],
        ['panel-002', {
          panelId: 'panel-002',
          frame: { datum: 'FRONT_LEFT', face: 'TOP', dimensions: { length: 600, width: 400, thickness: 18 } },
          placement: { offset: { x: 700, y: 0, z: 0 }, rotationZ: 0 }, // Offset on X
        }],
      ]);

      const result = mapDrillMapToOps(drillMap, machine, {
        workpieceTransforms: transforms,
        attachWorkpieceContext: true,
      });

      expect(result.operations.length).toBe(2);

      // Panel 1: no offset
      const op1 = result.operations.find(op => op.sourceId === 'p1');
      expect(op1?.position.x).toBe(10);

      // Panel 2: 700mm X offset
      const op2 = result.operations.find(op => op.sourceId === 'p2');
      expect(op2?.position.x).toBe(710); // 10 + 700
    });
  });
});
