/**
 * ToleranceEngine - Semantic Tolerance Injection System
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Part of Module B: Assembler Logic
 * - Auto-injects tolerances based on material behavior
 * - Ensures DXF/CSV output includes context-aware gaps
 * 
 * CONCEPT:
 * DXF R12 is just bare lines, but real production needs "context"
 * This engine knows material behavior and injects tolerances automatically
 * 
 * All dimensions in millimeters (mm)
 */

// ============================================
// MATERIAL CATEGORIES & BEHAVIORS
// ============================================

export type MaterialCategory = 
  | 'WOOD_PANEL'      // MDF, Plywood, Particle Board
  | 'SOLID_WOOD'      // Natural wood (expands/contracts)
  | 'STONE_NATURAL'   // Marble, Granite (needs grout)
  | 'STONE_ENGINEERED'// Quartz, Sintered (tighter tolerance)
  | 'METAL_SHEET'     // Aluminum, Steel
  | 'GLASS'           // Tempered, Laminated
  | 'ACRYLIC';        // Solid surface

export interface MaterialBehavior {
  category: MaterialCategory;
  
  // Expansion/Contraction
  thermalExpansion: number;     // mm per meter per °C
  humidityExpansion: number;    // mm per meter per % RH
  
  // Joint requirements
  minJointGap: number;          // mm - minimum gap between pieces
  groutWidth: number;           // mm - for stone (0 for wood)
  
  // Edge treatment
  edgeBandingAllowance: number; // mm - pre-mill allowance
  chipOutRisk: boolean;         // needs climb-cut or scoring
  
  // Structural
  density: number;              // kg/m³
  flexuralStrength: number;     // MPa
}

// ============================================
// MATERIAL BEHAVIOR DATABASE
// ============================================

export const MATERIAL_BEHAVIORS: Record<MaterialCategory, MaterialBehavior> = {
  WOOD_PANEL: {
    category: 'WOOD_PANEL',
    thermalExpansion: 0.005,
    humidityExpansion: 0.3,
    minJointGap: 0,              // Can be butt-jointed
    groutWidth: 0,
    edgeBandingAllowance: 0.5,   // Standard pre-mill
    chipOutRisk: true,
    density: 700,                // MDF average
    flexuralStrength: 30,
  },
  
  SOLID_WOOD: {
    category: 'SOLID_WOOD',
    thermalExpansion: 0.003,
    humidityExpansion: 2.5,      // Significant movement!
    minJointGap: 1,              // Allow for expansion
    groutWidth: 0,
    edgeBandingAllowance: 0,     // No edge banding
    chipOutRisk: true,
    density: 600,
    flexuralStrength: 80,
  },
  
  STONE_NATURAL: {
    category: 'STONE_NATURAL',
    thermalExpansion: 0.008,
    humidityExpansion: 0.01,
    minJointGap: 2,              // Grout line required
    groutWidth: 2,               // Standard grout width
    edgeBandingAllowance: 0,
    chipOutRisk: true,           // Needs water jet or slow cut
    density: 2700,               // Marble/Granite
    flexuralStrength: 15,
  },
  
  STONE_ENGINEERED: {
    category: 'STONE_ENGINEERED',
    thermalExpansion: 0.01,
    humidityExpansion: 0.001,
    minJointGap: 1,              // Tighter than natural
    groutWidth: 1.5,
    edgeBandingAllowance: 0,
    chipOutRisk: false,
    density: 2400,
    flexuralStrength: 40,
  },
  
  METAL_SHEET: {
    category: 'METAL_SHEET',
    thermalExpansion: 0.024,     // Aluminum expands a lot
    humidityExpansion: 0,
    minJointGap: 0.5,
    groutWidth: 0,
    edgeBandingAllowance: 0,
    chipOutRisk: false,
    density: 2700,               // Aluminum
    flexuralStrength: 200,
  },
  
  GLASS: {
    category: 'GLASS',
    thermalExpansion: 0.009,
    humidityExpansion: 0,
    minJointGap: 3,              // Safety gap required
    groutWidth: 0,
    edgeBandingAllowance: 0,
    chipOutRisk: false,          // Already polished
    density: 2500,
    flexuralStrength: 40,
  },
  
  ACRYLIC: {
    category: 'ACRYLIC',
    thermalExpansion: 0.07,      // Very high expansion!
    humidityExpansion: 0.3,
    minJointGap: 2,
    groutWidth: 0,
    edgeBandingAllowance: 0,
    chipOutRisk: false,
    density: 1200,
    flexuralStrength: 70,
  },
};

// ============================================
// TOLERANCE CALCULATION
// ============================================

export interface ToleranceContext {
  material: MaterialCategory;
  
  // Environmental conditions
  tempVariation: number;        // °C range (e.g., 10 = ±5°C)
  humidityVariation: number;    // % RH range
  
  // Installation context
  isExterior: boolean;          // More tolerance needed
  installMethod: 'GLUE' | 'MECHANICAL' | 'FLOATING';
  
  // Panel dimensions
  lengthMM: number;
  widthMM: number;
}

export interface ToleranceResult {
  // Joint gaps to add
  lengthGap: number;            // mm to add at length ends
  widthGap: number;             // mm to add at width ends
  
  // Grout (for stone)
  groutAllowance: number;       // mm per joint
  
  // Cut adjustments
  preMill: number;              // mm for edge banding
  
  // Warnings
  warnings: string[];
  
  // Total adjustment
  adjustedLength: number;
  adjustedWidth: number;
}

/**
 * Calculate semantic tolerances based on material and context
 * 
 * This is the core "intelligence" that injects appropriate gaps
 * into the DXF/CSV output based on material behavior
 */
export function calculateSemanticTolerance(
  context: ToleranceContext
): ToleranceResult {
  const behavior = MATERIAL_BEHAVIORS[context.material];
  const warnings: string[] = [];
  
  // Calculate thermal expansion
  const lengthMeters = context.lengthMM / 1000;
  const widthMeters = context.widthMM / 1000;
  
  const thermalLengthExpansion = lengthMeters * behavior.thermalExpansion * context.tempVariation;
  const thermalWidthExpansion = widthMeters * behavior.thermalExpansion * context.tempVariation;
  
  // Calculate humidity expansion
  const humidityLengthExpansion = lengthMeters * behavior.humidityExpansion * (context.humidityVariation / 100);
  const humidityWidthExpansion = widthMeters * behavior.humidityExpansion * (context.humidityVariation / 100);
  
  // Total expansion (worst case)
  let lengthGap = Math.max(
    behavior.minJointGap,
    thermalLengthExpansion + humidityLengthExpansion
  );
  
  let widthGap = Math.max(
    behavior.minJointGap,
    thermalWidthExpansion + humidityWidthExpansion
  );
  
  // Exterior installation needs more tolerance
  if (context.isExterior) {
    lengthGap *= 1.5;
    widthGap *= 1.5;
    warnings.push('Exterior installation: tolerances increased by 50%');
  }
  
  // Floating installation needs expansion gaps
  if (context.installMethod === 'FLOATING') {
    lengthGap = Math.max(lengthGap, 8);  // Perimeter gap for floating
    widthGap = Math.max(widthGap, 8);
    warnings.push('Floating installation: minimum 8mm perimeter gap');
  }
  
  // Round to practical values (0.5mm increments)
  lengthGap = Math.ceil(lengthGap * 2) / 2;
  widthGap = Math.ceil(widthGap * 2) / 2;
  
  // Grout allowance (stone only)
  const groutAllowance = behavior.groutWidth;
  if (groutAllowance > 0) {
    warnings.push(`Stone material: ${groutAllowance}mm grout line required between pieces`);
  }
  
  // Pre-mill for edge banding
  const preMill = behavior.edgeBandingAllowance;
  
  // Chip-out warning
  if (behavior.chipOutRisk) {
    warnings.push('Material prone to chip-out: use climb-cut or scoring saw');
  }
  
  // High expansion warning
  if (behavior.thermalExpansion > 0.05 || behavior.humidityExpansion > 1) {
    warnings.push('⚠️ High expansion material: ensure adequate expansion gaps');
  }
  
  return {
    lengthGap,
    widthGap,
    groutAllowance,
    preMill,
    warnings,
    adjustedLength: context.lengthMM - (lengthGap * 2),  // Gap both ends
    adjustedWidth: context.widthMM - (widthGap * 2),
  };
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Get tolerance for wood panel (cabinet parts)
 * Most common use case - simplified interface
 */
export function getWoodPanelTolerance(
  lengthMM: number,
  widthMM: number,
  hasEdgeBanding: boolean = true
): ToleranceResult {
  return calculateSemanticTolerance({
    material: 'WOOD_PANEL',
    tempVariation: 10,          // Typical indoor
    humidityVariation: 20,
    isExterior: false,
    installMethod: 'MECHANICAL',
    lengthMM,
    widthMM,
  });
}

/**
 * Get tolerance for stone installation
 * Includes grout line calculation
 */
export function getStoneTolerance(
  lengthMM: number,
  widthMM: number,
  isNatural: boolean = true
): ToleranceResult {
  return calculateSemanticTolerance({
    material: isNatural ? 'STONE_NATURAL' : 'STONE_ENGINEERED',
    tempVariation: 15,
    humidityVariation: 10,
    isExterior: false,
    installMethod: 'GLUE',
    lengthMM,
    widthMM,
  });
}

// ============================================
// STRUCTURAL WEIGHT CALCULATION (Module 3 Preview)
// ============================================

/**
 * Calculate panel weight for hardware validation
 * Part of Structural Integrity Check (Module 3)
 */
export function calculatePanelWeight(
  lengthMM: number,
  widthMM: number,
  thicknessMM: number,
  material: MaterialCategory
): { weightKg: number; warnings: string[] } {
  const behavior = MATERIAL_BEHAVIORS[material];
  const warnings: string[] = [];
  
  // Volume in m³
  const volumeM3 = (lengthMM / 1000) * (widthMM / 1000) * (thicknessMM / 1000);
  
  // Weight in kg
  const weightKg = volumeM3 * behavior.density;
  
  // Warnings for heavy panels
  if (weightKg > 15) {
    warnings.push(`⚠️ Heavy panel: ${weightKg.toFixed(1)}kg - verify hardware load rating`);
  }
  
  if (weightKg > 25) {
    warnings.push(`🚨 Very heavy panel: ${weightKg.toFixed(1)}kg - may require special hinges (Blum Aventos HK-XS or similar)`);
  }
  
  if (material === 'STONE_NATURAL' || material === 'STONE_ENGINEERED') {
    warnings.push('Stone panel: ensure substrate and adhesive can support weight');
  }
  
  return { weightKg, warnings };
}

// ============================================
// ADVANCED TOLERANCE CHECKING (T010)
// ============================================

/**
 * Machine tolerance constants.
 * Based on typical CNC woodworking equipment capabilities.
 */
export const MACHINE_TOLERANCES = {
  /** CNC saw/router cutting tolerance (mm) */
  CUT_TOLERANCE: 0.1,
  /** CNC drill position tolerance (mm) */
  DRILL_POSITION_TOLERANCE: 0.5,
  /** Minimum gap between adjacent panels (mm) */
  MIN_PANEL_CLEARANCE: 2,
  /** Edge banding placement tolerance (mm) */
  EDGE_BANDING_TOLERANCE: 0.3,
  /** Minimum panel dimension in any direction (mm) */
  MIN_PANEL_DIMENSION: 50,
  /** Maximum panel dimension - standard sheet size (mm) */
  MAX_PANEL_DIMENSION: 2440,
} as const;

/**
 * Severity levels compatible with the gate system.
 */
export type ToleranceSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

/**
 * A single tolerance finding, compatible with the gate GateIssue pattern.
 */
export interface ToleranceFinding {
  /** Deterministic unique identifier */
  id: string;
  /** Severity: BLOCKER blocks manufacturing, WARNING needs review, INFO is informational */
  severity: ToleranceSeverity;
  /** Stable issue code for programmatic handling */
  code: string;
  /** Human-readable description */
  message: string;
  /** Affected panel IDs (optional) */
  panelIds?: string[];
  /** Additional context for debugging/display */
  context?: Record<string, string | number | boolean | null>;
}

/**
 * Result of running advanced tolerance checks.
 * Compatible with gate system output pattern.
 */
export interface ToleranceCheckResult {
  /** True if no BLOCKER findings */
  ok: boolean;
  /** All findings */
  findings: ToleranceFinding[];
  /** Count of blockers */
  blockerCount: number;
  /** Count of warnings */
  warningCount: number;
  /** Count of info items */
  infoCount: number;
}

// ---- Issue Code Constants ----

export const TOLERANCE_CODES = {
  // Machine tolerance
  B_CUT_DEVIATION: 'B_CUT_DEVIATION',
  W_CUT_NEAR_LIMIT: 'W_CUT_NEAR_LIMIT',
  B_DRILL_POSITION_DEVIATION: 'B_DRILL_POSITION_DEVIATION',
  W_DRILL_POSITION_NEAR_LIMIT: 'W_DRILL_POSITION_NEAR_LIMIT',
  // Clearance
  B_PANEL_CLEARANCE: 'B_PANEL_CLEARANCE',
  W_PANEL_CLEARANCE_TIGHT: 'W_PANEL_CLEARANCE_TIGHT',
  // Edge banding
  B_EDGE_BAND_DEVIATION: 'B_EDGE_BAND_DEVIATION',
  W_EDGE_BAND_ON_SOLID_WOOD: 'W_EDGE_BAND_ON_SOLID_WOOD',
  // Panel dimension sanity
  B_PANEL_TOO_SMALL: 'B_PANEL_TOO_SMALL',
  B_PANEL_TOO_LARGE: 'B_PANEL_TOO_LARGE',
  W_PANEL_NEAR_MIN: 'W_PANEL_NEAR_MIN',
  W_PANEL_NEAR_MAX: 'W_PANEL_NEAR_MAX',
} as const;

// ---- Input Types for Advanced Checks ----

/**
 * Panel specification for tolerance validation.
 * Simplified from CabinetPanel to decouple from full Cabinet type.
 */
export interface TolerancePanelSpec {
  id: string;
  name: string;
  /** Finish width in mm */
  finishWidth: number;
  /** Finish height in mm */
  finishHeight: number;
  /** Material category for the panel */
  material: MaterialCategory;
  /** Which edges have banding applied */
  edgeBanding: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
}

/**
 * Cut operation for machine tolerance validation.
 */
export interface CutOperation {
  /** Panel ID this cut belongs to */
  panelId: string;
  /** Nominal target dimension (mm) */
  nominalDimension: number;
  /** Actual/measured dimension (mm), for post-cut validation */
  actualDimension: number;
}

/**
 * Drill position for machine tolerance validation.
 */
export interface DrillPosition {
  /** Panel ID this drill belongs to */
  panelId: string;
  /** Nominal X position (mm) */
  nominalX: number;
  /** Nominal Y position (mm) */
  nominalY: number;
  /** Actual X position (mm) */
  actualX: number;
  /** Actual Y position (mm) */
  actualY: number;
}

/**
 * Adjacent panel pair for clearance validation.
 */
export interface PanelPair {
  /** First panel ID */
  panelAId: string;
  /** Second panel ID */
  panelBId: string;
  /** Measured gap between panels (mm) */
  gapMM: number;
}

/**
 * Edge banding placement for tolerance validation.
 */
export interface EdgeBandPlacement {
  /** Panel ID */
  panelId: string;
  /** Which edge: top, bottom, left, right */
  edge: 'top' | 'bottom' | 'left' | 'right';
  /** Nominal position offset (mm) - should be 0 for perfect alignment */
  nominalOffset: number;
  /** Actual measured offset from nominal (mm) */
  actualOffset: number;
}

// ============================================
// MACHINE TOLERANCE VALIDATION
// ============================================

/**
 * Validate CNC cut operations against machine tolerance (+-0.1mm).
 *
 * Compares nominal vs actual cut dimensions and flags deviations
 * that exceed machine tolerance.
 *
 * @param cuts - Array of cut operations with nominal and actual dimensions
 * @returns Array of tolerance findings
 */
export function validateMachineCuts(cuts: CutOperation[]): ToleranceFinding[] {
  const findings: ToleranceFinding[] = [];
  const tolerance = MACHINE_TOLERANCES.CUT_TOLERANCE;

  for (const cut of cuts) {
    const deviation = Math.abs(cut.actualDimension - cut.nominalDimension);

    if (deviation > tolerance) {
      findings.push({
        id: `tol-cut-${cut.panelId}-${cut.nominalDimension}`,
        severity: 'BLOCKER',
        code: TOLERANCE_CODES.B_CUT_DEVIATION,
        message: `Cut deviation ${deviation.toFixed(2)}mm exceeds machine tolerance of ${tolerance}mm (nominal: ${cut.nominalDimension}mm, actual: ${cut.actualDimension}mm)`,
        panelIds: [cut.panelId],
        context: {
          nominalMm: cut.nominalDimension,
          actualMm: cut.actualDimension,
          deviationMm: Math.round(deviation * 100) / 100,
          toleranceMm: tolerance,
        },
      });
    } else if (deviation > tolerance * 0.8) {
      findings.push({
        id: `tol-cut-warn-${cut.panelId}-${cut.nominalDimension}`,
        severity: 'WARNING',
        code: TOLERANCE_CODES.W_CUT_NEAR_LIMIT,
        message: `Cut deviation ${deviation.toFixed(2)}mm is near machine tolerance limit of ${tolerance}mm`,
        panelIds: [cut.panelId],
        context: {
          nominalMm: cut.nominalDimension,
          actualMm: cut.actualDimension,
          deviationMm: Math.round(deviation * 100) / 100,
          toleranceMm: tolerance,
        },
      });
    }
  }

  return findings;
}

/**
 * Validate CNC drill positions against position tolerance (+-0.5mm).
 *
 * Checks that drill holes are within acceptable positional tolerance
 * from their nominal positions.
 *
 * @param drills - Array of drill positions with nominal and actual coordinates
 * @returns Array of tolerance findings
 */
export function validateDrillPositions(drills: DrillPosition[]): ToleranceFinding[] {
  const findings: ToleranceFinding[] = [];
  const tolerance = MACHINE_TOLERANCES.DRILL_POSITION_TOLERANCE;

  for (const drill of drills) {
    const dx = drill.actualX - drill.nominalX;
    const dy = drill.actualY - drill.nominalY;
    const deviation = Math.sqrt(dx * dx + dy * dy);

    if (deviation > tolerance) {
      findings.push({
        id: `tol-drill-${drill.panelId}-${drill.nominalX}-${drill.nominalY}`,
        severity: 'BLOCKER',
        code: TOLERANCE_CODES.B_DRILL_POSITION_DEVIATION,
        message: `Drill position deviation ${deviation.toFixed(2)}mm exceeds tolerance of ${tolerance}mm at (${drill.nominalX}, ${drill.nominalY})`,
        panelIds: [drill.panelId],
        context: {
          nominalX: drill.nominalX,
          nominalY: drill.nominalY,
          actualX: drill.actualX,
          actualY: drill.actualY,
          deviationMm: Math.round(deviation * 100) / 100,
          toleranceMm: tolerance,
        },
      });
    } else if (deviation > tolerance * 0.8) {
      findings.push({
        id: `tol-drill-warn-${drill.panelId}-${drill.nominalX}-${drill.nominalY}`,
        severity: 'WARNING',
        code: TOLERANCE_CODES.W_DRILL_POSITION_NEAR_LIMIT,
        message: `Drill position deviation ${deviation.toFixed(2)}mm is near tolerance limit of ${tolerance}mm`,
        panelIds: [drill.panelId],
        context: {
          nominalX: drill.nominalX,
          nominalY: drill.nominalY,
          deviationMm: Math.round(deviation * 100) / 100,
          toleranceMm: tolerance,
        },
      });
    }
  }

  return findings;
}

// ============================================
// CLEARANCE VALIDATION
// ============================================

/**
 * Validate gaps between adjacent panels (minimum 2mm clearance).
 *
 * Checks that there is sufficient clearance between neighboring panels
 * to prevent assembly issues and allow for material expansion.
 *
 * @param pairs - Array of adjacent panel pairs with measured gaps
 * @returns Array of tolerance findings
 */
export function validatePanelClearance(pairs: PanelPair[]): ToleranceFinding[] {
  const findings: ToleranceFinding[] = [];
  const minGap = MACHINE_TOLERANCES.MIN_PANEL_CLEARANCE;

  for (const pair of pairs) {
    if (pair.gapMM < 0) {
      // Panels are overlapping - always a blocker
      findings.push({
        id: `tol-clearance-${pair.panelAId}-${pair.panelBId}`,
        severity: 'BLOCKER',
        code: TOLERANCE_CODES.B_PANEL_CLEARANCE,
        message: `Panels overlap by ${Math.abs(pair.gapMM).toFixed(1)}mm. Minimum gap is ${minGap}mm.`,
        panelIds: [pair.panelAId, pair.panelBId],
        context: {
          gapMm: pair.gapMM,
          minGapMm: minGap,
        },
      });
    } else if (pair.gapMM < minGap) {
      findings.push({
        id: `tol-clearance-${pair.panelAId}-${pair.panelBId}`,
        severity: 'BLOCKER',
        code: TOLERANCE_CODES.B_PANEL_CLEARANCE,
        message: `Gap ${pair.gapMM.toFixed(1)}mm between panels is below minimum ${minGap}mm.`,
        panelIds: [pair.panelAId, pair.panelBId],
        context: {
          gapMm: pair.gapMM,
          minGapMm: minGap,
        },
      });
    } else if (pair.gapMM < minGap * 1.5) {
      findings.push({
        id: `tol-clearance-warn-${pair.panelAId}-${pair.panelBId}`,
        severity: 'WARNING',
        code: TOLERANCE_CODES.W_PANEL_CLEARANCE_TIGHT,
        message: `Gap ${pair.gapMM.toFixed(1)}mm between panels is tight (recommended: >${(minGap * 1.5).toFixed(1)}mm).`,
        panelIds: [pair.panelAId, pair.panelBId],
        context: {
          gapMm: pair.gapMM,
          minGapMm: minGap,
          recommendedMinMm: minGap * 1.5,
        },
      });
    }
  }

  return findings;
}

// ============================================
// EDGE BANDING PLACEMENT TOLERANCE
// ============================================

/**
 * Validate edge banding placement tolerance (+-0.3mm).
 *
 * Checks that edge banding is positioned within acceptable tolerance.
 * Also warns if edge banding is applied to solid wood (not recommended).
 *
 * @param placements - Array of edge band placements to validate
 * @param panels - Panel specs for material-based warnings
 * @returns Array of tolerance findings
 */
export function validateEdgeBanding(
  placements: EdgeBandPlacement[],
  panels: TolerancePanelSpec[]
): ToleranceFinding[] {
  const findings: ToleranceFinding[] = [];
  const tolerance = MACHINE_TOLERANCES.EDGE_BANDING_TOLERANCE;

  // Build panel lookup
  const panelMap = new Map<string, TolerancePanelSpec>();
  for (const p of panels) {
    panelMap.set(p.id, p);
  }

  // Check placements
  for (const placement of placements) {
    const deviation = Math.abs(placement.actualOffset - placement.nominalOffset);

    if (deviation > tolerance) {
      findings.push({
        id: `tol-edge-${placement.panelId}-${placement.edge}`,
        severity: 'BLOCKER',
        code: TOLERANCE_CODES.B_EDGE_BAND_DEVIATION,
        message: `Edge banding on ${placement.edge} side offset by ${deviation.toFixed(2)}mm exceeds tolerance of ${tolerance}mm`,
        panelIds: [placement.panelId],
        context: {
          edge: placement.edge,
          nominalOffsetMm: placement.nominalOffset,
          actualOffsetMm: placement.actualOffset,
          deviationMm: Math.round(deviation * 100) / 100,
          toleranceMm: tolerance,
        },
      });
    }
  }

  // Material-based warnings: edge banding on solid wood
  for (const panel of panels) {
    if (panel.material !== 'SOLID_WOOD') continue;
    const hasAnyEdgeBanding =
      panel.edgeBanding.top ||
      panel.edgeBanding.bottom ||
      panel.edgeBanding.left ||
      panel.edgeBanding.right;

    if (hasAnyEdgeBanding) {
      findings.push({
        id: `tol-edge-material-${panel.id}`,
        severity: 'WARNING',
        code: TOLERANCE_CODES.W_EDGE_BAND_ON_SOLID_WOOD,
        message: `Edge banding applied to solid wood panel "${panel.name}". Solid wood movement may cause delamination.`,
        panelIds: [panel.id],
        context: {
          material: panel.material,
          panelName: panel.name,
        },
      });
    }
  }

  return findings;
}

// ============================================
// PANEL DIMENSION SANITY CHECKS
// ============================================

/**
 * Validate panel dimensions are within sane manufacturing limits.
 *
 * Checks:
 * - Minimum 50mm in any dimension (below this, CNC handling is unreliable)
 * - Maximum 2440mm (standard sheet stock size)
 * - Warning zones near limits
 *
 * @param panels - Array of panel specs to validate
 * @returns Array of tolerance findings
 */
export function validatePanelDimensions(panels: TolerancePanelSpec[]): ToleranceFinding[] {
  const findings: ToleranceFinding[] = [];
  const minDim = MACHINE_TOLERANCES.MIN_PANEL_DIMENSION;
  const maxDim = MACHINE_TOLERANCES.MAX_PANEL_DIMENSION;
  // Warning zone: within 20% of limits
  const nearMinThreshold = minDim * 1.5; // 75mm
  const nearMaxThreshold = maxDim * 0.95; // 2318mm

  for (const panel of panels) {
    const dims = [
      { label: 'width', value: panel.finishWidth },
      { label: 'height', value: panel.finishHeight },
    ];

    for (const dim of dims) {
      // Below minimum - blocker
      if (dim.value < minDim) {
        findings.push({
          id: `tol-dim-min-${panel.id}-${dim.label}`,
          severity: 'BLOCKER',
          code: TOLERANCE_CODES.B_PANEL_TOO_SMALL,
          message: `Panel "${panel.name}" ${dim.label} ${dim.value}mm is below minimum ${minDim}mm. CNC handling unreliable.`,
          panelIds: [panel.id],
          context: {
            dimension: dim.label,
            valueMm: dim.value,
            minMm: minDim,
          },
        });
      }
      // Near minimum - warning
      else if (dim.value < nearMinThreshold) {
        findings.push({
          id: `tol-dim-near-min-${panel.id}-${dim.label}`,
          severity: 'WARNING',
          code: TOLERANCE_CODES.W_PANEL_NEAR_MIN,
          message: `Panel "${panel.name}" ${dim.label} ${dim.value}mm is near minimum limit (${minDim}mm). Consider design review.`,
          panelIds: [panel.id],
          context: {
            dimension: dim.label,
            valueMm: dim.value,
            minMm: minDim,
            warningThresholdMm: nearMinThreshold,
          },
        });
      }

      // Above maximum - blocker
      if (dim.value > maxDim) {
        findings.push({
          id: `tol-dim-max-${panel.id}-${dim.label}`,
          severity: 'BLOCKER',
          code: TOLERANCE_CODES.B_PANEL_TOO_LARGE,
          message: `Panel "${panel.name}" ${dim.label} ${dim.value}mm exceeds maximum ${maxDim}mm (standard sheet size).`,
          panelIds: [panel.id],
          context: {
            dimension: dim.label,
            valueMm: dim.value,
            maxMm: maxDim,
          },
        });
      }
      // Near maximum - warning
      else if (dim.value > nearMaxThreshold) {
        findings.push({
          id: `tol-dim-near-max-${panel.id}-${dim.label}`,
          severity: 'WARNING',
          code: TOLERANCE_CODES.W_PANEL_NEAR_MAX,
          message: `Panel "${panel.name}" ${dim.label} ${dim.value}mm is near maximum sheet size (${maxDim}mm). Material waste likely high.`,
          panelIds: [panel.id],
          context: {
            dimension: dim.label,
            valueMm: dim.value,
            maxMm: maxDim,
            warningThresholdMm: nearMaxThreshold,
          },
        });
      }
    }
  }

  return findings;
}

// ============================================
// COMBINED ADVANCED TOLERANCE CHECK
// ============================================

/**
 * Input for running all advanced tolerance checks at once.
 */
export interface AdvancedToleranceInput {
  /** Panels to validate dimensions */
  panels: TolerancePanelSpec[];
  /** Cut operations for machine tolerance validation (optional) */
  cuts?: CutOperation[];
  /** Drill positions for position tolerance validation (optional) */
  drills?: DrillPosition[];
  /** Adjacent panel pairs for clearance validation (optional) */
  panelPairs?: PanelPair[];
  /** Edge banding placements for tolerance validation (optional) */
  edgeBandPlacements?: EdgeBandPlacement[];
}

/**
 * Run all advanced tolerance checks and aggregate results.
 *
 * This is the main entry point for comprehensive manufacturing tolerance
 * validation. It runs all sub-checks and combines findings into a single
 * result compatible with the gate system.
 *
 * @param input - All data needed for tolerance validation
 * @returns Combined tolerance check result
 */
export function runAdvancedToleranceChecks(
  input: AdvancedToleranceInput
): ToleranceCheckResult {
  const findings: ToleranceFinding[] = [];

  // 1. Panel dimension sanity checks (always run)
  findings.push(...validatePanelDimensions(input.panels));

  // 2. Machine cut tolerance (if cut data provided)
  if (input.cuts && input.cuts.length > 0) {
    findings.push(...validateMachineCuts(input.cuts));
  }

  // 3. Drill position tolerance (if drill data provided)
  if (input.drills && input.drills.length > 0) {
    findings.push(...validateDrillPositions(input.drills));
  }

  // 4. Panel clearance validation (if pairs provided)
  if (input.panelPairs && input.panelPairs.length > 0) {
    findings.push(...validatePanelClearance(input.panelPairs));
  }

  // 5. Edge banding tolerance (if placements provided)
  if (input.edgeBandPlacements && input.edgeBandPlacements.length > 0) {
    findings.push(...validateEdgeBanding(input.edgeBandPlacements, input.panels));
  }

  // Also check for edge banding material warnings even without placements
  if (!input.edgeBandPlacements || input.edgeBandPlacements.length === 0) {
    findings.push(...validateEdgeBanding([], input.panels));
  }

  const blockerCount = findings.filter(f => f.severity === 'BLOCKER').length;
  const warningCount = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount = findings.filter(f => f.severity === 'INFO').length;

  return {
    ok: blockerCount === 0,
    findings,
    blockerCount,
    warningCount,
    infoCount,
  };
}
