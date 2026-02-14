/**
 * doorCalculations.test.ts - Unit tests for door dimension calculations
 */

import { describe, expect, it } from 'vitest';
import {
  calculateDoorDimensions,
  calculateHingeCount,
  calculateHingePositions,
  estimateDoorWeight,
  validateDoorHingeConfig,
  createDoorPanelId,
  HINGE_CUP_SPECS,
  HINGE_COUNT_BY_HEIGHT,
} from '../doorCalculations';

describe('doorCalculations', () => {
  // ============================================
  // calculateDoorDimensions
  // ============================================
  describe('calculateDoorDimensions', () => {
    const baseInput = {
      openingWidth: 500,
      openingHeight: 700,
      doorCount: 1 as const,
      overlayType: 'full' as const,
      overlayAmount: 18,
      doorGap: 3,
      revealGap: 2,
      panelThickness: 18,
    };

    describe('single door', () => {
      it('calculates full overlay single door dimensions', () => {
        const result = calculateDoorDimensions(baseInput);

        // Width: 500 + (2 × 18) - (2 × 2) = 500 + 36 - 4 = 532
        expect(result.width).toBe(532);
        // Height: 700 + (2 × 18) - (2 × 2) = 700 + 36 - 4 = 732
        expect(result.height).toBe(732);
        // Single door centered at X=0
        expect(result.xPosition).toBe(0);
        expect(result.xPositionRight).toBeUndefined();
      });

      it('calculates half overlay single door dimensions', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          overlayType: 'half',
        });

        // Width: 500 + 18 - (2 × 2) = 500 + 18 - 4 = 514
        expect(result.width).toBe(514);
        // Height: 700 + 18 - (2 × 2) = 700 + 18 - 4 = 714
        expect(result.height).toBe(714);
      });

      it('calculates inset single door dimensions', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          overlayType: 'inset',
        });

        // Width: 500 - (2 × 2) = 496
        expect(result.width).toBe(496);
        // Height: 700 - (2 × 2) = 696
        expect(result.height).toBe(696);
      });

      it('handles zero reveal gap', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          revealGap: 0,
        });

        // Width: 500 + (2 × 18) - 0 = 536
        expect(result.width).toBe(536);
        // Height: 700 + (2 × 18) - 0 = 736
        expect(result.height).toBe(736);
      });
    });

    describe('double doors', () => {
      it('calculates full overlay double door dimensions', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          doorCount: 2,
        });

        // Total width: 500 + (2 × 18) = 536
        // Total gaps: 3 + (2 × 2) = 7
        // Door width: (536 - 7) / 2 = 529 / 2 = 264.5
        expect(result.width).toBe(264.5);
        expect(result.height).toBe(732);

        // X positions for left and right doors
        const xOffset = (264.5 + 3) / 2;
        expect(result.xPosition).toBe(-xOffset);
        expect(result.xPositionRight).toBe(xOffset);
      });

      it('calculates half overlay double door dimensions', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          doorCount: 2,
          overlayType: 'half',
        });

        // Total width: 500 + 18 = 518
        // Total gaps: 3 + (2 × 2) = 7
        // Door width: (518 - 7) / 2 = 511 / 2 = 255.5
        expect(result.width).toBe(255.5);
        expect(result.height).toBe(714);
      });

      it('calculates inset double door dimensions', () => {
        const result = calculateDoorDimensions({
          ...baseInput,
          doorCount: 2,
          overlayType: 'inset',
        });

        // Total width: 500
        // Total gaps: 3 + (2 × 2) = 7
        // Door width: (500 - 7) / 2 = 493 / 2 = 246.5
        expect(result.width).toBe(246.5);
        expect(result.height).toBe(696);
      });

      it('respects door gap setting', () => {
        const result1 = calculateDoorDimensions({
          ...baseInput,
          doorCount: 2,
          doorGap: 3,
        });

        const result2 = calculateDoorDimensions({
          ...baseInput,
          doorCount: 2,
          doorGap: 6,
        });

        // Larger gap = narrower doors
        expect(result2.width).toBeLessThan(result1.width);
      });
    });
  });

  // ============================================
  // calculateHingeCount
  // ============================================
  describe('calculateHingeCount', () => {
    it('returns 2 hinges for short doors (≤800mm)', () => {
      expect(calculateHingeCount(500)).toBe(2);
      expect(calculateHingeCount(700)).toBe(2);
      expect(calculateHingeCount(800)).toBe(2);
    });

    it('returns 3 hinges for medium doors (801-1200mm)', () => {
      expect(calculateHingeCount(801)).toBe(3);
      expect(calculateHingeCount(1000)).toBe(3);
      expect(calculateHingeCount(1200)).toBe(3);
    });

    it('returns 4 hinges for tall doors (1201-1600mm)', () => {
      expect(calculateHingeCount(1201)).toBe(4);
      expect(calculateHingeCount(1400)).toBe(4);
      expect(calculateHingeCount(1600)).toBe(4);
    });

    it('returns 5 hinges for very tall doors (1601-2000mm)', () => {
      expect(calculateHingeCount(1601)).toBe(5);
      expect(calculateHingeCount(1800)).toBe(5);
      expect(calculateHingeCount(2000)).toBe(5);
    });

    it('returns 6 hinges for extra tall doors (>2000mm)', () => {
      expect(calculateHingeCount(2001)).toBe(6);
      expect(calculateHingeCount(2500)).toBe(6);
    });

    it('adds extra hinge for heavy doors', () => {
      // 3 hinges at 1000mm height
      // Heavy door: >75kg (3 × 25kg)
      expect(calculateHingeCount(1000, 80)).toBe(4);
    });

    it('never returns less than 2 hinges', () => {
      expect(calculateHingeCount(100)).toBeGreaterThanOrEqual(2);
    });

    it('never returns more than 6 hinges', () => {
      expect(calculateHingeCount(3000, 200)).toBeLessThanOrEqual(6);
    });
  });

  // ============================================
  // calculateHingePositions
  // ============================================
  describe('calculateHingePositions', () => {
    it('calculates 2 hinge positions correctly', () => {
      const positions = calculateHingePositions(700, 2);

      expect(positions).toHaveLength(2);
      // Bottom hinge at margin (100mm default)
      expect(positions[0].y).toBe(100);
      // Top hinge at height - margin = 700 - 100 = 600
      expect(positions[1].y).toBe(600);
      // Both have standard edge offset
      expect(positions[0].edgeOffset).toBe(HINGE_CUP_SPECS.EDGE_OFFSET);
      expect(positions[1].edgeOffset).toBe(HINGE_CUP_SPECS.EDGE_OFFSET);
    });

    it('calculates 3 hinge positions with even spacing', () => {
      const positions = calculateHingePositions(800, 3);

      expect(positions).toHaveLength(3);
      // Available height: 800 - 100 - 100 = 600
      // Spacing: 600 / 2 = 300
      expect(positions[0].y).toBe(100);  // Bottom
      expect(positions[1].y).toBe(400);  // Middle
      expect(positions[2].y).toBe(700);  // Top
    });

    it('calculates 4 hinge positions with even spacing', () => {
      const positions = calculateHingePositions(1300, 4);

      expect(positions).toHaveLength(4);
      // Available height: 1300 - 100 - 100 = 1100
      // Spacing: 1100 / 3 ≈ 366.67
      expect(positions[0].y).toBeCloseTo(100, 1);
      expect(positions[1].y).toBeCloseTo(466.67, 1);
      expect(positions[2].y).toBeCloseTo(833.33, 1);
      expect(positions[3].y).toBeCloseTo(1200, 1);
    });

    it('respects custom margins', () => {
      const positions = calculateHingePositions(700, 2, 80, 120);

      expect(positions[0].y).toBe(120);  // Bottom margin
      expect(positions[1].y).toBe(620);  // 700 - 80 = 620
    });

    it('throws error for less than 2 hinges', () => {
      expect(() => calculateHingePositions(700, 1)).toThrow('Minimum 2 hinges required');
      expect(() => calculateHingePositions(700, 0)).toThrow('Minimum 2 hinges required');
    });
  });

  // ============================================
  // estimateDoorWeight
  // ============================================
  describe('estimateDoorWeight', () => {
    it('calculates door weight with default density', () => {
      // 500mm × 700mm × 18mm = 6,300,000 mm³
      // = 0.0063 m³
      // × 650 kg/m³ = 4.095 kg
      const weight = estimateDoorWeight(500, 700, 18);
      expect(weight).toBeCloseTo(4.095, 2);
    });

    it('calculates door weight with custom density', () => {
      // 500mm × 700mm × 18mm = 6,300,000 mm³
      // = 0.0063 m³
      // × 800 kg/m³ (particleboard) = 5.04 kg
      const weight = estimateDoorWeight(500, 700, 18, 800);
      expect(weight).toBeCloseTo(5.04, 2);
    });

    it('handles large doors', () => {
      // 600mm × 2000mm × 19mm = 22,800,000 mm³
      // = 0.0228 m³
      // × 650 kg/m³ = 14.82 kg
      const weight = estimateDoorWeight(600, 2000, 19);
      expect(weight).toBeCloseTo(14.82, 1);
    });

    it('returns 0 for zero dimensions', () => {
      expect(estimateDoorWeight(0, 700, 18)).toBe(0);
      expect(estimateDoorWeight(500, 0, 18)).toBe(0);
      expect(estimateDoorWeight(500, 700, 0)).toBe(0);
    });
  });

  // ============================================
  // validateDoorHingeConfig
  // ============================================
  describe('validateDoorHingeConfig', () => {
    it('returns valid for properly configured door', () => {
      const result = validateDoorHingeConfig(
        500,  // width
        700,  // height
        5,    // weight
        25,   // capacity per hinge
        2     // count
      );

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('warns when weight exceeds capacity', () => {
      const result = validateDoorHingeConfig(
        500, 700,
        60,   // weight exceeds 50kg (2 × 25)
        25,   // capacity
        2     // count
      );

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain(
        'Door weight (60.0kg) exceeds hinge capacity (50kg)'
      );
    });

    it('warns when hinge count is too low for height', () => {
      const result = validateDoorHingeConfig(
        500, 1000, // 1000mm height needs 3 hinges
        5,
        25,
        2  // Only 2 hinges
      );

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain(
        'Recommended 3 hinges for 1000mm height'
      );
    });

    it('warns for wide doors', () => {
      const result = validateDoorHingeConfig(
        700,  // Wide door >600mm
        700,
        5,
        25,
        2
      );

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain(
        'Wide doors may require specialized hinges'
      );
    });

    it('accumulates multiple warnings', () => {
      const result = validateDoorHingeConfig(
        700,   // Wide
        1200,  // Needs 3 hinges
        60,    // Heavy
        25,
        2      // Too few hinges
      );

      expect(result.isValid).toBe(false);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // createDoorPanelId
  // ============================================
  describe('createDoorPanelId', () => {
    it('creates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createDoorPanelId());
      }
      expect(ids.size).toBe(100);
    });

    it('creates IDs with door prefix', () => {
      const id = createDoorPanelId();
      expect(id).toMatch(/^door-/);
    });
  });

  // ============================================
  // Constants
  // ============================================
  describe('constants', () => {
    it('has correct hinge cup specs', () => {
      expect(HINGE_CUP_SPECS.DIAMETER).toBe(35);
      expect(HINGE_CUP_SPECS.DEPTH).toBe(13);
      expect(HINGE_CUP_SPECS.EDGE_OFFSET).toBe(21.5);
    });

    it('has sorted height thresholds', () => {
      for (let i = 1; i < HINGE_COUNT_BY_HEIGHT.length; i++) {
        expect(HINGE_COUNT_BY_HEIGHT[i].maxHeight)
          .toBeGreaterThan(HINGE_COUNT_BY_HEIGHT[i - 1].maxHeight);
      }
    });

    it('has increasing hinge counts', () => {
      for (let i = 1; i < HINGE_COUNT_BY_HEIGHT.length; i++) {
        expect(HINGE_COUNT_BY_HEIGHT[i].count)
          .toBeGreaterThanOrEqual(HINGE_COUNT_BY_HEIGHT[i - 1].count);
      }
    });
  });
});
