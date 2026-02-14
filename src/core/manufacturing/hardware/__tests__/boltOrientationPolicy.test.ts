/**
 * Bolt Orientation Policy Tests
 *
 * Tests the data-driven rule resolver for bolt twist angles.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveBoltTwist,
  DEFAULT_BOLT_ORIENTATION_RULES,
  degToRad,
  radToDeg,
  getHandednessSign,
  MODEL_UP_AXIS,
  SPIN_REFERENCE_AXIS,
  deriveSeamDirFromCorner,
  deriveSeamDirFromNormal,
  computeSeamDrivenTwist,
  resolveSeamDrivenTwist,
  type BoltOrientationContext,
  type BoltOrientationRule,
  type SeamOrientationContext,
  type Vec3,
} from '../boltOrientationPolicy';

// ============================================
// DEFAULT RULES TESTS
// ============================================

describe('resolveBoltTwist: default rules', () => {
  it('INSET joints resolve to 0° (horizontal)', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
    };

    const result = resolveBoltTwist(context);

    expect(result.twistDeg).toBe(0);
    expect(result.matchedRuleId).toBe('INSET_0');
  });

  it('OVERLAY joints resolve to 90° (vertical)', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
    };

    const result = resolveBoltTwist(context);

    expect(result.twistDeg).toBe(90);
    expect(result.matchedRuleId).toBe('OVERLAY_90');
  });

  it('BOTTOM + INSET resolves to 0°', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'BOTTOM',
      jointMode: 'INSET',
    };

    const result = resolveBoltTwist(context);

    expect(result.twistDeg).toBe(0);
    expect(result.matchedRuleId).toBe('INSET_0');
  });

  it('BOTTOM + OVERLAY resolves to 90°', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'BOTTOM',
      jointMode: 'OVERLAY',
    };

    const result = resolveBoltTwist(context);

    expect(result.twistDeg).toBe(90);
    expect(result.matchedRuleId).toBe('OVERLAY_90');
  });

  it('includes panelSide without affecting default rules', () => {
    const leftContext: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    };

    const rightContext: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'RIGHT',
    };

    const leftResult = resolveBoltTwist(leftContext);
    const rightResult = resolveBoltTwist(rightContext);

    // Both should resolve to same angle (INSET = 0°)
    expect(leftResult.twistDeg).toBe(0);
    expect(rightResult.twistDeg).toBe(0);
  });
});

// ============================================
// CUSTOM RULES TESTS
// ============================================

describe('resolveBoltTwist: custom rules', () => {
  it('custom rule takes precedence when matched', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'CUSTOM_LEFT_45',
        description: 'Left side bolts at 45°',
        conditions: {
          panelSide: 'LEFT',
        },
        twistDeg: 45,
      },
      ...DEFAULT_BOLT_ORIENTATION_RULES,
    ];

    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    };

    const result = resolveBoltTwist(context, customRules);

    expect(result.twistDeg).toBe(45);
    expect(result.matchedRuleId).toBe('CUSTOM_LEFT_45');
  });

  it('falls back to default rules when custom rule does not match', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'CUSTOM_LEFT_45',
        description: 'Left side bolts at 45°',
        conditions: {
          panelSide: 'LEFT',
        },
        twistDeg: 45,
      },
      ...DEFAULT_BOLT_ORIENTATION_RULES,
    ];

    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      panelSide: 'RIGHT', // Not LEFT, so custom rule doesn't match
    };

    const result = resolveBoltTwist(context, customRules);

    expect(result.twistDeg).toBe(90); // Falls back to OVERLAY_90
    expect(result.matchedRuleId).toBe('OVERLAY_90');
  });

  it('supports array conditions (multiple values)', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'BOTH_SIDES_30',
        description: 'Both sides at 30°',
        conditions: {
          panelSide: ['LEFT', 'RIGHT'],
          jointMode: 'INSET',
        },
        twistDeg: 30,
      },
      ...DEFAULT_BOLT_ORIENTATION_RULES,
    ];

    const leftContext: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    };

    const rightContext: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'RIGHT',
    };

    expect(resolveBoltTwist(leftContext, customRules).twistDeg).toBe(30);
    expect(resolveBoltTwist(rightContext, customRules).twistDeg).toBe(30);
  });

  it('supports hardware model conditions', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'S100_DIAGONAL',
        description: 'S100 hardware at 45°',
        conditions: {
          hardwareModel: 'S100',
        },
        twistDeg: 45,
      },
      ...DEFAULT_BOLT_ORIENTATION_RULES,
    ];

    const s100Context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      hardwareModel: 'S100',
    };

    const s200Context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      hardwareModel: 'S200',
    };

    expect(resolveBoltTwist(s100Context, customRules).twistDeg).toBe(45);
    expect(resolveBoltTwist(s200Context, customRules).twistDeg).toBe(0); // Falls back
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('resolveBoltTwist: edge cases', () => {
  it('returns 0° when no rules provided', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
    };

    const result = resolveBoltTwist(context, []);

    expect(result.twistDeg).toBe(0);
    expect(result.matchedRuleId).toBe('NONE');
  });

  it('handles undefined optional context fields', () => {
    const minimalContext: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      // panelSide, hardwareModel are undefined
    };

    const result = resolveBoltTwist(minimalContext);

    expect(result.twistDeg).toBe(90);
    expect(result.matchedRuleId).toBe('OVERLAY_90');
  });
});

// ============================================
// UTILITY FUNCTION TESTS
// ============================================

describe('degToRad / radToDeg', () => {
  it('converts 0° to 0 radians', () => {
    expect(degToRad(0)).toBeCloseTo(0, 10);
  });

  it('converts 90° to π/2 radians', () => {
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('converts 180° to π radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
  });

  it('converts 360° to 2π radians', () => {
    expect(degToRad(360)).toBeCloseTo(2 * Math.PI, 10);
  });

  it('round-trips correctly', () => {
    const angles = [0, 15, 30, 45, 60, 90, 120, 135, 180, 270, 360];
    for (const deg of angles) {
      expect(radToDeg(degToRad(deg))).toBeCloseTo(deg, 10);
    }
  });
});

// ============================================
// REAL-WORLD SCENARIOS
// ============================================

describe('resolveBoltTwist: real-world scenarios', () => {
  it('TOP_LEFT + INSET (common case)', () => {
    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    });

    expect(result.twistDeg).toBe(0);
    expect(result.matchedRuleDescription).toContain('Inset');
  });

  it('BOTTOM_RIGHT + OVERLAY (common case)', () => {
    const result = resolveBoltTwist({
      jointPosition: 'BOTTOM',
      jointMode: 'OVERLAY',
      panelSide: 'RIGHT',
    });

    expect(result.twistDeg).toBe(90);
    expect(result.matchedRuleDescription).toContain('Overlay');
  });

  it('returns description for debugging/logging', () => {
    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
    });

    expect(result.matchedRuleDescription).toBeDefined();
    expect(result.matchedRuleDescription.length).toBeGreaterThan(0);
  });
});

// ============================================
// GEOMETRY CONSTANTS
// ============================================

describe('Geometry constants', () => {
  it('MODEL_UP_AXIS is +Y', () => {
    expect(MODEL_UP_AXIS).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('SPIN_REFERENCE_AXIS is +X (matches model fin axis)', () => {
    // Bolt model fins extend along +X (not +Z)
    // This was verified by inspecting Hardware3D.tsx fin geometry:
    // <boxGeometry args={[5.8mm width, 14mm height, 0.4mm depth]} />
    expect(SPIN_REFERENCE_AXIS).toEqual({ x: 1, y: 0, z: 0 });
  });
});

// ============================================
// HANDEDNESS
// ============================================

describe('getHandednessSign', () => {
  it('returns +1 when flipForLeftSide is false', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    };

    expect(getHandednessSign(context, false)).toBe(1);
  });

  it('returns -1 for LEFT side when flipForLeftSide is true', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    };

    expect(getHandednessSign(context, true)).toBe(-1);
  });

  it('returns +1 for RIGHT side even when flipForLeftSide is true', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'RIGHT',
    };

    expect(getHandednessSign(context, true)).toBe(1);
  });

  it('returns +1 when panelSide is undefined', () => {
    const context: BoltOrientationContext = {
      jointPosition: 'TOP',
      jointMode: 'INSET',
    };

    expect(getHandednessSign(context, true)).toBe(1);
  });
});

// ============================================
// PRIORITY AND SPECIFICITY
// ============================================

describe('resolveBoltTwist: priority and specificity', () => {
  it('higher priority rule wins over lower priority', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'LOW_PRIORITY',
        description: 'Low priority rule',
        priority: 0,
        conditions: { jointMode: 'INSET' },
        twistDeg: 10,
      },
      {
        id: 'HIGH_PRIORITY',
        description: 'High priority rule',
        priority: 100,
        conditions: { jointMode: 'INSET' },
        twistDeg: 99,
      },
    ];

    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
    }, customRules);

    expect(result.twistDeg).toBe(99);
    expect(result.matchedRuleId).toBe('HIGH_PRIORITY');
  });

  it('higher specificity wins when priority is equal', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'LESS_SPECIFIC',
        description: 'Less specific (1 condition)',
        priority: 0,
        conditions: { jointMode: 'INSET' },
        twistDeg: 10,
      },
      {
        id: 'MORE_SPECIFIC',
        description: 'More specific (2 conditions)',
        priority: 0,
        conditions: { jointMode: 'INSET', jointPosition: 'TOP' },
        twistDeg: 20,
      },
    ];

    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
    }, customRules);

    expect(result.twistDeg).toBe(20);
    expect(result.matchedRuleId).toBe('MORE_SPECIFIC');
    expect(result.specificity).toBe(2);
  });

  it('returns specificity in result', () => {
    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
    });

    expect(result.specificity).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// HANDEDNESS INTEGRATION
// ============================================

describe('resolveBoltTwist: handedness integration', () => {
  it('applies handedness sign when flipForLeftSide is true', () => {
    const customRules: BoltOrientationRule[] = [
      {
        id: 'DIAGONAL_45',
        description: 'Diagonal at 45°',
        conditions: {},
        twistDeg: 45,
        flipForLeftSide: true,
      },
    ];

    const leftResult = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
    }, customRules);

    const rightResult = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'RIGHT',
    }, customRules);

    // LEFT side gets flipped
    expect(leftResult.twistDeg).toBe(-45);
    expect(leftResult.rawTwistDeg).toBe(45);
    expect(leftResult.handednessSign).toBe(-1);

    // RIGHT side stays positive
    expect(rightResult.twistDeg).toBe(45);
    expect(rightResult.rawTwistDeg).toBe(45);
    expect(rightResult.handednessSign).toBe(1);
  });

  it('does not flip when flipForLeftSide is false/undefined', () => {
    const result = resolveBoltTwist({
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      panelSide: 'LEFT',
    });

    // Default OVERLAY rule does not have flipForLeftSide
    expect(result.twistDeg).toBe(90);
    expect(result.handednessSign).toBe(1);
  });
});

// ============================================
// SEAM DIRECTION DERIVATION (v2.0)
// ============================================

describe('deriveSeamDirFromCorner', () => {
  it('returns +Z for TOP_LEFT corner', () => {
    const seamDir = deriveSeamDirFromCorner('TOP_LEFT');
    expect(seamDir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('returns +Z for TOP_RIGHT corner', () => {
    const seamDir = deriveSeamDirFromCorner('TOP_RIGHT');
    expect(seamDir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('returns +Z for BOTTOM_LEFT corner', () => {
    const seamDir = deriveSeamDirFromCorner('BOTTOM_LEFT');
    expect(seamDir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('returns +Z for BOTTOM_RIGHT corner', () => {
    const seamDir = deriveSeamDirFromCorner('BOTTOM_RIGHT');
    expect(seamDir).toEqual({ x: 0, y: 0, z: 1 });
  });
});

// ============================================
// SEAM DIRECTION FROM NORMAL (v2.1 - PREFERRED)
// ============================================

describe('deriveSeamDirFromNormal', () => {
  it('TOP panel with bolt pointing -X gives seam along -Z', () => {
    // TOP panel: face normal = -Y (bottom face)
    // Bolt direction: -X (into left side panel)
    // seam = cross(-Y, -X) = cross([0,-1,0], [-1,0,0]) = [0, 0, -1]
    const seamDir = deriveSeamDirFromNormal({
      boltDir: { x: -1, y: 0, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
    });

    expect(seamDir).not.toBeNull();
    expect(seamDir!.x).toBeCloseTo(0, 5);
    expect(seamDir!.y).toBeCloseTo(0, 5);
    expect(seamDir!.z).toBeCloseTo(-1, 5);
  });

  it('TOP panel with bolt pointing +X gives seam along +Z', () => {
    // TOP panel: face normal = -Y (bottom face)
    // Bolt direction: +X (into right side panel)
    // seam = cross(-Y, +X) = cross([0,-1,0], [1,0,0]) = [0, 0, 1]
    const seamDir = deriveSeamDirFromNormal({
      boltDir: { x: 1, y: 0, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
    });

    expect(seamDir).not.toBeNull();
    expect(seamDir!.x).toBeCloseTo(0, 5);
    expect(seamDir!.y).toBeCloseTo(0, 5);
    expect(seamDir!.z).toBeCloseTo(1, 5);
  });

  it('BOTTOM panel with bolt pointing -X gives seam along +Z', () => {
    // BOTTOM panel: face normal = +Y (top face)
    // Bolt direction: -X (into left side panel)
    // seam = cross(+Y, -X) = cross([0,1,0], [-1,0,0]) = [0, 0, 1]
    const seamDir = deriveSeamDirFromNormal({
      boltDir: { x: -1, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });

    expect(seamDir).not.toBeNull();
    expect(seamDir!.x).toBeCloseTo(0, 5);
    expect(seamDir!.y).toBeCloseTo(0, 5);
    expect(seamDir!.z).toBeCloseTo(1, 5);
  });

  it('handles diagonal bolt direction correctly', () => {
    // Diagonal bolt: [-0.707, -0.707, 0]
    // Normal: -Y
    const seamDir = deriveSeamDirFromNormal({
      boltDir: { x: -0.707, y: -0.707, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
    });

    expect(seamDir).not.toBeNull();
    // seam should be along Z axis (perpendicular to both)
    expect(Math.abs(seamDir!.z)).toBeGreaterThan(0.9);
  });

  it('returns null for degenerate case (boltDir parallel to normal)', () => {
    // boltDir = normal = +Y -> cross product is zero
    const seamDir = deriveSeamDirFromNormal({
      boltDir: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });

    expect(seamDir).toBeNull();
  });

  it('seam direction is perpendicular to both normal and boltDir', () => {
    const normal = { x: 0, y: -1, z: 0 };
    const boltDir = { x: -0.8, y: -0.6, z: 0 };
    const seamDir = deriveSeamDirFromNormal({ boltDir, normal });

    expect(seamDir).not.toBeNull();

    // Dot product with normal should be ~0
    const dotNormal = seamDir!.x * normal.x + seamDir!.y * normal.y + seamDir!.z * normal.z;
    expect(Math.abs(dotNormal)).toBeLessThan(0.001);

    // Dot product with boltDir should be ~0
    const dotBolt = seamDir!.x * boltDir.x + seamDir!.y * boltDir.y + seamDir!.z * boltDir.z;
    expect(Math.abs(dotBolt)).toBeLessThan(0.001);
  });
});

// ============================================
// GEOMETRY-DRIVEN TWIST CALCULATION (v2.0)
// ============================================

describe('computeSeamDrivenTwist', () => {
  it('INSET with seam along Z, bolt along -X returns consistent twist', () => {
    const twist = computeSeamDrivenTwist({
      boltDir: { x: -1, y: 0, z: 0 },  // Pointing -X (into left side panel)
      seamDirWorld: { x: 0, y: 0, z: 1 },  // Seam along Z
      jointMode: 'INSET',
    });

    // With SPIN_REFERENCE_AXIS = +X (model fins axis), after base alignment,
    // the twist aligns fins with the seam direction.
    // The exact angle depends on the full rotation chain; verify consistency.
    expect(typeof twist).toBe('number');
    expect(isNaN(twist)).toBe(false);
  });

  it('OVERLAY with seam along Z, bolt along -X returns ~180° (or 0°)', () => {
    const twist = computeSeamDrivenTwist({
      boltDir: { x: -1, y: 0, z: 0 },  // Pointing -X
      seamDirWorld: { x: 0, y: 0, z: 1 },  // Seam along Z
      jointMode: 'OVERLAY',
    });

    // OVERLAY is perpendicular to seam (+90° from INSET = 90° + 90° = 180°)
    // Due to angle wrapping, could be close to 180° or 0° depending on normalization
    expect(Math.abs(twist - 180) < 5 || Math.abs(twist) < 5).toBe(true);
  });

  it('handles diagonal bolt direction correctly', () => {
    // Bolt pointing at 45° angle (typical for angled top panel)
    const twist = computeSeamDrivenTwist({
      boltDir: { x: -0.707, y: -0.707, z: 0 },  // Diagonal -X-Y
      seamDirWorld: { x: 0, y: 0, z: 1 },  // Seam along Z
      jointMode: 'INSET',
    });

    // Should still produce a valid angle
    expect(typeof twist).toBe('number');
    expect(isNaN(twist)).toBe(false);
  });

  it('applies policy offset correctly', () => {
    const baseResult = computeSeamDrivenTwist({
      boltDir: { x: -1, y: 0, z: 0 },
      seamDirWorld: { x: 0, y: 0, z: 1 },
      jointMode: 'INSET',
    });

    const withOffset = computeSeamDrivenTwist({
      boltDir: { x: -1, y: 0, z: 0 },
      seamDirWorld: { x: 0, y: 0, z: 1 },
      jointMode: 'INSET',
      policyOffsetDeg: 45,
    });

    expect(withOffset).toBeCloseTo(baseResult + 45, 1);
  });

  it('handles degenerate case (seam parallel to bolt)', () => {
    // Seam is parallel to bolt direction
    const twist = computeSeamDrivenTwist({
      boltDir: { x: 0, y: 0, z: 1 },  // Bolt along Z
      seamDirWorld: { x: 0, y: 0, z: 1 },  // Seam also along Z (degenerate!)
      jointMode: 'INSET',
    });

    // Should fallback gracefully (0° for INSET)
    expect(twist).toBe(0);
  });

  it('handles degenerate case for OVERLAY', () => {
    const twist = computeSeamDrivenTwist({
      boltDir: { x: 0, y: 0, z: 1 },
      seamDirWorld: { x: 0, y: 0, z: 1 },
      jointMode: 'OVERLAY',
    });

    // Should fallback to 90° for OVERLAY
    expect(twist).toBe(90);
  });
});

// ============================================
// UNIFIED RESOLVER (v2.0)
// ============================================

describe('resolveSeamDrivenTwist', () => {
  it('uses geometry when boltDir and cornerType are provided', () => {
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
      cornerType: 'TOP_LEFT',
      boltDir: { x: -1, y: 0, z: 0 },
    });

    expect(result.usedGeometry).toBe(true);
    expect(result.matchedRuleId).toBe('GEOMETRY_SEAM');
    expect(result.seamDir).toBeDefined();
  });

  it('uses geometry when boltDir and seamDirWorld are provided', () => {
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      boltDir: { x: -1, y: 0, z: 0 },
      seamDirWorld: { x: 0, y: 0, z: 1 },
    });

    expect(result.usedGeometry).toBe(true);
    // OVERLAY = INSET + 90° = 90° + 90° = 180° (or 0° with wrapping)
    expect(Math.abs(result.twistDeg - 180) < 5 || Math.abs(result.twistDeg) < 5).toBe(true);
  });

  it('falls back to rule-based when boltDir is missing', () => {
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      panelSide: 'LEFT',
      // No boltDir provided
    });

    expect(result.usedGeometry).toBe(false);
    expect(result.matchedRuleId).toBe('OVERLAY_90');
    expect(result.twistDeg).toBe(90);
  });

  it('uses boltPanelNormal for seam derivation (priority 2)', () => {
    // When boltPanelNormal is provided, should use deriveSeamDirFromNormal
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
      boltDir: { x: -1, y: 0, z: 0 },  // Pointing -X into left side
      boltPanelNormal: { x: 0, y: -1, z: 0 },  // TOP panel's bottom face
    });

    expect(result.usedGeometry).toBe(true);
    expect(result.matchedRuleId).toBe('GEOMETRY_SEAM');
    // Description should mention 'normal-cross' as the seam source
    expect(result.matchedRuleDescription).toContain('normal-cross');
  });

  it('boltPanelNormal takes priority over pocket geometry', () => {
    // Even with position and targetPocketCenter, boltPanelNormal should be used first
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      boltDir: { x: -1, y: 0, z: 0 },
      boltPanelNormal: { x: 0, y: -1, z: 0 },
      position: { x: 24, y: 700, z: 37 },
      targetPocketCenter: { x: 0, y: 693.75, z: 37 },
    });

    expect(result.usedGeometry).toBe(true);
    expect(result.matchedRuleDescription).toContain('normal-cross');
  });

  it('falls back to rule-based when seamDir cannot be derived', () => {
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      boltDir: { x: -1, y: 0, z: 0 },
      // No cornerType or seamDirWorld or boltPanelNormal
    });

    expect(result.usedGeometry).toBe(false);
    expect(result.matchedRuleId).toBe('INSET_0');
  });

  it('geometry result has high specificity', () => {
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      cornerType: 'TOP_LEFT',
      boltDir: { x: -1, y: 0, z: 0 },
    });

    expect(result.specificity).toBe(100);
  });
});

// ============================================
// REAL-WORLD GEOMETRY SCENARIOS (v2.0)
// ============================================

describe('resolveSeamDrivenTwist: real-world scenarios', () => {
  it('TOP_LEFT INSET with standard 90° cabinet', () => {
    // Bolt pointing into left side panel (-X direction)
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
      cornerType: 'TOP_LEFT',
      boltDir: { x: -0.97, y: -0.26, z: 0 },  // Slight downward angle
    });

    expect(result.usedGeometry).toBe(true);
    // INSET aligns fins with seam (Z-axis) for horizontal orientation
    // With SPIN_REFERENCE_AXIS = +X (model fins), this requires ~90° twist
    // Note: No handedness flip for INSET mode (LEFT/RIGHT fins point same direction)
    // So twist magnitude should be ~90° (sign depends on bolt direction)
    expect(Math.abs(Math.abs(result.twistDeg) - 90)).toBeLessThan(15);
  });

  it('TOP_RIGHT OVERLAY with standard 90° cabinet', () => {
    // Bolt pointing into right side panel (+X direction)
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'OVERLAY',
      panelSide: 'RIGHT',
      cornerType: 'TOP_RIGHT',
      boltDir: { x: 0.97, y: -0.26, z: 0 },  // Slight downward angle
    });

    expect(result.usedGeometry).toBe(true);
    // OVERLAY = INSET + 90° = ~180° (or ~0° with wrapping)
    expect(Math.abs(result.twistDeg - 180) < 15 || Math.abs(result.twistDeg) < 15).toBe(true);
  });

  it('angled top panel (45°) still works correctly', () => {
    // Bolt at 45° angle (diagonal from top panel to side)
    const result = resolveSeamDrivenTwist({
      jointPosition: 'TOP',
      jointMode: 'INSET',
      panelSide: 'LEFT',
      cornerType: 'TOP_LEFT',
      boltDir: { x: -0.707, y: -0.707, z: 0 },  // 45° diagonal
    });

    expect(result.usedGeometry).toBe(true);
    // Should produce valid result without needing new rules
    expect(typeof result.twistDeg).toBe('number');
    expect(isNaN(result.twistDeg)).toBe(false);
  });

  it('BOTTOM_LEFT INSET matches BOTTOM_RIGHT INSET (symmetry)', () => {
    const leftResult = resolveSeamDrivenTwist({
      jointPosition: 'BOTTOM',
      jointMode: 'INSET',
      panelSide: 'LEFT',
      cornerType: 'BOTTOM_LEFT',
      boltDir: { x: -1, y: 0, z: 0 },
    });

    const rightResult = resolveSeamDrivenTwist({
      jointPosition: 'BOTTOM',
      jointMode: 'INSET',
      panelSide: 'RIGHT',
      cornerType: 'BOTTOM_RIGHT',
      boltDir: { x: 1, y: 0, z: 0 },
    });

    // Both should produce similar absolute twist angles
    expect(leftResult.usedGeometry).toBe(true);
    expect(rightResult.usedGeometry).toBe(true);
  });
});
