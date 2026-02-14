/**
 * Gate Validation Types
 *
 * @module gate/types
 * @version 0.1.0
 *
 * Type definitions for the Gate manufacturing validation system.
 *
 * ## Philosophy
 * "โรงงานก่อน ความสวยทีหลัง" (Factory first, aesthetics second)
 *
 * The Gate system ensures designs are manufacturable before they reach
 * the factory floor, preventing costly errors and machine damage.
 *
 * ## Severity Levels
 * - **BLOCKER**: Must be fixed before manufacturing (hard stop)
 * - **WARNING**: Should be reviewed, may indicate issues
 * - **INFO**: Informational notes, no action required
 */

import type { Severity } from '../spec';

// ============================================
// RULE & ISSUE TYPES
// ============================================

/**
 * Identifier for validation rules.
 *
 * Each rule checks a specific aspect of manufacturability.
 *
 * @see {@link ../rules} for rule implementations
 */
export type RuleId =
  | 'CUTSIZE_NONNEGATIVE'
  | 'EDGE_ALLOWANCE'
  | 'MIN_MARGINS'
  | 'CLEARANCE_BACKPANEL'
  | 'DRILL_DEPTH_SAFETY'
  | 'FITTING_SPACING'
  // G4: Geometry Safety Gate
  | 'G4_OD_BUDGET'
  | 'G4_PANEL_OVERLAP'
  | 'G4_EDGE_FEASIBILITY'
  // G11: Minifix/System32/Dowel Validation
  | 'G11_DISTANCE_B'
  | 'G11_DOWEL_DEPTH'
  | 'G11_DRILL_TYPE'
  | 'G11_MATING_ALIGNMENT';

/**
 * A validation issue detected by the Gate system.
 *
 * Issues are the primary output of gate validation, representing
 * problems or concerns with the design's manufacturability.
 *
 * @example
 * {
 *   id: 'issue_a1b2c3d4',
 *   severity: 'BLOCKER',
 *   code: 'B_SAFETY_DRILL_DEPTH',
 *   message: 'Drill depth 18mm exceeds safe max 15.5mm',
 *   partIds: ['panel-left-side'],
 *   context: { depthMm: 18, maxDepthMm: 15.5 }
 * }
 */
export type GateIssue = {
  /** Deterministic or sequential unique identifier */
  id: string;
  /** Severity level: 'BLOCKER' | 'WARNING' | 'INFO' */
  severity: Severity;
  /** Stable issue code for programmatic handling (e.g., 'B_SAFETY_DRILL_DEPTH') */
  code: string;
  /** Human-readable description of the issue */
  message: string;
  /** IDs of affected parts (optional) */
  partIds?: string[];
  /** Additional context for debugging/display (optional) */
  context?: Record<string, string | number | boolean | null>;
};

/**
 * Aggregate metrics from a gate validation run.
 *
 * Used for summary statistics and go/no-go decisions.
 *
 * @example
 * { partsCount: 12, blockers: 0, warnings: 2, info: 5 }
 */
export type GateMetrics = {
  /** Total number of parts validated */
  partsCount: number;
  /** Count of BLOCKER severity issues */
  blockers: number;
  /** Count of WARNING severity issues */
  warnings: number;
  /** Count of INFO severity issues */
  info: number;
};

// ============================================
// POLICY
// ============================================

/**
 * Configuration policy for gate validation rules.
 *
 * Policies define thresholds and constraints that rules use for validation.
 * Different factories may have different policies based on their equipment
 * and quality standards.
 *
 * @example
 * const defaultPolicy: GatePolicy = {
 *   policyVersion: '1.0.0',
 *   thicknessSafetyMarginMm: 0.5,
 *   minMarginToEdgeMm: 8,
 *   minFeatureSizeMm: 12,
 *   backPanelClearanceMm: 2,
 *   shelfToBackClearanceMm: 1,
 *   minFittingSpacingMm: 32,
 *   minSetbackFromEdgeMm: 18,
 *   minCutDimensionMm: 20,
 * };
 */
export type GatePolicy = {
  /** Semantic version for policy compatibility tracking */
  policyVersion: string;

  // Safety margins
  /** Minimum material remaining after drilling (e.g., 0.5mm) */
  thicknessSafetyMarginMm: number;
  /** Minimum distance from drill to panel edge (e.g., 8mm) */
  minMarginToEdgeMm: number;
  /** Minimum size for any CNC feature (e.g., 12mm) */
  minFeatureSizeMm: number;

  // Clearance rules
  /** Required clearance between shelves and back panel (e.g., 2mm) */
  backPanelClearanceMm: number;
  /** Minimum shelf setback from back (e.g., 1mm) */
  shelfToBackClearanceMm: number;

  // Fitting rules
  /** Minimum distance between fittings (e.g., 32mm for System 32) */
  minFittingSpacingMm: number;
  /** Minimum fitting distance from edge (e.g., 18mm for Minifix) */
  minSetbackFromEdgeMm: number;

  // Cut rules
  /** Minimum cut dimension for CNC saw (e.g., 20mm) */
  minCutDimensionMm: number;
};

// ============================================
// MATERIAL & EDGE SPECS
// ============================================

/**
 * Edge side identifier.
 *
 * - 'L': Left edge
 * - 'R': Right edge
 * - 'T': Top edge
 * - 'B': Bottom edge
 */
export type EdgeSide = 'L' | 'R' | 'T' | 'B';

/**
 * Edge banding specification for one side of a panel.
 *
 * Edge bands are applied to raw cut edges for aesthetics and durability.
 * The specification affects cut size calculations.
 *
 * @example
 * // 2mm ABS edge with 0.3mm premill
 * { enabled: true, thicknessMm: 2, premillMm: 0.3 }
 *
 * // No edge band
 * { enabled: false, thicknessMm: 0, premillMm: 0 }
 */
export type EdgeSpec = {
  /** Whether edge banding is applied to this side */
  enabled: boolean;
  /** Edge band thickness in mm (subtracted from cut size) */
  thicknessMm: number;
  /** Premill allowance in mm (added to cut size for CNC edge prep) */
  premillMm: number;
};

/**
 * Composite material specification for panel thickness calculation.
 *
 * Panels typically have a core material with surface treatments on
 * both faces. Total thickness = core + surfaceA + surfaceB.
 *
 * @example
 * // 16mm particleboard with 0.2mm melamine both sides
 * {
 *   coreThicknessMm: 16,
 *   surfaceAThicknessMm: 0.2,
 *   surfaceBThicknessMm: 0.2,
 * }
 * // Total: 16.4mm
 *
 * @see {@link compositeThicknessMm} for thickness calculation
 */
export type MaterialSpec = {
  /** Core material thickness in mm (e.g., 16, 18, 19) */
  coreThicknessMm: number;
  /** Surface A (visible face) thickness in mm */
  surfaceAThicknessMm: number;
  /** Surface B (back face) thickness in mm */
  surfaceBThicknessMm: number;
};

// ============================================
// PART SPEC
// ============================================

/**
 * Specification for a single panel/part in the design.
 *
 * Contains all information needed to calculate cut sizes, validate
 * drill depths, and check manufacturing constraints.
 *
 * @example
 * {
 *   partId: 'left-side-panel',
 *   name: 'Left Side',
 *   finishW: 600,
 *   finishH: 720,
 *   material: { coreThicknessMm: 16, surfaceAThicknessMm: 0.2, surfaceBThicknessMm: 0.2 },
 *   edges: {
 *     L: { enabled: true, thicknessMm: 2, premillMm: 0.3 },
 *     R: { enabled: true, thicknessMm: 2, premillMm: 0.3 },
 *     T: { enabled: false, thicknessMm: 0, premillMm: 0 },
 *     B: { enabled: false, thicknessMm: 0, premillMm: 0 },
 *   },
 *   tags: ['SIDE_PANEL'],
 * }
 */
export type PartSpec = {
  /** Unique identifier for the part */
  partId: string;
  /** Human-readable name */
  name: string;
  /** Finish width in mm (after edge banding) */
  finishW: number;
  /** Finish height in mm (after edge banding) */
  finishH: number;
  /** Material specification for thickness calculations */
  material: MaterialSpec;
  /** Edge banding configuration for each side */
  edges: Record<EdgeSide, EdgeSpec>;
  /** Tags for rule filtering (e.g., 'SHELF', 'BACK_PANEL', 'SIDE_PANEL') */
  tags?: string[];
};

// ============================================
// OPERATIONS & FITTINGS
// ============================================

/**
 * Drill operation specification.
 *
 * Represents a single drilling operation on a panel, used for
 * depth safety and margin validation.
 *
 * @example
 * {
 *   opId: 'drill-shelf-pin-1',
 *   partId: 'left-side-panel',
 *   x: 37,      // 37mm from left edge (System 32 first hole)
 *   y: 100,     // 100mm from bottom
 *   depthMm: 13, // 13mm deep for shelf pin
 *   diaMm: 5,    // 5mm diameter
 * }
 */
export type DrillOp = {
  /** Unique identifier for this operation */
  opId: string;
  /** ID of the part this operation is on */
  partId: string;
  /** X position in mm from panel origin */
  x: number;
  /** Y position in mm from panel origin */
  y: number;
  /** Drill depth in mm */
  depthMm: number;
  /** Drill diameter in mm (optional) */
  diaMm?: number;
};

/**
 * Hardware fitting placement intent.
 *
 * Represents where a hardware fitting will be placed, used for
 * spacing validation between fittings.
 *
 * @example
 * {
 *   fittingId: 'minifix-cam-1',
 *   partId: 'shelf-panel',
 *   x: 50,
 *   y: 37,
 *   groupKey: 'left-joint', // Group with related fittings
 * }
 */
export type FittingIntent = {
  /** Unique identifier for this fitting */
  fittingId: string;
  /** ID of the part this fitting is on */
  partId: string;
  /** X position in mm from panel origin */
  x: number;
  /** Y position in mm from panel origin */
  y: number;
  /** Optional grouping key for related fittings */
  groupKey?: string;
};

// ============================================
// GATE INPUT / OUTPUT
// ============================================

/**
 * Input data for gate validation.
 *
 * Contains all design data needed to run validation rules:
 * parts, drill operations, fitting placements, and cabinet metadata.
 *
 * @example
 * const input: GateInput = {
 *   snapshotId: 'snapshot-2024-01-15-001',
 *   parts: [leftSidePanel, rightSidePanel, topPanel, bottomPanel],
 *   drillOps: [shelfPinHoles, minifixCamHoles],
 *   fittings: [minifixCams, minifixBolts],
 *   cabinet: { backPanelThicknessMm: 4 },
 * };
 */
export type GateInput = {
  /** Unique identifier for this design snapshot */
  snapshotId: string;
  /** Array of part specifications to validate */
  parts: PartSpec[];
  /** Array of drill operations (v0.1 assumes pre-resolved) */
  drillOps: DrillOp[];
  /** Array of fitting placements (v0.1 assumes pre-resolved) */
  fittings: FittingIntent[];
  /** Cabinet-level metadata for clearance rules */
  cabinet?: {
    /** Back panel thickness in mm (for clearance calculations) */
    backPanelThicknessMm?: number;
  };
};

/**
 * Output from gate validation.
 *
 * Contains all detected issues and aggregate metrics for
 * reporting and go/no-go decisions.
 *
 * @example
 * const output: GateOutput = {
 *   issues: [
 *     { id: 'issue_abc123', severity: 'WARNING', code: 'W_PREMILL_GT_EDGE', ... }
 *   ],
 *   metrics: { partsCount: 8, blockers: 0, warnings: 1, info: 0 },
 * };
 *
 * // Go/no-go decision
 * if (output.metrics.blockers === 0) {
 *   console.log('Design is manufacturable!');
 * }
 */
export type GateOutput = {
  /** Array of all detected validation issues */
  issues: GateIssue[];
  /** Aggregate metrics for summary reporting */
  metrics: GateMetrics;
};
