/**
 * drillTuning.test.ts - Tests for Drill Tuning Options
 *
 * Verifies peck schedule calculation, retract modes, and final clamp behavior.
 *
 * @version 1.0.0 - Phase D5-C.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePeckSchedule,
  getEffectivePeckDepth,
  needsExplicitPeckSchedule,
  DEFAULT_DRILL_TUNING,
  PARTIAL_RETRACT_CLEARANCE,
  TAPER_PECK_RATIO,
  TAPER_START_PERCENT,
} from '../drillTuningTypes';
import type { DrillTuningOptions, PeckEntry } from '../drillTuningTypes';

// ============================================
// PECK SCHEDULE CALCULATION TESTS
// ============================================

describe('Peck Schedule Calculation', () => {
  const safeZ = 5;
  const surfaceZ = 0;

  describe('FIXED mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FIXED', retractMode: 'FULL' };

    it('should calculate correct number of pecks', () => {
      // 20mm depth, 5mm peck = 4 pecks
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      expect(schedule.length).toBe(4);
    });

    it('should use fixed peck depth throughout', () => {
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      // All pecks should be 5mm
      schedule.forEach((entry) => {
        expect(entry.peckDepth).toBe(5);
      });
    });

    it('should calculate correct target Z for each peck', () => {
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      expect(schedule[0].targetZ).toBe(-5);
      expect(schedule[1].targetZ).toBe(-10);
      expect(schedule[2].targetZ).toBe(-15);
      expect(schedule[3].targetZ).toBe(-20);
    });

    it('should retract to safe Z in FULL mode', () => {
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      schedule.forEach((entry) => {
        expect(entry.retractZ).toBe(safeZ);
      });
    });
  });

  describe('FINAL_CLAMP mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', retractMode: 'FULL' };

    it('should clamp final peck to remaining depth', () => {
      // 18mm depth, 5mm peck: 3 full pecks + 1 clamped peck of 3mm
      const schedule = calculatePeckSchedule(18, 5, safeZ, surfaceZ, tuning);

      expect(schedule.length).toBe(4);
      expect(schedule[0].peckDepth).toBe(5);
      expect(schedule[1].peckDepth).toBe(5);
      expect(schedule[2].peckDepth).toBe(5);
      expect(schedule[3].peckDepth).toBe(3); // Clamped to remaining
    });

    it('should not overshoot target depth', () => {
      const schedule = calculatePeckSchedule(18, 5, safeZ, surfaceZ, tuning);
      const lastEntry = schedule[schedule.length - 1];

      expect(lastEntry.targetZ).toBe(-18);
    });

    it('should handle exact divisible depth', () => {
      // 15mm depth, 5mm peck: exactly 3 pecks
      const schedule = calculatePeckSchedule(15, 5, safeZ, surfaceZ, tuning);

      expect(schedule.length).toBe(3);
      schedule.forEach((entry) => {
        expect(entry.peckDepth).toBe(5);
      });
    });

    it('should handle depth less than peck', () => {
      // 3mm depth, 5mm peck: 1 peck of 3mm
      const schedule = calculatePeckSchedule(3, 5, safeZ, surfaceZ, tuning);

      expect(schedule.length).toBe(1);
      expect(schedule[0].peckDepth).toBe(3);
      expect(schedule[0].targetZ).toBe(-3);
    });
  });

  describe('TAPERED mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'TAPERED', retractMode: 'FULL' };

    it('should reduce peck depth after taper threshold', () => {
      // 20mm depth, 5mm peck
      // Taper starts at 70% = 14mm depth
      // After 14mm, peck = 5 * 0.8 = 4mm
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      // First 3 pecks (0-15mm) should be 5mm
      expect(schedule[0].peckDepth).toBe(5);
      expect(schedule[1].peckDepth).toBe(5);
      expect(schedule[2].peckDepth).toBe(5);

      // After 15mm (75%), pecks should be tapered (4mm)
      // But also clamped to remaining
      const lastPecks = schedule.slice(3);
      lastPecks.forEach((entry) => {
        expect(entry.peckDepth).toBeLessThanOrEqual(5 * TAPER_PECK_RATIO);
      });
    });

    it('should still clamp to remaining depth', () => {
      const schedule = calculatePeckSchedule(22, 5, safeZ, surfaceZ, tuning);
      const lastEntry = schedule[schedule.length - 1];

      // Final peck should reach exactly -22
      expect(lastEntry.targetZ).toBe(-22);
    });
  });

  describe('PARTIAL retract mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', retractMode: 'PARTIAL' };

    it('should retract to partial clearance above current depth', () => {
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      // After first peck at -5, retract to -5 + 2 = -3 (but not above safe Z)
      expect(schedule[0].retractZ).toBeLessThanOrEqual(safeZ);
      expect(schedule[0].retractZ).toBeGreaterThan(schedule[0].targetZ);
    });

    it('should not retract above safe Z', () => {
      // First peck with small depth: retract should not exceed safe Z
      const schedule = calculatePeckSchedule(20, 5, safeZ, surfaceZ, tuning);

      schedule.forEach((entry) => {
        expect(entry.retractZ).toBeLessThanOrEqual(safeZ);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very small depth', () => {
      const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP' };
      const schedule = calculatePeckSchedule(0.5, 5, safeZ, surfaceZ, tuning);

      expect(schedule.length).toBe(1);
      expect(schedule[0].peckDepth).toBeLessThanOrEqual(0.5);
    });

    it('should respect minimum peck depth', () => {
      const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', minPeckDepth: 2 };
      const schedule = calculatePeckSchedule(9, 5, safeZ, surfaceZ, tuning);

      // 9mm depth: 5mm + 4mm (not below minPeckDepth)
      schedule.forEach((entry) => {
        expect(entry.peckDepth).toBeGreaterThanOrEqual(Math.min(2, 9 - (entry.peckNumber - 1) * 5));
      });
    });
  });
});

// ============================================
// EFFECTIVE PECK DEPTH TESTS
// ============================================

describe('Effective Peck Depth', () => {
  it('should return base peck depth for FIXED mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FIXED' };
    const result = getEffectivePeckDepth(20, 5, tuning);

    expect(result).toBe(5);
  });

  it('should clamp to total depth for FINAL_CLAMP mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP' };

    // Normal case: peck < depth
    expect(getEffectivePeckDepth(20, 5, tuning)).toBe(5);

    // Edge case: peck > depth
    expect(getEffectivePeckDepth(3, 5, tuning)).toBe(3);
  });

  it('should use default tuning when not specified', () => {
    const result = getEffectivePeckDepth(20, 5);

    // Default is FINAL_CLAMP, should return min(5, 20) = 5
    expect(result).toBe(5);
  });
});

// ============================================
// EXPLICIT SCHEDULE DETECTION TESTS
// ============================================

describe('Explicit Schedule Detection', () => {
  it('should return false for standard FIXED/FULL mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FIXED', retractMode: 'FULL' };
    expect(needsExplicitPeckSchedule(20, 5, tuning)).toBe(false);
  });

  it('should return false for FINAL_CLAMP/FULL mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', retractMode: 'FULL' };
    expect(needsExplicitPeckSchedule(20, 5, tuning)).toBe(false);
  });

  it('should return true for TAPERED mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'TAPERED', retractMode: 'FULL' };
    expect(needsExplicitPeckSchedule(20, 5, tuning)).toBe(true);
  });

  it('should return true for PARTIAL retract mode', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', retractMode: 'PARTIAL' };
    expect(needsExplicitPeckSchedule(20, 5, tuning)).toBe(true);
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('Tuning Determinism', () => {
  it('should produce identical schedule for identical inputs', () => {
    const tuning: DrillTuningOptions = { peckMode: 'FINAL_CLAMP', retractMode: 'FULL' };

    const schedule1 = calculatePeckSchedule(18, 5, 5, 0, tuning);
    const schedule2 = calculatePeckSchedule(18, 5, 5, 0, tuning);

    expect(schedule1).toEqual(schedule2);
  });

  it('should produce consistent results across multiple calls', () => {
    const tuning: DrillTuningOptions = { peckMode: 'TAPERED' };

    const results = Array.from({ length: 50 }, () =>
      calculatePeckSchedule(25, 6, 5, 0, tuning)
    );

    // All results should be identical
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

// ============================================
// DEFAULT VALUES TESTS
// ============================================

describe('Default Tuning Values', () => {
  it('should have conservative defaults', () => {
    expect(DEFAULT_DRILL_TUNING.retractMode).toBe('FULL');
    expect(DEFAULT_DRILL_TUNING.peckMode).toBe('FINAL_CLAMP');
    expect(DEFAULT_DRILL_TUNING.partialRetractClearance).toBe(PARTIAL_RETRACT_CLEARANCE);
    expect(DEFAULT_DRILL_TUNING.minPeckDepth).toBe(1);
  });

  it('should use default values when tuning not specified', () => {
    const schedule = calculatePeckSchedule(18, 5, 5, 0);

    // Should use FINAL_CLAMP (clamp last peck)
    expect(schedule[schedule.length - 1].peckDepth).toBe(3);

    // Should use FULL retract
    schedule.forEach((entry) => {
      expect(entry.retractZ).toBe(5);
    });
  });
});
