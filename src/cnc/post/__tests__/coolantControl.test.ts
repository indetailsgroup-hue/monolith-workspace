/**
 * coolantControl.test.ts - Tests for Automatic Coolant Control (M8/M9)
 *
 * Verifies that post processors correctly emit M8 (coolant on) at setup
 * and M9 (coolant off) at program end when useCoolant is enabled.
 *
 * @version 1.0.0 - Phase D5-D.1
 */

import { describe, it, expect } from 'vitest';
import { fanucPostProcessor } from '../dialects/fanuc';
import { biesseIsoPostProcessor } from '../dialects/biesseIso';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';
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
  ],
  defaultSafeZ: 50,
  coordinateSystem: 'Z_UP',
  dialect: 'FANUC',
  supportsToolChange: true,
  toolMagazineSize: 12,
});

const createDrillOp = (id: string): DrillOperation => ({
  type: 'DRILL',
  id,
  sourceId: id,
  toolId: 'DRILL_5',
  position: { x: 100, y: 200, z: 0 },
  depth: 10,
  throughHole: false,
  comment: `Drill ${id}`,
});

const createOpGraph = (operations: DrillOperation[]): OperationGraph => ({
  machineId: 'KDT',
  safeZ: 50,
  rapidZ: 60,
  operations,
  metadata: {
    jobId: 'TEST-JOB',
    sourceContentHash: 'abc123',
    builtAt: new Date().toISOString(),
    toolVersion: 'test@1.0',
  },
  toolsUsed: ['DRILL_5'],
});

// ============================================
// FANUC COOLANT CONTROL TESTS
// ============================================

describe('FANUC Coolant Control (D5-D.1)', () => {
  const machine = createTestMachine();

  describe('useCoolant: false (default)', () => {
    it('should NOT emit M8 in setup when useCoolant is false', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: false,
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // M9 should still appear in footer (defensive off)
        expect(result.gcode).toContain('M9');
        // M8 should NOT appear anywhere in setup
        const setupSection = result.gcode.split('(Tool change')[0];
        expect(setupSection).not.toContain('M8');
      }
    });

    it('should NOT emit M8 when useCoolant is undefined (default)', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        // useCoolant not set - should default to false
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        const setupSection = result.gcode.split('(Tool change')[0];
        expect(setupSection).not.toContain('M8');
      }
    });
  });

  describe('useCoolant: true', () => {
    it('should emit M8 in setup when useCoolant is true', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: true,
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // M8 should appear in setup (before first tool change)
        const setupSection = result.gcode.split('(Tool change')[0];
        expect(setupSection).toContain('M8');
      }
    });

    it('should emit M9 in footer when useCoolant is true', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: true,
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // M9 should appear near M30 (program end)
        const footerSection = result.gcode.split('(Program end)')[1] || '';
        expect(footerSection).toContain('M9');
      }
    });

    it('should have M8 after setup codes (G21, G90, G17, G80)', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: true,
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        const lines = result.gcode.split('\n');
        const g21Index = lines.findIndex(l => l.includes('G21'));
        const m8Index = lines.findIndex(l => l.includes('M8'));

        // M8 should come after G21 (setup codes)
        expect(m8Index).toBeGreaterThan(g21Index);
      }
    });
  });
});

// ============================================
// BIESSE ISO COOLANT CONTROL TESTS
// ============================================

describe('BIESSE ISO Coolant Control (D5-D.1)', () => {
  const machine: MachineProfile = {
    ...createTestMachine(),
    id: 'BIESSE',
    dialect: 'BIESSE',
  };

  describe('useCoolant: false (default)', () => {
    it('should NOT emit M8 in setup when useCoolant is false', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: false,
      };

      const result = biesseIsoPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        const setupSection = result.gcode.split('(Tool:')[0];
        expect(setupSection).not.toContain('M8');
      }
    });
  });

  describe('useCoolant: true', () => {
    it('should emit M8 in setup when useCoolant is true', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: true,
      };

      const result = biesseIsoPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        const setupSection = result.gcode.split('(Tool:')[0];
        expect(setupSection).toContain('M8');
      }
    });

    it('should emit M9 in footer when useCoolant is true', () => {
      const opGraph = createOpGraph([createDrillOp('op1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        useCoolant: true,
      };

      const result = biesseIsoPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        const footerSection = result.gcode.split('(End of program)')[1] || '';
        expect(footerSection).toContain('M9');
      }
    });
  });
});
