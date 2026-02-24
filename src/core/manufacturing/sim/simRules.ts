// src/core/manufacturing/sim/simRules.ts
/**
 * Simulation Rules Configuration.
 *
 * Defines rule thresholds and configurations for IR simulation.
 * All values are factory-tuned defaults.
 *
 * v0.10.7.3 - Simulation Kernel
 */

import { SimIssueCode, SimSeverity } from "./simReport.v1";

// =============================================================================
// RULE DEFINITIONS
// =============================================================================

/**
 * Rule definition.
 */
export interface SimRule {
  /** Rule code */
  code: SimIssueCode;

  /** Default severity */
  severity: SimSeverity;

  /** Rule description */
  description: string;

  /** Can be downgraded to warning */
  canDowngrade?: boolean;

  /** Can be disabled */
  canDisable?: boolean;
}

/**
 * All simulation rules.
 */
export const SIM_RULES: Record<SimIssueCode, SimRule> = {
  // Safety rules (ERROR)
  RAPID_XY_BELOW_SAFEZ: {
    code: "RAPID_XY_BELOW_SAFEZ",
    severity: "ERROR",
    description: "Rapid XY move while Z is below safe height",
    canDowngrade: false,
    canDisable: false,
  },
  TOOLCHANGE_WITH_SPINDLE_ON: {
    code: "TOOLCHANGE_WITH_SPINDLE_ON",
    severity: "ERROR",
    description: "Tool change commanded while spindle is running",
    canDowngrade: false,
    canDisable: false,
  },
  CUT_MOVE_WITHOUT_SPINDLE: {
    code: "CUT_MOVE_WITHOUT_SPINDLE",
    severity: "ERROR",
    description: "Cutting move (G1/G2/G3) while spindle is off",
    canDowngrade: false,
    canDisable: false,
  },
  JUMP_WITHOUT_RETRACT: {
    code: "JUMP_WITHOUT_RETRACT",
    severity: "WARN",
    description: "Large XY jump at low Z without retract",
    canDowngrade: true,
    canDisable: true,
  },
  OUT_OF_SHEET_BOUNDS: {
    code: "OUT_OF_SHEET_BOUNDS",
    severity: "ERROR",
    description: "Move position is outside sheet bounds",
    canDowngrade: false,
    canDisable: false,
  },
  ENTER_FORBIDDEN_ZONE: {
    code: "ENTER_FORBIDDEN_ZONE",
    severity: "ERROR",
    description: "Move enters a forbidden zone (clamp, keep-out)",
    canDowngrade: false,
    canDisable: false,
  },

  // Quality rules (WARN)
  EXCESSIVE_PLUNGE_RATE: {
    code: "EXCESSIVE_PLUNGE_RATE",
    severity: "WARN",
    description: "Plunge rate exceeds recommended limit",
    canDowngrade: true,
    canDisable: true,
  },
  TINY_SEGMENTS: {
    code: "TINY_SEGMENTS",
    severity: "WARN",
    description: "Many tiny segments detected (possible noise)",
    canDowngrade: true,
    canDisable: true,
  },
  ARC_RADIUS_MISMATCH: {
    code: "ARC_RADIUS_MISMATCH",
    severity: "WARN",
    description: "Arc start/end radius mismatch",
    canDowngrade: true,
    canDisable: true,
  },
  FEED_ZERO_OR_NEG: {
    code: "FEED_ZERO_OR_NEG",
    severity: "WARN",
    description: "Feed rate is zero or negative",
    canDowngrade: true,
    canDisable: true,
  },
  TOO_MANY_MOVES: {
    code: "TOO_MANY_MOVES",
    severity: "WARN",
    description: "Program has excessive number of moves",
    canDowngrade: true,
    canDisable: true,
  },

  // Info
  SIMULATION_COMPLETE: {
    code: "SIMULATION_COMPLETE",
    severity: "INFO",
    description: "Simulation completed successfully",
    canDowngrade: false,
    canDisable: false,
  },
};

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * Simulation thresholds.
 */
export interface SimThresholds {
  /** Tolerance for bounds checking (mm) */
  boundsTolerance: number;

  /** Arc radius mismatch tolerance (mm) */
  arcRadiusTolerance: number;

  /** Minimum segment length before flagging (mm) */
  minSegmentLength: number;

  /** Number of tiny segments to trigger warning */
  tinySegmentThreshold: number;

  /** Maximum XY jump at low Z before warning (mm) */
  maxJumpAtLowZ: number;

  /** Maximum moves before warning */
  maxMoves: number;

  /** Maximum plunge rate (mm/min) */
  maxPlungeRate: number;
}

/**
 * Default simulation thresholds.
 */
export const DEFAULT_THRESHOLDS: SimThresholds = {
  boundsTolerance: 0.01,
  arcRadiusTolerance: 0.05,
  minSegmentLength: 0.05,
  tinySegmentThreshold: 50,
  maxJumpAtLowZ: 5.0,
  maxMoves: 100000,
  maxPlungeRate: 3000,
};

// =============================================================================
// RULE CONFIGURATION
// =============================================================================

/**
 * Rule override configuration.
 */
export interface RuleOverride {
  /** Override severity (if allowed) */
  severity?: SimSeverity;

  /** Disable rule */
  disabled?: boolean;
}

/**
 * Simulation configuration.
 */
export interface SimConfig {
  /** Thresholds */
  thresholds: SimThresholds;

  /** Rule overrides by code */
  overrides?: Partial<Record<SimIssueCode, RuleOverride>>;

  /** Enable strict mode (no downgrades allowed) */
  strictMode?: boolean;
}

/**
 * Default simulation configuration.
 */
export const DEFAULT_SIM_CONFIG: SimConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  strictMode: false,
};

/**
 * Get effective severity for a rule.
 */
export function getEffectiveSeverity(
  code: SimIssueCode,
  config: SimConfig
): SimSeverity | null {
  const rule = SIM_RULES[code];
  const override = config.overrides?.[code];

  // Check if disabled
  if (override?.disabled && rule.canDisable && !config.strictMode) {
    return null;
  }

  // Check for severity override
  if (override?.severity && rule.canDowngrade && !config.strictMode) {
    return override.severity;
  }

  return rule.severity;
}

/**
 * Check if rule should be applied.
 */
export function shouldApplyRule(
  code: SimIssueCode,
  config: SimConfig
): boolean {
  return getEffectiveSeverity(code, config) !== null;
}

// =============================================================================
// RULES VERSION
// =============================================================================

/**
 * Current rules version.
 */
export const RULES_VERSION = "10.7.3.v1";

/**
 * Get rules version string.
 */
export function getRulesVersion(): string {
  return RULES_VERSION;
}
