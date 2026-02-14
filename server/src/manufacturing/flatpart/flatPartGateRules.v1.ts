/**
 * flatPartGateRules.v1.ts - Gate Rule Pack v1
 *
 * Validation rules blocking spec.freeze and manufacturing.exportDXF.
 * All rules have unique IDs for traceability.
 *
 * @version P14A.2
 */

// ============================================================================
// Rule IDs
// ============================================================================

export const GATE_RULE_IDS = {
  // Dimension Rules
  CUT_SIZE_MIN: 'GATE_CUT_SIZE_MIN',
  CUT_SIZE_MAX: 'GATE_CUT_SIZE_MAX',
  CUT_SIZE_MISMATCH: 'GATE_CUT_SIZE_MISMATCH',
  FINISH_SIZE_INVALID: 'GATE_FINISH_SIZE_INVALID',

  // Contour Rules
  OUTER_NOT_CLOSED: 'GATE_OUTER_NOT_CLOSED',
  OUTER_INVALID: 'GATE_OUTER_INVALID',

  // Drill Rules
  HOLE_TOO_DEEP: 'GATE_HOLE_TOO_DEEP',
  HOLE_OUTSIDE_PART: 'GATE_HOLE_OUTSIDE_PART',
  HOLE_EDGE_CLEARANCE: 'GATE_HOLE_EDGE_CLEARANCE',
  HOLE_DIAMETER_INVALID: 'GATE_HOLE_DIAMETER_INVALID',

  // Pocket Rules
  POCKET_TOO_DEEP: 'GATE_POCKET_TOO_DEEP',
  POCKET_OUTSIDE_PART: 'GATE_POCKET_OUTSIDE_PART',
  POCKET_SIZE_INVALID: 'GATE_POCKET_SIZE_INVALID',

  // Groove Rules
  GROOVE_TOO_DEEP: 'GATE_GROOVE_TOO_DEEP',
  GROOVE_OUTSIDE_PART: 'GATE_GROOVE_OUTSIDE_PART',
  GROOVE_WIDTH_INVALID: 'GATE_GROOVE_WIDTH_INVALID',

  // Material Rules
  MATERIAL_MISSING: 'GATE_MATERIAL_MISSING',
  EDGE_BAND_CONFLICT: 'GATE_EDGE_BAND_CONFLICT',
} as const;

export type GateRuleId = (typeof GATE_RULE_IDS)[keyof typeof GATE_RULE_IDS];

// ============================================================================
// Machine Constraints
// ============================================================================

export const MACHINE_LIMITS = {
  /** Minimum cut dimension (mm) - CNC bed minimum */
  MIN_CUT_SIZE: 50,

  /** Maximum cut dimension (mm) - CNC bed X/Y limit */
  MAX_CUT_SIZE: 2800,

  /** Minimum drill diameter (mm) */
  MIN_DRILL_DIAMETER: 2,

  /** Maximum drill diameter (mm) */
  MAX_DRILL_DIAMETER: 35,

  /** Minimum pocket width/height (mm) */
  MIN_POCKET_SIZE: 5,

  /** Minimum groove width (mm) */
  MIN_GROOVE_WIDTH: 2,

  /** Maximum groove width (mm) */
  MAX_GROOVE_WIDTH: 10,
} as const;

// ============================================================================
// Safety Margins
// ============================================================================

export const SAFETY_MARGINS = {
  /** Blind hole depth margin from back face (mm) */
  DRILL_DEPTH_MARGIN: 2,

  /** Pocket depth margin from back face (mm) */
  POCKET_DEPTH_MARGIN: 2,

  /** Groove depth margin from back face (mm) */
  GROOVE_DEPTH_MARGIN: 2,

  /** Minimum distance from hole edge to edge band (mm) */
  HOLE_TO_EDGE_BAND: 8,

  /** Minimum distance from feature to part edge (mm) */
  FEATURE_TO_EDGE: 5,
} as const;

// ============================================================================
// Tolerance
// ============================================================================

export const TOLERANCE = {
  /** Dimension comparison tolerance (mm) */
  DIMENSION: 0.1,

  /** Position comparison tolerance (mm) */
  POSITION: 0.01,

  /** Angle comparison tolerance (degrees) */
  ANGLE: 0.5,
} as const;

// ============================================================================
// Suggested Fixes Mapping
// ============================================================================

/**
 * Map rule ID to suggested fix command
 */
export const SUGGESTED_FIXES: Partial<Record<GateRuleId, string>> = {
  [GATE_RULE_IDS.CUT_SIZE_MIN]: 'cmd:increase_panel_width',
  [GATE_RULE_IDS.CUT_SIZE_MAX]: 'cmd:reduce_panel_width',
  [GATE_RULE_IDS.CUT_SIZE_MISMATCH]: 'cmd:recalculate_cut_size',
  [GATE_RULE_IDS.HOLE_TOO_DEEP]: 'cmd:reduce_drill_depth',
  [GATE_RULE_IDS.HOLE_EDGE_CLEARANCE]: 'cmd:move_hole_from_edge',
  [GATE_RULE_IDS.HOLE_OUTSIDE_PART]: 'cmd:move_hole_inside',
  [GATE_RULE_IDS.POCKET_TOO_DEEP]: 'cmd:reduce_pocket_depth',
  [GATE_RULE_IDS.POCKET_OUTSIDE_PART]: 'cmd:move_pocket_inside',
  [GATE_RULE_IDS.GROOVE_TOO_DEEP]: 'cmd:reduce_groove_depth',
};

// ============================================================================
// Rule Definitions
// ============================================================================

export interface GateRuleDef {
  id: GateRuleId;
  description: string;
  severity: 'ERROR' | 'WARN';
  blocks: ('freeze' | 'export')[];
}

export const GATE_RULES: GateRuleDef[] = [
  // Dimension Rules
  {
    id: GATE_RULE_IDS.CUT_SIZE_MIN,
    description: 'Cut dimension below machine minimum',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.CUT_SIZE_MAX,
    description: 'Cut dimension exceeds machine maximum',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.CUT_SIZE_MISMATCH,
    description: 'Cut size does not match finish size minus edge bands',
    severity: 'WARN',
    blocks: ['freeze'],
  },

  // Contour Rules
  {
    id: GATE_RULE_IDS.OUTER_NOT_CLOSED,
    description: 'Outer contour is not closed',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.OUTER_INVALID,
    description: 'Outer contour has invalid dimensions',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },

  // Drill Rules
  {
    id: GATE_RULE_IDS.HOLE_TOO_DEEP,
    description: 'Blind hole depth exceeds safe limit for core thickness',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.HOLE_OUTSIDE_PART,
    description: 'Hole position is outside part boundary',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.HOLE_EDGE_CLEARANCE,
    description: 'Hole is too close to edge band',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.HOLE_DIAMETER_INVALID,
    description: 'Hole diameter is outside valid range',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },

  // Pocket Rules
  {
    id: GATE_RULE_IDS.POCKET_TOO_DEEP,
    description: 'Pocket depth exceeds safe limit for core thickness',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.POCKET_OUTSIDE_PART,
    description: 'Pocket extends outside part boundary',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.POCKET_SIZE_INVALID,
    description: 'Pocket dimensions are too small',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },

  // Groove Rules
  {
    id: GATE_RULE_IDS.GROOVE_TOO_DEEP,
    description: 'Groove depth exceeds safe limit for core thickness',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.GROOVE_OUTSIDE_PART,
    description: 'Groove extends outside part boundary',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.GROOVE_WIDTH_INVALID,
    description: 'Groove width is outside valid range',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },

  // Material Rules
  {
    id: GATE_RULE_IDS.MATERIAL_MISSING,
    description: 'Core material is not specified',
    severity: 'ERROR',
    blocks: ['freeze', 'export'],
  },
  {
    id: GATE_RULE_IDS.EDGE_BAND_CONFLICT,
    description: 'Edge band configuration conflict',
    severity: 'WARN',
    blocks: ['freeze'],
  },
];

// ============================================================================
// Gate Version
// ============================================================================

export const GATE_VERSION = 'GATE_RULES_V1';
