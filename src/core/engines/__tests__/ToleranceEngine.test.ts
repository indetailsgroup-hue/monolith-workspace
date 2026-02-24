/**
 * ToleranceEngine Advanced Tolerance Checking Tests
 *
 * Tests for T010 - Advanced Tolerance Checking:
 * - Machine tolerance validation (cuts +/-0.1mm, drills +/-0.5mm)
 * - Clearance validation (2mm minimum gaps between panels)
 * - Edge banding placement tolerance (+/-0.3mm)
 * - Panel dimension sanity checks (min 50mm, max 2440mm)
 * - Combined runAdvancedToleranceChecks aggregation
 *
 * @version 1.0.0 - AGENT-T010
 */

import { describe, it, expect } from 'vitest';
import {
  // Machine tolerance
  validateMachineCuts,
  validateDrillPositions,
  // Clearance
  validatePanelClearance,
  // Edge banding
  validateEdgeBanding,
  // Panel dimensions
  validatePanelDimensions,
  // Combined
  runAdvancedToleranceChecks,
  // Constants
  MACHINE_TOLERANCES,
  TOLERANCE_CODES,
  // Types
  type TolerancePanelSpec,
  type CutOperation,
  type DrillPosition,
  type PanelPair,
  type EdgeBandPlacement,
  type AdvancedToleranceInput,
} from '../ToleranceEngine';

// ============================================
// TEST HELPERS
// ============================================

function makePanel(overrides: Partial<TolerancePanelSpec> = {}): TolerancePanelSpec {
  return {
    id: 'panel-1',
    name: 'Test Panel',
    finishWidth: 600,
    finishHeight: 400,
    material: 'WOOD_PANEL',
    edgeBanding: { top: false, bottom: false, left: false, right: false },
    ...overrides,
  };
}

// ============================================
// 1. MACHINE CUT TOLERANCE (+-0.1mm)
// ============================================

describe('validateMachineCuts', () => {
  it('should pass when cut is within tolerance', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(0);
  });

  it('should warn when cut deviation is exactly at 80% of tolerance', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600.08 },
    ];
    // 0.08mm == 80% of 0.1mm tolerance -> triggers warning (conservative)
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
  });

  it('should pass when cut deviation is well within tolerance', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600.05 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(0);
  });

  it('should warn when cut deviation is near tolerance limit (>80%)', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600.09 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].code).toBe(TOLERANCE_CODES.W_CUT_NEAR_LIMIT);
  });

  it('should block when cut deviation exceeds tolerance', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600.15 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
    expect(findings[0].code).toBe(TOLERANCE_CODES.B_CUT_DEVIATION);
    expect(findings[0].panelIds).toContain('p1');
  });

  it('should block for negative deviation (undersized cut)', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 599.85 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
  });

  it('should validate multiple cuts independently', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600 },     // OK
      { panelId: 'p2', nominalDimension: 400, actualDimension: 400.15 },  // BLOCKER
      { panelId: 'p3', nominalDimension: 300, actualDimension: 300.09 },  // WARNING
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings).toHaveLength(2);
    const blockers = findings.filter(f => f.severity === 'BLOCKER');
    const warnings = findings.filter(f => f.severity === 'WARNING');
    expect(blockers).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it('should return empty for empty input', () => {
    expect(validateMachineCuts([])).toHaveLength(0);
  });

  it('should include context with deviation details', () => {
    const cuts: CutOperation[] = [
      { panelId: 'p1', nominalDimension: 600, actualDimension: 600.2 },
    ];
    const findings = validateMachineCuts(cuts);
    expect(findings[0].context).toBeDefined();
    expect(findings[0].context!.nominalMm).toBe(600);
    expect(findings[0].context!.actualMm).toBe(600.2);
    expect(findings[0].context!.toleranceMm).toBe(MACHINE_TOLERANCES.CUT_TOLERANCE);
  });
});

// ============================================
// 2. DRILL POSITION TOLERANCE (+-0.5mm)
// ============================================

describe('validateDrillPositions', () => {
  it('should pass when drill position is exact', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37, actualY: 100 },
    ];
    expect(validateDrillPositions(drills)).toHaveLength(0);
  });

  it('should pass when drill deviation is within tolerance', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37.3, actualY: 100.2 },
    ];
    // sqrt(0.3^2 + 0.2^2) = sqrt(0.09 + 0.04) = sqrt(0.13) ~ 0.36mm < 0.5mm
    expect(validateDrillPositions(drills)).toHaveLength(0);
  });

  it('should warn when drill deviation is near limit (>80%)', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37.3, actualY: 100.3 },
    ];
    // sqrt(0.3^2 + 0.3^2) = sqrt(0.18) ~ 0.424mm > 0.4mm (80% of 0.5) but < 0.5mm
    const findings = validateDrillPositions(drills);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].code).toBe(TOLERANCE_CODES.W_DRILL_POSITION_NEAR_LIMIT);
  });

  it('should block when drill deviation exceeds tolerance', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37.5, actualY: 100.3 },
    ];
    // sqrt(0.5^2 + 0.3^2) = sqrt(0.25 + 0.09) = sqrt(0.34) ~ 0.583mm > 0.5mm
    const findings = validateDrillPositions(drills);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
    expect(findings[0].code).toBe(TOLERANCE_CODES.B_DRILL_POSITION_DEVIATION);
  });

  it('should handle purely X-axis deviation', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37.6, actualY: 100 },
    ];
    // deviation = 0.6mm > 0.5mm
    const findings = validateDrillPositions(drills);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
  });

  it('should handle purely Y-axis deviation', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37, actualY: 100.6 },
    ];
    const findings = validateDrillPositions(drills);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
  });

  it('should return empty for empty input', () => {
    expect(validateDrillPositions([])).toHaveLength(0);
  });

  it('should include position context in findings', () => {
    const drills: DrillPosition[] = [
      { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 38, actualY: 100 },
    ];
    const findings = validateDrillPositions(drills);
    expect(findings[0].context).toBeDefined();
    expect(findings[0].context!.nominalX).toBe(37);
    expect(findings[0].context!.nominalY).toBe(100);
    expect(findings[0].context!.toleranceMm).toBe(MACHINE_TOLERANCES.DRILL_POSITION_TOLERANCE);
  });
});

// ============================================
// 3. PANEL CLEARANCE (2mm minimum)
// ============================================

describe('validatePanelClearance', () => {
  it('should pass when gap is above minimum', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 3 },
    ];
    expect(validatePanelClearance(pairs)).toHaveLength(0);
  });

  it('should warn when gap is exactly at minimum (tight clearance)', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 2 },
    ];
    // Gap == minGap but < 1.5x minGap -> tight clearance warning (conservative)
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].code).toBe(TOLERANCE_CODES.W_PANEL_CLEARANCE_TIGHT);
  });

  it('should block when gap is below minimum', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 1.5 },
    ];
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
    expect(findings[0].code).toBe(TOLERANCE_CODES.B_PANEL_CLEARANCE);
    expect(findings[0].panelIds).toEqual(['p1', 'p2']);
  });

  it('should block when panels overlap (negative gap)', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: -0.5 },
    ];
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
    expect(findings[0].message).toContain('overlap');
  });

  it('should block when gap is zero', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 0 },
    ];
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('BLOCKER');
  });

  it('should warn when gap is tight (between min and 1.5x min)', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 2.5 },
    ];
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].code).toBe(TOLERANCE_CODES.W_PANEL_CLEARANCE_TIGHT);
  });

  it('should not warn when gap is above 1.5x minimum', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 3.5 },
    ];
    expect(validatePanelClearance(pairs)).toHaveLength(0);
  });

  it('should validate multiple pairs independently', () => {
    const pairs: PanelPair[] = [
      { panelAId: 'p1', panelBId: 'p2', gapMM: 5 },   // OK
      { panelAId: 'p2', panelBId: 'p3', gapMM: 1 },   // BLOCKER
      { panelAId: 'p3', panelBId: 'p4', gapMM: 2.5 },  // WARNING
    ];
    const findings = validatePanelClearance(pairs);
    expect(findings).toHaveLength(2);
    expect(findings.filter(f => f.severity === 'BLOCKER')).toHaveLength(1);
    expect(findings.filter(f => f.severity === 'WARNING')).toHaveLength(1);
  });

  it('should return empty for empty input', () => {
    expect(validatePanelClearance([])).toHaveLength(0);
  });
});

// ============================================
// 4. EDGE BANDING PLACEMENT TOLERANCE (+-0.3mm)
// ============================================

describe('validateEdgeBanding', () => {
  it('should pass when edge banding is within tolerance', () => {
    const placements: EdgeBandPlacement[] = [
      { panelId: 'p1', edge: 'top', nominalOffset: 0, actualOffset: 0.1 },
    ];
    const panels = [makePanel({ id: 'p1' })];
    expect(validateEdgeBanding(placements, panels)).toHaveLength(0);
  });

  it('should pass when edge banding is perfectly aligned', () => {
    const placements: EdgeBandPlacement[] = [
      { panelId: 'p1', edge: 'left', nominalOffset: 0, actualOffset: 0 },
    ];
    const panels = [makePanel({ id: 'p1' })];
    expect(validateEdgeBanding(placements, panels)).toHaveLength(0);
  });

  it('should block when edge banding deviation exceeds tolerance', () => {
    const placements: EdgeBandPlacement[] = [
      { panelId: 'p1', edge: 'top', nominalOffset: 0, actualOffset: 0.5 },
    ];
    const panels = [makePanel({ id: 'p1' })];
    const findings = validateEdgeBanding(placements, panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_EDGE_BAND_DEVIATION);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].severity).toBe('BLOCKER');
    expect(blockers[0].context!.edge).toBe('top');
  });

  it('should warn when edge banding is applied to solid wood', () => {
    const panels = [makePanel({
      id: 'p1',
      material: 'SOLID_WOOD',
      edgeBanding: { top: true, bottom: false, left: false, right: false },
    })];
    const findings = validateEdgeBanding([], panels);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].code).toBe(TOLERANCE_CODES.W_EDGE_BAND_ON_SOLID_WOOD);
  });

  it('should not warn about solid wood without edge banding', () => {
    const panels = [makePanel({
      id: 'p1',
      material: 'SOLID_WOOD',
      edgeBanding: { top: false, bottom: false, left: false, right: false },
    })];
    const findings = validateEdgeBanding([], panels);
    expect(findings).toHaveLength(0);
  });

  it('should not warn about edge banding on wood panels', () => {
    const panels = [makePanel({
      id: 'p1',
      material: 'WOOD_PANEL',
      edgeBanding: { top: true, bottom: true, left: true, right: true },
    })];
    const findings = validateEdgeBanding([], panels);
    expect(findings).toHaveLength(0);
  });

  it('should validate multiple placements', () => {
    const placements: EdgeBandPlacement[] = [
      { panelId: 'p1', edge: 'top', nominalOffset: 0, actualOffset: 0.1 },    // OK
      { panelId: 'p1', edge: 'bottom', nominalOffset: 0, actualOffset: 0.4 },  // BLOCKER
      { panelId: 'p1', edge: 'left', nominalOffset: 0, actualOffset: 0.35 },   // BLOCKER
    ];
    const panels = [makePanel({ id: 'p1' })];
    const findings = validateEdgeBanding(placements, panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_EDGE_BAND_DEVIATION);
    expect(blockers).toHaveLength(2);
  });

  it('should return empty for empty input with non-solid-wood panels', () => {
    const panels = [makePanel({ id: 'p1', material: 'WOOD_PANEL' })];
    expect(validateEdgeBanding([], panels)).toHaveLength(0);
  });
});

// ============================================
// 5. PANEL DIMENSION SANITY CHECKS
// ============================================

describe('validatePanelDimensions', () => {
  it('should pass for typical cabinet panel dimensions', () => {
    const panels = [makePanel({ finishWidth: 600, finishHeight: 400 })];
    expect(validatePanelDimensions(panels)).toHaveLength(0);
  });

  it('should pass at exactly minimum dimension (50mm)', () => {
    const panels = [makePanel({ finishWidth: 50, finishHeight: 50 })];
    // 50mm is at the minimum but not below, however it will trigger "near min" warning
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.severity === 'BLOCKER');
    expect(blockers).toHaveLength(0);
  });

  it('should block when width is below minimum', () => {
    const panels = [makePanel({ finishWidth: 30, finishHeight: 400 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_PANEL_TOO_SMALL);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].context!.dimension).toBe('width');
    expect(blockers[0].context!.valueMm).toBe(30);
  });

  it('should block when height is below minimum', () => {
    const panels = [makePanel({ finishWidth: 600, finishHeight: 20 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_PANEL_TOO_SMALL);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].context!.dimension).toBe('height');
  });

  it('should block when both dimensions are below minimum', () => {
    const panels = [makePanel({ finishWidth: 10, finishHeight: 10 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_PANEL_TOO_SMALL);
    expect(blockers).toHaveLength(2);
  });

  it('should warn when dimension is near minimum (50-75mm)', () => {
    const panels = [makePanel({ finishWidth: 60, finishHeight: 400 })];
    const findings = validatePanelDimensions(panels);
    const warnings = findings.filter(f => f.code === TOLERANCE_CODES.W_PANEL_NEAR_MIN);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].context!.dimension).toBe('width');
  });

  it('should block when width exceeds maximum (2440mm)', () => {
    const panels = [makePanel({ finishWidth: 2500, finishHeight: 400 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_PANEL_TOO_LARGE);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].context!.dimension).toBe('width');
  });

  it('should block when height exceeds maximum', () => {
    const panels = [makePanel({ finishWidth: 600, finishHeight: 3000 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.code === TOLERANCE_CODES.B_PANEL_TOO_LARGE);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].context!.dimension).toBe('height');
  });

  it('should warn when dimension is near maximum (>2318mm)', () => {
    const panels = [makePanel({ finishWidth: 2400, finishHeight: 400 })];
    const findings = validatePanelDimensions(panels);
    const warnings = findings.filter(f => f.code === TOLERANCE_CODES.W_PANEL_NEAR_MAX);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].context!.dimension).toBe('width');
  });

  it('should pass at exactly maximum dimension (2440mm)', () => {
    const panels = [makePanel({ finishWidth: 2440, finishHeight: 400 })];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.severity === 'BLOCKER');
    expect(blockers).toHaveLength(0);
    // Should have a near-max warning though
    const warnings = findings.filter(f => f.code === TOLERANCE_CODES.W_PANEL_NEAR_MAX);
    expect(warnings).toHaveLength(1);
  });

  it('should validate multiple panels', () => {
    const panels = [
      makePanel({ id: 'p1', name: 'Good', finishWidth: 600, finishHeight: 400 }),
      makePanel({ id: 'p2', name: 'Too Small', finishWidth: 30, finishHeight: 400 }),
      makePanel({ id: 'p3', name: 'Too Big', finishWidth: 3000, finishHeight: 400 }),
    ];
    const findings = validatePanelDimensions(panels);
    const blockers = findings.filter(f => f.severity === 'BLOCKER');
    expect(blockers).toHaveLength(2); // One too small, one too big
    expect(blockers.find(f => f.panelIds?.includes('p2'))).toBeDefined();
    expect(blockers.find(f => f.panelIds?.includes('p3'))).toBeDefined();
  });

  it('should return empty for empty input', () => {
    expect(validatePanelDimensions([])).toHaveLength(0);
  });
});

// ============================================
// 6. COMBINED runAdvancedToleranceChecks
// ============================================

describe('runAdvancedToleranceChecks', () => {
  it('should return ok=true when all checks pass', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel({ finishWidth: 600, finishHeight: 400 })],
      cuts: [{ panelId: 'panel-1', nominalDimension: 600, actualDimension: 600 }],
      drills: [{ panelId: 'panel-1', nominalX: 37, nominalY: 100, actualX: 37, actualY: 100 }],
      panelPairs: [{ panelAId: 'panel-1', panelBId: 'panel-2', gapMM: 5 }],
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true);
    expect(result.blockerCount).toBe(0);
  });

  it('should return ok=false when any blocker exists', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel({ finishWidth: 30, finishHeight: 400 })], // Too small
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(false);
    expect(result.blockerCount).toBeGreaterThan(0);
  });

  it('should aggregate findings from all validators', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel({
        id: 'p1',
        finishWidth: 60,   // Near min warning
        finishHeight: 400,
        material: 'SOLID_WOOD',
        edgeBanding: { top: true, bottom: false, left: false, right: false },
      })],
      cuts: [{ panelId: 'p1', nominalDimension: 60, actualDimension: 60.15 }],  // Cut blocker
      panelPairs: [{ panelAId: 'p1', panelBId: 'p2', gapMM: 1 }],              // Clearance blocker
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(false);
    expect(result.blockerCount).toBeGreaterThanOrEqual(2); // cut + clearance
    expect(result.warningCount).toBeGreaterThanOrEqual(2); // near min + solid wood edge banding
  });

  it('should run dimension checks even without optional data', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel({ finishWidth: 600, finishHeight: 400 })],
      // No cuts, drills, pairs, or edge placements
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('should handle completely empty panels array', () => {
    const input: AdvancedToleranceInput = {
      panels: [],
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('should skip optional validators when data not provided', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel()],
      cuts: undefined,
      drills: undefined,
      panelPairs: undefined,
      edgeBandPlacements: undefined,
    };
    const result = runAdvancedToleranceChecks(input);
    // Only dimension checks should run - should pass for standard panel
    expect(result.ok).toBe(true);
  });

  it('should check edge banding material warnings even without placements', () => {
    const input: AdvancedToleranceInput = {
      panels: [makePanel({
        material: 'SOLID_WOOD',
        edgeBanding: { top: true, bottom: false, left: false, right: false },
      })],
    };
    const result = runAdvancedToleranceChecks(input);
    const solidWoodWarnings = result.findings.filter(
      f => f.code === TOLERANCE_CODES.W_EDGE_BAND_ON_SOLID_WOOD
    );
    expect(solidWoodWarnings).toHaveLength(1);
  });

  it('should count findings correctly', () => {
    const input: AdvancedToleranceInput = {
      panels: [
        makePanel({ id: 'p1', finishWidth: 30, finishHeight: 400 }),  // Too small (blocker)
        makePanel({ id: 'p2', finishWidth: 60, finishHeight: 400 }),  // Near min (warning)
      ],
      panelPairs: [
        { panelAId: 'p1', panelBId: 'p2', gapMM: 1 },  // Below min (blocker)
      ],
    };
    const result = runAdvancedToleranceChecks(input);
    expect(result.blockerCount).toBe(result.findings.filter(f => f.severity === 'BLOCKER').length);
    expect(result.warningCount).toBe(result.findings.filter(f => f.severity === 'WARNING').length);
    expect(result.infoCount).toBe(result.findings.filter(f => f.severity === 'INFO').length);
  });
});

// ============================================
// 7. CONSTANTS VERIFICATION
// ============================================

describe('MACHINE_TOLERANCES constants', () => {
  it('should have correct cut tolerance', () => {
    expect(MACHINE_TOLERANCES.CUT_TOLERANCE).toBe(0.1);
  });

  it('should have correct drill position tolerance', () => {
    expect(MACHINE_TOLERANCES.DRILL_POSITION_TOLERANCE).toBe(0.5);
  });

  it('should have correct minimum panel clearance', () => {
    expect(MACHINE_TOLERANCES.MIN_PANEL_CLEARANCE).toBe(2);
  });

  it('should have correct edge banding tolerance', () => {
    expect(MACHINE_TOLERANCES.EDGE_BANDING_TOLERANCE).toBe(0.3);
  });

  it('should have correct minimum panel dimension', () => {
    expect(MACHINE_TOLERANCES.MIN_PANEL_DIMENSION).toBe(50);
  });

  it('should have correct maximum panel dimension', () => {
    expect(MACHINE_TOLERANCES.MAX_PANEL_DIMENSION).toBe(2440);
  });
});

// ============================================
// 8. REAL-WORLD SCENARIOS
// ============================================

describe('real-world scenarios', () => {
  it('should validate a standard kitchen base cabinet', () => {
    const panels: TolerancePanelSpec[] = [
      makePanel({ id: 'left', name: 'Left Side', finishWidth: 560, finishHeight: 720, edgeBanding: { top: false, bottom: false, left: true, right: false } }),
      makePanel({ id: 'right', name: 'Right Side', finishWidth: 560, finishHeight: 720, edgeBanding: { top: false, bottom: false, left: false, right: true } }),
      makePanel({ id: 'top', name: 'Top', finishWidth: 564, finishHeight: 560 }),
      makePanel({ id: 'bottom', name: 'Bottom', finishWidth: 564, finishHeight: 560 }),
      makePanel({ id: 'shelf', name: 'Shelf', finishWidth: 530, finishHeight: 398 }),
      makePanel({ id: 'back', name: 'Back', finishWidth: 596, finishHeight: 714, material: 'WOOD_PANEL' }),
    ];

    const input: AdvancedToleranceInput = {
      panels,
      panelPairs: [
        { panelAId: 'left', panelBId: 'shelf', gapMM: 2 },
        { panelAId: 'right', panelBId: 'shelf', gapMM: 2 },
        { panelAId: 'top', panelBId: 'shelf', gapMM: 3 },
      ],
    };

    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true);
    expect(result.blockerCount).toBe(0);
  });

  it('should catch a tiny drawer bottom panel', () => {
    const panels: TolerancePanelSpec[] = [
      makePanel({ id: 'drawer-bottom', name: 'Drawer Bottom', finishWidth: 400, finishHeight: 40 }),
    ];

    const result = runAdvancedToleranceChecks({ panels });
    expect(result.ok).toBe(false);
    expect(result.findings.some(f =>
      f.code === TOLERANCE_CODES.B_PANEL_TOO_SMALL && f.panelIds?.includes('drawer-bottom')
    )).toBe(true);
  });

  it('should catch oversized wardrobe panel', () => {
    const panels: TolerancePanelSpec[] = [
      makePanel({ id: 'side', name: 'Wardrobe Side', finishWidth: 600, finishHeight: 2500 }),
    ];

    const result = runAdvancedToleranceChecks({ panels });
    expect(result.ok).toBe(false);
    expect(result.findings.some(f =>
      f.code === TOLERANCE_CODES.B_PANEL_TOO_LARGE
    )).toBe(true);
  });

  it('should warn about tight assembly with minimal clearances', () => {
    const panels: TolerancePanelSpec[] = [
      makePanel({ id: 'p1', finishWidth: 600, finishHeight: 400 }),
      makePanel({ id: 'p2', finishWidth: 600, finishHeight: 400 }),
    ];

    const input: AdvancedToleranceInput = {
      panels,
      panelPairs: [
        { panelAId: 'p1', panelBId: 'p2', gapMM: 2.2 },
      ],
    };

    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true); // No blockers
    expect(result.warningCount).toBeGreaterThan(0); // But warnings about tight fit
  });

  it('should validate post-CNC measurement data', () => {
    const panels: TolerancePanelSpec[] = [
      makePanel({ id: 'p1', name: 'Side Panel', finishWidth: 560, finishHeight: 720 }),
    ];

    const input: AdvancedToleranceInput = {
      panels,
      cuts: [
        { panelId: 'p1', nominalDimension: 560, actualDimension: 560.05 },  // OK
        { panelId: 'p1', nominalDimension: 720, actualDimension: 720.03 },  // OK
      ],
      drills: [
        { panelId: 'p1', nominalX: 37, nominalY: 100, actualX: 37.1, actualY: 100.05 },  // OK
        { panelId: 'p1', nominalX: 37, nominalY: 200, actualX: 37.05, actualY: 200.1 },   // OK
      ],
    };

    const result = runAdvancedToleranceChecks(input);
    expect(result.ok).toBe(true);
    expect(result.blockerCount).toBe(0);
  });
});
