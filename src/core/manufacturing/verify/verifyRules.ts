// src/core/manufacturing/verify/verifyRules.ts
/**
 * Verification Rules Configuration.
 *
 * Defines manufacturing verification rules and thresholds.
 * All values are factory-tuned defaults.
 *
 * v0.10.8.1 - Toolpath Verifier
 */

import { VerifyIssueCode, VerifySeverity } from "./verifierReport.v1";

// =============================================================================
// RULE DEFINITIONS
// =============================================================================

/**
 * Verification rule definition.
 */
export interface VerifyRule {
  /** Rule code */
  code: VerifyIssueCode;

  /** Default severity */
  severity: VerifySeverity;

  /** Rule category */
  category: "DEPTH" | "TOOL" | "TAB" | "CLAMP" | "CONTINUITY" | "TRACE" | "OTHER";

  /** Rule description */
  description: string;

  /** Can severity be downgraded */
  canDowngrade?: boolean;

  /** Can rule be disabled */
  canDisable?: boolean;
}

/**
 * All verification rules.
 */
export const VERIFY_RULES: Record<VerifyIssueCode, VerifyRule> = {
  // Depth & thickness rules (BLOCK)
  Z_BELOW_ALLOWED: {
    code: "Z_BELOW_ALLOWED",
    severity: "BLOCK",
    category: "DEPTH",
    description: "Cut depth exceeds allowed limit for operation",
    canDowngrade: false,
    canDisable: false,
  },
  Z_BELOW_ONION_PLANE: {
    code: "Z_BELOW_ONION_PLANE",
    severity: "BLOCK",
    category: "DEPTH",
    description: "Cut goes below onion skin plane in non-THROUGH stage",
    canDowngrade: false,
    canDisable: false,
  },
  FLUTE_TOO_SHORT: {
    code: "FLUTE_TOO_SHORT",
    severity: "BLOCK",
    category: "DEPTH",
    description: "Cut depth exceeds tool flute length",
    canDowngrade: false,
    canDisable: false,
  },
  DEPTH_EXCEEDS_THICKNESS: {
    code: "DEPTH_EXCEEDS_THICKNESS",
    severity: "BLOCK",
    category: "DEPTH",
    description: "Cut depth exceeds material thickness",
    canDowngrade: false,
    canDisable: false,
  },

  // Tool compatibility rules
  FEATURE_TOO_SMALL_FOR_TOOL: {
    code: "FEATURE_TOO_SMALL_FOR_TOOL",
    severity: "BLOCK",
    category: "TOOL",
    description: "Feature (slot/pocket) is smaller than tool diameter",
    canDowngrade: false,
    canDisable: false,
  },
  INNER_RADIUS_LIMIT: {
    code: "INNER_RADIUS_LIMIT",
    severity: "WARN",
    category: "TOOL",
    description: "Inner corner radius smaller than tool radius",
    canDowngrade: true,
    canDisable: true,
  },
  STEPDOWN_EXCEEDS_LIMIT: {
    code: "STEPDOWN_EXCEEDS_LIMIT",
    severity: "WARN",
    category: "TOOL",
    description: "Z stepdown exceeds tool maximum",
    canDowngrade: true,
    canDisable: true,
  },

  // Tab integrity rules (BLOCK)
  TAB_ZONE_VIOLATION: {
    code: "TAB_ZONE_VIOLATION",
    severity: "BLOCK",
    category: "TAB",
    description: "Cut enters tab zone before THROUGH stage",
    canDowngrade: false,
    canDisable: false,
  },
  THROUGH_HAS_GAPS: {
    code: "THROUGH_HAS_GAPS",
    severity: "WARN",
    category: "TAB",
    description: "THROUGH stage has unexpected gaps (may indicate missing cuts)",
    canDowngrade: true,
    canDisable: true,
  },
  PREMATURE_THROUGH_CUT: {
    code: "PREMATURE_THROUGH_CUT",
    severity: "BLOCK",
    category: "TAB",
    description: "Through-cutting detected before THROUGH stage",
    canDowngrade: false,
    canDisable: false,
  },

  // Clamp/fixture rules (BLOCK)
  CUT_IN_CLAMP_ZONE: {
    code: "CUT_IN_CLAMP_ZONE",
    severity: "BLOCK",
    category: "CLAMP",
    description: "Cut path enters clamp/forbidden zone",
    canDowngrade: false,
    canDisable: false,
  },
  RAPID_IN_CLAMP_ZONE_BELOW_SAFEZ: {
    code: "RAPID_IN_CLAMP_ZONE_BELOW_SAFEZ",
    severity: "BLOCK",
    category: "CLAMP",
    description: "Rapid move through clamp zone below safe Z",
    canDowngrade: false,
    canDisable: false,
  },
  FIXTURE_COLLISION: {
    code: "FIXTURE_COLLISION",
    severity: "BLOCK",
    category: "CLAMP",
    description: "Toolpath collides with fixture",
    canDowngrade: false,
    canDisable: false,
  },

  // Continuity rules
  DISCONTINUITY_WITHOUT_RETRACT: {
    code: "DISCONTINUITY_WITHOUT_RETRACT",
    severity: "BLOCK",
    category: "CONTINUITY",
    description: "Cut path discontinuity without retract to safe Z",
    canDowngrade: false,
    canDisable: false,
  },
  PATH_JUMP_IN_CUT: {
    code: "PATH_JUMP_IN_CUT",
    severity: "BLOCK",
    category: "CONTINUITY",
    description: "Unexpected position jump during cut",
    canDowngrade: false,
    canDisable: false,
  },

  // Trace map rules
  TRACE_MAP_MISMATCH: {
    code: "TRACE_MAP_MISMATCH",
    severity: "BLOCK",
    category: "TRACE",
    description: "Trace map does not match IR program",
    canDowngrade: false,
    canDisable: false,
  },
  MISSING_TRACE_DATA: {
    code: "MISSING_TRACE_DATA",
    severity: "WARN",
    category: "TRACE",
    description: "Trace data missing for move (verification incomplete)",
    canDowngrade: true,
    canDisable: true,
  },

  // Warning rules
  PLUNGE_WITHOUT_SPINDLE: {
    code: "PLUNGE_WITHOUT_SPINDLE",
    severity: "WARN",
    category: "OTHER",
    description: "Plunge move detected without spindle on",
    canDowngrade: true,
    canDisable: true,
  },
  STEEP_PLUNGE_ANGLE: {
    code: "STEEP_PLUNGE_ANGLE",
    severity: "WARN",
    category: "OTHER",
    description: "Plunge angle exceeds recommended limit",
    canDowngrade: true,
    canDisable: true,
  },
  EXCESSIVE_STEPOVER: {
    code: "EXCESSIVE_STEPOVER",
    severity: "WARN",
    category: "OTHER",
    description: "Stepover exceeds tool maximum",
    canDowngrade: true,
    canDisable: true,
  },

  // Info
  VERIFICATION_COMPLETE: {
    code: "VERIFICATION_COMPLETE",
    severity: "INFO",
    category: "OTHER",
    description: "Verification completed successfully",
    canDowngrade: false,
    canDisable: false,
  },
};

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * Verification thresholds.
 */
export interface VerifyThresholds {
  /** General position tolerance (mm) */
  positionTolerance: number;

  /** Depth tolerance (mm) */
  depthTolerance: number;

  /** Flute length safety margin (mm) */
  fluteSafetyMargin: number;

  /** Maximum path jump at low Z (mm) */
  maxPathJump: number;

  /** Safe Z detection threshold (mm below safeZ) */
  safeZThreshold: number;

  /** Inner radius tolerance factor (0-1) */
  innerRadiusTolerance: number;

  /** Maximum stepdown warning factor (1.0 = exact limit) */
  stepdownWarningFactor: number;

  /** Arc sample count for collision checking */
  arcSampleCount: number;
}

/**
 * Default verification thresholds.
 */
export const DEFAULT_VERIFY_THRESHOLDS: VerifyThresholds = {
  positionTolerance: 0.01,
  depthTolerance: 0.02,
  fluteSafetyMargin: 0.5,
  maxPathJump: 2.0,
  safeZThreshold: 0.5,
  innerRadiusTolerance: 0.95,
  stepdownWarningFactor: 1.1,
  arcSampleCount: 8,
};

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Rule override.
 */
export interface VerifyRuleOverride {
  /** Override severity */
  severity?: VerifySeverity;

  /** Disable rule */
  disabled?: boolean;
}

/**
 * Verification configuration.
 */
export interface VerifyConfig {
  /** Thresholds */
  thresholds: VerifyThresholds;

  /** Rule overrides */
  overrides?: Partial<Record<VerifyIssueCode, VerifyRuleOverride>>;

  /** Strict mode (no downgrades) */
  strictMode?: boolean;

  /** Skip trace-dependent checks if trace incomplete */
  allowIncompleteTrace?: boolean;
}

/**
 * Default verification configuration.
 */
export const DEFAULT_VERIFY_CONFIG: VerifyConfig = {
  thresholds: DEFAULT_VERIFY_THRESHOLDS,
  strictMode: false,
  allowIncompleteTrace: false,
};

/**
 * Get effective severity for a rule.
 */
export function getEffectiveVerifySeverity(
  code: VerifyIssueCode,
  config: VerifyConfig
): VerifySeverity | null {
  const rule = VERIFY_RULES[code];
  const override = config.overrides?.[code];

  if (override?.disabled && rule.canDisable && !config.strictMode) {
    return null;
  }

  if (override?.severity && rule.canDowngrade && !config.strictMode) {
    return override.severity;
  }

  return rule.severity;
}

/**
 * Check if rule should be applied.
 */
export function shouldApplyVerifyRule(
  code: VerifyIssueCode,
  config: VerifyConfig
): boolean {
  return getEffectiveVerifySeverity(code, config) !== null;
}

// =============================================================================
// VERSION
// =============================================================================

/**
 * Current rules version.
 */
export const VERIFY_RULES_VERSION = "10.8.1.v1";

/**
 * Get rules version.
 */
export function getVerifyRulesVersion(): string {
  return VERIFY_RULES_VERSION;
}
