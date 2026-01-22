/**
 * drillPolicyTypes.ts - Drilling Policy Type Definitions
 *
 * Defines types for deterministic drilling cycle selection
 * based on hole characteristics and material properties.
 *
 * @version 1.0.0 - Phase D5-A
 */

import type { MaterialClass, MaterialHint } from './materialTypes';

// ============================================
// HOLE CLASSIFICATION
// ============================================

/**
 * Hole kind classification for cycle selection.
 *
 * SYSTEM_HOLE: 5mm system holes (shelf pins, cam locks)
 * HINGE_CUP: 35mm hinge cup boring
 * DOWEL: 8mm dowel holes
 * SHELF_PIN: 5mm shelf pin holes (alias for system)
 * CAM_HOUSING: 15mm minifix cam housing
 * THROUGH: Through-hole (any diameter)
 * CUSTOM: Non-standard holes
 */
export type HoleKind =
  | 'SYSTEM_HOLE'
  | 'HINGE_CUP'
  | 'DOWEL'
  | 'SHELF_PIN'
  | 'CAM_HOUSING'
  | 'THROUGH'
  | 'CUSTOM';

/**
 * G-code drilling cycle types.
 *
 * G81: Simple drill cycle (rapid down, feed to depth, rapid out)
 * G82: Dwell drill cycle (adds dwell at bottom for chip clearing)
 * G83: Peck drill cycle (multiple pecks for chip evacuation in deep holes)
 */
export type CycleType = 'G81' | 'G82' | 'G83';

// ============================================
// HOLE SPECIFICATION
// ============================================

/**
 * Input specification for a hole to be drilled.
 */
export interface HoleSpec {
  /** Hole diameter in mm */
  readonly diameter: number;
  /** Hole depth in mm */
  readonly depth: number;
  /** Panel thickness in mm (for through-hole detection) */
  readonly panelThickness: number;
  /** Explicit hole kind (if known) */
  readonly kind?: HoleKind;
  /** Is this a through-hole? */
  readonly throughHole?: boolean;
}

// ============================================
// POLICY OUTPUT
// ============================================

/**
 * Drilling parameters output from policy.
 */
export interface DrillParameters {
  /** G-code cycle to use */
  readonly cycle: CycleType;
  /** Spindle speed in RPM */
  readonly rpm: number;
  /** Feed rate in mm/min */
  readonly feedRate: number;
  /** Peck depth in mm (for G83) */
  readonly peckDepth?: number;
  /** Dwell time in seconds (for G82) */
  readonly dwellTime?: number;
  /** Retract amount in mm (for G83) */
  readonly retract?: number;
}

/**
 * Cycle selection result with reasoning.
 */
export interface CycleSelectionResult {
  /** Selected cycle type */
  readonly cycle: CycleType;
  /** Reason for selection (for debugging/logging) */
  readonly reason: string;
  /** Classified hole kind */
  readonly holeKind: HoleKind;
}

// ============================================
// POLICY INTERFACE
// ============================================

/**
 * Drilling policy interface.
 *
 * Policies are stateless and deterministic:
 * same inputs → same outputs.
 */
export interface DrillPolicy {
  /** Policy identifier */
  readonly id: string;
  /** Human-readable policy name */
  readonly name: string;
  /** Policy version */
  readonly version: string;

  /**
   * Select drilling cycle based on hole spec and material.
   */
  selectCycle(hole: HoleSpec, material: MaterialHint): CycleSelectionResult;

  /**
   * Get full drilling parameters for a hole.
   */
  getParameters(hole: HoleSpec, material: MaterialHint): DrillParameters;

  /**
   * Check if a hole spec is valid for this policy.
   * Returns error messages if invalid.
   */
  validate(hole: HoleSpec): string[];
}

// ============================================
// POLICY CONFIGURATION
// ============================================

/**
 * Base feed/speed configuration for a tool diameter.
 */
export interface ToolFeedSpeed {
  /** Tool diameter in mm */
  readonly diameter: number;
  /** Base RPM */
  readonly baseRpm: number;
  /** Base feed rate in mm/min */
  readonly baseFeed: number;
}

/**
 * Cycle selection rules.
 */
export interface CycleRules {
  /** Depth/diameter ratio threshold for peck drilling */
  readonly peckThreshold: number;
  /** Diameters that always use dwell (e.g., 35mm hinge cup) */
  readonly dwellDiameters: number[];
  /** Dwell time in seconds */
  readonly dwellTime: number;
  /** Peck depth as fraction of diameter */
  readonly peckDepthRatio: number;
  /** Retract amount in mm for peck cycle */
  readonly peckRetract: number;
}

/**
 * Policy configuration structure.
 */
export interface DrillPolicyConfig {
  /** Policy identifier */
  readonly id: string;
  /** Policy name */
  readonly name: string;
  /** Policy version */
  readonly version: string;
  /** Feed/speed table by diameter */
  readonly feedSpeedTable: readonly ToolFeedSpeed[];
  /** Cycle selection rules */
  readonly cycleRules: CycleRules;
  /** Material-specific multipliers */
  readonly materialMultipliers: Record<MaterialClass, {
    readonly feedMultiplier: number;
    readonly rpmMultiplier: number;
  }>;
}

// ============================================
// HELPERS
// ============================================

/**
 * Classify hole kind from diameter and depth.
 */
export function classifyHoleKind(hole: HoleSpec): HoleKind {
  // Explicit kind takes precedence
  if (hole.kind) {
    return hole.kind;
  }

  // Through-hole check
  if (hole.throughHole || hole.depth >= hole.panelThickness - 0.5) {
    return 'THROUGH';
  }

  // Diameter-based classification
  const d = hole.diameter;

  if (d >= 34 && d <= 36) {
    return 'HINGE_CUP'; // 35mm hinge cup
  }
  if (d >= 14 && d <= 16) {
    return 'CAM_HOUSING'; // 15mm minifix cam
  }
  if (d >= 7 && d <= 9) {
    return 'DOWEL'; // 8mm dowel
  }
  if (d >= 4 && d <= 6) {
    return 'SYSTEM_HOLE'; // 5mm system hole
  }

  return 'CUSTOM';
}

/**
 * Check if a hole is considered "deep" (requires peck drilling).
 */
export function isDeepHole(hole: HoleSpec, peckThreshold: number): boolean {
  return hole.depth / hole.diameter > peckThreshold;
}
