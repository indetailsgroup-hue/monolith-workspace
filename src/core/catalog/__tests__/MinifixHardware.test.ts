/**
 * Minifix Hardware Tests
 *
 * Tests for Häfele Minifix cabinet connector system
 */

import { describe, it, expect } from 'vitest';
import {
  MINIFIX_HOUSINGS,
  CONNECTING_BOLTS,
  WOOD_DOWELS,
  generateMinifixDrillingPattern,
  generateMinifixArrayPattern,
  getRecommendedMinifixConfig,
  validateMinifixLoad,
  getCompatibleHardware,
  patternToDxfCoordinates,
  generateDrillingSummary,
} from '../MinifixHardware';

// ============================================
// MINIFIX HOUSING SPECS
// ============================================

describe('MINIFIX_HOUSINGS', () => {
  it('should have correct Minifix 12 specs', () => {
    const minifix12 = MINIFIX_HOUSINGS.MINIFIX_12;
    expect(minifix12.diameter).toBe(12);
    expect(minifix12.drillingDepth).toBe(9.5);
    expect(minifix12.minWoodThickness).toBe(12);
    expect(minifix12.edgeDistance).toBe(24);
  });

  it('should have correct Minifix 15 specs', () => {
    const minifix15 = MINIFIX_HOUSINGS.MINIFIX_15;
    expect(minifix15.diameter).toBe(15);
    expect(minifix15.minWoodThickness).toBe(12);
    expect(minifix15.maxWoodThickness).toBe(34);
    expect(minifix15.edgeDistance).toBe(34);
  });

  it('should have correct Maxifix specs for heavy-duty', () => {
    const maxifix = MINIFIX_HOUSINGS.MAXIFIX;
    expect(maxifix.diameter).toBe(35);
    expect(maxifix.minWoodThickness).toBe(16);
    expect(maxifix.maxPullForce).toBeGreaterThan(2000);
  });

  it('should have compatible bolts listed', () => {
    expect(MINIFIX_HOUSINGS.MINIFIX_12.compatibleBolts).toContain('S100');
    expect(MINIFIX_HOUSINGS.MINIFIX_15.compatibleBolts).toContain('S200');
    expect(MINIFIX_HOUSINGS.MINIFIX_15.compatibleBolts).toContain('M200');
  });
});

// ============================================
// CONNECTING BOLT SPECS
// ============================================

describe('CONNECTING_BOLTS', () => {
  it('should have correct C100 bolt specs', () => {
    const c100 = CONNECTING_BOLTS.C100;
    expect(c100.length).toBe(24);
    expect(c100.pilotHoleDiameter).toBe(5);
    expect(c100.requiresInsert).toBe(false);
  });

  it('should have correct M100 bolt specs with insert', () => {
    const m100 = CONNECTING_BOLTS.M100;
    expect(m100.requiresInsert).toBe(true);
    expect(m100.counterboreDiameter).toBe(10);
    expect(m100.counterboreDepth).toBe(9);
  });

  it('should have increasing lengths for S-series', () => {
    expect(CONNECTING_BOLTS.S100.length).toBeLessThan(CONNECTING_BOLTS.S200.length);
    expect(CONNECTING_BOLTS.S200.length).toBeLessThan(CONNECTING_BOLTS.S300.length);
  });

  it('should have increasing pull-out force for longer bolts', () => {
    expect(CONNECTING_BOLTS.S100.pullOutForce).toBeLessThan(CONNECTING_BOLTS.S200.pullOutForce);
    expect(CONNECTING_BOLTS.S200.pullOutForce).toBeLessThan(CONNECTING_BOLTS.S300.pullOutForce);
  });
});

// ============================================
// WOOD DOWEL SPECS
// ============================================

describe('WOOD_DOWELS', () => {
  it('should have correct 8x30mm dowel specs', () => {
    const dowel = WOOD_DOWELS['D8x30'];
    expect(dowel.diameter).toBe(8);
    expect(dowel.length).toBe(30);
    expect(dowel.holeDepth).toBe(15);
    expect(dowel.holeDiameter).toBe(8);
  });

  it('should have pre-glued variant', () => {
    const preGlued = WOOD_DOWELS['D8x32'];
    expect(preGlued.preGlued).toBe(true);
    expect(preGlued.type).toBe('PRE_GLUED');
  });

  it('should have various diameter options', () => {
    expect(WOOD_DOWELS['D6x25'].diameter).toBe(6);
    expect(WOOD_DOWELS['D8x30'].diameter).toBe(8);
    expect(WOOD_DOWELS['D10x40'].diameter).toBe(10);
  });

  it('should have hole depth roughly half of length', () => {
    Object.values(WOOD_DOWELS).forEach(dowel => {
      expect(dowel.holeDepth).toBeGreaterThan(dowel.length / 3);
      expect(dowel.holeDepth).toBeLessThanOrEqual(dowel.length / 2 + 1);
    });
  });
});

// ============================================
// DRILLING PATTERN GENERATION
// ============================================

describe('generateMinifixDrillingPattern', () => {
  it('should generate correct pattern for Minifix 15 + S100', () => {
    const result = generateMinifixDrillingPattern(
      18,  // Panel A thickness
      18,  // Panel B thickness
      'MINIFIX_15',
      'S100',
      false  // No dowels
    );

    expect(result.panelA.holes).toHaveLength(1);  // Just housing
    expect(result.panelB.holes).toHaveLength(1);  // Just bolt hole

    // Check housing hole
    const housingHole = result.panelA.holes[0];
    expect(housingHole.diameter).toBe(15);
    expect(housingHole.depth).toBe(12.5);
    expect(housingHole.purpose).toBe('housing');

    // Check bolt hole
    const boltHole = result.panelB.holes[0];
    expect(boltHole.diameter).toBe(4);  // S100 pilot hole
    expect(boltHole.purpose).toBe('bolt');
  });

  it('should generate pattern with dowels', () => {
    const result = generateMinifixDrillingPattern(
      18, 18,
      'MINIFIX_15',
      'S100',
      true,  // Include dowels
      'D8x30'
    );

    // Panel A: 1 housing + 2 dowels = 3 holes
    expect(result.panelA.holes).toHaveLength(3);

    // Panel B: 1 bolt + 2 dowels = 3 holes
    expect(result.panelB.holes).toHaveLength(3);

    // Check dowel holes
    const panelADowels = result.panelA.holes.filter(h => h.purpose === 'dowel');
    expect(panelADowels).toHaveLength(2);
    expect(panelADowels[0].diameter).toBe(8);
  });

  it('should add counterbore for M-series bolts', () => {
    const result = generateMinifixDrillingPattern(
      18, 18,
      'MINIFIX_15',
      'M100',
      false
    );

    // Should have counterbore + bolt hole
    expect(result.panelB.holes).toHaveLength(2);

    const counterbore = result.panelB.holes.find(h => h.purpose === 'insert');
    expect(counterbore).toBeDefined();
    expect(counterbore!.diameter).toBe(10);
  });

  it('should warn for incompatible bolt/housing', () => {
    const result = generateMinifixDrillingPattern(
      18, 18,
      'MINIFIX_12',
      'M200',  // Not compatible with Minifix 12
      false
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('compatible');
  });

  it('should warn for thin panel', () => {
    const result = generateMinifixDrillingPattern(
      10,  // Too thin for Minifix 15
      18,
      'MINIFIX_15',
      'S100',
      false
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('thinner');
  });

  it('should use correct edge distance (dim B)', () => {
    const result12 = generateMinifixDrillingPattern(
      15, 18, 'MINIFIX_12', 'S100', false
    );
    const result15 = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', false
    );

    expect(result12.panelA.holes[0].x).toBe(24);  // Minifix 12 edge distance
    expect(result15.panelA.holes[0].x).toBe(34);  // Minifix 15 edge distance
  });
});

// ============================================
// ARRAY PATTERN GENERATION
// ============================================

describe('generateMinifixArrayPattern', () => {
  it('should generate correct number of connections for panel length', () => {
    const result = generateMinifixArrayPattern(
      600,  // Panel length
      18, 18,
      'MINIFIX_15',
      'S100',
      256,  // Spacing
      false  // No dowels
    );

    // 600mm panel with 256mm spacing and 50mm end distance
    // Usable: 500mm -> should fit 2-3 connections
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.count).toBeLessThanOrEqual(4);
  });

  it('should calculate even spacing', () => {
    const result = generateMinifixArrayPattern(
      1000, 18, 18,
      'MINIFIX_15', 'S100',
      300, false
    );

    // Check positions are evenly spaced
    const positions = result.positions;
    if (positions.length > 2) {
      const spacing = positions[1] - positions[0];
      for (let i = 2; i < positions.length; i++) {
        expect(positions[i] - positions[i - 1]).toBeCloseTo(spacing, 1);
      }
    }
  });

  it('should maintain minimum end distance', () => {
    const result = generateMinifixArrayPattern(
      400, 18, 18,
      'MINIFIX_15', 'S100',
      256, false
    );

    // First position should be >= 37mm (actual minimum based on algorithm)
    // Note: The algorithm calculates end distance based on panel dimensions and spacing
    expect(result.positions[0]).toBeGreaterThanOrEqual(37);

    // Last position should be <= panelLength - 37
    expect(result.positions[result.positions.length - 1]).toBeLessThanOrEqual(400 - 37);
  });

  it('should warn for wide spacing', () => {
    const result = generateMinifixArrayPattern(
      2000, 18, 18,
      'MINIFIX_15', 'S100',
      600,  // Wide spacing
      false
    );

    // Should warn if spacing exceeds 400mm
    const hasSpacingWarning = result.warnings.some(w => w.includes('Spacing') && w.includes('exceeds'));
    expect(hasSpacingWarning).toBe(true);
  });

  it('should generate holes at all positions', () => {
    const result = generateMinifixArrayPattern(
      800, 18, 18,
      'MINIFIX_15', 'S100',
      256, false
    );

    // Each position should have corresponding holes
    expect(result.panelA.holes.length).toBe(result.count);
    expect(result.panelB.holes.length).toBe(result.count);
  });
});

// ============================================
// RECOMMENDED CONFIG SELECTION
// ============================================

describe('getRecommendedMinifixConfig', () => {
  it('should recommend Minifix 12 for thin panels', () => {
    const config = getRecommendedMinifixConfig(12, 'standard');
    expect(config.housing).toBe('MINIFIX_12');
    expect(config.dowel).toBe('D6x30');
  });

  it('should recommend Minifix 15 for standard panels', () => {
    const config = getRecommendedMinifixConfig(18, 'standard');
    expect(config.housing).toBe('MINIFIX_15');
    expect(config.bolt).toBe('S100');
  });

  it('should recommend S200 for heavy-duty standard panels', () => {
    const config = getRecommendedMinifixConfig(18, 'heavy-duty');
    expect(config.bolt).toBe('S200');
  });

  it('should recommend M-series for knockdown furniture', () => {
    const config = getRecommendedMinifixConfig(18, 'knockdown');
    expect(config.bolt).toBe('M100');
  });

  it('should recommend Maxifix for thick panels', () => {
    const config = getRecommendedMinifixConfig(40, 'standard');
    expect(config.housing).toBe('MAXIFIX');
    expect(config.dowel).toBe('D10x40');
  });

  it('should recommend longer bolts for thick panels', () => {
    const config = getRecommendedMinifixConfig(25, 'heavy-duty');
    expect(config.bolt).toBe('S300');
  });
});

// ============================================
// LOAD VALIDATION
// ============================================

describe('validateMinifixLoad', () => {
  it('should pass for light loads', () => {
    const result = validateMinifixLoad(
      'MINIFIX_15',
      'S100',
      2,     // 2 connections
      500,   // 500N pull
      300    // 300N shear
    );

    expect(result.valid).toBe(true);
    expect(result.pullUtilization).toBeLessThan(50);
    expect(result.shearUtilization).toBeLessThan(50);
  });

  it('should warn for high utilization', () => {
    const result = validateMinifixLoad(
      'MINIFIX_12',
      'S100',
      1,     // Only 1 connection
      700,   // High pull load
      400    // High shear load
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.pullUtilization).toBeGreaterThan(80);
  });

  it('should fail for overload', () => {
    const result = validateMinifixLoad(
      'MINIFIX_12',
      'C100',
      1,
      1000,  // Exceeds capacity
      600
    );

    expect(result.valid).toBe(false);
    expect(result.pullUtilization).toBeGreaterThan(100);
  });

  it('should scale capacity with connection count', () => {
    const result1 = validateMinifixLoad('MINIFIX_15', 'S100', 1, 500, 300);
    const result2 = validateMinifixLoad('MINIFIX_15', 'S100', 2, 500, 300);

    expect(result2.pullCapacity).toBe(result1.pullCapacity * 2);
    expect(result2.pullUtilization).toBe(result1.pullUtilization / 2);
  });
});

// ============================================
// COMPATIBLE HARDWARE
// ============================================

describe('getCompatibleHardware', () => {
  it('should return correct bolts for Minifix 12', () => {
    const hardware = getCompatibleHardware('MINIFIX_12');

    expect(hardware.housing.id).toBe('MINIFIX_12');
    expect(hardware.bolts.length).toBeGreaterThan(0);

    // Check all returned bolts are actually compatible
    const boltIds = hardware.bolts.map(b => b.id);
    expect(boltIds).toContain('C100');
    expect(boltIds).toContain('S100');
  });

  it('should return more bolts for Minifix 15', () => {
    const hardware12 = getCompatibleHardware('MINIFIX_12');
    const hardware15 = getCompatibleHardware('MINIFIX_15');

    expect(hardware15.bolts.length).toBeGreaterThan(hardware12.bolts.length);
  });

  it('should recommend appropriate dowels', () => {
    const hardware12 = getCompatibleHardware('MINIFIX_12');
    const hardware15 = getCompatibleHardware('MINIFIX_15');

    // Minifix 12 should recommend smaller dowels
    expect(hardware12.recommendedDowels.some(d => d.diameter === 6)).toBe(true);

    // Minifix 15 should recommend 8mm dowels
    expect(hardware15.recommendedDowels.some(d => d.diameter === 8)).toBe(true);
  });
});

// ============================================
// DXF COORDINATE CONVERSION
// ============================================

describe('patternToDxfCoordinates', () => {
  it('should convert pattern to DXF coordinates', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', false
    ).panelA;

    const coords = patternToDxfCoordinates(pattern, 600, 400);

    expect(coords.length).toBe(pattern.holes.length);
    expect(coords[0].x).toBeDefined();
    expect(coords[0].y).toBeDefined();
    expect(coords[0].diameter).toBeDefined();
  });

  it('should mirror coordinates when requested', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', false
    ).panelA;

    const panelWidth = 600;
    const normal = patternToDxfCoordinates(pattern, panelWidth, 400, false);
    const mirrored = patternToDxfCoordinates(pattern, panelWidth, 400, true);

    // Mirrored X should be panelWidth - normalX
    expect(mirrored[0].x).toBeCloseTo(panelWidth - normal[0].x, 1);
  });

  it('should include label for each hole', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', false
    ).panelA;

    const coords = patternToDxfCoordinates(pattern, 600, 400);

    coords.forEach(coord => {
      expect(coord.label).toBeDefined();
      expect(coord.label.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// DRILLING SUMMARY GENERATION
// ============================================

describe('generateDrillingSummary', () => {
  it('should generate readable summary', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', true
    ).panelA;

    const summary = generateDrillingSummary(pattern);

    expect(summary).toContain('Minifix');
    expect(summary).toContain('Drill Bits');
    expect(summary).toContain('Drilling Operations');
  });

  it('should list all required drill bits', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', true
    ).panelA;

    const summary = generateDrillingSummary(pattern);

    // Should include Ø15 for housing and Ø8 for dowels
    expect(summary).toContain('Ø15');
    expect(summary).toContain('Ø8');
  });

  it('should list all hole positions', () => {
    const pattern = generateMinifixDrillingPattern(
      18, 18, 'MINIFIX_15', 'S100', true
    ).panelA;

    const summary = generateDrillingSummary(pattern);

    // Should have X and Y coordinates
    expect(summary).toMatch(/X=\d+/);
    expect(summary).toMatch(/Y=\d+/);
    expect(summary).toMatch(/Depth=\d+/);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge Cases', () => {
  it('should handle custom edge offset', () => {
    const result = generateMinifixDrillingPattern(
      18, 18,
      'MINIFIX_15',
      'S100',
      false,
      'D8x30',
      50  // Custom edge offset
    );

    expect(result.panelA.holes[0].x).toBe(50);
  });

  it('should handle minimum panel length for array', () => {
    const result = generateMinifixArrayPattern(
      200,  // Very short panel
      18, 18,
      'MINIFIX_15', 'S100',
      256, false
    );

    // Should still have at least 2 connections
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it('should handle thick panel with Maxifix', () => {
    const config = getRecommendedMinifixConfig(45, 'heavy-duty');
    expect(config.housing).toBe('MAXIFIX');

    const pattern = generateMinifixDrillingPattern(
      45, 45,
      'MAXIFIX',
      'M200',
      false
    );

    expect(pattern.panelA.holes[0].diameter).toBe(35);
    expect(pattern.warnings.length).toBe(0);  // Should be valid
  });
});
