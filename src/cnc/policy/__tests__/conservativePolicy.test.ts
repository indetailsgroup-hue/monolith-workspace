/**
 * conservativePolicy.test.ts - Tests for Conservative Drilling Policy
 *
 * Verifies deterministic cycle selection and feed/speed calculation.
 *
 * @version 1.0.0 - Phase D5-A
 */

import { describe, it, expect } from 'vitest';
import {
  CONSERVATIVE_DRILL_POLICY,
  getConservativePolicyConfig,
  createCustomPolicy,
} from '../conservativePolicy';
import { classifyHoleKind, isDeepHole } from '../drillPolicyTypes';
import type { HoleSpec, MaterialHint, CycleType } from '../drillPolicyTypes';

// ============================================
// TEST FIXTURES
// ============================================

const MDF_HINT: MaterialHint = { class: 'MDF' };
const MELAMINE_HINT: MaterialHint = { class: 'MELAMINE' };
const HPL_HINT: MaterialHint = { class: 'HPL' };
const UNKNOWN_HINT: MaterialHint = { class: 'UNKNOWN' };

const createHoleSpec = (
  diameter: number,
  depth: number,
  panelThickness: number = 18,
  options: Partial<HoleSpec> = {}
): HoleSpec => ({
  diameter,
  depth,
  panelThickness,
  ...options,
});

// ============================================
// CYCLE SELECTION TESTS
// ============================================

describe('Conservative Policy - Cycle Selection', () => {
  const policy = CONSERVATIVE_DRILL_POLICY;

  describe('G81 - Simple Drill', () => {
    it('should select G81 for 5mm system hole', () => {
      const hole = createHoleSpec(5, 10, 18);
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G81');
      expect(result.holeKind).toBe('SYSTEM_HOLE');
    });

    it('should select G81 for 8mm dowel hole', () => {
      const hole = createHoleSpec(8, 12, 18);
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G81');
      expect(result.holeKind).toBe('DOWEL');
    });

    it('should select G81 for shallow 15mm cam housing', () => {
      const hole = createHoleSpec(15, 12, 18);
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G81');
      expect(result.holeKind).toBe('CAM_HOUSING');
    });
  });

  describe('G82 - Dwell Drill', () => {
    it('should select G82 for 35mm hinge cup', () => {
      const hole = createHoleSpec(35, 12, 18);
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G82');
      expect(result.holeKind).toBe('HINGE_CUP');
      expect(result.reason).toContain('dwell');
    });

    it('should select G82 for hinge cup in any material', () => {
      const hole = createHoleSpec(35, 12, 18);

      expect(policy.selectCycle(hole, MDF_HINT).cycle).toBe('G82');
      expect(policy.selectCycle(hole, MELAMINE_HINT).cycle).toBe('G82');
      expect(policy.selectCycle(hole, HPL_HINT).cycle).toBe('G82');
    });

    it('should select G82 for explicit HINGE_CUP kind even if diameter differs', () => {
      const hole = createHoleSpec(34, 12, 18, { kind: 'HINGE_CUP' });
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G82');
      expect(result.holeKind).toBe('HINGE_CUP');
    });
  });

  describe('G83 - Peck Drill', () => {
    it('should select G83 for deep hole (depth/dia > 3)', () => {
      // 5mm x 20mm = ratio of 4
      const hole = createHoleSpec(5, 20, 25);
      const result = policy.selectCycle(hole, MDF_HINT);

      expect(result.cycle).toBe('G83');
      expect(result.reason).toContain('Deep hole');
    });

    it('should select G83 for through-hole in HPL', () => {
      const hole = createHoleSpec(8, 18, 18, { throughHole: true });
      const result = policy.selectCycle(hole, HPL_HINT);

      expect(result.cycle).toBe('G83');
      expect(result.reason).toContain('HPL');
    });

    it('should select G83 for through-hole in plywood', () => {
      const hole = createHoleSpec(8, 18, 18, { throughHole: true });
      const result = policy.selectCycle(hole, { class: 'PLYWOOD' });

      expect(result.cycle).toBe('G83');
      expect(result.reason).toContain('PLYWOOD');
    });

    it('should NOT select G83 for through-hole in MDF (soft material)', () => {
      const hole = createHoleSpec(8, 18, 18, { throughHole: true });
      const result = policy.selectCycle(hole, MDF_HINT);

      // MDF is soft, through-hole doesn't need peck
      expect(result.cycle).toBe('G81');
    });
  });
});

// ============================================
// FEED/SPEED TESTS
// ============================================

describe('Conservative Policy - Feed/Speed', () => {
  const policy = CONSERVATIVE_DRILL_POLICY;

  describe('Base feed/speed lookup', () => {
    it('should return correct base RPM for 5mm drill in MDF', () => {
      const hole = createHoleSpec(5, 10, 18);
      const params = policy.getParameters(hole, MDF_HINT);

      expect(params.rpm).toBe(6000);
      expect(params.feedRate).toBe(1200);
    });

    it('should return correct base RPM for 35mm bore in MDF', () => {
      const hole = createHoleSpec(35, 12, 18);
      const params = policy.getParameters(hole, MDF_HINT);

      expect(params.rpm).toBe(2500);
      expect(params.feedRate).toBe(500);
    });

    it('should interpolate for non-standard diameter', () => {
      // 12mm is between 10mm and 15mm in the table
      const hole = createHoleSpec(12, 10, 18);
      const params = policy.getParameters(hole, MDF_HINT);

      // Should be between 4500/3500 RPM and 900/800 feed
      expect(params.rpm).toBeGreaterThan(3500);
      expect(params.rpm).toBeLessThan(4500);
      expect(params.feedRate).toBeGreaterThan(800);
      expect(params.feedRate).toBeLessThan(900);
    });
  });

  describe('Material multipliers', () => {
    it('should reduce feed for MELAMINE', () => {
      const hole = createHoleSpec(8, 12, 18);
      const mdfParams = policy.getParameters(hole, MDF_HINT);
      const melParams = policy.getParameters(hole, MELAMINE_HINT);

      expect(melParams.feedRate).toBeLessThan(mdfParams.feedRate);
      expect(melParams.rpm).toBeGreaterThan(mdfParams.rpm); // Higher RPM for cleaner cut
    });

    it('should significantly reduce feed for HPL', () => {
      const hole = createHoleSpec(8, 12, 18);
      const mdfParams = policy.getParameters(hole, MDF_HINT);
      const hplParams = policy.getParameters(hole, HPL_HINT);

      // HPL should have ~70% feed of MDF
      expect(hplParams.feedRate).toBeLessThan(mdfParams.feedRate * 0.75);
    });

    it('should use conservative parameters for UNKNOWN material', () => {
      const hole = createHoleSpec(8, 12, 18);
      const mdfParams = policy.getParameters(hole, MDF_HINT);
      const unknownParams = policy.getParameters(hole, UNKNOWN_HINT);

      // UNKNOWN should be most conservative
      expect(unknownParams.feedRate).toBeLessThan(mdfParams.feedRate);
      expect(unknownParams.rpm).toBeLessThan(mdfParams.rpm);
    });
  });

  describe('Cycle-specific parameters', () => {
    it('should include dwell time for G82 cycle', () => {
      const hole = createHoleSpec(35, 12, 18);
      const params = policy.getParameters(hole, MDF_HINT);

      expect(params.cycle).toBe('G82');
      expect(params.dwellTime).toBeDefined();
      expect(params.dwellTime).toBeGreaterThan(0);
    });

    it('should include peck parameters for G83 cycle', () => {
      const hole = createHoleSpec(5, 20, 25); // Deep hole
      const params = policy.getParameters(hole, MDF_HINT);

      expect(params.cycle).toBe('G83');
      expect(params.peckDepth).toBeDefined();
      expect(params.peckDepth).toBeGreaterThan(0);
      expect(params.retract).toBeDefined();
    });

    it('should NOT include extra parameters for G81 cycle', () => {
      const hole = createHoleSpec(8, 12, 18);
      const params = policy.getParameters(hole, MDF_HINT);

      expect(params.cycle).toBe('G81');
      expect(params.dwellTime).toBeUndefined();
      expect(params.peckDepth).toBeUndefined();
    });
  });
});

// ============================================
// VALIDATION TESTS
// ============================================

describe('Conservative Policy - Validation', () => {
  const policy = CONSERVATIVE_DRILL_POLICY;

  it('should pass valid hole specs', () => {
    const hole = createHoleSpec(8, 12, 18);
    const errors = policy.validate(hole);

    expect(errors).toEqual([]);
  });

  it('should fail for zero diameter', () => {
    const hole = createHoleSpec(0, 12, 18);
    const errors = policy.validate(hole);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Diameter');
  });

  it('should fail for negative depth', () => {
    const hole = createHoleSpec(8, -5, 18);
    const errors = policy.validate(hole);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Depth');
  });

  it('should fail for depth exceeding panel thickness', () => {
    const hole = createHoleSpec(8, 25, 18); // 25mm depth > 18mm panel
    const errors = policy.validate(hole);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('exceeds');
  });

  it('should fail for oversized diameter', () => {
    const hole = createHoleSpec(60, 12, 18);
    const errors = policy.validate(hole);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('maximum');
  });
});

// ============================================
// HOLE CLASSIFICATION TESTS
// ============================================

describe('Hole Classification', () => {
  it('should classify 5mm as SYSTEM_HOLE', () => {
    const hole = createHoleSpec(5, 10, 18);
    expect(classifyHoleKind(hole)).toBe('SYSTEM_HOLE');
  });

  it('should classify 8mm as DOWEL', () => {
    const hole = createHoleSpec(8, 12, 18);
    expect(classifyHoleKind(hole)).toBe('DOWEL');
  });

  it('should classify 15mm as CAM_HOUSING', () => {
    const hole = createHoleSpec(15, 12, 18);
    expect(classifyHoleKind(hole)).toBe('CAM_HOUSING');
  });

  it('should classify 35mm as HINGE_CUP', () => {
    const hole = createHoleSpec(35, 12, 18);
    expect(classifyHoleKind(hole)).toBe('HINGE_CUP');
  });

  it('should classify through-hole correctly', () => {
    const hole = createHoleSpec(8, 18, 18, { throughHole: true });
    expect(classifyHoleKind(hole)).toBe('THROUGH');
  });

  it('should detect through-hole from depth near panel thickness', () => {
    const hole = createHoleSpec(8, 17.8, 18); // Almost through
    expect(classifyHoleKind(hole)).toBe('THROUGH');
  });

  it('should use explicit kind when provided', () => {
    const hole = createHoleSpec(10, 12, 18, { kind: 'CUSTOM' });
    expect(classifyHoleKind(hole)).toBe('CUSTOM');
  });

  it('should classify non-standard diameter as CUSTOM', () => {
    const hole = createHoleSpec(12, 10, 18);
    expect(classifyHoleKind(hole)).toBe('CUSTOM');
  });
});

// ============================================
// DEEP HOLE DETECTION TESTS
// ============================================

describe('Deep Hole Detection', () => {
  it('should detect deep hole when ratio > threshold', () => {
    // 5mm x 20mm = ratio of 4
    const hole = createHoleSpec(5, 20, 25);
    expect(isDeepHole(hole, 3)).toBe(true);
  });

  it('should NOT detect shallow hole', () => {
    // 8mm x 12mm = ratio of 1.5
    const hole = createHoleSpec(8, 12, 18);
    expect(isDeepHole(hole, 3)).toBe(false);
  });

  it('should detect deep hole at exact threshold', () => {
    // 10mm x 30mm = ratio of exactly 3
    const hole = createHoleSpec(10, 30.1, 35);
    expect(isDeepHole(hole, 3)).toBe(true);
  });
});

// ============================================
// POLICY CONFIGURATION TESTS
// ============================================

describe('Policy Configuration', () => {
  it('should expose policy metadata', () => {
    const policy = CONSERVATIVE_DRILL_POLICY;

    expect(policy.id).toBe('conservative-v1');
    expect(policy.name).toContain('Conservative');
    expect(policy.version).toBe('1.0.0');
  });

  it('should allow accessing config for inspection', () => {
    const config = getConservativePolicyConfig();

    expect(config.feedSpeedTable.length).toBeGreaterThan(0);
    expect(config.cycleRules.peckThreshold).toBe(3);
    expect(config.cycleRules.dwellDiameters).toContain(35);
  });

  it('should allow creating custom policy with overrides', () => {
    const customPolicy = createCustomPolicy({
      id: 'custom-test',
      name: 'Test Policy',
      cycleRules: {
        peckThreshold: 2, // More aggressive peck
        dwellDiameters: [35],
        dwellTime: 0.5,
        peckDepthRatio: 1.5,
        peckRetract: 2,
      },
    });

    expect(customPolicy.id).toBe('custom-test');
    expect(customPolicy.name).toBe('Test Policy');

    // Should use overridden peck threshold
    const hole = createHoleSpec(10, 25, 30); // ratio = 2.5
    const result = customPolicy.selectCycle(hole, MDF_HINT);
    expect(result.cycle).toBe('G83'); // Should trigger peck at ratio > 2
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('Policy Determinism', () => {
  it('should produce identical output for identical input', () => {
    const policy = CONSERVATIVE_DRILL_POLICY;
    const hole = createHoleSpec(8, 12, 18);

    const result1 = policy.getParameters(hole, MDF_HINT);
    const result2 = policy.getParameters(hole, MDF_HINT);

    expect(result1).toEqual(result2);
  });

  it('should produce consistent results across multiple calls', () => {
    const policy = CONSERVATIVE_DRILL_POLICY;

    const results = Array.from({ length: 100 }, () => {
      const hole = createHoleSpec(35, 12, 18);
      return policy.selectCycle(hole, MELAMINE_HINT);
    });

    // All results should be identical
    const firstResult = results[0];
    expect(results.every((r) => r.cycle === firstResult.cycle)).toBe(true);
    expect(results.every((r) => r.holeKind === firstResult.holeKind)).toBe(true);
  });
});
