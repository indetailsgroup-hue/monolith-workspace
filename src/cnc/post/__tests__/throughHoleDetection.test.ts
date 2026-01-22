/**
 * throughHoleDetection.test.ts - Tests for Through-Hole Detection and Dwell
 *
 * Verifies through-hole detection logic and dwell behavior for breakout mitigation.
 *
 * @version 1.0.0 - Phase D5-C.1A
 */

import { describe, it, expect } from 'vitest';
import {
  decideDrillParams,
  shouldApplyThroughHoleDwell,
  DEFAULT_THROUGH_HOLE_TUNING,
  DEFAULT_FALLBACK_THICKNESS_MM,
} from '../decideDrillParams';
import type { ThroughHoleDecision } from '../decideDrillParams';
import type { DrillOperation } from '../../operation/operationTypes';
import type { MachineProfile } from '../../machine/machineProfile';
import type { CncPolicyOptions, PanelFrameInfo } from '../types';

// ============================================
// TEST FIXTURES
// ============================================

const mockMachine: MachineProfile = {
  id: 'TEST_MACHINE',
  name: 'Test Machine',
  manufacturer: 'Test',
  controller: 'FANUC',
  defaultSafeZ: 50,
  limits: { x: 3000, y: 1500, z: 100 },
  spindle: { minRpm: 1000, maxRpm: 24000, defaultRpm: 18000 },
  tools: [
    { toolId: 'DRILL_5', type: 'drill', diameter: 5 },
    { toolId: 'DRILL_8', type: 'drill', diameter: 8 },
    { toolId: 'BORE_35', type: 'boring', diameter: 35 },
  ],
};

function createDrillOp(
  depth: number,
  panelId?: string,
  options?: Partial<DrillOperation>
): DrillOperation {
  return {
    id: 'test-drill-1',
    type: 'DRILL',
    toolId: 'DRILL_5',
    position: { x: 100, y: 50, z: 0 },
    depth,
    workpieceContext: panelId ? { panelId } : undefined,
    ...options,
  };
}

// ============================================
// THROUGH-HOLE DETECTION TESTS
// ============================================

describe('Through-Hole Detection', () => {
  describe('Basic detection with panelFrames', () => {
    it('should detect through-hole when depth >= thickness - allowance', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const op = createDrillOp(17.6, 'panel-1');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: { panelFrames },
      });

      // 17.6 >= 18 - 0.5 = 17.5 → through-hole
      expect(result.throughHole.isThroughHole).toBe(true);
      expect(result.throughHole.panelThicknessMm).toBe(18);
      expect(result.throughHole.thicknessResolved).toBe(true);
    });

    it('should not detect through-hole when depth < threshold', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const op = createDrillOp(17.0, 'panel-1');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: { panelFrames },
      });

      // 17.0 < 18 - 0.5 = 17.5 → not through-hole
      expect(result.throughHole.isThroughHole).toBe(false);
    });

    it('should detect through-hole for exact thickness', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const op = createDrillOp(18, 'panel-1');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: { panelFrames },
      });

      expect(result.throughHole.isThroughHole).toBe(true);
    });
  });

  describe('Fallback thickness behavior', () => {
    it('should use fallback thickness when panel not in map', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const op = createDrillOp(17.6, 'unknown-panel');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: {
          panelFrames,
          fallbackThicknessMm: 18,
        },
      });

      expect(result.throughHole.thicknessResolved).toBe(false);
      expect(result.throughHole.panelThicknessMm).toBe(18);
    });

    it('should use default fallback when no fallbackThicknessMm specified', () => {
      const op = createDrillOp(17.6);
      const result = decideDrillParams({
        op,
        machine: mockMachine,
      });

      expect(result.throughHole.panelThicknessMm).toBe(DEFAULT_FALLBACK_THICKNESS_MM);
      expect(result.throughHole.thicknessResolved).toBe(false);
    });

    it('should use explicit fallbackThicknessMm', () => {
      const op = createDrillOp(21.6, 'unknown-panel');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: { fallbackThicknessMm: 22 },
      });

      expect(result.throughHole.panelThicknessMm).toBe(22);
      // 21.6 >= 22 - 0.5 = 21.5 → through-hole
      expect(result.throughHole.isThroughHole).toBe(true);
    });
  });

  describe('Custom allowance', () => {
    it('should respect custom breakthroughAllowanceMm', () => {
      const panelFrames: Record<string, PanelFrameInfo> = {
        'panel-1': { thicknessMm: 18 },
      };

      const op = createDrillOp(17.0, 'panel-1');
      const result = decideDrillParams({
        op,
        machine: mockMachine,
        policyOptions: {
          panelFrames,
          throughHoleTuning: {
            breakthroughAllowanceMm: 1.5, // More aggressive
          },
        },
      });

      // 17.0 >= 18 - 1.5 = 16.5 → through-hole
      expect(result.throughHole.isThroughHole).toBe(true);
    });
  });
});

// ============================================
// MATERIAL SENSITIVITY TESTS
// ============================================

describe('Material Sensitivity', () => {
  const panelFrames: Record<string, PanelFrameInfo> = {
    'panel-1': { thicknessMm: 18 },
  };

  it('should mark HPL as sensitive material', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HPL',
      },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(true);
    expect(result.throughHole.exitDwellSec).toBe(0.15);
  });

  it('should mark PLYWOOD as sensitive material', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'PLYWOOD',
      },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(true);
    expect(result.throughHole.exitDwellSec).toBe(0.15);
  });

  it('should mark MELAMINE as sensitive material with different dwell', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'MELAMINE',
      },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(true);
    expect(result.throughHole.exitDwellSec).toBe(0.10);
  });

  it('should not mark MDF as sensitive material', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'MDF',
      },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(false);
    expect(result.throughHole.exitDwellSec).toBe(0);
  });

  it('should not mark HMR as sensitive material', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HMR',
      },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(false);
    expect(result.throughHole.exitDwellSec).toBe(0);
  });

  it('should not mark UNKNOWN as sensitive material', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: { panelFrames },
    });

    expect(result.throughHole.isSensitiveMaterial).toBe(false);
    expect(result.throughHole.exitDwellSec).toBe(0);
  });
});

// ============================================
// DWELL DECISION TESTS
// ============================================

describe('Exit Dwell Decision', () => {
  const panelFrames: Record<string, PanelFrameInfo> = {
    'panel-1': { thicknessMm: 18 },
  };

  it('should apply dwell only for through-hole + sensitive material', () => {
    // Through-hole + HPL → dwell
    const op1 = createDrillOp(18, 'panel-1');
    const result1 = decideDrillParams({
      op: op1,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HPL',
      },
    });
    expect(shouldApplyThroughHoleDwell(result1.throughHole)).toBe(true);

    // Not through-hole + HPL → no dwell
    const op2 = createDrillOp(10, 'panel-1');
    const result2 = decideDrillParams({
      op: op2,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HPL',
      },
    });
    expect(shouldApplyThroughHoleDwell(result2.throughHole)).toBe(false);

    // Through-hole + MDF → no dwell
    const op3 = createDrillOp(18, 'panel-1');
    const result3 = decideDrillParams({
      op: op3,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'MDF',
      },
    });
    expect(shouldApplyThroughHoleDwell(result3.throughHole)).toBe(false);
  });

  it('should use custom dwell times when specified', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HPL',
        throughHoleTuning: {
          dwellSecByMaterial: {
            HPL: 0.25, // Custom value
          },
        },
      },
    });

    expect(result.throughHole.exitDwellSec).toBe(0.25);
  });

  it('should disable through-hole detection when enabled=false', () => {
    const op = createDrillOp(18, 'panel-1');
    const result = decideDrillParams({
      op,
      machine: mockMachine,
      policyOptions: {
        panelFrames,
        defaultMaterialClass: 'HPL',
        throughHoleTuning: {
          enabled: false,
        },
      },
    });

    expect(result.throughHole.isThroughHole).toBe(false);
    expect(shouldApplyThroughHoleDwell(result.throughHole)).toBe(false);
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('Through-Hole Determinism', () => {
  it('should produce identical results for identical inputs', () => {
    const panelFrames: Record<string, PanelFrameInfo> = {
      'panel-1': { thicknessMm: 18 },
    };

    const op = createDrillOp(17.8, 'panel-1');
    const options: CncPolicyOptions = {
      panelFrames,
      defaultMaterialClass: 'HPL',
    };

    const result1 = decideDrillParams({ op, machine: mockMachine, policyOptions: options });
    const result2 = decideDrillParams({ op, machine: mockMachine, policyOptions: options });

    expect(result1.throughHole).toEqual(result2.throughHole);
  });

  it('should produce consistent results across multiple calls', () => {
    const panelFrames: Record<string, PanelFrameInfo> = {
      'panel-1': { thicknessMm: 22 },
    };

    const op = createDrillOp(21.6, 'panel-1');
    const options: CncPolicyOptions = {
      panelFrames,
      defaultMaterialClass: 'PLYWOOD',
    };

    const results = Array.from({ length: 50 }, () =>
      decideDrillParams({ op, machine: mockMachine, policyOptions: options }).throughHole
    );

    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

// ============================================
// DEFAULT VALUES TESTS
// ============================================

describe('Default Through-Hole Values', () => {
  it('should have conservative default tuning', () => {
    expect(DEFAULT_THROUGH_HOLE_TUNING.enabled).toBe(true);
    expect(DEFAULT_THROUGH_HOLE_TUNING.breakthroughAllowanceMm).toBe(0.5);
    expect(DEFAULT_THROUGH_HOLE_TUNING.dwellSecByMaterial.HPL).toBe(0.15);
    expect(DEFAULT_THROUGH_HOLE_TUNING.dwellSecByMaterial.PLYWOOD).toBe(0.15);
    expect(DEFAULT_THROUGH_HOLE_TUNING.dwellSecByMaterial.MELAMINE).toBe(0.10);
  });

  it('should have standard fallback thickness', () => {
    expect(DEFAULT_FALLBACK_THICKNESS_MM).toBe(18);
  });
});
