/**
 * Gate Validation Rules Unit Tests
 *
 * Tests for manufacturing validation rules:
 * - Cut size non-negative validation
 * - Minimum margin validation
 * - Edge allowance validation
 *
 * @version 1.0.0 - AGENT-T020
 */

import { describe, it, expect } from 'vitest';
import { ruleCutSizeNonNegative } from '../rule_cutSize_nonNegative';
import { ruleMinMargins } from '../rule_minMargins';
import { computeCutW, computeCutH, computeCutSize } from '../../compute/cutSize';
import type { GatePolicy, PartSpec, DrillOp, FittingIntent, EdgeSpec } from '../../types';

// ============================================
// TEST HELPERS
// ============================================

const createPolicy = (overrides: Partial<GatePolicy> = {}): GatePolicy => ({
  policyVersion: '1.0',
  thicknessSafetyMarginMm: 0.5,
  minMarginToEdgeMm: 8,
  minFeatureSizeMm: 12,
  backPanelClearanceMm: 2,
  shelfToBackClearanceMm: 1,
  minFittingSpacingMm: 32,
  minSetbackFromEdgeMm: 18,
  minCutDimensionMm: 20,
  ...overrides,
});

const createEdge = (
  enabled: boolean = false,
  thicknessMm: number = 0,
  premillMm: number = 0.5
): EdgeSpec => ({
  enabled,
  thicknessMm,
  premillMm,
});

const createPart = (
  partId: string,
  finishW: number,
  finishH: number,
  edges: Partial<Record<'L' | 'R' | 'T' | 'B', EdgeSpec>> = {}
): PartSpec => ({
  partId,
  name: `Part ${partId}`,
  finishW,
  finishH,
  material: {
    coreThicknessMm: 16,
    surfaceAThicknessMm: 0.1,
    surfaceBThicknessMm: 0.1,
  },
  edges: {
    L: createEdge(false),
    R: createEdge(false),
    T: createEdge(false),
    B: createEdge(false),
    ...edges,
  },
});

const createDrillOp = (
  opId: string,
  partId: string,
  x: number,
  y: number,
  depthMm: number = 10,
  // Every real drill op carries a diameter — the drill map records one for
  // every point. Ops built without one are measured from the bore CENTRE,
  // which understates the true edge margin, so ruleMinMargins flags them.
  // Defaulting to Ø8 (the standard dowel) keeps these fixtures representative
  // of real holes and exercises the wall-based measurement.
  diaMm: number = 8
): DrillOp => ({
  opId,
  partId,
  x,
  y,
  depthMm,
  diaMm,
});

const createFitting = (
  fittingId: string,
  partId: string,
  x: number,
  y: number
): FittingIntent => ({
  fittingId,
  partId,
  x,
  y,
});

// ============================================
// CUT SIZE COMPUTATION TESTS
// ============================================

describe('computeCutW', () => {
  it('should return finish width when no edges', () => {
    const part = createPart('p1', 400, 500);
    expect(computeCutW(part)).toBe(400);
  });

  it('should subtract edge and add premill for enabled edges', () => {
    const part = createPart('p1', 400, 500, {
      L: createEdge(true, 1, 0.5),
      R: createEdge(true, 1, 0.5),
    });
    // 400 - (1 + 1) + (0.5 + 0.5) = 399
    expect(computeCutW(part)).toBe(399);
  });

  it('should ignore disabled edges', () => {
    const part = createPart('p1', 400, 500, {
      L: createEdge(false, 2, 0.5),
      R: createEdge(false, 2, 0.5),
    });
    // Disabled edges are ignored
    expect(computeCutW(part)).toBe(400);
  });

  it('should handle asymmetric edges', () => {
    const part = createPart('p1', 400, 500, {
      L: createEdge(true, 2, 0.5),
      R: createEdge(false, 1, 0.5),
    });
    // 400 - 2 + 0.5 = 398.5
    expect(computeCutW(part)).toBe(398.5);
  });
});

describe('computeCutH', () => {
  it('should return finish height when no edges', () => {
    const part = createPart('p1', 400, 500);
    expect(computeCutH(part)).toBe(500);
  });

  it('should subtract edge and add premill for enabled edges', () => {
    const part = createPart('p1', 400, 500, {
      T: createEdge(true, 1, 0.5),
      B: createEdge(true, 1, 0.5),
    });
    // 500 - (1 + 1) + (0.5 + 0.5) = 499
    expect(computeCutH(part)).toBe(499);
  });
});

describe('computeCutSize', () => {
  it('should return both dimensions', () => {
    const part = createPart('p1', 400, 500, {
      L: createEdge(true, 1, 0.5),
      T: createEdge(true, 1, 0.5),
    });
    const { cutW, cutH } = computeCutSize(part);
    expect(cutW).toBe(399.5); // 400 - 1 + 0.5
    expect(cutH).toBe(499.5); // 500 - 1 + 0.5
  });
});

// ============================================
// RULE: CUT SIZE NON-NEGATIVE
// ============================================

describe('ruleCutSizeNonNegative', () => {
  const policy = createPolicy({ minCutDimensionMm: 20 });

  describe('BLOCKER - Non-positive cut size', () => {
    it('should return BLOCKER when cut width is zero', () => {
      // Create part with thick edges that make cut size zero
      const part = createPart('p1', 4, 500, {
        L: createEdge(true, 2, 0),
        R: createEdge(true, 2, 0),
      });
      // cutW = 4 - 4 = 0
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
      expect(issues[0].code).toBe('B_CUTSIZE_NONPOSITIVE');
    });

    it('should return BLOCKER when cut width is negative', () => {
      const part = createPart('p1', 2, 500, {
        L: createEdge(true, 2, 0),
        R: createEdge(true, 2, 0),
      });
      // cutW = 2 - 4 = -2
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
    });

    it('should return BLOCKER when cut height is non-positive', () => {
      const part = createPart('p1', 400, 2, {
        T: createEdge(true, 2, 0),
        B: createEdge(true, 2, 0),
      });
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
    });
  });

  describe('WARNING - Cut size too small', () => {
    it('should return WARNING when cut size below minimum', () => {
      const part = createPart('p1', 15, 15); // Below 20mm minimum
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('WARNING');
      expect(issues[0].code).toBe('W_CUTSIZE_TOO_SMALL');
    });

    it('should return WARNING for one dimension below minimum', () => {
      const part = createPart('p1', 100, 10); // Height below minimum
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('WARNING');
    });
  });

  describe('PASS - Valid cut sizes', () => {
    it('should return no issues for valid part', () => {
      const part = createPart('p1', 400, 500);
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(0);
    });

    it('should return no issues for part exactly at minimum', () => {
      const part = createPart('p1', 20, 20);
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues.length).toBe(0);
    });

    it('should handle multiple valid parts', () => {
      const parts = [
        createPart('p1', 400, 500),
        createPart('p2', 600, 800),
        createPart('p3', 300, 700),
      ];
      const issues = ruleCutSizeNonNegative(policy, parts);

      expect(issues.length).toBe(0);
    });
  });

  describe('context information', () => {
    it('should include context in BLOCKER issue', () => {
      const part = createPart('p1', 2, 500, {
        L: createEdge(true, 2, 0),
        R: createEdge(true, 2, 0),
      });
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues[0].context).toBeDefined();
      expect(issues[0].context?.finishW).toBe(2);
      expect(issues[0].context?.finishH).toBe(500);
      expect(issues[0].partIds).toContain('p1');
    });

    it('should include minCutDimensionMm in WARNING context', () => {
      const part = createPart('p1', 15, 15);
      const issues = ruleCutSizeNonNegative(policy, [part]);

      expect(issues[0].context?.minCutDimensionMm).toBe(20);
    });
  });
});

// ============================================
// RULE: MINIMUM MARGINS
// ============================================

describe('ruleMinMargins', () => {
  const policy = createPolicy({
    minMarginToEdgeMm: 8,
    minSetbackFromEdgeMm: 18,
  });

  describe('drill operations margin check', () => {
    it('should return BLOCKER when drill too close to left edge', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 5, 100); // x=5 < 8

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
      expect(issues[0].code).toBe('B_MIN_MARGIN_DRILL');
    });

    it('should return BLOCKER when drill too close to top edge', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 100, 3); // y=3 < 8

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
    });

    it('should return BLOCKER when drill too close to right edge', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 395, 100); // 400-395=5 < 8

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(1);
    });

    it('should return BLOCKER when drill too close to bottom edge', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 100, 495); // 500-495=5 < 8

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(1);
    });

    it('should pass when drill has adequate margin', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 100, 100);

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(0);
    });

    it('should pass when the bore WALL is exactly at minimum margin', () => {
      const part = createPart('p1', 400, 500);
      // The margin is the material between the hole and the edge, so a Ø8 bore
      // sits at min + radius = 8 + 4 = 12mm from the edge to leave exactly 8mm.
      // This used to place the CENTRE at 8mm and call it compliant, which left
      // only 4mm of material — the understatement Item 4 removes.
      const drill = createDrillOp('d1', 'p1', 12, 12);

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(0);
    });
  });

  describe('fitting intent setback check', () => {
    it('should return BLOCKER when fitting too close to edge', () => {
      const part = createPart('p1', 400, 500);
      const fitting = createFitting('f1', 'p1', 10, 100); // x=10 < 18

      const issues = ruleMinMargins(policy, [part], [], [fitting]);

      expect(issues.length).toBe(1);
      expect(issues[0].severity).toBe('BLOCKER');
      expect(issues[0].code).toBe('B_MIN_SETBACK_FITTING');
    });

    it('should pass when fitting has adequate setback', () => {
      const part = createPart('p1', 400, 500);
      const fitting = createFitting('f1', 'p1', 50, 100);

      const issues = ruleMinMargins(policy, [part], [], [fitting]);

      expect(issues.length).toBe(0);
    });

    it('should pass when fitting exactly at minimum setback', () => {
      const part = createPart('p1', 400, 500);
      const fitting = createFitting('f1', 'p1', 18, 18);

      const issues = ruleMinMargins(policy, [part], [], [fitting]);

      expect(issues.length).toBe(0);
    });
  });

  describe('combined drill and fitting checks', () => {
    it('should check both drills and fittings', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 5, 100); // Too close
      const fitting = createFitting('f1', 'p1', 10, 100); // Too close

      const issues = ruleMinMargins(policy, [part], [drill], [fitting]);

      expect(issues.length).toBe(2);
      expect(issues.some(i => i.code === 'B_MIN_MARGIN_DRILL')).toBe(true);
      expect(issues.some(i => i.code === 'B_MIN_SETBACK_FITTING')).toBe(true);
    });

    it('should handle operations on multiple parts', () => {
      const parts = [
        createPart('p1', 400, 500),
        createPart('p2', 600, 800),
      ];
      const drills = [
        createDrillOp('d1', 'p1', 5, 100), // Too close on p1
        createDrillOp('d2', 'p2', 100, 100), // OK on p2
      ];

      const issues = ruleMinMargins(policy, parts, drills, []);

      expect(issues.length).toBe(1);
      expect(issues[0].partIds).toContain('p1');
    });
  });

  describe('part not found handling', () => {
    it('should ignore operations with unknown partId', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'unknown', 5, 100);

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues.length).toBe(0); // Ignored, not an error
    });
  });

  describe('context information', () => {
    it('should include position and margin info in context', () => {
      const part = createPart('p1', 400, 500);
      const drill = createDrillOp('d1', 'p1', 5, 100);

      const issues = ruleMinMargins(policy, [part], [drill], []);

      expect(issues[0].context?.x).toBe(5);
      expect(issues[0].context?.y).toBe(100);
      expect(issues[0].context?.finishW).toBe(400);
      expect(issues[0].context?.finishH).toBe(500);
      expect(issues[0].context?.minMarginToEdgeMm).toBe(8);
    });
  });
});

// ============================================
// REAL-WORLD SCENARIOS
// ============================================

describe('real-world validation scenarios', () => {
  const policy = createPolicy();

  it('should validate standard kitchen cabinet shelf', () => {
    // 600mm wide cabinet, shelf with 1mm edge
    const shelf = createPart('shelf-1', 564, 520, {
      T: createEdge(true, 1, 0.5), // Front edge
    });

    const cutIssues = ruleCutSizeNonNegative(policy, [shelf]);
    expect(cutIssues.length).toBe(0);
  });

  it('should catch edge thickness mistake (too thick edges)', () => {
    // Someone entered 10mm edge instead of 1mm
    const panel = createPart('side-1', 560, 720, {
      L: createEdge(true, 10, 0.5),
      R: createEdge(true, 10, 0.5),
      T: createEdge(true, 10, 0.5),
      B: createEdge(true, 10, 0.5),
    });

    const cutIssues = ruleCutSizeNonNegative(policy, [panel]);
    // Cut width = 560 - 20 + 1 = 541 (OK)
    // But someone entering 100mm edges would be a problem
    expect(cutIssues.length).toBe(0);
  });

  it('should validate minifix placement margins', () => {
    const sidePanel = createPart('side-1', 560, 720);
    const minifixDrill = createDrillOp(
      'minifix-1',
      'side-1',
      24, // Distance B = 24mm from edge
      37  // First hole Z = 37mm
    );

    const marginIssues = ruleMinMargins(
      createPolicy({ minMarginToEdgeMm: 8 }),
      [sidePanel],
      [minifixDrill],
      []
    );

    expect(marginIssues.length).toBe(0);
  });

  it('should catch drill too close to edge', () => {
    const panel = createPart('panel-1', 400, 500);
    // Drill at 5mm from edge (below 8mm minimum)
    const drill = createDrillOp('d1', 'panel-1', 5, 100);

    const issues = ruleMinMargins(policy, [panel], [drill], []);

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
  });

  it('should validate multiple parts in a cabinet', () => {
    const parts = [
      createPart('left-side', 560, 720),
      createPart('right-side', 560, 720),
      createPart('bottom', 564, 560, {
        T: createEdge(true, 1, 0.5),
      }),
      createPart('shelf-1', 562, 520, {
        T: createEdge(true, 1, 0.5),
      }),
    ];

    const cutIssues = ruleCutSizeNonNegative(policy, parts);
    expect(cutIssues.length).toBe(0);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  const policy = createPolicy();

  it('should handle empty parts array', () => {
    const cutIssues = ruleCutSizeNonNegative(policy, []);
    expect(cutIssues.length).toBe(0);

    const marginIssues = ruleMinMargins(policy, [], [], []);
    expect(marginIssues.length).toBe(0);
  });

  it('should handle very large dimensions', () => {
    const largePart = createPart('large', 2440, 1220);
    const issues = ruleCutSizeNonNegative(policy, [largePart]);
    expect(issues.length).toBe(0);
  });

  it('should handle decimal edge thicknesses', () => {
    const part = createPart('p1', 400, 500, {
      L: createEdge(true, 0.45, 0.5),
      R: createEdge(true, 0.45, 0.5),
    });
    // 400 - 0.9 + 1 = 400.1
    expect(computeCutW(part)).toBeCloseTo(400.1, 5);
  });

  it('should handle zero premill', () => {
    const part = createPart('p1', 400, 500, {
      T: createEdge(true, 1, 0),
    });
    // 500 - 1 + 0 = 499
    expect(computeCutH(part)).toBe(499);
  });
});
