/**
 * ManufacturingCalculator Unit Tests
 *
 * Tests for manufacturing calculation logic:
 * - Material thickness calculations
 * - Internal depth (anti-collision)
 * - Cut dimensions transformation
 * - Cabinet internal parts calculation
 *
 * @version 1.0.0 - AGENT-T019
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
  type CabinetParams,
} from '../ManufacturingCalculator';

// ============================================
// 1. MATERIAL PHYSICS - Total Thickness
// ============================================

describe('calculateTotalThickness', () => {
  it('should calculate PB-MEL thickness correctly (no glue)', () => {
    const result = calculateTotalThickness(COMMON_COMPOSITIONS['PB-MEL']);
    // 16 + 0.1 + 0.1 + 0 = 16.2mm
    expect(result).toBeCloseTo(16.2, 5);
  });

  it('should calculate PB-HPL thickness correctly (with glue)', () => {
    const result = calculateTotalThickness(COMMON_COMPOSITIONS['PB-HPL']);
    // 16 + 0.8 + 0.8 + (2 × 0.1) = 17.8mm
    expect(result).toBeCloseTo(17.8, 5);
  });

  it('should calculate MDF-HPL thickness correctly', () => {
    const result = calculateTotalThickness(COMMON_COMPOSITIONS['MDF-HPL']);
    // 18 + 0.8 + 0.8 + (2 × 0.1) = 19.8mm
    expect(result).toBeCloseTo(19.8, 5);
  });

  it('should calculate HMR-HPL thickness correctly', () => {
    const result = calculateTotalThickness(COMMON_COMPOSITIONS['HMR-HPL']);
    // 18 + 0.8 + 0.8 + (2 × 0.1) = 19.8mm
    expect(result).toBeCloseTo(19.8, 5);
  });

  it('should handle single-sided laminate (one surface)', () => {
    const material: MaterialComposition = {
      coreThickness: 16,
      surfaceAThickness: 0.8,
      surfaceBThickness: 0,
      glueThickness: 0.1,
    };
    // 16 + 0.8 + 0 + (1 × 0.1) = 16.9mm
    expect(calculateTotalThickness(material)).toBeCloseTo(16.9, 5);
  });

  it('should handle bare core (no surface)', () => {
    const material: MaterialComposition = {
      coreThickness: 18,
      surfaceAThickness: 0,
      surfaceBThickness: 0,
      glueThickness: 0.1,
    };
    // 18 + 0 + 0 + 0 = 18mm (no glue needed)
    expect(calculateTotalThickness(material)).toBe(18);
  });

  it('should handle different core thicknesses', () => {
    const thin: MaterialComposition = {
      coreThickness: 9,
      surfaceAThickness: 0.1,
      surfaceBThickness: 0.1,
      glueThickness: 0,
    };
    expect(calculateTotalThickness(thin)).toBeCloseTo(9.2, 5);

    const thick: MaterialComposition = {
      coreThickness: 25,
      surfaceAThickness: 0.8,
      surfaceBThickness: 0.8,
      glueThickness: 0.1,
    };
    expect(calculateTotalThickness(thick)).toBeCloseTo(26.8, 5);
  });
});

// ============================================
// 2. ANTI-COLLISION FORMULA - Safe Depth
// ============================================

describe('calculateInternalDepth', () => {
  describe('inset construction', () => {
    it('should calculate depth for standard inset back', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 2 = 532mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(532);
    });

    it('should calculate depth with 9mm back panel', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 9,
        grooveOffset: 20,
      };
      // 560 - 20 - 9 - 2 = 529mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(529);
    });

    it('should calculate depth with different groove offset', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 15,
      };
      // 560 - 15 - 6 - 2 = 537mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(537);
    });

    it('should use default safety gap of 2mm', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // Without explicit safety gap, should use 2mm default
      expect(calculateInternalDepth(560, backConfig)).toBe(532);
    });
  });

  describe('overlay construction', () => {
    it('should calculate depth for overlay back', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 0, // Not used for overlay
      };
      // 560 - 6 - 2 = 552mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(552);
    });

    it('should calculate depth with 9mm overlay back', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 9,
        grooveOffset: 0,
      };
      // 560 - 9 - 2 = 549mm
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(549);
    });

    it('should ignore grooveOffset for overlay', () => {
      const backConfig: BackPanelConfig = {
        construction: 'overlay',
        thickness: 6,
        grooveOffset: 100, // Should be ignored
      };
      // 560 - 6 - 2 = 552mm (grooveOffset ignored)
      expect(calculateInternalDepth(560, backConfig, 2)).toBe(552);
    });
  });

  describe('edge cases', () => {
    it('should handle shallow cabinet depth', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 300 - 20 - 6 - 2 = 272mm
      expect(calculateInternalDepth(300, backConfig, 2)).toBe(272);
    });

    it('should handle zero safety gap', () => {
      const backConfig: BackPanelConfig = {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      };
      // 560 - 20 - 6 - 0 = 534mm
      expect(calculateInternalDepth(560, backConfig, 0)).toBe(534);
    });
  });
});

// ============================================
// 3. DIVIDER DIMENSIONS
// ============================================

describe('calculateDividerDimensions', () => {
  it('should calculate inset divider dimensions', () => {
    const result = calculateDividerDimensions(
      720,  // cabinet inner height
      18,   // top panel thickness
      18,   // bottom panel thickness
      532,  // safe depth
      'inset'
    );
    // finishWidth = safeDepth = 532mm
    // finishHeight = 720 - 18 - 18 = 684mm
    expect(result.finishWidth).toBe(532);
    expect(result.finishHeight).toBe(684);
  });

  it('should calculate overlay divider dimensions', () => {
    const result = calculateDividerDimensions(
      720,
      18,
      18,
      532,
      'overlay'
    );
    // Same calculation for overlay in current implementation
    expect(result.finishWidth).toBe(532);
    expect(result.finishHeight).toBe(684);
  });

  it('should handle different panel thicknesses', () => {
    const result = calculateDividerDimensions(
      720,
      16,   // thinner top
      18,   // thicker bottom
      500,
      'inset'
    );
    expect(result.finishHeight).toBe(686); // 720 - 16 - 18
  });
});

// ============================================
// 4. SHELF DIMENSIONS
// ============================================

describe('calculateShelfDimensions', () => {
  it('should calculate shelf with default setbacks', () => {
    const result = calculateShelfDimensions(
      400,  // bay width
      532,  // safe depth
      20,   // front setback (หลบหน้าบาน)
      1     // side clearance
    );
    // finishWidth = 400 - (1 × 2) = 398mm
    // finishHeight = 532 - 20 = 512mm
    expect(result.finishWidth).toBe(398);
    expect(result.finishHeight).toBe(512);
  });

  it('should handle zero front setback', () => {
    const result = calculateShelfDimensions(400, 532, 0, 1);
    expect(result.finishHeight).toBe(532);
  });

  it('should handle larger side clearance', () => {
    const result = calculateShelfDimensions(400, 532, 20, 2);
    // 400 - (2 × 2) = 396mm
    expect(result.finishWidth).toBe(396);
  });

  it('should handle narrow bay', () => {
    const result = calculateShelfDimensions(200, 400, 20, 1);
    expect(result.finishWidth).toBe(198);
    expect(result.finishHeight).toBe(380);
  });
});

// ============================================
// 5. CUT DIMENSIONS
// ============================================

describe('calculateCutDimensions', () => {
  it('should calculate cut size with default pre-mill', () => {
    const edges: EdgeConfig = { top: 1, bottom: 0, left: 0, right: 0 };
    const result = calculateCutDimensions(400, 500, edges);
    // cutWidth = 400 - 0 - 0 + 0 + 0 = 400mm (no left/right edges)
    // cutHeight = 500 - 1 - 0 + 0.5 + 0 = 499.5mm
    expect(result.cutWidth).toBe(400);
    expect(result.cutHeight).toBe(499.5);
  });

  it('should calculate cut size with all edges', () => {
    const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
    const preMill = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
    const result = calculateCutDimensions(400, 500, edges, preMill);
    // cutWidth = 400 - 1 - 1 + 0.5 + 0.5 = 399mm
    // cutHeight = 500 - 1 - 1 + 0.5 + 0.5 = 499mm
    expect(result.cutWidth).toBe(399);
    expect(result.cutHeight).toBe(499);
  });

  it('should NOT add pre-mill for edges with zero thickness', () => {
    const edges: EdgeConfig = { top: 0, bottom: 0, left: 0, right: 0 };
    const result = calculateCutDimensions(400, 500, edges);
    // No edges = no pre-mill added
    expect(result.cutWidth).toBe(400);
    expect(result.cutHeight).toBe(500);
  });

  it('should handle 2mm edge tape', () => {
    const edges: EdgeConfig = { top: 2, bottom: 2, left: 2, right: 2 };
    const preMill = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
    const result = calculateCutDimensions(400, 500, edges, preMill);
    // cutWidth = 400 - 2 - 2 + 0.5 + 0.5 = 397mm
    // cutHeight = 500 - 2 - 2 + 0.5 + 0.5 = 497mm
    expect(result.cutWidth).toBe(397);
    expect(result.cutHeight).toBe(497);
  });

  it('should handle asymmetric edges', () => {
    const edges: EdgeConfig = { top: 1, bottom: 0.5, left: 2, right: 0 };
    const preMill = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
    const result = calculateCutDimensions(400, 500, edges, preMill);
    // cutWidth = 400 - 2 - 0 + 0.5 + 0 = 398.5mm
    // cutHeight = 500 - 1 - 0.5 + 0.5 + 0.5 = 499.5mm
    expect(result.cutWidth).toBe(398.5);
    expect(result.cutHeight).toBe(499.5);
  });
});

// ============================================
// 6. PANEL MANUFACTURING (Full Pipeline)
// ============================================

describe('calculatePanelManufacturing', () => {
  it('should calculate complete panel dimensions', () => {
    const edges: EdgeConfig = { top: 1, bottom: 0, left: 0, right: 0 };
    const result = calculatePanelManufacturing(
      400,
      500,
      COMMON_COMPOSITIONS['PB-MEL'],
      edges
    );

    expect(result.finishWidth).toBe(400);
    expect(result.finishHeight).toBe(500);
    expect(result.realThickness).toBeCloseTo(16.2, 5);
    expect(result.cutWidth).toBe(400);
    expect(result.cutHeight).toBeCloseTo(499.5, 5);
  });

  it('should calculate HPL panel with all edges', () => {
    const edges: EdgeConfig = { top: 1, bottom: 1, left: 1, right: 1 };
    const result = calculatePanelManufacturing(
      600,
      800,
      COMMON_COMPOSITIONS['PB-HPL'],
      edges
    );

    expect(result.realThickness).toBeCloseTo(17.8, 5);
    expect(result.cutWidth).toBe(599); // 600 - 1 - 1 + 0.5 + 0.5
    expect(result.cutHeight).toBe(799); // 800 - 1 - 1 + 0.5 + 0.5
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

  it('should calculate shelves without dividers', () => {
    const results = calculateInternalParts(
      standardParams,
      2, // 2 shelves
      0, // no dividers
      DEFAULT_EDGE_CONFIG,
      20 // front setback
    );

    // Should have 2 shelves
    const shelves = results.filter(r => r.partName.includes('Shelf'));
    expect(shelves.length).toBe(2);

    // Check shelf dimensions
    const shelf = shelves[0];
    expect(shelf.partName).toContain('Shelf');
    expect(shelf.formula).toContain('Front(20)');
  });

  it('should calculate dividers and shelves', () => {
    const results = calculateInternalParts(
      standardParams,
      2, // 2 shelves per bay
      1, // 1 divider (2 bays)
      DEFAULT_EDGE_CONFIG,
      20
    );

    const dividers = results.filter(r => r.partName.includes('Divider'));
    const shelves = results.filter(r => r.partName.includes('Shelf'));

    expect(dividers.length).toBe(1);
    expect(shelves.length).toBe(4); // 2 shelves × 2 bays
  });

  it('should include formula descriptions', () => {
    const results = calculateInternalParts(
      standardParams,
      1,
      1,
      DEFAULT_EDGE_CONFIG,
      20
    );

    const divider = results.find(r => r.partName.includes('Divider'));
    expect(divider?.formula).toContain('BackOffset');
    expect(divider?.formula).toContain('BackThk');
  });

  it('should handle overlay joints', () => {
    const overlayParams: CabinetParams = {
      ...standardParams,
      topJoint: 'overlay',
      bottomJoint: 'overlay',
    };

    const results = calculateInternalParts(overlayParams, 1, 0, DEFAULT_EDGE_CONFIG, 20);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ============================================
// 8. FORMULA STRING GENERATORS
// ============================================

describe('getShelfDepthFormula', () => {
  it('should generate inset formula', () => {
    const formula = getShelfDepthFormula(560, DEFAULT_BACK_CONFIG, 20, 2);
    expect(formula).toContain('D(560)');
    expect(formula).toContain('BackOffset(20)');
    expect(formula).toContain('BackThk(6)');
    expect(formula).toContain('Safety(2)');
    expect(formula).toContain('Front(20)');
  });

  it('should generate overlay formula', () => {
    const overlayConfig: BackPanelConfig = {
      construction: 'overlay',
      thickness: 6,
      grooveOffset: 0,
    };
    const formula = getShelfDepthFormula(560, overlayConfig, 20, 2);
    expect(formula).not.toContain('BackOffset');
    expect(formula).toContain('BackThk(6)');
  });
});

describe('getCutWidthFormula', () => {
  it('should generate formula for left edge only', () => {
    const formula = getCutWidthFormula(400, 1, 0, 0.5);
    expect(formula).toContain('Finish(400)');
    expect(formula).toContain('EdgeL(1)');
    expect(formula).toContain('Mill(0.5)');
    expect(formula).not.toContain('EdgeR');
  });

  it('should generate formula for both edges', () => {
    const formula = getCutWidthFormula(400, 1, 1, 0.5);
    expect(formula).toContain('EdgeL(1)');
    expect(formula).toContain('EdgeR(1)');
  });

  it('should handle no edges', () => {
    const formula = getCutWidthFormula(400, 0, 0, 0.5);
    expect(formula).toBe('Finish(400)');
  });
});

// ============================================
// 9. DEFAULT CONSTANTS
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

  it('should have all COMMON_COMPOSITIONS defined', () => {
    expect(COMMON_COMPOSITIONS['PB-MEL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['PB-HPL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['MDF-HPL']).toBeDefined();
    expect(COMMON_COMPOSITIONS['HMR-HPL']).toBeDefined();
  });
});

// ============================================
// 10. REAL-WORLD SCENARIOS
// ============================================

describe('real-world scenarios', () => {
  it('should calculate standard kitchen base cabinet parts', () => {
    const params: CabinetParams = {
      width: 600,
      height: 720,
      depth: 560,
      panelThickness: 18,
      backConfig: {
        construction: 'inset',
        thickness: 6,
        grooveOffset: 20,
      },
      topJoint: 'inset',
      bottomJoint: 'inset',
    };

    const safeDepth = calculateInternalDepth(560, params.backConfig, 2);
    expect(safeDepth).toBe(532);

    const results = calculateInternalParts(params, 1, 0, DEFAULT_EDGE_CONFIG, 20);
    expect(results.length).toBe(1); // 1 shelf
  });

  it('should calculate wardrobe with multiple compartments', () => {
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

    // 2 dividers + (2 shelves × 3 bays) = 8 parts
    expect(results.filter(r => r.partName.includes('Divider')).length).toBe(2);
    expect(results.filter(r => r.partName.includes('Shelf')).length).toBe(6);
  });
});
