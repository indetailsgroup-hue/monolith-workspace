// src/core/manufacturing/offset/offsetSpec.v1.ts
/**
 * Offset Specification Types.
 *
 * Defines the contract for variable offset by tool radius:
 * - Per-op (PROFILE/GROOVE/POCKET)
 * - Per-pass (ROUGH/FINISH)
 * - Tool-aware (diameter, class)
 * - Audit-friendly (formula documentation)
 *
 * Key concepts:
 * - OffsetSide: LEFT/RIGHT relative to path travel direction
 * - OffsetWhy: Reason codes for audit trail
 * - OffsetSpec: Complete specification with inputs and formula
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

// =============================================================================
// OFFSET SIDE
// =============================================================================

/**
 * Offset side relative to path travel direction.
 *
 * - LEFT: Offset to the left of the path (normal-left of tangent)
 * - RIGHT: Offset to the right of the path (normal-right of tangent)
 *
 * Convention:
 * - For CCW paths: interior is on LEFT
 * - For CW paths: interior is on RIGHT
 */
export type OffsetSide = "LEFT" | "RIGHT";

// =============================================================================
// OFFSET REASON
// =============================================================================

/**
 * Reason codes for offset calculation.
 *
 * Used for audit trail and gate checks.
 */
export type OffsetWhy =
  | "PROFILE_OUTSIDE"      // Outside profile cut (part boundary)
  | "PROFILE_INSIDE"       // Inside profile cut (hole)
  | "GROOVE_CENTERLINE"    // Groove along centerline
  | "GROOVE_OFFSET"        // Groove with offset from centerline
  | "POCKET_CLEAR"         // Pocket clearing pass
  | "POCKET_FINISH"        // Pocket finish pass
  | "FINISH_ALLOWANCE"     // Includes finish stock allowance
  | "RADIUS_COMP"          // Tool radius compensation applied
  | "KERF_ALLOWANCE"       // Includes kerf/saw allowance
  | "USER_ALLOWANCE"       // Includes user/designer adjustment
  | "ONION_SKIN";          // Onion skin holding strategy

// =============================================================================
// OFFSET INPUTS
// =============================================================================

/**
 * Input parameters for offset calculation.
 *
 * These values are captured for audit trail.
 */
export interface OffsetInputs {
  /** Tool diameter (mm) */
  toolDiameterMm: number;

  /** Tool radius = diameter / 2 (mm) - canonical value */
  toolRadiusMm: number;

  /** Stock to leave for finish pass (mm, >= 0) */
  stockToLeaveMm: number;

  /** Kerf/saw allowance (mm, usually 0 for routing) */
  kerfAllowanceMm: number;

  /** User/designer adjustment (mm, can be negative) */
  userAllowanceMm: number;
}

// =============================================================================
// OFFSET SPEC
// =============================================================================

/**
 * Complete offset specification.
 *
 * Contains all information needed to:
 * 1. Apply the offset to a path
 * 2. Audit the offset calculation
 * 3. Reproduce the offset deterministically
 */
export interface OffsetSpec {
  /** Spec version for compatibility */
  version: "1.0";

  /** Offset distance (mm, >= 0). Side determines direction. */
  distanceMm: number;

  /** Offset side relative to path travel direction */
  side: OffsetSide;

  /** Reason codes for this offset */
  why: OffsetWhy[];

  /** Input parameters used in calculation */
  inputs: OffsetInputs;

  /** Human-readable formula for audit */
  formula: string;

  /** Optional: fingerprint for chain-of-custody */
  fingerprint?: string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default offset inputs (no tool, no allowances).
 */
export const DEFAULT_OFFSET_INPUTS: OffsetInputs = {
  toolDiameterMm: 0,
  toolRadiusMm: 0,
  stockToLeaveMm: 0,
  kerfAllowanceMm: 0,
  userAllowanceMm: 0,
};

/**
 * Create a zero-offset spec (centerline, no offset).
 */
export function createZeroOffsetSpec(reason: OffsetWhy = "GROOVE_CENTERLINE"): OffsetSpec {
  return {
    version: "1.0",
    distanceMm: 0,
    side: "LEFT",
    why: [reason],
    inputs: DEFAULT_OFFSET_INPUTS,
    formula: "dist = 0 (centerline)",
  };
}

// =============================================================================
// PATH METADATA
// =============================================================================

/**
 * Path metadata with offset spec.
 *
 * Attached to paths after offset application for audit trail.
 * Extends Record<string, unknown> for compatibility with generic meta.
 */
export interface PathOffsetMeta extends Record<string, unknown> {
  /** The offset spec used */
  offsetSpec: OffsetSpec;

  /** SHA-256 fingerprint of stable-stringified spec */
  offsetFp?: string;

  /** Original path ID (before offset) */
  sourcePathId?: string;

  /** Timestamp of offset application */
  offsetAppliedAt?: string;
}

// =============================================================================
// ISSUE CODES
// =============================================================================

/**
 * Offset-related gate issue codes.
 */
export type OffsetIssueCode =
  | "OFFSET_SPEC_INVALID"        // Invalid offset spec
  | "OFFSET_SPEC_MISSING"        // Path missing offset spec
  | "OFFSET_DISTANCE_NEGATIVE"   // Distance < 0 (should not happen)
  | "OFFSET_TOOL_DIAMETER_ZERO"  // Tool diameter <= 0
  | "OFFSET_STOCK_EXCEEDS_RADIUS"// Stock to leave > tool radius
  | "OFFSET_ROUGH_ZERO_DIST"     // Rough pass has zero distance (risky)
  | "OFFSET_INPUTS_MISMATCH";    // Inputs don't match calculated distance

/**
 * Offset issue for gate checks.
 */
export interface OffsetIssue {
  code: OffsetIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  data?: Record<string, unknown>;
}
