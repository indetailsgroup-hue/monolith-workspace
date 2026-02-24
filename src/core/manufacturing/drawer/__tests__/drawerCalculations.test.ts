/**
 * drawerCalculations.test.ts - Unit Tests for Drawer Dimension Calculations
 *
 * @version 1.0.0 - Initial drawer system tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDrawerDimensions,
  getDrawerClearances,
  calculateDrawerStackHeight,
  validateDrawerStackFit,
  createDrawerRowId,
  DRAWER_BOTTOM_GROOVE_DEPTH,
  BACK_HEIGHT_REDUCTION,
  REAR_CLEARANCE,
  DEFAULT_FRONT_OVERLAY,
  DRAWER_REVEAL,
} from '../drawerCalculations';
import { DRAWER_SLIDE } from '../../../types/Production';

// ============================================
// TEST DATA
// ============================================

const defaultBoxMaterials = {
  sideThickness: 12,
  backThickness: 12,
  bottomThickness: 6,
  sideCore: 'core-ply-12',
  bottomCore: 'core-mdf-6',
};

// ============================================
// getDrawerClearances TESTS
// ============================================

describe('getDrawerClearances', () => {
  it('returns correct clearances for undermount slides', () => {
    const clearances = getDrawerClearances('undermount');

    expect(clearances.sideGap).toBe(DRAWER_SLIDE.UNDERMOUNT.SIDE_GAP);
    expect(clearances.totalSideGap).toBe(DRAWER_SLIDE.UNDERMOUNT.SIDE_GAP * 2);
    expect(clearances.slideOffsetY).toBe(DRAWER_SLIDE.UNDERMOUNT.SLIDE_OFFSET_Y);
    expect(clearances.topGap).toBe(3);
    expect(clearances.bottomReveal).toBe(DRAWER_REVEAL);
    expect(clearances.frontOverlay).toBe(DEFAULT_FRONT_OVERLAY);
  });

  it('returns correct clearances for side-mount slides', () => {
    const clearances = getDrawerClearances('side_mount');

    expect(clearances.sideGap).toBe(DRAWER_SLIDE.SIDE_MOUNT.SIDE_GAP);
    expect(clearances.totalSideGap).toBe(DRAWER_SLIDE.SIDE_MOUNT.SIDE_GAP * 2);
    expect(clearances.slideOffsetY).toBe(15); // Different from undermount
  });

  it('undermount has larger side gap than side-mount', () => {
    const undermount = getDrawerClearances('undermount');
    const sideMount = getDrawerClearances('side_mount');

    expect(undermount.sideGap).toBeGreaterThan(sideMount.sideGap);
  });
});

// ============================================
// calculateDrawerDimensions TESTS
// ============================================

describe('calculateDrawerDimensions', () => {
  const baseInput = {
    cabinetInnerWidth: 500,
    cabinetInnerDepth: 550,
    frontHeight: 140,
    slideType: 'undermount' as const,
    boxMaterials: defaultBoxMaterials,
  };

  describe('box width calculation', () => {
    it('calculates box width with undermount clearance', () => {
      const result = calculateDrawerDimensions(baseInput);

      const expectedWidth = 500 - (DRAWER_SLIDE.UNDERMOUNT.SIDE_GAP * 2);
      expect(result.boxWidth).toBe(expectedWidth);
    });

    it('calculates box width with side-mount clearance', () => {
      const result = calculateDrawerDimensions({
        ...baseInput,
        slideType: 'side_mount',
      });

      const expectedWidth = 500 - (DRAWER_SLIDE.SIDE_MOUNT.SIDE_GAP * 2);
      expect(result.boxWidth).toBe(expectedWidth);
    });

    it('side-mount gives wider box than undermount', () => {
      const undermount = calculateDrawerDimensions(baseInput);
      const sideMount = calculateDrawerDimensions({
        ...baseInput,
        slideType: 'side_mount',
      });

      expect(sideMount.boxWidth).toBeGreaterThan(undermount.boxWidth);
    });
  });

  describe('box depth calculation', () => {
    it('calculates box depth with rear clearance', () => {
      // Use short cabinet so rear clearance is the limiting factor, not slide length
      const result = calculateDrawerDimensions({
        ...baseInput,
        cabinetInnerDepth: 400, // 400 - 18 = 382, less than default 500mm slide
      });

      const expectedDepth = 400 - REAR_CLEARANCE;
      expect(result.boxDepth).toBe(expectedDepth);
    });

    it('limits box depth to max slide length', () => {
      const result = calculateDrawerDimensions({
        ...baseInput,
        maxSlideLength: 400,
      });

      expect(result.boxDepth).toBe(400);
    });

    it('uses available depth when less than max slide length', () => {
      const result = calculateDrawerDimensions({
        ...baseInput,
        cabinetInnerDepth: 350,
        maxSlideLength: 500,
      });

      expect(result.boxDepth).toBe(350 - REAR_CLEARANCE);
    });
  });

  describe('side and back height calculation', () => {
    it('calculates side height from front height', () => {
      const result = calculateDrawerDimensions(baseInput);

      // frontHeight (140) - 20mm overlap = 120mm
      expect(result.sideHeight).toBe(120);
    });

    it('enforces minimum side height of 60mm', () => {
      const result = calculateDrawerDimensions({
        ...baseInput,
        frontHeight: 60, // Would give 40mm side height
      });

      expect(result.sideHeight).toBe(60);
    });

    it('calculates back height with reduction for slide mechanism', () => {
      const result = calculateDrawerDimensions(baseInput);

      expect(result.backHeight).toBe(result.sideHeight - BACK_HEIGHT_REDUCTION);
    });
  });

  describe('bottom panel dimensions', () => {
    it('calculates bottom width to fit in grooves', () => {
      const result = calculateDrawerDimensions(baseInput);

      // boxWidth - 2×sideThickness + 2×grooveDepth - 2mm clearance
      const expectedWidth =
        result.boxWidth - (2 * 12) + (2 * DRAWER_BOTTOM_GROOVE_DEPTH) - 2;
      expect(result.bottomWidth).toBe(expectedWidth);
    });

    it('calculates bottom depth to fit in grooves', () => {
      const result = calculateDrawerDimensions(baseInput);

      // boxDepth - sideT + 2×grooveDepth - 2mm clearance
      const expectedDepth =
        result.boxDepth - 12 + (2 * DRAWER_BOTTOM_GROOVE_DEPTH) - 2;
      expect(result.bottomDepth).toBe(expectedDepth);
    });
  });

  describe('front panel dimensions', () => {
    it('calculates front width with default overlay', () => {
      const result = calculateDrawerDimensions(baseInput);

      const expectedWidth = 500 + (2 * DEFAULT_FRONT_OVERLAY);
      expect(result.frontWidth).toBe(expectedWidth);
    });

    it('calculates front width with custom overlay', () => {
      const result = calculateDrawerDimensions({
        ...baseInput,
        frontOverlay: 25,
      });

      const expectedWidth = 500 + (2 * 25);
      expect(result.frontWidth).toBe(expectedWidth);
    });

    it('preserves front height from input', () => {
      const result = calculateDrawerDimensions(baseInput);

      expect(result.frontHeight).toBe(140);
    });
  });

  describe('real-world scenarios', () => {
    it('calculates standard 600mm wide base cabinet drawer', () => {
      const result = calculateDrawerDimensions({
        cabinetInnerWidth: 564, // 600 - 2×18mm sides
        cabinetInnerDepth: 550,
        frontHeight: 140,
        slideType: 'undermount',
        boxMaterials: defaultBoxMaterials,
      });

      // Verify reasonable dimensions
      expect(result.boxWidth).toBeGreaterThan(500);
      expect(result.boxWidth).toBeLessThan(564);
      expect(result.frontWidth).toBeGreaterThan(564);
    });

    it('calculates narrow drawer for 300mm cabinet', () => {
      const result = calculateDrawerDimensions({
        cabinetInnerWidth: 264, // 300 - 2×18mm sides
        cabinetInnerDepth: 550,
        frontHeight: 100,
        slideType: 'side_mount',
        boxMaterials: defaultBoxMaterials,
      });

      expect(result.boxWidth).toBeGreaterThan(200);
      expect(result.boxWidth).toBeLessThan(264);
    });
  });
});

// ============================================
// calculateDrawerStackHeight TESTS
// ============================================

describe('calculateDrawerStackHeight', () => {
  it('returns 0 for empty array', () => {
    const result = calculateDrawerStackHeight([]);
    expect(result).toBe(0);
  });

  it('calculates height for single drawer', () => {
    const result = calculateDrawerStackHeight([
      { frontHeight: 140, gapAbove: 3 },
    ]);
    expect(result).toBe(143);
  });

  it('calculates height for multiple drawers', () => {
    const result = calculateDrawerStackHeight([
      { frontHeight: 100, gapAbove: 3 },
      { frontHeight: 140, gapAbove: 3 },
      { frontHeight: 200, gapAbove: 3 },
    ]);
    expect(result).toBe(100 + 3 + 140 + 3 + 200 + 3);
  });

  it('handles varying gap sizes', () => {
    const result = calculateDrawerStackHeight([
      { frontHeight: 100, gapAbove: 5 },
      { frontHeight: 100, gapAbove: 10 },
    ]);
    expect(result).toBe(100 + 5 + 100 + 10);
  });
});

// ============================================
// validateDrawerStackFit TESTS
// ============================================

describe('validateDrawerStackFit', () => {
  const rows = [
    { frontHeight: 100, gapAbove: 3 },
    { frontHeight: 140, gapAbove: 3 },
    { frontHeight: 200, gapAbove: 3 },
  ];

  it('returns valid when stack fits within cabinet', () => {
    const totalHeight = calculateDrawerStackHeight(rows);
    const result = validateDrawerStackFit(totalHeight + 100, rows);

    expect(result.isValid).toBe(true);
    expect(result.message).toBeUndefined();
    expect(result.totalHeight).toBe(totalHeight);
  });

  it('returns valid when stack exactly equals cabinet height', () => {
    const totalHeight = calculateDrawerStackHeight(rows);
    const result = validateDrawerStackFit(totalHeight, rows);

    expect(result.isValid).toBe(true);
  });

  it('returns invalid when stack exceeds cabinet height', () => {
    const totalHeight = calculateDrawerStackHeight(rows);
    const result = validateDrawerStackFit(totalHeight - 10, rows);

    expect(result.isValid).toBe(false);
    expect(result.message).toContain('exceeds');
    expect(result.totalHeight).toBe(totalHeight);
  });

  it('handles empty rows', () => {
    const result = validateDrawerStackFit(500, []);

    expect(result.isValid).toBe(true);
    expect(result.totalHeight).toBe(0);
  });
});

// ============================================
// createDrawerRowId TESTS
// ============================================

describe('createDrawerRowId', () => {
  it('creates unique IDs', () => {
    const id1 = createDrawerRowId();
    const id2 = createDrawerRowId();

    expect(id1).not.toBe(id2);
  });

  it('creates IDs with drawer prefix', () => {
    const id = createDrawerRowId();
    expect(id.startsWith('drawer-')).toBe(true);
  });

  it('creates IDs with timestamp component', () => {
    const id = createDrawerRowId();
    const parts = id.split('-');

    // Should have format: drawer-<timestamp>-<random>
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('drawer');
    expect(Number(parts[1])).toBeGreaterThan(0);
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('drawer constants', () => {
  it('has valid groove depth', () => {
    expect(DRAWER_BOTTOM_GROOVE_DEPTH).toBeGreaterThan(0);
    expect(DRAWER_BOTTOM_GROOVE_DEPTH).toBeLessThanOrEqual(10);
  });

  it('has valid back height reduction', () => {
    expect(BACK_HEIGHT_REDUCTION).toBeGreaterThan(0);
    expect(BACK_HEIGHT_REDUCTION).toBeLessThan(20);
  });

  it('has valid rear clearance', () => {
    expect(REAR_CLEARANCE).toBeGreaterThan(10);
    expect(REAR_CLEARANCE).toBeLessThan(30);
  });

  it('has valid default overlay', () => {
    expect(DEFAULT_FRONT_OVERLAY).toBeGreaterThan(0);
    expect(DEFAULT_FRONT_OVERLAY).toBeLessThanOrEqual(25);
  });

  it('has valid drawer reveal', () => {
    expect(DRAWER_REVEAL).toBeGreaterThan(0);
    expect(DRAWER_REVEAL).toBeLessThanOrEqual(5);
  });
});
