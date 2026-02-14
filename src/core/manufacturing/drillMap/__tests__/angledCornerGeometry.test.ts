/**
 * Unit tests for angledCornerGeometry.ts
 *
 * Tests Minifix hardware placement calculations for angled cabinet corners.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCornerAngle,
  calculateAngledDistanceB,
  isRightAngle,
  degToRad,
  radToDeg,
  getDefaultCornerAngle,
  requiresAngledDrilling,
} from '../angledCornerGeometry';
import { MINIFIX_ANGLE_LIMITS } from '../types';

describe('angledCornerGeometry', () => {
  // ============================================
  // validateCornerAngle
  // ============================================
  describe('validateCornerAngle', () => {
    it('should accept 90° angle without warning', () => {
      const result = validateCornerAngle(90);
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it('should accept angles in standard range (45°-135°) without warning', () => {
      for (const angle of [45, 60, 75, 90, 105, 120, 135]) {
        const result = validateCornerAngle(angle);
        expect(result.valid).toBe(true);
        expect(result.blocked).toBe(false);
        expect(result.warning).toBe(false);
      }
    });

    it('should warn for acute angles below 45°', () => {
      const result = validateCornerAngle(40);
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.message).toContain('may require longer bolts');
    });

    it('should warn for obtuse angles above 135°', () => {
      const result = validateCornerAngle(140);
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.message).toContain('may require longer bolts');
    });

    it('should block angles below 30° (physical limit)', () => {
      const result = validateCornerAngle(25);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.warning).toBe(false);
      expect(result.message).toContain('below minimum');
    });

    it('should block angles above 150° (physical limit)', () => {
      const result = validateCornerAngle(155);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.warning).toBe(false);
      expect(result.message).toContain('exceeds maximum');
    });

    it('should accept boundary angle 30° with warning', () => {
      const result = validateCornerAngle(30);
      expect(result.valid).toBe(true);
      expect(result.warning).toBe(true);
    });

    it('should accept boundary angle 150° with warning', () => {
      const result = validateCornerAngle(150);
      expect(result.valid).toBe(true);
      expect(result.warning).toBe(true);
    });
  });

  // ============================================
  // calculateAngledDistanceB
  // ============================================
  describe('calculateAngledDistanceB', () => {
    const standardB = 24; // mm (per CAD spec)

    it('should return unchanged Distance B for 90° corner', () => {
      const result = calculateAngledDistanceB(standardB, 90);
      expect(result).toBeCloseTo(standardB, 2);
    });

    it('should return unchanged Distance B for angles within tolerance of 90°', () => {
      const result = calculateAngledDistanceB(standardB, 90.05);
      expect(result).toBeCloseTo(standardB, 2);
    });

    it('should increase Distance B for acute angles (60°)', () => {
      // At 60°: sin(45°)/sin(30°) = 0.7071/0.5 = 1.414
      const result = calculateAngledDistanceB(standardB, 60);
      expect(result).toBeGreaterThan(standardB);
      expect(result).toBeCloseTo(standardB * Math.SQRT2, 1); // ~33.9mm
    });

    it('should decrease Distance B for obtuse angles (120°)', () => {
      // At 120°: sin(45°)/sin(60°) = 0.7071/0.866 = 0.816
      const result = calculateAngledDistanceB(standardB, 120);
      expect(result).toBeLessThan(standardB);
      expect(result).toBeCloseTo(19.6, 0); // ~19.6mm
    });

    it('should increase Distance B significantly for very acute angles (45°)', () => {
      // At 45°: sin(45°)/sin(22.5°) = 0.7071/0.3827 = 1.848
      const result = calculateAngledDistanceB(standardB, 45);
      expect(result).toBeGreaterThan(standardB * 1.5);
    });

    it('should decrease Distance B significantly for very obtuse angles (135°)', () => {
      // At 135°: sin(45°)/sin(67.5°) = 0.7071/0.9239 = 0.765
      const result = calculateAngledDistanceB(standardB, 135);
      expect(result).toBeLessThan(standardB * 0.8);
    });

    it('should handle edge case of 30° angle', () => {
      const result = calculateAngledDistanceB(standardB, 30);
      // At 30°: sin(45°)/sin(15°) = 0.7071/0.2588 = 2.73
      expect(result).toBeGreaterThan(standardB * 2.5);
    });
  });

  // ============================================
  // isRightAngle
  // ============================================
  describe('isRightAngle', () => {
    it('should return true for exactly 90°', () => {
      expect(isRightAngle(90)).toBe(true);
    });

    it('should return true for angles within default tolerance (0.1°)', () => {
      expect(isRightAngle(89.95)).toBe(true);
      expect(isRightAngle(90.05)).toBe(true);
    });

    it('should return false for angles outside default tolerance', () => {
      expect(isRightAngle(89.8)).toBe(false);
      expect(isRightAngle(90.2)).toBe(false);
    });

    it('should respect custom tolerance', () => {
      expect(isRightAngle(89, 2)).toBe(true);
      expect(isRightAngle(91, 2)).toBe(true);
      expect(isRightAngle(87, 2)).toBe(false);
    });
  });

  // ============================================
  // Utility functions
  // ============================================
  describe('degToRad', () => {
    it('should convert 0° to 0 radians', () => {
      expect(degToRad(0)).toBeCloseTo(0, 10);
    });

    it('should convert 90° to π/2 radians', () => {
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
    });

    it('should convert 180° to π radians', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    });

    it('should convert 360° to 2π radians', () => {
      expect(degToRad(360)).toBeCloseTo(Math.PI * 2, 10);
    });
  });

  describe('radToDeg', () => {
    it('should convert 0 radians to 0°', () => {
      expect(radToDeg(0)).toBeCloseTo(0, 10);
    });

    it('should convert π/2 radians to 90°', () => {
      expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 10);
    });

    it('should convert π radians to 180°', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
    });
  });

  describe('getDefaultCornerAngle', () => {
    it('should return 90° for all corner types', () => {
      expect(getDefaultCornerAngle('TOP_LEFT')).toBe(90);
      expect(getDefaultCornerAngle('TOP_RIGHT')).toBe(90);
      expect(getDefaultCornerAngle('BOTTOM_LEFT')).toBe(90);
      expect(getDefaultCornerAngle('BOTTOM_RIGHT')).toBe(90);
    });
  });

  describe('requiresAngledDrilling', () => {
    it('should return false for 90° angle', () => {
      expect(requiresAngledDrilling(90)).toBe(false);
    });

    it('should return false for angles within 1° of 90°', () => {
      expect(requiresAngledDrilling(89.5)).toBe(false);
      expect(requiresAngledDrilling(90.5)).toBe(false);
    });

    it('should return true for angles more than 1° from 90°', () => {
      expect(requiresAngledDrilling(88)).toBe(true);
      expect(requiresAngledDrilling(92)).toBe(true);
      expect(requiresAngledDrilling(60)).toBe(true);
      expect(requiresAngledDrilling(120)).toBe(true);
    });
  });

  // ============================================
  // MINIFIX_ANGLE_LIMITS constant
  // ============================================
  describe('MINIFIX_ANGLE_LIMITS', () => {
    it('should have correct physical limits', () => {
      expect(MINIFIX_ANGLE_LIMITS.MIN_ANGLE).toBe(30);
      expect(MINIFIX_ANGLE_LIMITS.MAX_ANGLE).toBe(150);
    });

    it('should have warning thresholds within physical limits', () => {
      expect(MINIFIX_ANGLE_LIMITS.WARNING_MIN).toBeGreaterThan(MINIFIX_ANGLE_LIMITS.MIN_ANGLE);
      expect(MINIFIX_ANGLE_LIMITS.WARNING_MAX).toBeLessThan(MINIFIX_ANGLE_LIMITS.MAX_ANGLE);
    });

    it('should have symmetric warning thresholds around 90°', () => {
      const lowerDiff = 90 - MINIFIX_ANGLE_LIMITS.WARNING_MIN;  // 45
      const upperDiff = MINIFIX_ANGLE_LIMITS.WARNING_MAX - 90;  // 45
      expect(lowerDiff).toBe(upperDiff);
    });
  });
});
