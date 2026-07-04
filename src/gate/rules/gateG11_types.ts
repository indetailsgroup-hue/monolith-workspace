/**
 * Gate G11 Types - Minifix/System32/Dowel Validation
 *
 * @module gate/rules/gateG11_types
 * @version 2.0.0 (v4.0 Side-covers-Top Construction)
 *
 * Type definitions for the G11 gate validation system.
 * Based on the Canonical Engineering Specification (CANONICAL_SPEC.md).
 *
 * ## Construction Type: Side-covers-Top/Bottom (v4.0)
 * Standard Häfele Minifix S200 configuration where SIDE panels cover
 * the ends of TOP/BOTTOM panels.
 *
 * ## Rule Set
 * - G11.1: Distance B - measured from mate edge (LEFT/RIGHT), not FRONT
 * - G11.2: Dowel Depth - SIDE=12mm (FACE_BORE), TOP/BOTTOM=18mm (EDGE_BORE)
 * - G11.3: Drill Type - BOLT/DOWEL on SIDE=FACE, CAM on TOP/BOTTOM=FACE, DOWEL on TOP/BOTTOM=EDGE
 * - G11.4: Mating Alignment - world-space dowel alignment ≤0.1mm
 */

import type { Severity } from '../../spec';

// ============================================
// CONSTANTS (Häfele Engineering Standards)
// ============================================

/**
 * Häfele Minifix S200 engineering constants.
 * Single Source of Truth from CANONICAL_SPEC.md.
 *
 * v4.0 Side-covers-Top Construction:
 * - SIDE panels: FACE bore (drilling into inner face, horizontal X)
 * - HORIZ panels: EDGE bore for dowels (drilling into left/right edge)
 */
export const G11_CONSTANTS = {
  // System 32 parameters
  SYSTEM32_PITCH: 32,           // mm - grid spacing
  SYSTEM32_FIRST_HOLE: 37,      // mm - from FRONT edge
  SYSTEM32_REAR_MARGIN: 50,     // mm - from BACK edge

  // Distance B
  DIMENSION_B_STANDARD: 24,     // mm - standard offset from mate edge
  DIMENSION_B_ALTERNATE: 34,    // mm - alternate for deeper cabinets

  // v4.0 Dowel split depth for Side-covers-Top construction
  // SIDE panel: FACE bore (shallow, avoids outer face breakthrough)
  // HORIZ panel: EDGE bore (deeper, into end grain)
  DOWEL_DEPTH_SIDE_FACE: 12,    // mm - into SIDE panel face (FACE_BORE)
  DOWEL_DEPTH_HORIZ_EDGE: 18,   // mm - into TOP/BOTTOM edge (EDGE_BORE)
  DOWEL_TOTAL_LENGTH: 30,       // mm - total (12 + 18)
  DOWEL_DIAMETER: 8,            // mm - Ø8

  // Legacy v3.x constants (for backward compatibility during migration)
  /** @deprecated Use DOWEL_DEPTH_HORIZ_EDGE instead */
  DOWEL_DEPTH_EDGE: 18,
  /** @deprecated Use DOWEL_DEPTH_SIDE_FACE instead */
  DOWEL_DEPTH_FACE: 12,

  // Minifix S200 specifications
  CAM_DIAMETER: 15,             // mm - Ø15
  BOLT_SLEEVE_DIAMETER: 10,     // mm - Ø10
  /** Bolt hole DRILLING depth (manufacturing domain). NOT the same as BOLT_SLEEVE_LENGTH. */
  BOLT_SLEEVE_DEPTH: 17.5,      // mm - bolt bore drilling depth (Häfele S200)

  // Bolt protrusion (G11.5: Bolt Tip must reach CAM center)
  // B = ballHeadRadius + neckLength + sleeveLength = 3.25 + 6.5 + 14.25 = 24mm
  BOLT_BALL_HEAD_DIAMETER: 6.5, // mm - Häfele S200 ball head Ø6.5
  BOLT_BALL_HEAD_RADIUS: 3.25,  // mm - half of diameter
  BOLT_NECK_LENGTH: 6.5,        // mm - neck shaft length
  /** Physical sleeve cylinder length (assembly domain). NOT the same as BOLT_SLEEVE_DEPTH. */
  BOLT_SLEEVE_LENGTH: 14.25,    // mm - sleeve assembly length (part of B=24mm chain)
  BOLT_PROTRUSION_TOTAL: 24,    // mm - total protrusion (must equal Distance B!)

  // Tolerances
  MATING_TOLERANCE: 0.1,        // mm - max alignment error for mating pairs
  DIMENSION_B_TOLERANCE: 1.0,   // mm - Distance B tolerance
  DEPTH_TOLERANCE: 0.5,         // mm - drill depth tolerance

  // Connector count formula: count = max(2, floor((depth - 74) / 224) + 2)
  CONNECTOR_SPACING_FACTOR: 224, // mm (= 32 × 7)
} as const;

// ============================================
// PANEL ROLE TYPES
// ============================================

/**
 * Panel role in cabinet structure.
 * Determines drill type and depth rules.
 */
export type PanelRole =
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'TOP'
  | 'BOTTOM'
  | 'SHELF'
  | 'DIVIDER'
  | 'BACK';

/**
 * Drill bore type based on panel orientation.
 */
export type DrillBoreType = 'EDGE_BORE' | 'FACE_BORE';

/**
 * Joint type for TOP/BOTTOM panels.
 */
export type JointType = 'INSET' | 'OVERLAY';

/**
 * Mate edge side (for Distance B reference).
 */
export type MateEdge = 'LEFT' | 'RIGHT';

// ============================================
// G11 ISSUE CODES
// ============================================

/**
 * G11 validation issue codes.
 * Format: [B|W|I]_G11_[RULE]_[SPECIFIC]
 */
export type G11IssueCode =
  // G11.1 Distance B
  | 'B_G11_DISTANCE_B_WRONG_REFERENCE'
  | 'W_G11_DISTANCE_B_OUT_OF_TOLERANCE'
  // G11.2 Dowel Depth
  | 'B_G11_DOWEL_DEPTH_SIDE_WRONG'
  | 'B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG'
  | 'W_G11_DOWEL_DEPTH_TOLERANCE'
  // G11.3 Drill Type (v4.0: SIDE=FACE_BORE, HORIZ CAM=FACE_BORE, HORIZ DOWEL=EDGE_BORE)
  | 'B_G11_DRILL_TYPE_SIDE_NOT_FACE'      // v4.0: SIDE panels must use FACE_BORE
  | 'B_G11_DRILL_TYPE_HORIZONTAL_NOT_FACE'
  // G11.4 Mating Alignment
  | 'B_G11_MATING_MISALIGNMENT'
  | 'W_G11_MATING_NEAR_TOLERANCE'
  // G11.5 Bolt Tip ↔ CAM Center Alignment
  | 'B_G11_BOLT_CAM_CORNER_MISMATCH'
  | 'B_G11_BOLT_CAM_MISALIGNMENT'
  | 'W_G11_BOLT_CAM_NEAR_TOLERANCE'
  // G11.6 N-Center Policy & Mode Consistency (v1.1)
  | 'B_G11_N_POLICY_MODE_MISMATCH'
  | 'W_G11_N_POLICY_MISSING'
  // G11.7 Double PVC Compensation Prevention (v1.1)
  | 'B_G11_DOUBLE_PVC_COMPENSATION'
  // G11.8 Edge Banding on Join Edge (v1.1)
  | 'B_G11_EDGE_BAND_JOIN_FORBIDDEN'
  | 'W_G11_EDGE_BAND_JOIN_WARNING'
  // General
  | 'I_G11_CONNECTOR_COUNT_SUBOPTIMAL';

// ============================================
// G11 ISSUE INTERFACE
// ============================================

/**
 * G11 validation issue.
 */
export interface G11Issue {
  /** Deterministic unique identifier */
  id: string;
  /** Severity level */
  severity: Severity;
  /** Stable issue code */
  code: G11IssueCode;
  /** Human-readable message */
  message: string;
  /** Affected drill point IDs */
  drillPointIds?: string[];
  /** Affected panel IDs */
  panelIds?: string[];
  /** Corner type if applicable */
  corner?: string;
  /** Additional context */
  context?: {
    measured?: number;
    expected?: number;
    tolerance?: number;
    panelRole?: string;
    boreType?: string;
    mateEdge?: string;
    [key: string]: string | number | boolean | undefined;
  };
}

// ============================================
// G11 VALIDATION INPUT
// ============================================

/**
 * Drill point for G11 validation.
 * Minimal interface matching DrillMapPoint requirements.
 */
export interface G11DrillPoint {
  id: string;
  panelId: string;
  position: [number, number, number];
  normal: [number, number, number];
  diameter: number;
  depth: number;
  purpose: 'CAM_LOCK' | 'BOLT' | 'DOWEL' | string;
  componentType?: string;
  pairId?: string;
  pairedHoleId?: string;
  edgeDistance?: number;
  cornerType?: string;
  face?: string;
  /** Panel role (LEFT_SIDE, RIGHT_SIDE, TOP, BOTTOM) */
  connectedPanelRole?: string;
}

/**
 * Panel for G11 validation.
 */
export interface G11Panel {
  id: string;
  role: string;
  position: [number, number, number];
  rotation: [number, number, number];
  finishWidth: number;
  finishHeight: number;
  computed?: {
    realThickness: number;
  };
}

/**
 * Cabinet for G11 validation.
 */
export interface G11Cabinet {
  id: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  jointType?: JointType;
  panels: G11Panel[];
}

/**
 * Mating pair for alignment validation.
 */
export interface G11MatingPair {
  sidePoint: G11DrillPoint;
  horizontalPoint: G11DrillPoint;
  corner: string;
  distance: number;
}

// ============================================
// G11 POLICY
// ============================================

/**
 * G11 validation policy.
 * Allows factory-specific tuning of tolerances.
 */
export interface G11Policy {
  /** Mating alignment tolerance in mm (default: 0.1) */
  matingTolerance?: number;
  /** Distance B tolerance in mm (default: 1.0) */
  dimensionBTolerance?: number;
  /** Depth tolerance in mm (default: 0.5) */
  depthTolerance?: number;
  /** Allow alternate Distance B (34mm) */
  allowAlternateDistanceB?: boolean;
  /** Skip mating check for specific corners */
  skipMatingCheck?: string[];
}

// ============================================
// G11 RESULT
// ============================================

/**
 * G11 validation result.
 */
export interface G11Result {
  gate: 'G11_MINIFIX_SYSTEM32';
  status: 'PASS' | 'FAIL';
  issues: G11Issue[];
  summary: {
    blockers: number;
    warnings: number;
    info: number;
    pairsValidated: number;
    pointsValidated: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine expected bore type for panel role and purpose.
 *
 * v4.0 Side-covers-Top Construction:
 * - SIDE panels: FACE_BORE for BOLT and DOWEL (horizontal X drilling)
 * - HORIZ panels: FACE_BORE for CAM, EDGE_BORE for DOWEL (Y drilling for CAM, X drilling for DOWEL)
 *
 * @param panelRole - Panel role (LEFT_SIDE, RIGHT_SIDE, TOP, BOTTOM, etc.)
 * @param purpose - Drill purpose (optional, for context-aware bore type)
 */
export function getExpectedBoreType(panelRole: string, purpose?: string): DrillBoreType {
  const sideRoles = ['LEFT_SIDE', 'RIGHT_SIDE', 'SIDE'];

  if (sideRoles.includes(panelRole)) {
    // v4.0: SIDE panels use FACE_BORE (horizontal X drilling into inner face)
    return 'FACE_BORE';
  }

  // HORIZ panels (TOP, BOTTOM):
  // - CAM: FACE_BORE (vertical Y drilling into face)
  // - DOWEL: EDGE_BORE (horizontal X drilling into left/right edge)
  if (purpose === 'DOWEL') {
    return 'EDGE_BORE';
  }
  return 'FACE_BORE';  // CAM, BOLT_ENTRY, etc.
}

/**
 * Determine expected dowel depth for panel role.
 *
 * v4.0 Side-covers-Top Construction:
 * - SIDE panels: 12mm (FACE_BORE, shallow to avoid outer face)
 * - HORIZ panels: 18mm (EDGE_BORE, deeper into end grain)
 */
export function getExpectedDowelDepth(panelRole: string): number {
  const sideRoles = ['LEFT_SIDE', 'RIGHT_SIDE', 'SIDE'];
  return sideRoles.includes(panelRole)
    ? G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE   // 12mm face bore on SIDE
    : G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE; // 18mm edge bore on HORIZ
}

/**
 * Check if panel role is a side panel.
 */
export function isSidePanel(panelRole: string): boolean {
  return ['LEFT_SIDE', 'RIGHT_SIDE', 'SIDE'].includes(panelRole);
}

/**
 * Check if panel role is a horizontal panel.
 */
export function isHorizontalPanel(panelRole: string): boolean {
  return ['TOP', 'BOTTOM', 'SHELF'].includes(panelRole);
}

/**
 * Calculate expected connector count based on carcass depth.
 */
export function calculateExpectedConnectorCount(carcassDepth: number): number {
  const usableZone = carcassDepth - (G11_CONSTANTS.SYSTEM32_FIRST_HOLE + G11_CONSTANTS.SYSTEM32_REAR_MARGIN);
  return Math.max(2, Math.floor(usableZone / G11_CONSTANTS.CONNECTOR_SPACING_FACTOR) + 2);
}

/**
 * Calculate 3D distance between two points.
 */
export function calculateDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generate deterministic issue ID.
 */
export function issueId(code: G11IssueCode, ...parts: string[]): string {
  return `${code}::${parts.join('::')}`;
}

/**
 * Calculate bolt tip position from drill entry point.
 *
 * G11.5: The bolt tip (ball head center) must align with the CAM pocket center.
 *
 * Bolt extends OPPOSITE to drill normal direction:
 * - If drill normal = [-1, 0, 0] (drilling left into SIDE panel)
 * - Then bolt protrudes in [+1, 0, 0] direction (extending right into cabinet)
 *
 * @param entryPosition - Drill entry point on SIDE panel inner face
 * @param drillNormal - Drill direction (into material)
 * @param protrusionLength - Total bolt protrusion (default: 24mm = Distance B)
 * @returns Bolt tip (ball head center) position in world coordinates
 */
export function calculateBoltTipPosition(
  entryPosition: [number, number, number],
  drillNormal: [number, number, number],
  protrusionLength: number = G11_CONSTANTS.BOLT_PROTRUSION_TOTAL
): [number, number, number] {
  // Bolt tip extends OPPOSITE to drill direction
  // protrusionLength extends from entry point in -normal direction
  return [
    entryPosition[0] - drillNormal[0] * protrusionLength,
    entryPosition[1] - drillNormal[1] * protrusionLength,
    entryPosition[2] - drillNormal[2] * protrusionLength,
  ];
}

/**
 * Calculate CAM pocket center from drill entry point.
 *
 * CAM pocket center is at camDepth/2 INTO the material from drill surface.
 *
 * @param camSurfacePosition - CAM drill entry point on TOP/BOTTOM face
 * @param camNormal - Drill direction (into material)
 * @param camDepth - CAM housing depth (typically 12.5mm for 16mm wood)
 * @returns CAM pocket center position in world coordinates
 */
export function calculateCamPocketCenter(
  camSurfacePosition: [number, number, number],
  camNormal: [number, number, number],
  camDepth: number
): [number, number, number] {
  const pocketOffset = camDepth / 2;
  return [
    camSurfacePosition[0] + camNormal[0] * pocketOffset,
    camSurfacePosition[1] + camNormal[1] * pocketOffset,
    camSurfacePosition[2] + camNormal[2] * pocketOffset,
  ];
}
