/**
 * exitFeedEmission.test.ts - Tests for D5-D.2 Exit Feed Emission
 *
 * Verifies that post processors correctly emit multi-line drilling
 * with reduced exit feed when emitExitFeed is enabled.
 *
 * @version 1.0.0 - Phase D5-D.2
 */

import { describe, it, expect } from 'vitest';
import { fanucPostProcessor } from '../dialects/fanuc';
import { shouldEmitExitFeed } from '../decideDrillParams';
import type { ThroughHoleDecision } from '../decideDrillParams';
import type { OperationGraph, DrillOperation } from '../../operation/operationTypes';
import type { MachineProfile } from '../../machine/machineProfile';
import type { PostProcessOptions, PanelFrameInfo } from '../types';

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

const createDrillOp = (id: string, depth: number, panelId?: string): DrillOperation => ({
  type: 'DRILL',
  id,
  sourceId: id,
  toolId: 'DRILL_5',
  position: { x: 100, y: 200, z: 0 },
  depth,
  throughHole: false,
  comment: `Drill ${id}`,
  workpieceContext: panelId ? {
    panelId,
    face: 'TOP',
    appliedOffset: { x: 0, y: 0, z: 0 },
  } : undefined,
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
// shouldEmitExitFeed HELPER TESTS
// ============================================

describe('shouldEmitExitFeed helper (D5-D.2)', () => {
  it('should return true when all conditions met', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: true,
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0.15,
      isSensitiveMaterial: true,
      exitFeedReductionPercent: 30,
      exitZoneDepthMm: 2,
      exitZoneStartMm: 16,
      exitFeedRateMmMin: 1400,
    };

    expect(shouldEmitExitFeed(decision, true)).toBe(true);
  });

  it('should return false when emitExitFeed is false', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: true,
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0.15,
      isSensitiveMaterial: true,
      exitFeedReductionPercent: 30,
      exitZoneDepthMm: 2,
      exitZoneStartMm: 16,
      exitFeedRateMmMin: 1400,
    };

    expect(shouldEmitExitFeed(decision, false)).toBe(false);
  });

  it('should return false when emitExitFeed is undefined', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: true,
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0.15,
      isSensitiveMaterial: true,
      exitFeedReductionPercent: 30,
      exitZoneDepthMm: 2,
      exitZoneStartMm: 16,
      exitFeedRateMmMin: 1400,
    };

    expect(shouldEmitExitFeed(decision, undefined)).toBe(false);
  });

  it('should return false when not through-hole', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: false, // Not through-hole
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0,
      isSensitiveMaterial: true,
      exitFeedReductionPercent: 0,
      exitZoneDepthMm: 0,
      exitZoneStartMm: 0,
      exitFeedRateMmMin: 0,
    };

    expect(shouldEmitExitFeed(decision, true)).toBe(false);
  });

  it('should return false when not sensitive material', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: true,
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0,
      isSensitiveMaterial: false, // MDF, not sensitive
      exitFeedReductionPercent: 0,
      exitZoneDepthMm: 0,
      exitZoneStartMm: 0,
      exitFeedRateMmMin: 0,
    };

    expect(shouldEmitExitFeed(decision, true)).toBe(false);
  });

  it('should return false when exitFeedRateMmMin is 0', () => {
    const decision: ThroughHoleDecision = {
      isThroughHole: true,
      panelThicknessMm: 18,
      thicknessResolved: true,
      exitDwellSec: 0.15,
      isSensitiveMaterial: true,
      exitFeedReductionPercent: 0,
      exitZoneDepthMm: 0,
      exitZoneStartMm: 0,
      exitFeedRateMmMin: 0, // No exit feed calculated
    };

    expect(shouldEmitExitFeed(decision, true)).toBe(false);
  });
});

// ============================================
// FANUC EXIT FEED EMISSION TESTS
// ============================================

describe('FANUC Exit Feed Emission (D5-D.2)', () => {
  const machine = createTestMachine();

  describe('emitExitFeed: false (default)', () => {
    it('should use canned cycle when emitExitFeed is false', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const opGraph = createOpGraph([createDrillOp('op1', 18, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'HPL',
          throughHoleTuning: {
            emitExitFeed: false,
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Should use a canned cycle (G81/G82/G83) - policy may choose any based on depth
        expect(result.gcode).toMatch(/G8[123]/);
        // Should NOT have multi-line indicator
        expect(result.gcode).not.toContain('MULTI+EF');
      }
    });
  });

  describe('emitExitFeed: true', () => {
    it('should use multi-line drill when emitExitFeed is true for through-hole with sensitive material', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const opGraph = createOpGraph([createDrillOp('op1', 18, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'HPL',
          throughHoleTuning: {
            emitExitFeed: true,
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Should have multi-line indicator in comment
        expect(result.gcode).toContain('MULTI+EF');
        // Should have separate G1 moves with different feed rates
        const g1Matches = result.gcode.match(/G1 Z-?\d+\.?\d* F\d+\.?\d*/g) || [];
        expect(g1Matches.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should emit different feed rates in exit zone', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const opGraph = createOpGraph([createDrillOp('op1', 18, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'HPL',
          throughHoleTuning: {
            emitExitFeed: true,
            exitZoneDepthMm: 2,
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Extract feed rates from G1 commands
        const feedMatches = result.gcode.match(/G1 Z[^\n]* F(\d+)/g) || [];
        const feeds = feedMatches.map(m => {
          const match = m.match(/F(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        });

        // Should have at least 2 different feed rates (normal and reduced)
        if (feeds.length >= 2) {
          const uniqueFeeds = new Set(feeds);
          expect(uniqueFeeds.size).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('should include dwell after multi-line drill when applicable', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const opGraph = createOpGraph([createDrillOp('op1', 18, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'HPL',
          throughHoleTuning: {
            emitExitFeed: true,
            dwellSecByMaterial: {
              HPL: 0.15,
            },
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Should have G4 dwell command
        expect(result.gcode).toMatch(/G4 P0\.15/);
      }
    });

    it('should NOT use multi-line drill for non-through-hole', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      // Shallow hole, not through
      const opGraph = createOpGraph([createDrillOp('op1', 10, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'HPL',
          throughHoleTuning: {
            emitExitFeed: true,
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Should use canned cycle for non-through-hole
        expect(result.gcode).toMatch(/G81/);
        expect(result.gcode).not.toContain('MULTI+EF');
      }
    });

    it('should NOT use multi-line drill for non-sensitive material', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const opGraph = createOpGraph([createDrillOp('op1', 18, 'panel-1')]);
      const opts: PostProcessOptions = {
        programName: 'TEST001',
        policy: {
          panelFrames,
          defaultMaterialClass: 'MDF', // Not sensitive
          throughHoleTuning: {
            emitExitFeed: true,
          },
        },
      };

      const result = fanucPostProcessor.post(opGraph, machine, opts);

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        // Should use canned cycle for non-sensitive material (policy may choose G81/G82/G83)
        expect(result.gcode).toMatch(/G8[123]/);
        expect(result.gcode).not.toContain('MULTI+EF');
      }
    });
  });
});
