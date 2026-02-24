/**
 * ManufacturingCalculator Comprehensive Unit Tests
 *
 * Tests for manufacturing calculation logic:
 * - Material thickness calculations (total thickness from composite layers)
 * - Internal depth (anti-collision safe depth for internal parts)
 * - Divider dimensions (vertical partition sizing)
 * - Shelf dimensions (horizontal internal part sizing)
 * - Cut dimensions transformation (finish to cut size with edge/pre-mill)
 * - Panel manufacturing pipeline (combined thickness + cut dims)
 * - Cabinet internal parts calculation (full cabinet with shelves/dividers)
 * - Human-readable formula string generators
 * - Edge cases (zero dimensions, very large values, all zeros)
 *
 * All dimensions in millimeters (mm).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTotalThickness,
  calculateInternalDepth,
  calculateDividerDimensions,
  calculateShelfDimensions,
  calculateCutDimensions,
  calculatePanelManufacturing,
  calculateInternalParts,
  getShelfDepthFormula,
  getCutWidthFormula,
  COMMON_COMPOSITIONS,
  DEFAULT_BACK_CONFIG,
  DEFAULT_EDGE_CONFIG,
  DEFAULT_PREMILL,
  type MaterialComposition,
  type BackPanelConfig,
  type EdgeConfig,
  type PreMillConfig,
  type CabinetParams,
} from '../ManufacturingCalculator';

// ============================================
// 1. MATERIAL PHYSICS - calculateTotalThickness
// ============================================

describe('calculateTotalThickness', () => {
  describe('common compositions', () => {
    it('should calculate PB-MEL: 16 + 0.1 + 0.1 + (2 * 0) = 16.2mm', () => {
      const result = calculateTotalThickness(COMMON_COMPOSITIONS['PB-MEL']);
      expect(result).toBeCloseTo(16.2, 5);
    });

    it('should calculate PB-HPL: 16 + 0.8 + 0.8 + (2 * 0.1) = 17.8mm', () => {
      const result = calculateTotalThickness(COMMON_COMPOSITIONS['PB-HPL']);
      expect(result).toBeCloseTo(17.8, 5);
    });

    it('should calculate MDF-HPL: 18 + 0.8 + 0.8 + (2 * 0.1) = 19.8mm', () => {
      const result = calculateTotalThickness(COMMON_COMPOSITIONS['MDF-HPL']);
      expect(result).toBeCloseTo(19.8, 5);
    });

    it('should calculate HMR-HPL: 18 + 0.8 + 0.8 + (2 * 0.1) = 19.8mm', () => {
      const result = calculateTotalThickness(COMMON_COMPOSITIONS['HMR-HPL']);
      expect(result).toBeCloseTo(19.8, 5);
    });
  });

  describe('bare core (no surfaces)', () => {
    it('should return core thickness only when both surfaces are zero', () => {
      const material: MaterialComposition = {
        coreThickness: 18,
        surfaceAThickness: 0,
        surfaceBThickness: 0,
        glueThickness: 0.1,
      };
      // glueCount = 0 (no surfaces), so no glue added
      // 18 + 0 + 0 + (0 * 0.1) = 18mm
      expect(calculateTotalThickness(material)).toBe(18);
    });

    it('should return core thickness only when glue is also zero', () => {
      const material: MaterialComposition = {
        coreThickness: 16,
        surfaceAThickness: 0,
        surfaceBThickness: 0,
        glueThickness: 0,
      };
      expect(calculateTotalThickness(material)).toBe(16);
    });
  });

  describe('one-sided laminate', () => {
    it('should add glue only for surfaceA when surfaceB is zero', () => {
      const material: MaterialComposition = {
        coreThickness: 16,
        surfaceAThickness: 0.8,
        surfaceBThickness: 0,
        glueThickness: 0.1,
      };
      // glueCount = 1 (only surfaceA)
      // 16 + 0.8 + 0 + (1 * 0.1) = 16.9mm
      expect(calculateTotalThickness(material)).toBeCloseTo(16.9, 5);
    });

    it('should add glue only for surfaceB when surfaceA is zero', () => {
      const material: MaterialComposition = {
        coreThickness: 16,
        surfaceAThickness: 0,
        surfaceBThickness: 0.8,
        glueThickness: 0.1,
      };
      // glueCount = 1 (only surfaceB)
      // 16 + 0 + 0.8 + (1 * 0.1) = 16.9mm
      expect(calculateTotalThickness(material)).toBeCloseTo(16.9, 5);
    });

    it('should handle melamine one-sided (no glue needed)', () => {
      const material: MaterialComposition = {
        coreThickness: 16,
        surfaceAThickness: 0.1,
        surfaceBThickness: 0,
        glueThickness: 0,
      };
      // 16 + 0.1 + 0 + 0 = 16.1mm
      expect(calculateTotalThickness(material)).toBeCloseTo(16.1, 5);
    });
  });

  describe('various core thicknesses', () => {
    it('should handle thin 9mm core with melamine', () => {
      const material: MaterialComposition = {
        coreThickness: 9,
        surfaceAThickness: 0.1,
        surfaceBThickness: 0.1,
        glueThickness: 0,
      };
      // 9 + 0.1 + 0.1 + 0 = 9.2mm
      expect(calculateTotalThickness(material)).toBeCloseTo(9.2, 5);
    });

    it('should handle thick 25mm core with HPL', () => {
      const material: MaterialComposition = {
        coreThickness: 25,
        surfaceAThickness: 0.8,
        surfaceBThickness: 0.8,
        glueThickness: 0.1,
      };
      // 25 + 0.8 + 0.8 + (2 * 0.1) = 26.8mm
      expect(calculateTotalThickness(material)).toBeCloseTo(26.8, 5);
    });

    it('should handle 12mm core with HPL', () => {
      const material: MaterialComposition = {
        coreThickness: 12,
        surfaceAThickness: 0.8,
        surfaceBThickness: 0.8,
        glueThickness: 0.1,
      };
      // 12 + 0.8 + 0.8 + (2 * 0.1) = 13.8mm
      expect(calculateTotalThickness(material)).toBeCloseTo(13.8, 5);
    });
  });

  describe('asymmetric surface thicknesses', () => {
    it('should handle different surface A and B thicknesses', () => {
      const material: MaterialComposition = {
        coreThickness: 18,
        surfaceAThickness: 0.8,
        surfaceBThickness: 0.4,
        glueThickness: 0.1,
      };
      // glueCount = 2 (both surfaces > 0)
      // 18 + 0.8 + 0.4 + (2 * 0.1) = 19.4mm
      expect(calculateTotalThickness(material)).toBeCloseTo(19.4, 5);
    });
  });
});

// ============================================
// 2. ANTI-COLLISION FORMULA - calculateInternalDepth
// ============================================

describe('calculateInternalDepth', () => {
  describe('inset construction', () => {
    it('should calculate: depth - grooveOffset - backThickness - safetyGap', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 2 = 532mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(532);
    });

    it('should handle 9mm back panel thickness', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 9,
        grooveOffset: 20,
      };
      // 560 - 20 - 9 - 2 = 529mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(529);
    });

    it('should handle different groove offsets', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 15,
      };
      // 560 - 15 - 6 - 2 = 537mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(537);
    });

    it('should use default safety gap of 2mm when not specified', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 2(default) = 532mm
      expect(calculateInternalDepth(560, backConfig)).toBe(532);
    });

    it('should handle shallow 300mm cabinet', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 300 - 20 - 6 - 2 = 272mm
      expect(calculateInternalDepth(300, backConfig, 2)).toBe(272);
    });
  });

  describe('overlay construction', () => {
    it('should calculate: depth - backThickness - safetyGap (no grooveOffset)', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      // 560 - 6 - 2 = 552mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(552);
    });

    it('should handle 9mm overlay back panel', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 9,
        grooveOffset: 0,
      };
      // 560 - 9 - 2 = 549mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(549);
    });

    it('should ignore grooveOffset even if set for overlay', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 100,
      };
      // 560 - 6 - 2 = 552mm (grooveOffset ignored)
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(552);
    });

    it('should use default safety gap of 2mm for overlay', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      // 560 - 6 - 2(default) = 552mm
      expect(calculateInternalDepth(560, backConfig)).toBe(552);
    });
  });

  describe('custom safety gap', () => {
    it('should handle zero safety gap', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 0 = 534mm
      expect(calculateInternalDepth(560, backConfig, 0)).toBe(534);
    });

    it('should handle larger safety gap of 5mm', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 5 = 529mm
      expect(calculateInternalDepth(560, backConfig, 5)).toBe(529);
    });

    it('should handle 1mm safety gap for overlay', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      // 560 - 6 - 1 = 553mm
      expect(calculateInternalDepth(560, backConfig, 1)).toBe(553);
    });
  });
});

// ============================================
// 3. DIVIDER DIMENSIONS
// ============================================

describe('calculateDividerDimensions', () => {
  describe('inset joint', () => {
    it('should calculate finishWidth = safeDepth, finishHeight = height - top - bottom', () => {
      const result = calculateDividerDimensions(720, 18, 18, 532, 'inset');
      // finishWidth = safeDepth = 532mm
      // finishHeight = 720 - 18 - 18 = 684mm
      expect(result.finishWidth).toBe(532);
      expect(result.finishHeight).toBe(684);
    });

    it('should handle asymmetric panel thicknesses', () => {
      const result = calculateDividerDimensions(720, 16, 18, 500, 'inset');
      // finishWidth = 500
      // finishHeight = 720 - 16 - 18 = 686mm
      expect(result.finishWidth).toBe(500);
      expect(result.finishHeight).toBe(686);
    });

    it('should default to inset when jointType is omitted', () => {
      const result = calculateDividerDimensions(720, 18, 18, 532);
      expect(result.finishWidth).toBe(532);
      expect(result.finishHeight).toBe(684);
    });

    it('should handle zero panel thicknesses (no top/bottom)', () => {
      const result = calculateDividerDimensions(720, 0, 0, 500, 'inset');
      expect(result.finishWidth).toBe(500);
      expect(result.finishHeight).toBe(720);
    });
  });

  describe('overlay joint', () => {
    it('should calculate same formula as inset (current implementation)', () => {
      const result = calculateDividerDimensions(720, 18, 18, 532, 'overlay');
      // Same as inset in current implementation
      expect(result.finishWidth).toBe(532);
      expect(result.finishHeight).toBe(684);
    });

    it('should produce same result as inset for same inputs', () => {
      const insetResult = calculateDividerDimensions(720, 18, 18, 532, 'inset');
      const overlayResult = calculateDividerDimensions(720, 18, 18, 532, 'overlay');
      expect(insetResult.finishWidth).toBe(overlayResult.finishWidth);
      expect(insetResult.finishHeight).toBe(overlayResult.finishHeight);
    });
  });

  describe('tall cabinets', () => {
    it('should handle wardrobe height of 2400mm', () => {
      const result = calculateDividerDimensions(2400, 18, 18, 572, 'inset');
      expect(result.finishWidth).toBe(572);
      expect(result.finishHeight).toBe(2364); // 2400 - 18 - 18
    });
  });
});

// ============================================
// 4. SHELF DIMENSIONS
// ============================================

describe('calculateShelfDimensions', () => {
  describe('default parameters', () => {
    it('should calculate with standard setback and clearance', () => {
      const result = calculateShelfDimensions(400, 532, 20, 1);
      // finishWidth = 400 - (1 * 2) = 398mm
      // finishHeight = 532 - 20 = 512mm
      expect(result.finishWidth).toBe(398);
      expect(result.finishHeight).toBe(512);
    });

    it('should use default frontSetback=20 and sideClearance=1', () => {
      const result = calculateShelfDimensions(400, 532);
      // finishWidth = 400 - (1 * 2) = 398mm  (default sideClearance=1)
      // finishHeight = 532 - 20 = 512mm       (default frontSetback=20)
      expect(result.finishWidth).toBe(398);
      expect(result.finishHeight).toBe(512);
    });
  });

  describe('custom setback', () => {
    it('should handle zero front setback', () => {
      const result = calculateShelfDimensions(400, 532, 0, 1);
      // finishWidth = 400 - 2 = 398mm
      // finishHeight = 532 - 0 = 532mm
      expect(result.finishWidth).toBe(398);
      expect(result.finishHeight).toBe(532);
    });

    it('should handle larger 30mm front setback', () => {
      const result = calculateShelfDimensions(400, 532, 30, 1);
      // finishHeight = 532 - 30 = 502mm
      expect(result.finishHeight).toBe(502);
    });

    it('should handle small 10mm front setback', () => {
      const result = calculateShelfDimensions(400, 532, 10, 1);
      expect(result.finishHeight).toBe(522);
    });
  });

  describe('custom clearance', () => {
    it('should handle zero side clearance', () => {
      const result = calculateShelfDimensions(400, 532, 20, 0);
      // finishWidth = 400 - (0 * 2) = 400mm
      expect(result.finishWidth).toBe(400);
      expect(result.finishHeight).toBe(512);
    });

    it('should handle 2mm side clearance', () => {
      const result = calculateShelfDimensions(400, 532, 20, 2);
      // finishWidth = 400 - (2 * 2) = 396mm
      expect(result.finishWidth).toBe(396);
    });

    it('should handle 0.5mm side clearance', () => {
      const result = calculateShelfDimensions(400, 532, 20, 0.5);
      // finishWidth = 400 - (0.5 * 2) = 399mm
      expect(result.finishWidth).toBe(399);
    });
  });

  describe('various bay widths', () => {
    it('should handle narrow 200mm bay', () => {
      const result = calculateShelfDimensions(200, 400, 20, 1);
      expect(result.finishWidth).toBe(198);
      expect(result.finishHeight).toBe(380);
    });

    it('should handle wide 600mm bay', () => {
      const result = calculateShelfDimensions(600, 532, 20, 1);
      expect(result.finishWidth).toBe(598);
      expect(result.finishHeight).toBe(512);
    });
  });
});

// ============================================
// 5. CUT DIMENSIONS
// ============================================

describe('calculateCutDimensions', () => {
  describe('no edges', () => {
    it('should return finish dimensions unchanged when all edges are zero', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const result = calculateCutDimensions(400, 500, edges);
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBe(500);
    });

    it('should not add pre-mill when no edges are applied', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // No edges => no pre-mill => no change
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBe(500);
    });
  });

  describe('all edges', () => {
    it('should subtract all edges and add all pre-mills with 1mm edges', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 1 - 1 + 0.5 + 0.5 = 399mm
      // cutHeight = 500 - 1 - 1 + 0.5 + 0.5 = 499mm
      expect(result.cutWidth).toBe(399);
      expect(result.cutHeight).toBe(499);
    });

    it('should handle 2mm edge tape on all sides', () => {
      const edges: EdgeConfig = { top: 2, bottom: 2, left: 2, right: 2 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 2 - 2 + 0.5 + 0.5 = 397mm
      // cutHeight = 500 - 2 - 2 + 0.5 + 0.5 = 497mm
      expect(result.cutWidth).toBe(397);
      expect(result.cutHeight).toBe(497);
    });

    it('should handle 0.5mm thin edge band on all sides', () => {
      const edges: EdgeConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 0.5 - 0.5 + 0.5 + 0.5 = 400mm
      // cutHeight = 500 - 0.5 - 0.5 + 0.5 + 0.5 = 500mm
      expect(result.cutWidth).toBeCloseTo(400, 5);
      expect(result.cutHeight).toBeCloseTo(500, 5);
    });
  });

  describe('partial edges', () => {
    it('should handle top edge only (default config)', () => {
      const edges: EdgeConfig = { top: 1, bottom: 0, left: 0, right: 0 };
      const result = calculateCutDimensions(400, 500, edges);
      // cutWidth  = 400 - 0 - 0 + 0 + 0 = 400mm
      // cutHeight = 500 - 1 - 0 + 0.5 + 0 = 499.5mm
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBeCloseTo(499.5, 5);
    });

    it('should handle left and right edges only', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 1, right: 1 };
      const result = calculateCutDimensions(400, 500, edges);
      // cutWidth  = 400 - 1 - 1 + 0.5 + 0.5 = 399mm
      // cutHeight = 500 - 0 - 0 + 0 + 0 = 500mm
      expect(result.cutWidth).toBe(399);
      expect(result.cutHeight).toBe(500);
    });

    it('should handle asymmetric edges: top=1, bottom=0.5, left=2, right=0', () => {
      const edges: EdgeConfig = { top: 1, bottom: 0.5, left: 2, right: 0 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 2 - 0 + 0.5 + 0 = 398.5mm
      // cutHeight = 500 - 1 - 0.5 + 0.5 + 0.5 = 499.5mm
      expect(result.cutWidth).toBeCloseTo(398.5, 5);
      expect(result.cutHeight).toBeCloseTo(499.5, 5);
    });

    it('should handle only bottom edge', () => {
      const edges: EdgeConfig = { top: 0, bottom: 1, left: 0, right: 0 };
      const result = calculateCutDimensions(400, 500, edges);
      // cutWidth  = 400
      // cutHeight = 500 - 0 - 1 + 0 + 0.5 = 499.5mm
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBeCloseTo(499.5, 5);
    });

    it('should handle only right edge', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 2 };
      const result = calculateCutDimensions(400, 500, edges);
      // cutWidth  = 400 - 0 - 2 + 0 + 0.5 = 398.5mm
      // cutHeight = 500
      expect(result.cutWidth).toBeCloseTo(398.5, 5);
      expect(result.cutHeight).toBe(500);
    });
  });

  describe('no pre-mill (custom zero pre-mill)', () => {
    it('should not add pre-mill when all pre-mill values are zero', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const preMill: PreMillConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 1 - 1 + 0 + 0 = 398mm
      // cutHeight = 500 - 1 - 1 + 0 + 0 = 498mm
      expect(result.cutWidth).toBe(398);
      expect(result.cutHeight).toBe(498);
    });
  });

  describe('custom pre-mill', () => {
    it('should use provided pre-mill values instead of defaults', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const preMill: PreMillConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 1 - 1 + 1 + 1 = 400mm
      // cutHeight = 500 - 1 - 1 + 1 + 1 = 500mm
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBe(500);
    });

    it('should handle asymmetric pre-mill values', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const preMill: PreMillConfig = { top: 0.3, bottom: 0.7, left: 0.4, right: 0.6 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 1 - 1 + 0.4 + 0.6 = 399mm
      // cutHeight = 500 - 1 - 1 + 0.3 + 0.7 = 499mm
      expect(result.cutWidth).toBeCloseTo(399, 5);
      expect(result.cutHeight).toBeCloseTo(499, 5);
    });

    it('should use default pre-mill of 0.5 when preMill parameter is omitted', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculateCutDimensions(400, 500, edges);
      // Uses default { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      // cutWidth  = 400 - 1 - 1 + 0.5 + 0.5 = 399mm
      // cutHeight = 500 - 1 - 1 + 0.5 + 0.5 = 499mm
      expect(result.cutWidth).toBe(399);
      expect(result.cutHeight).toBe(499);
    });
  });

  describe('pre-mill only applies to edges > 0', () => {
    it('should add pre-mill to left but not right when right edge is zero', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 1, right: 0 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400 - 1 - 0 + 0.5 + 0 = 399.5mm
      // cutHeight = 500
      expect(result.cutWidth).toBeCloseTo(399.5, 5);
      expect(result.cutHeight).toBe(500);
    });

    it('should add pre-mill to top but not bottom when bottom edge is zero', () => {
      const edges: EdgeConfig = { top: 2, bottom: 0, left: 0, right: 0 };
      const preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      const result = calculateCutDimensions(400, 500, edges, preMill);
      // cutWidth  = 400
      // cutHeight = 500 - 2 - 0 + 0.5 + 0 = 498.5mm
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBeCloseTo(498.5, 5);
    });
  });
});

// ============================================
// 6. PANEL MANUFACTURING (Full Pipeline)
// ============================================

describe('calculatePanelManufacturing', () => {
  describe('standard panel', () => {
    it('should combine thickness and cut dims for PB-MEL with top edge only', () => {
      const edges: EdgeConfig = { top: 1, bottom: 0, left: 0, right: 0 };
      const result = calculatePanelManufacturing(
        400, 500,
        COMMON_COMPOSITIONS['PB-MEL'],
        edges
      );

      expect(result.finishWidth).toBe(400);
      expect(result.finishHeight).toBe(500);
      expect(result.realThickness).toBeCloseTo(16.2, 5);
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBeCloseTo(499.5, 5);
    });

    it('should correctly pass through finish dimensions', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const result = calculatePanelManufacturing(
        600, 800,
        COMMON_COMPOSITIONS['MDF-HPL'],
        edges
      );

      expect(result.finishWidth).toBe(600);
      expect(result.finishHeight).toBe(800);
      expect(result.cutWidth).toBe(600);
      expect(result.cutHeight).toBe(800);
      expect(result.realThickness).toBeCloseTo(19.8, 5);
    });
  });

  describe('full edges', () => {
    it('should calculate HPL panel with all 1mm edges', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculatePanelManufacturing(
        600, 800,
        COMMON_COMPOSITIONS['PB-HPL'],
        edges
      );

      expect(result.realThickness).toBeCloseTo(17.8, 5);
      expect(result.cutWidth).toBe(599);   // 600 - 1 - 1 + 0.5 + 0.5
      expect(result.cutHeight).toBe(799);  // 800 - 1 - 1 + 0.5 + 0.5
    });

    it('should calculate HMR-HPL panel with all 2mm edges', () => {
      const edges: EdgeConfig = { top: 2, bottom: 2, left: 2, right: 2 };
      const result = calculatePanelManufacturing(
        600, 800,
        COMMON_COMPOSITIONS['HMR-HPL'],
        edges
      );

      expect(result.realThickness).toBeCloseTo(19.8, 5);
      expect(result.cutWidth).toBe(597);   // 600 - 2 - 2 + 0.5 + 0.5
      expect(result.cutHeight).toBe(797);  // 800 - 2 - 2 + 0.5 + 0.5
    });
  });

  describe('custom pre-mill', () => {
    it('should accept custom pre-mill overriding defaults', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const preMill: PreMillConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculatePanelManufacturing(
        400, 500,
        COMMON_COMPOSITIONS['PB-MEL'],
        edges,
        preMill
      );

      // cutWidth  = 400 - 1 - 1 + 1 + 1 = 400mm
      // cutHeight = 500 - 1 - 1 + 1 + 1 = 500mm
      expect(result.cutWidth).toBe(400);
      expect(result.cutHeight).toBe(500);
    });

    it('should use default pre-mill when preMill param is undefined', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculatePanelManufacturing(
        400, 500,
        COMMON_COMPOSITIONS['PB-MEL'],
        edges,
        undefined
      );

      // cutWidth  = 400 - 1 - 1 + 0.5 + 0.5 = 399mm
      // cutHeight = 500 - 1 - 1 + 0.5 + 0.5 = 499mm
      expect(result.cutWidth).toBe(399);
      expect(result.cutHeight).toBe(499);
    });
  });
});

// ============================================
// 7. INTERNAL PARTS CALCULATION
// ============================================

describe('calculateInternalParts', () => {
  const standardParams: CabinetParams = {
    width: 800,
    height: 720,
    depth: 560,
    panelThickness: 18,
    backConfig: DEFAULT_BACK_CONFIG,
    topJoint: 'inset',
    bottomJoint: 'inset',
  };

  describe('cabinet with shelves only', () => {
    it('should produce 2 shelves in a single bay (no dividers)', () => {
      const results = calculateInternalParts(standardParams, 2, 0, DEFAULT_EDGE_CONFIG, 20);

      const shelves = results.filter(r => r.partName.includes('Shelf'));
      const dividers = results.filter(r => r.partName.includes('Divider'));

      expect(shelves.length).toBe(2);
      expect(dividers.length).toBe(0);
    });

    it('should produce 1 shelf for single shelf count', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
      const shelves = results.filter(r => r.partName.includes('Shelf'));
      expect(shelves.length).toBe(1);
    });

    it('should produce 0 parts when shelfCount=0 and dividerCount=0', () => {
      const results = calculateInternalParts(standardParams, 0, 0, DEFAULT_EDGE_CONFIG, 20);
      expect(results.length).toBe(0);
    });

    it('should calculate correct shelf finish dimensions', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
      const shelf = results[0];

      // Safe depth: 560 - 20 - 6 - 2 = 532mm
      // Inner width: 800 - (2 * 18) = 764mm (1 bay, no dividers)
      // Bay width = 764mm
      // Shelf finishWidth = bayWidth - (1 * 2) = 762mm
      // Shelf finishHeight = safeDepth - frontSetback = 532 - 20 = 512mm
      expect(shelf.finishWidth).toBe(762);
      expect(shelf.finishHeight).toBe(512);
    });

    it('should include formula with Front setback', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
      const shelf = results[0];
      expect(shelf.formula).toContain('Front(20)');
    });

    it('should include cut dimensions in each part result', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
      const shelf = results[0];

      // Shelf edges: { top: 1, bottom: 0, left: 0, right: 0 } (front edge only)
      // cutWidth = 762 (no left/right edges)
      // cutHeight = 512 - 1 + 0.5 = 511.5mm (top edge with pre-mill)
      expect(shelf.cutWidth).toBe(762);
      expect(shelf.cutHeight).toBeCloseTo(511.5, 5);
    });
  });

  describe('cabinet with dividers only', () => {
    it('should produce 1 divider and no shelves when shelfCount=0', () => {
      const results = calculateInternalParts(standardParams, 0, 1, DEFAULT_EDGE_CONFIG, 20);

      const dividers = results.filter(r => r.partName.includes('Divider'));
      const shelves = results.filter(r => r.partName.includes('Shelf'));

      expect(dividers.length).toBe(1);
      expect(shelves.length).toBe(0);
    });

    it('should calculate correct divider finish dimensions', () => {
      const results = calculateInternalParts(standardParams, 0, 1, DEFAULT_EDGE_CONFIG, 20);
      const divider = results[0];

      // Safe depth: 532mm
      // Inner height for inset/inset:
      //   innerHeight = 720 - 18(inset top) - 18(inset bottom) = 684
      //   Since topJoint=inset, the divider call uses topThk=0 and bottomThk=0
      //   (because topJoint==='inset' ? 0 : panelThickness)
      //   so divider finishHeight = 684 - 0 - 0 = 684
      // finishWidth = safeDepth = 532
      expect(divider.finishWidth).toBe(532);
      expect(divider.finishHeight).toBe(684);
    });

    it('should produce 2 dividers when dividerCount=2', () => {
      const results = calculateInternalParts(standardParams, 0, 2, DEFAULT_EDGE_CONFIG, 20);
      const dividers = results.filter(r => r.partName.includes('Divider'));
      expect(dividers.length).toBe(2);
    });

    it('should include formula with BackOffset and BackThk', () => {
      const results = calculateInternalParts(standardParams, 0, 1, DEFAULT_EDGE_CONFIG, 20);
      const divider = results[0];
      expect(divider.formula).toContain('BackOffset(20)');
      expect(divider.formula).toContain('BackThk(6)');
      expect(divider.formula).toContain('Gap(2)');
    });
  });

  describe('cabinet with both shelves and dividers', () => {
    it('should produce 1 divider + 4 shelves (2 shelves * 2 bays)', () => {
      const results = calculateInternalParts(standardParams, 2, 1, DEFAULT_EDGE_CONFIG, 20);

      const dividers = results.filter(r => r.partName.includes('Divider'));
      const shelves = results.filter(r => r.partName.includes('Shelf'));

      expect(dividers.length).toBe(1);
      expect(shelves.length).toBe(4); // 2 shelves per bay, 2 bays
    });

    it('should produce 2 dividers + 6 shelves (2 shelves * 3 bays)', () => {
      const results = calculateInternalParts(standardParams, 2, 2, DEFAULT_EDGE_CONFIG, 20);

      const dividers = results.filter(r => r.partName.includes('Divider'));
      const shelves = results.filter(r => r.partName.includes('Shelf'));

      expect(dividers.length).toBe(2);
      expect(shelves.length).toBe(6); // 2 shelves per bay, 3 bays
    });

    it('should correctly divide bay width among bays', () => {
      const results = calculateInternalParts(standardParams, 1, 1, DEFAULT_EDGE_CONFIG, 20);
      const shelves = results.filter(r => r.partName.includes('Shelf'));

      // innerWidth = 800 - (2 * 18) = 764mm
      // bayCount = 1 + 1 = 2
      // dividerThicknessTotal = 1 * 18 = 18mm
      // bayWidth = (764 - 18) / 2 = 373mm
      // shelfFinishWidth = 373 - (1 * 2) = 371mm
      expect(shelves[0].finishWidth).toBe(371);
      expect(shelves[1].finishWidth).toBe(371);
    });

    it('should name parts sequentially', () => {
      const results = calculateInternalParts(standardParams, 2, 1, DEFAULT_EDGE_CONFIG, 20);

      expect(results[0].partName).toBe('Divider 1');
      expect(results[1].partName).toContain('Shelf 1');
      expect(results[1].partName).toContain('Bay 1');
    });
  });

  describe('overlay joints', () => {
    it('should handle overlay top and bottom joints', () => {
      const overlayParams: CabinetParams = {
        ...standardParams,
        topJoint: 'overlay',
        bottomJoint: 'overlay',
      };

      const results = calculateInternalParts(overlayParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
      expect(results.length).toBe(1);

      // innerHeight = 720 - 0(overlay top) - 0(overlay bottom) = 720
      // For dividers: since topJoint=overlay, topThk = panelThickness = 18
      // But for shelves this doesn't change the calc
      const shelf = results[0];
      expect(shelf.finishHeight).toBe(512); // safeDepth(532) - frontSetback(20)
    });

    it('should calculate overlay divider height with panel thicknesses subtracted', () => {
      const overlayParams: CabinetParams = {
        ...standardParams,
        topJoint: 'overlay',
        bottomJoint: 'overlay',
      };

      const results = calculateInternalParts(overlayParams, 0, 1, DEFAULT_EDGE_CONFIG, 20);
      const divider = results[0];

      // innerHeight = 720 - 0(overlay) - 0(overlay) = 720
      // Divider dims: topJoint=overlay => topThk=panelThickness=18, bottomThk=18
      // finishHeight = 720 - 18 - 18 = 684
      expect(divider.finishHeight).toBe(684);
    });

    it('should handle mixed joints (inset top, overlay bottom)', () => {
      const mixedParams: CabinetParams = {
        ...standardParams,
        topJoint: 'inset',
        bottomJoint: 'overlay',
      };

      const results = calculateInternalParts(mixedParams, 0, 1, DEFAULT_EDGE_CONFIG, 20);
      const divider = results[0];

      // innerHeight = 720 - 18(inset top) - 0(overlay bottom) = 702
      // topJoint=inset => topThk=0, bottomJoint=overlay => bottomThk=18
      // finishHeight = 702 - 0 - 18 = 684
      expect(divider.finishHeight).toBe(684);
    });
  });

  describe('custom front setback', () => {
    it('should use default frontSetback=20 when not specified', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG);
      const shelf = results[0];
      // safeDepth = 532, finishHeight = 532 - 20 = 512
      expect(shelf.finishHeight).toBe(512);
    });

    it('should respect custom frontSetback=30', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 30);
      const shelf = results[0];
      // safeDepth = 532, finishHeight = 532 - 30 = 502
      expect(shelf.finishHeight).toBe(502);
    });

    it('should handle frontSetback=0', () => {
      const results = calculateInternalParts(standardParams, 1, 0, DEFAULT_EDGE_CONFIG, 0);
      const shelf = results[0];
      // safeDepth = 532, finishHeight = 532 - 0 = 532
      expect(shelf.finishHeight).toBe(532);
    });
  });
});

// ============================================
// 8. FORMULA STRING GENERATORS - getShelfDepthFormula
// ============================================

describe('getShelfDepthFormula', () => {
  describe('inset construction', () => {
    it('should include BackOffset in the formula', () => {
      const formula = getShelfDepthFormula(560, DEFAULT_BACK_CONFIG, 20, 2);
      expect(formula).toContain('D(560)');
      expect(formula).toContain('BackOffset(20)');
      expect(formula).toContain('BackThk(6)');
      expect(formula).toContain('Safety(2)');
      expect(formula).toContain('Front(20)');
    });

    it('should produce exact expected string for standard values', () => {
      const formula = getShelfDepthFormula(560, DEFAULT_BACK_CONFIG, 20, 2);
      expect(formula).toBe('D(560) - BackOffset(20) - BackThk(6) - Safety(2) - Front(20)');
    });

    it('should reflect custom depth and setback', () => {
      const config: BackPanelConfig = { construction: 'inset', thickness: 9, grooveOffset: 15 };
      const formula = getShelfDepthFormula(600, config, 25, 3);
      expect(formula).toBe('D(600) - BackOffset(15) - BackThk(9) - Safety(3) - Front(25)');
    });

    it('should use default safetyGap=2 when omitted', () => {
      const formula = getShelfDepthFormula(560, DEFAULT_BACK_CONFIG, 20);
      expect(formula).toContain('Safety(2)');
    });
  });

  describe('overlay construction', () => {
    it('should NOT include BackOffset in the formula', () => {
      const overlayConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      const formula = getShelfDepthFormula(560, overlayConfig, 20, 2);
      expect(formula).not.toContain('BackOffset');
      expect(formula).toContain('D(560)');
      expect(formula).toContain('BackThk(6)');
      expect(formula).toContain('Safety(2)');
      expect(formula).toContain('Front(20)');
    });

    it('should produce exact expected string for overlay', () => {
      const overlayConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      const formula = getShelfDepthFormula(560, overlayConfig, 20, 2);
      expect(formula).toBe('D(560) - BackThk(6) - Safety(2) - Front(20)');
    });

    it('should handle 9mm overlay back', () => {
      const overlayConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 9,
        grooveOffset: 0,
      };
      const formula = getShelfDepthFormula(560, overlayConfig, 20, 2);
      expect(formula).toBe('D(560) - BackThk(9) - Safety(2) - Front(20)');
    });
  });
});

// ============================================
// 9. FORMULA STRING GENERATORS - getCutWidthFormula
// ============================================

describe('getCutWidthFormula', () => {
  describe('with edges', () => {
    it('should include left edge and mill in formula', () => {
      const formula = getCutWidthFormula(400, 1, 0, 0.5);
      expect(formula).toContain('Finish(400)');
      expect(formula).toContain('EdgeL(1)');
      expect(formula).toContain('Mill(0.5)');
      expect(formula).not.toContain('EdgeR');
    });

    it('should include right edge and mill in formula', () => {
      const formula = getCutWidthFormula(400, 0, 1, 0.5);
      expect(formula).toContain('Finish(400)');
      expect(formula).not.toContain('EdgeL');
      expect(formula).toContain('EdgeR(1)');
      expect(formula).toContain('Mill(0.5)');
    });

    it('should include both edges and mills in formula', () => {
      const formula = getCutWidthFormula(400, 1, 1, 0.5);
      expect(formula).toContain('Finish(400)');
      expect(formula).toContain('EdgeL(1)');
      expect(formula).toContain('EdgeR(1)');
      // Should have two Mill entries
      const millCount = (formula.match(/Mill\(0\.5\)/g) || []).length;
      expect(millCount).toBe(2);
    });

    it('should handle 2mm edges', () => {
      const formula = getCutWidthFormula(600, 2, 2, 0.5);
      expect(formula).toContain('Finish(600)');
      expect(formula).toContain('EdgeL(2)');
      expect(formula).toContain('EdgeR(2)');
    });

    it('should use default preMill=0.5 when omitted', () => {
      const formula = getCutWidthFormula(400, 1, 1);
      expect(formula).toContain('Mill(0.5)');
    });

    it('should handle custom preMill value', () => {
      const formula = getCutWidthFormula(400, 1, 1, 0.8);
      expect(formula).toContain('Mill(0.8)');
    });
  });

  describe('without edges', () => {
    it('should return only Finish when both edges are zero', () => {
      const formula = getCutWidthFormula(400, 0, 0, 0.5);
      expect(formula).toBe('Finish(400)');
    });

    it('should not include any edge or mill terms', () => {
      const formula = getCutWidthFormula(500, 0, 0);
      expect(formula).toBe('Finish(500)');
      expect(formula).not.toContain('Edge');
      expect(formula).not.toContain('Mill');
    });
  });
});

// ============================================
// 10. DEFAULT CONSTANTS
// ============================================

describe('default constants', () => {
  it('should have correct DEFAULT_BACK_CONFIG', () => {
    expect(DEFAULT_BACK_CONFIG.construction).toBe('inset');
    expect(DEFAULT_BACK_CONFIG.thickness).toBe(6);
    expect(DEFAULT_BACK_CONFIG.grooveOffset).toBe(20);
  });

  it('should have correct DEFAULT_EDGE_CONFIG', () => {
    expect(DEFAULT_EDGE_CONFIG.top).toBe(1);
    expect(DEFAULT_EDGE_CONFIG.bottom).toBe(0);
    expect(DEFAULT_EDGE_CONFIG.left).toBe(0);
    expect(DEFAULT_EDGE_CONFIG.right).toBe(0);
  });

  it('should have correct DEFAULT_PREMILL', () => {
    expect(DEFAULT_PREMILL.top).toBe(0.5);
    expect(DEFAULT_PREMILL.bottom).toBe(0.5);
    expect(DEFAULT_PREMILL.left).toBe(0.5);
    expect(DEFAULT_PREMILL.right).toBe(0.5);
  });

  it('should have all four COMMON_COMPOSITIONS defined', () => {
    expect(COMMON_COMPOSITIONS['PB-MEL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['PB-HPL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['MDF-HPL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['HMR-HPL']).toBeDefined();
  });

  it('should have correct PB-MEL composition values', () => {
    const mel = COMMON_COMPOSITIONS['PB-MEL'];
    expect(mel.coreThickness).toBe(16);
    expect(mel.surfaceAThickness).toBe(0.1);
    expect(mel.surfaceBThickness).toBe(0.1);
    expect(mel.glueThickness).toBe(0);
  });

  it('should have correct PB-HPL composition values', () => {
    const hpl = COMMON_COMPOSITIONS['PB-HPL'];
    expect(hpl.coreThickness).toBe(16);
    expect(hpl.surfaceAThickness).toBe(0.8);
    expect(hpl.surfaceBThickness).toBe(0.8);
    expect(hpl.glueThickness).toBe(0.1);
  });
});

// ============================================
// 11. EDGE CASES
// ============================================

describe('edge cases', () => {
  describe('zero dimensions', () => {
    it('calculateTotalThickness should return 0 for all-zero material', () => {
      const material: MaterialComposition = {
        coreThickness: 0,
        surfaceAThickness: 0,
        surfaceBThickness: 0,
        glueThickness: 0,
      };
      expect(calculateTotalThickness(material)).toBe(0);
    });

    it('calculateInternalDepth should return negative for zero cabinet depth (inset)', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 0 - 20 - 6 - 2 = -28mm
      expect(calculateInternalDepth(0, backConfig, 2)).toBe(-28);
    });

    it('calculateInternalDepth should return negative for zero cabinet depth (overlay)', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0,
      };
      // 0 - 6 - 2 = -8mm
      expect(calculateInternalDepth(0, backConfig, 2)).toBe(-8);
    });

    it('calculateDividerDimensions should handle zero height', () => {
      const result = calculateDividerDimensions(0, 18, 18, 500, 'inset');
      expect(result.finishWidth).toBe(500);
      expect(result.finishHeight).toBe(-36); // 0 - 18 - 18
    });

    it('calculateShelfDimensions should handle zero bay width', () => {
      const result = calculateShelfDimensions(0, 500, 20, 1);
      expect(result.finishWidth).toBe(-2); // 0 - (1 * 2)
      expect(result.finishHeight).toBe(480);
    });

    it('calculateCutDimensions should handle zero finish dimensions', () => {
      const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
      const result = calculateCutDimensions(0, 0, edges);
      // cutWidth  = 0 - 1 - 1 + 0.5 + 0.5 = -1mm
      // cutHeight = 0 - 1 - 1 + 0.5 + 0.5 = -1mm
      expect(result.cutWidth).toBe(-1);
      expect(result.cutHeight).toBe(-1);
    });
  });

  describe('very large values', () => {
    it('calculateTotalThickness should handle large core thickness', () => {
      const material: MaterialComposition = {
        coreThickness: 50,
        surfaceAThickness: 2,
        surfaceBThickness: 2,
        glueThickness: 0.5,
      };
      // 50 + 2 + 2 + (2 * 0.5) = 55mm
      expect(calculateTotalThickness(material)).toBeCloseTo(55, 5);
    });

    it('calculateInternalDepth should handle very deep cabinet', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 1200 - 20 - 6 - 2 = 1172mm
      expect(calculateInternalDepth(1200, backConfig, 2)).toBe(1172);
    });

    it('calculateShelfDimensions should handle very wide bay', () => {
      const result = calculateShelfDimensions(2000, 1000, 20, 1);
      expect(result.finishWidth).toBe(1998);
      expect(result.finishHeight).toBe(980);
    });

    it('calculateCutDimensions should handle large finish dimensions', () => {
      const edges: EdgeConfig = { top: 2, bottom: 2, left: 2, right: 2 };
      const result = calculateCutDimensions(2440, 1220, edges);
      // cutWidth  = 2440 - 2 - 2 + 0.5 + 0.5 = 2437mm
      // cutHeight = 1220 - 2 - 2 + 0.5 + 0.5 = 1217mm
      expect(result.cutWidth).toBe(2437);
      expect(result.cutHeight).toBe(1217);
    });

    it('calculateInternalParts should handle large wardrobe with many dividers', () => {
      const params: CabinetParams = {
        width: 2400,
        height: 2400,
        depth: 600,
        panelThickness: 18,
        backConfig: DEFAULT_BACK_CONFIG,
        topJoint: 'overlay',
        bottomJoint: 'overlay',
      };

      const results = calculateInternalParts(params, 3, 3, DEFAULT_EDGE_CONFIG, 20);

      // 3 dividers + (3 shelves * 4 bays) = 15 parts
      const dividers = results.filter(r => r.partName.includes('Divider'));
      const shelves = results.filter(r => r.partName.includes('Shelf'));
      expect(dividers.length).toBe(3);
      expect(shelves.length).toBe(12); // 3 shelves * 4 bays
      expect(results.length).toBe(15);
    });
  });

  describe('all zeros edge config', () => {
    it('calculateCutDimensions should return finish dims unchanged', () => {
      const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const preMill: PreMillConfig = { top: 0, bottom: 0, left: 0, right: 0 };
      const result = calculateCutDimensions(500, 300, edges, preMill);
      expect(result.cutWidth).toBe(500);
      expect(result.cutHeight).toBe(300);
    });
  });

  describe('floating point precision', () => {
    it('calculateTotalThickness should handle small floating point sums', () => {
      const material: MaterialComposition = {
        coreThickness: 16,
        surfaceAThickness: 0.1,
        surfaceBThickness: 0.1,
        glueThickness: 0,
      };
      // Floating point: 16 + 0.1 + 0.1 might not be exactly 16.2
      expect(calculateTotalThickness(material)).toBeCloseTo(16.2, 10);
    });

    it('calculateCutDimensions should handle sub-millimeter precision', () => {
      const edges: EdgeConfig = { top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 };
      const preMill: PreMillConfig = { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 };
      const result = calculateCutDimensions(100, 100, edges, preMill);
      // cutWidth  = 100 - 0.3 - 0.3 + 0.2 + 0.2 = 99.8mm
      // cutHeight = 100 - 0.3 - 0.3 + 0.2 + 0.2 = 99.8mm
      expect(result.cutWidth).toBeCloseTo(99.8, 5);
      expect(result.cutHeight).toBeCloseTo(99.8, 5);
    });
  });
});

// ============================================
// 12. REAL-WORLD SCENARIOS
// ============================================

describe('real-world scenarios', () => {
  it('should calculate standard kitchen base cabinet (600x720x560)', () => {
    const params: CabinetParams = {
      width: 600,
      height: 720,
      depth: 560,
      panelThickness: 18,
      backConfig: { construction: 'inset', thickness: 6, grooveOffset: 20 },
      topJoint: 'inset',
      bottomJoint: 'inset',
    };

    // Verify safe depth
    const safeDepth = calculateInternalDepth(560, params.backConfig, 2);
    expect(safeDepth).toBe(532);

    // Single shelf
    const results = calculateInternalParts(params, 1, 0, DEFAULT_EDGE_CONFIG, 20);
    expect(results.length).toBe(1);

    const shelf = results[0];
    // innerWidth = 600 - 36 = 564
    // bayWidth = 564
    // finishWidth = 564 - 2 = 562
    // finishHeight = 532 - 20 = 512
    expect(shelf.finishWidth).toBe(562);
    expect(shelf.finishHeight).toBe(512);
  });

  it('should calculate wardrobe with multiple compartments (1200x2400x600)', () => {
    const params: CabinetParams = {
      width: 1200,
      height: 2400,
      depth: 600,
      panelThickness: 18,
      backConfig: DEFAULT_BACK_CONFIG,
      topJoint: 'overlay',
      bottomJoint: 'overlay',
    };

    const results = calculateInternalParts(params, 2, 2, DEFAULT_EDGE_CONFIG, 20);

    // 2 dividers + (2 shelves * 3 bays) = 8 parts
    expect(results.filter(r => r.partName.includes('Divider')).length).toBe(2);
    expect(results.filter(r => r.partName.includes('Shelf')).length).toBe(6);
    expect(results.length).toBe(8);
  });

  it('should calculate complete panel for PB-HPL side panel', () => {
    const edges: EdgeConfig = { top: 0, bottom: 0, left: 1, right: 0 };
    const result = calculatePanelManufacturing(
      560, 720,
      COMMON_COMPOSITIONS['PB-HPL'],
      edges
    );

    expect(result.realThickness).toBeCloseTo(17.8, 5);
    expect(result.finishWidth).toBe(560);
    expect(result.finishHeight).toBe(720);
    // cutWidth = 560 - 1 - 0 + 0.5 + 0 = 559.5mm
    expect(result.cutWidth).toBeCloseTo(559.5, 5);
    // cutHeight = 720 (no top/bottom edges)
    expect(result.cutHeight).toBe(720);
  });

  it('should produce a coherent end-to-end cabinet calculation', () => {
    // Full pipeline: thickness -> safe depth -> shelf dims -> cut dims
    const material = COMMON_COMPOSITIONS['PB-HPL'];
    const thickness = calculateTotalThickness(material);
    expect(thickness).toBeCloseTo(17.8, 5);

    const backConfig = DEFAULT_BACK_CONFIG;
    const safeDepth = calculateInternalDepth(560, backConfig, 2);
    expect(safeDepth).toBe(532);

    const shelf = calculateShelfDimensions(764, safeDepth, 20, 1);
    expect(shelf.finishWidth).toBe(762);
    expect(shelf.finishHeight).toBe(512);

    const edges: EdgeConfig = { top: 1, bottom: 0, left: 0, right: 0 };
    const cut = calculateCutDimensions(shelf.finishWidth, shelf.finishHeight, edges);
    expect(cut.cutWidth).toBe(762);
    expect(cut.cutHeight).toBeCloseTo(511.5, 5);

    // Verify formula generation
    const depthFormula = getShelfDepthFormula(560, backConfig, 20, 2);
    expect(depthFormula).toBe('D(560) - BackOffset(20) - BackThk(6) - Safety(2) - Front(20)');

    const widthFormula = getCutWidthFormula(762, 0, 0, 0.5);
    expect(widthFormula).toBe('Finish(762)');
  });
});
