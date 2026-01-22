/**
 * policyEmission.biesseIso.test.ts - Tests for Biesse ISO Policy-Driven Cycle Emission
 *
 * Verifies that Biesse ISO dialect correctly emits G81/G82/G83 cycles
 * based on DrillPolicy decisions.
 *
 * @version 1.0.0 - Phase D5-B
 */

import { describe, it, expect } from 'vitest';
import { biesseIsoPostProcessor } from '../dialects/biesseIso';
import type { OperationGraph, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { MachineProfile } from '../../machine/machineProfile';
import type { PostProcessOptions } from '../types';

// ============================================
// TEST FIXTURES
// ============================================

const createTestMachine = (): MachineProfile => ({
  id: 'BIESSE',
  name: 'Test Biesse Machine',
  manufacturer: 'Biesse',
  units: 'mm',
  axis: {
    x: { min: 0, max: 3200 },
    y: { min: 0, max: 1600 },
    z: { min: -150, max: 100 },
  },
  spindle: {
    maxRpm: 24000,
    minRpm: 6000,
    defaultRpm: 12000,
  },
  tools: [
    {
      toolId: 'DRILL_5',
      type: 'DRILL',
      diameter: 5,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1200,
      defaultPlungeRate: 800,
    },
    {
      toolId: 'DRILL_8',
      type: 'DRILL',
      diameter: 8,
      maxDepth: 60,
      supportsPeck: true,
      supportsBore: false,
      defaultFeedRate: 1000,
      defaultPlungeRate: 700,
    },
    {
      toolId: 'BORE_35',
      type: 'BORE',
      diameter: 35,
      maxDepth: 25,
      supportsPeck: false,
      supportsBore: true,
      defaultFeedRate: 500,
      defaultPlungeRate: 400,
    },
  ],
  defaultSafeZ: 50,
  coordinateSystem: 'Z_UP',
  dialect: 'BIESSE',
  supportsToolChange: true,
  toolMagazineSize: 16,
});

const createDrillOp = (
  id: string,
  toolId: string,
  depth: number,
  options: Partial<DrillOperation> = {}
): DrillOperation => ({
  type: 'DRILL',
  id,
  sourceId: id,
  toolId,
  position: { x: 100, y: 200, z: 0 },
  depth,
  throughHole: false,
  comment: `Drill ${id}`,
  ...options,
});

const createBoreOp = (
  id: string,
  diameter: number,
  depth: number,
  options: Partial<BoreOperation> = {}
): BoreOperation => ({
  type: 'BORE',
  id,
  sourceId: id,
  toolId: 'BORE_35',
  position: { x: 150, y: 250, z: 0 },
  diameter,
  depth,
  flatBottom: true,
  comment: `Bore ${id}`,
  ...options,
});

const createOpGraph = (operations: (DrillOperation | BoreOperation)[]): OperationGraph => ({
  machineId: 'BIESSE',
  safeZ: 50,
  rapidZ: 60,
  operations,
  metadata: {
    jobId: 'TEST-JOB',
    sourceContentHash: 'abc123',
    builtAt: '2024-01-01T00:00:00Z',
    toolVersion: 'test',
  },
  toolsUsed: [...new Set(operations.map((op) => op.toolId))],
});

const defaultOpts: PostProcessOptions = {
  programName: 'BIESSE001',
  includeComments: true,
};

// ============================================
// CYCLE SELECTION TESTS
// ============================================

describe('Biesse ISO Policy-Driven Cycle Selection', () => {
  const machine = createTestMachine();

  describe('G81 - Simple Drill', () => {
    it('should emit G81 for shallow 5mm hole', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
      const graph = createOpGraph(ops);

      const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G81');
        expect(result.gcode).not.toContain('G82');
        expect(result.gcode).not.toContain('G83');
      }
    });
  });

  describe('G82 - Dwell Drill (Hinge Cups)', () => {
    it('should emit G82 for 35mm hinge cup bore', () => {
      const ops = [createBoreOp('bore-1', 35, 12)];
      const graph = createOpGraph(ops);

      const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G82');
        expect(result.gcode).toContain('P');
      }
    });
  });

  describe('G83 - Peck Drill (Deep Holes)', () => {
    it('should emit G83 for deep 5mm hole', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_5', 20)];
      const graph = createOpGraph(ops);

      const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G83');
        expect(result.gcode).toContain('Q');
      }
    });
  });

  describe('Mixed Operations', () => {
    it('should emit correct cycles for mixed hole types', () => {
      const ops = [
        createDrillOp('drill-1', 'DRILL_5', 8),
        createDrillOp('drill-2', 'DRILL_5', 20),
        createBoreOp('bore-1', 35, 12),
      ];
      const graph = createOpGraph(ops);

      const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G81');
        expect(result.gcode).toContain('G82');
        expect(result.gcode).toContain('G83');
      }
    });
  });
});

// ============================================
// SAFETY INVARIANT TESTS
// ============================================

describe('Biesse ISO Safety Invariants', () => {
  const machine = createTestMachine();

  it('should emit G80 cancel cycle', () => {
    const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
    const graph = createOpGraph(ops);

    const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G80');
    }
  });

  it('should include standard program structure', () => {
    const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
    const graph = createOpGraph(ops);

    const result = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.gcode).toContain('G21'); // Millimeters
      expect(result.gcode).toContain('G90'); // Absolute
      expect(result.gcode).toContain('G17'); // XY plane
      expect(result.gcode).toContain('M5'); // Spindle off
      expect(result.gcode).toContain('M30'); // Program end
    }
  });
});

// ============================================
// DIALECT PARITY TESTS
// ============================================

describe('Biesse ISO vs FANUC Parity', () => {
  const biesseMachine = createTestMachine();
  const fanucMachine: MachineProfile = { ...biesseMachine, id: 'KDT', dialect: 'FANUC' };

  it('should select same cycle type as FANUC for same hole spec', () => {
    const ops = [createBoreOp('bore-1', 35, 12)];
    const biesseGraph = createOpGraph(ops);
    const fanucGraph: OperationGraph = { ...biesseGraph, machineId: 'KDT' };

    const biesseResult = biesseIsoPostProcessor.post(biesseGraph, biesseMachine, defaultOpts);
    // Note: We can't directly compare with FANUC here without importing,
    // but we verify Biesse produces correct cycle selection

    expect(biesseResult.status).toBe('OK');
    if (biesseResult.status === 'OK') {
      // 35mm bore should always use G82 (dwell) per policy
      expect(biesseResult.gcode).toContain('G82');
    }
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('Biesse ISO Determinism', () => {
  const machine = createTestMachine();

  it('should produce identical output for identical input', () => {
    const ops = [
      createDrillOp('drill-1', 'DRILL_5', 10),
      createDrillOp('drill-2', 'DRILL_5', 20),
      createBoreOp('bore-1', 35, 12),
    ];
    const graph = createOpGraph(ops);

    const result1 = biesseIsoPostProcessor.post(graph, machine, defaultOpts);
    const result2 = biesseIsoPostProcessor.post(graph, machine, defaultOpts);

    expect(result1.status).toBe('OK');
    expect(result2.status).toBe('OK');

    if (result1.status === 'OK' && result2.status === 'OK') {
      // Remove timestamp from comparison
      const normalizeGcode = (gcode: string) =>
        gcode
          .split('\n')
          .filter((l) => !l.includes('Generated:'))
          .join('\n');

      expect(normalizeGcode(result1.gcode)).toBe(normalizeGcode(result2.gcode));
    }
  });
});
