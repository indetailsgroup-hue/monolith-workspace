/**
 * buildOperationGraph.bounds.test.ts - D4 Bounds Validation Tests
 *
 * Tests for machine axis bounds validation during operation graph building.
 *
 * @version 1.0.0 - Phase D4
 */

import { describe, it, expect } from 'vitest';
import { buildOperationGraph } from '../buildOperationGraph';
import { markPacketAsValidated } from '../g9AssertValidPacket';
import type { FactoryPacket } from '../../../factory/packet/types';
import type { MachineProfile } from '../../machine/machineProfile';
import type { ValidatedFactoryPacket } from '../../../core/gate/brandTypes';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockMachine(axisOverrides?: Partial<MachineProfile['axis']>): MachineProfile {
  return {
    id: 'GENERIC',
    name: 'Test CNC',
    manufacturer: 'Test',
    units: 'mm',
    axis: {
      x: { min: 0, max: 3000 },
      y: { min: 0, max: 1500 },
      z: { min: -100, max: 100 },
      ...axisOverrides,
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

// G9: Test fixtures use markPacketAsValidated for trusted test data
function createMockPacket(pointPosition: [number, number, number]): ValidatedFactoryPacket {
  return markPacketAsValidated({
    version: '1.0',
    manifest: {
      version: '1.0',
      jobId: 'test-job',
      contentHash: 'abc123',
      createdAt: new Date().toISOString(),
      artifacts: [],
    },
    drillMap: {
      version: '1.0',
      panels: [
        {
          panelId: 'panel-001',
          role: 'SIDE_LEFT',
          dimensions: { width: 600, height: 400, thickness: 18 },
          worldPosition: [0, 0, 0],
          worldRotation: [0, 0, 0],
          face: 'TOP',
          points: [
            {
              id: 'point-001',
              position: pointPosition,
              normal: [0, 0, 1],
              diameter: 5,
              depth: 10,
              purpose: 'SHELF_PIN',
              face: 'A',
              throughHole: false,
              status: 'VALID',
            },
          ],
        },
      ],
      stats: { totalPoints: 1, byPurpose: { SHELF_PIN: 1 }, byFace: { A: 1 } },
    },
    connectors: {
      minifix: [],
      stats: { totalPairs: 0 },
    },
  } as unknown as FactoryPacket);
}

// ============================================================================
// Bounds Validation Tests
// ============================================================================

describe('buildOperationGraph - D4 Bounds Validation', () => {
  describe('X axis bounds', () => {
    it('should warn when X position exceeds max', () => {
      const machine = createMockMachine({ x: { min: 0, max: 1000 } });
      const packet = createMockPacket([1500, 100, 0]); // X > max

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(1);
      expect(result.warnings.some(w => w.includes('X=1500'))).toBe(true);
      expect(result.warnings.some(w => w.includes('outside'))).toBe(true);
    });

    it('should warn when X position is below min', () => {
      const machine = createMockMachine({ x: { min: 100, max: 1000 } });
      const packet = createMockPacket([50, 100, 0]); // X < min

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(1);
      expect(result.warnings.some(w => w.includes('X=50'))).toBe(true);
    });
  });

  describe('Y axis bounds', () => {
    it('should warn when Y position exceeds max', () => {
      const machine = createMockMachine({ y: { min: 0, max: 500 } });
      const packet = createMockPacket([100, 800, 0]); // Y > max

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(1);
      expect(result.warnings.some(w => w.includes('Y=800'))).toBe(true);
    });
  });

  describe('Z axis bounds', () => {
    it('should warn when Z position exceeds limits', () => {
      const machine = createMockMachine({ z: { min: -50, max: 50 } });
      const packet = createMockPacket([100, 100, -100]); // Z < min

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(1);
      expect(result.warnings.some(w => w.includes('Z=-100'))).toBe(true);
    });
  });

  describe('valid positions', () => {
    it('should not warn for positions within bounds', () => {
      const machine = createMockMachine();
      const packet = createMockPacket([500, 500, 0]); // All within bounds

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(0);
      expect(result.warnings.filter(w => w.includes('out of bounds'))).toHaveLength(0);
    });

    it('should not warn for positions at exact boundary', () => {
      const machine = createMockMachine({ x: { min: 0, max: 1000 } });
      const packet = createMockPacket([1000, 100, 0]); // X exactly at max

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(0);
    });
  });

  describe('multiple violations', () => {
    it('should report all axis violations for a single point', () => {
      const machine = createMockMachine({
        x: { min: 0, max: 100 },
        y: { min: 0, max: 100 },
      });
      const packet = createMockPacket([500, 500, 0]); // Both X and Y exceed

      const result = buildOperationGraph(packet, machine);

      expect(result.stats.outOfBoundsCount).toBe(1); // 1 operation out of bounds
      expect(result.warnings.some(w => w.includes('X=500'))).toBe(true);
      expect(result.warnings.some(w => w.includes('Y=500'))).toBe(true);
    });
  });
});
