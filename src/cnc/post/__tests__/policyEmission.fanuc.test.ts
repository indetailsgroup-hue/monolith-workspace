/**
 * policyEmission.fanuc.test.ts - Tests for FANUC Policy-Driven Cycle Emission
 *
 * Verifies that FANUC dialect correctly emits G81/G82/G83 cycles
 * based on DrillPolicy decisions.
 *
 * @version 1.0.0 - Phase D5-B
 */

import { describe, it, expect } from 'vitest';
import { fanucPostProcessor } from '../dialects/fanuc';
import type { OperationGraph, DrillOperation, BoreOperation } from '../../operation/operationTypes';
import type { MachineProfile } from '../../machine/machineProfile';
import type { PostProcessOptions } from '../types';

// ============================================
// TEST FIXTURES
// ============================================

const createTestMachine = (): MachineProfile => ({
  id: 'KDT',
  name: 'Test KDT Machine',
  manufacturer: 'KDT',
  units: 'mm',
  axis: {
    x: { min: 0, max: 2500 },
    y: { min: 0, max: 1300 },
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
  dialect: 'FANUC',
  supportsToolChange: true,
  toolMagazineSize: 12,
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
  machineId: 'KDT',
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
  programName: 'TEST001',
  includeComments: true,
};

// ============================================
// CYCLE SELECTION TESTS
// ============================================

describe('FANUC Policy-Driven Cycle Selection', () => {
  const machine = createTestMachine();

  describe('G81 - Simple Drill', () => {
    it('should emit G81 for shallow 5mm hole (depth/dia < 3)', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_5', 10)]; // 10mm / 5mm = ratio 2
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G81');
        expect(result.gcode).not.toContain('G82');
        expect(result.gcode).not.toContain('G83');
      }
    });

    it('should emit G81 for 8mm dowel hole', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_8', 12)]; // 12mm / 8mm = ratio 1.5
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G81');
        expect(result.gcode).not.toContain('G83');
      }
    });
  });

  describe('G82 - Dwell Drill (Hinge Cups)', () => {
    it('should emit G82 for 35mm hinge cup bore', () => {
      const ops = [createBoreOp('bore-1', 35, 12)];
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G82');
        expect(result.gcode).toContain('P'); // Dwell parameter
      }
    });

    it('should include dwell time in G82 cycle', () => {
      const ops = [createBoreOp('bore-1', 35, 12)];
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // G82 should have P parameter for dwell
        const g82Match = result.gcode.match(/G82[^G]*P([\d.]+)/);
        expect(g82Match).not.toBeNull();
        if (g82Match) {
          const dwellTime = parseFloat(g82Match[1]);
          expect(dwellTime).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('G83 - Peck Drill (Deep Holes)', () => {
    it('should emit G83 for deep 5mm hole (depth/dia > 3)', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_5', 20)]; // 20mm / 5mm = ratio 4
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.gcode).toContain('G83');
        expect(result.gcode).toContain('Q'); // Peck depth parameter
      }
    });

    it('should include peck depth in G83 cycle', () => {
      const ops = [createDrillOp('drill-1', 'DRILL_5', 20)];
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // G83 should have Q parameter for peck depth
        const g83Match = result.gcode.match(/G83[^G]*Q([\d.]+)/);
        expect(g83Match).not.toBeNull();
        if (g83Match) {
          const peckDepth = parseFloat(g83Match[1]);
          expect(peckDepth).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Mixed Operations', () => {
    it('should emit correct cycles for mixed hole types', () => {
      const ops = [
        createDrillOp('drill-1', 'DRILL_5', 8), // Shallow → G81
        createDrillOp('drill-2', 'DRILL_5', 20), // Deep → G83
        createBoreOp('bore-1', 35, 12), // Hinge cup → G82
      ];
      const graph = createOpGraph(ops);

      const result = fanucPostProcessor.post(graph, machine, defaultOpts);

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
// FEED/SPEED TESTS
// ============================================

describe('FANUC Policy-Driven Feed Rates', () => {
  const machine = createTestMachine();

  it('should include feed rate in drill cycles', () => {
    const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
    const graph = createOpGraph(ops);

    const result = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // Should have F parameter
      const feedMatch = result.gcode.match(/G81[^G]*F([\d.]+)/);
      expect(feedMatch).not.toBeNull();
      if (feedMatch) {
        const feedRate = parseFloat(feedMatch[1]);
        expect(feedRate).toBeGreaterThan(0);
      }
    }
  });

  it('should use policy-derived feed rate for bore operations', () => {
    const ops = [createBoreOp('bore-1', 35, 12)];
    const graph = createOpGraph(ops);

    const result = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // Should have F parameter in G82
      const feedMatch = result.gcode.match(/G82[^G]*F([\d.]+)/);
      expect(feedMatch).not.toBeNull();
      if (feedMatch) {
        const feedRate = parseFloat(feedMatch[1]);
        expect(feedRate).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================
// SAFETY INVARIANT TESTS
// ============================================

describe('FANUC Safety Invariants', () => {
  const machine = createTestMachine();

  it('should emit G80 cancel cycle before tool change', () => {
    const ops = [
      createDrillOp('drill-1', 'DRILL_5', 10),
      createBoreOp('bore-1', 35, 12),
    ];
    const graph = createOpGraph(ops);

    const result = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // G80 should appear after first operation and before tool change
      const lines = result.gcode.split('\n');
      let foundG80 = false;
      let foundToolChange = false;

      for (const line of lines) {
        if (line.includes('G80')) foundG80 = true;
        if (line.includes('M6') && foundG80) foundToolChange = true;
      }

      expect(foundG80).toBe(true);
      expect(foundToolChange).toBe(true);
    }
  });

  it('should emit G80 at program end', () => {
    const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
    const graph = createOpGraph(ops);

    const result = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      const lines = result.gcode.split('\n');
      const endIndex = lines.findIndex((l) => l.includes('M30'));
      const lastG80Index = lines.slice(0, endIndex).findLastIndex((l) => l.includes('G80'));

      // G80 should appear before M30
      expect(lastG80Index).toBeGreaterThan(-1);
      expect(lastG80Index).toBeLessThan(endIndex);
    }
  });

  it('should include standard program structure', () => {
    const ops = [createDrillOp('drill-1', 'DRILL_5', 10)];
    const graph = createOpGraph(ops);

    const result = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      // Standard FANUC structure
      expect(result.gcode).toContain('%'); // Program start/end
      expect(result.gcode).toContain('G21'); // Millimeters
      expect(result.gcode).toContain('G90'); // Absolute
      expect(result.gcode).toContain('G17'); // XY plane
      expect(result.gcode).toContain('M5'); // Spindle off
      expect(result.gcode).toContain('M30'); // Program end
    }
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('FANUC Determinism', () => {
  const machine = createTestMachine();

  it('should produce identical output for identical input', () => {
    const ops = [
      createDrillOp('drill-1', 'DRILL_5', 10),
      createDrillOp('drill-2', 'DRILL_5', 20),
      createBoreOp('bore-1', 35, 12),
    ];
    const graph = createOpGraph(ops);

    const result1 = fanucPostProcessor.post(graph, machine, defaultOpts);
    const result2 = fanucPostProcessor.post(graph, machine, defaultOpts);

    expect(result1.status).toBe('OK');
    expect(result2.status).toBe('OK');

    if (result1.status === 'OK' && result2.status === 'OK') {
      // Remove timestamp from comparison (line with "Generated:")
      const normalizeGcode = (gcode: string) =>
        gcode
          .split('\n')
          .filter((l) => !l.includes('Generated:'))
          .join('\n');

      expect(normalizeGcode(result1.gcode)).toBe(normalizeGcode(result2.gcode));
    }
  });
});
