// src/core/manufacturing/z/zPlan.v1.ts
/**
 * Z-aware Path Planning Types.
 *
 * Defines contracts for Z-level scheduling:
 * - Stepdown splitting (maxStepdownMm)
 * - Onion skin (stop before through, then final cut)
 * - Finish-only walls (skim last depth)
 * - Through stage (part release)
 *
 * Key concepts:
 * - ZContext: Material/depth parameters
 * - ZToolLimits: Tool stepdown constraints
 * - ZPass: Single pass at specific Z level
 * - ZPlan: Complete Z schedule for an operation
 *
 * Depth conventions:
 * - topZ = 0 (material top surface)
 * - Downwards = negative values
 * - Through cut = -(T + spoilExtra)
 *
 * v0.10.6.8 - Z-aware Path Planning
 */

// =============================================================================
// Z CONTEXT
// =============================================================================

/**
 * Z context for depth calculations.
 *
 * Defines the material and machine constraints.
 */
export interface ZContext {
  /** Panel finished thickness (mm) */
  finishedThicknessMm: number;

  /** Target cut depth (mm, positive value) - e.g., thru = finishedT + spoil */
  cutDepthMm: number;

  /** Spoilboard extra penetration (mm) - e.g., 0.6 */
  spoilExtraMm: number;

  /** Onion skin remaining thickness (mm) - e.g., 0.8 */
  onionSkinMm: number;

  /** Top Z position (usually 0) */
  topZ: number;

  /** Machine safe Z height (mm, positive) */
  safeZ: number;
}

/**
 * Default Z context for 18mm panel.
 */
export const DEFAULT_Z_CONTEXT: ZContext = {
  finishedThicknessMm: 18,
  cutDepthMm: 18.6,
  spoilExtraMm: 0.6,
  onionSkinMm: 0.8,
  topZ: 0,
  safeZ: 10,
};

// =============================================================================
// TOOL LIMITS
// =============================================================================

/**
 * Z-related tool limits.
 *
 * Defines maximum stepdown per pass.
 */
export interface ZToolLimits {
  /** Maximum stepdown per pass (mm) */
  maxStepdownMm: number;

  /** Optional smaller stepdown for finish passes (mm) */
  finishStepdownMm?: number;

  /** Tool diameter for reference (mm) */
  toolDiameterMm?: number;

  /** Tool ID */
  toolId?: string;
}

/**
 * Default tool limits for 6mm flat end mill.
 */
export const DEFAULT_Z_TOOL_LIMITS: ZToolLimits = {
  maxStepdownMm: 8,
  finishStepdownMm: 4,
  toolDiameterMm: 6,
};

// =============================================================================
// Z PASS
// =============================================================================

/**
 * Pass kind for Z scheduling.
 */
export type ZPassKind = "ROUGH" | "FINISH" | "THROUGH";

/**
 * A single Z pass.
 *
 * Represents one complete pass at a specific Z level.
 */
export interface ZPass {
  /** Pass index within stage (0-based) */
  passIndex: number;

  /** Z top of this pass (mm, usually previous bottom or topZ) */
  zTop: number;

  /** Z bottom of this pass (mm, negative downwards) */
  zBottom: number;

  /** Pass kind (ROUGH/FINISH/THROUGH) */
  kind: ZPassKind;

  /** Actual stepdown for this pass (mm) */
  stepdownMm: number;

  /** Feed rate multiplier (optional, 1.0 = full speed) */
  feedMultiplier?: number;

  /** Is this the final pass in the stage? */
  isFinalPass?: boolean;
}

// =============================================================================
// FINISH MODE
// =============================================================================

/**
 * Finish mode for wall finishing strategy.
 */
export type FinishModeType = "SKIM_LAST_ONLY" | "EACH_STEP";

/**
 * Finish mode configuration.
 *
 * Controls how finish passes are generated.
 */
export interface FinishMode {
  /** Finish mode type */
  mode: FinishModeType;

  /** Optional: start depth for wall-only finish (mm from top, e.g., 2) */
  skimDepthFromTopMm?: number;

  /** Optional: spring pass after through cut */
  springPass?: boolean;
}

/**
 * Default finish mode (skim last only for best surface).
 */
export const DEFAULT_FINISH_MODE: FinishMode = {
  mode: "SKIM_LAST_ONLY",
  springPass: false,
};

// =============================================================================
// Z PLAN
// =============================================================================

/**
 * Z plan stages.
 */
export interface ZPlanStages {
  /** Rough passes (multi-step depth) */
  rough: ZPass[];

  /** Finish passes (wall finishing) */
  finish: ZPass[];

  /** Through passes (final cut-through, optional) */
  through?: ZPass[];
}

/**
 * Z plan audit trail.
 */
export interface ZPlanAudit {
  /** Formula description for audit */
  formula: string;

  /** All Z levels in order */
  zList: number[];

  /** Total passes */
  totalPasses: number;

  /** Onion Z level (if applicable) */
  zOnion?: number;

  /** Through Z level (if applicable) */
  zThrough?: number;

  /** Generation timestamp */
  generatedAt: string;
}

/**
 * Complete Z plan for an operation.
 *
 * Defines the Z schedule with rough, finish, and through stages.
 */
export interface ZPlan {
  /** Plan version */
  version: "1.0";

  /** Operation ID */
  opId: string;

  /** Z stages */
  stages: ZPlanStages;

  /** Z context used */
  context: ZContext;

  /** Tool limits used */
  toolLimits: {
    rough: ZToolLimits;
    finish: ZToolLimits;
  };

  /** Finish mode used */
  finishMode: FinishMode;

  /** Audit trail */
  audit: ZPlanAudit;

  /** Fingerprint (SHA-256 of stable-stringified plan) */
  fingerprint?: string;
}

// =============================================================================
// Z PLAN REQUEST
// =============================================================================

/**
 * Request to build a Z plan.
 */
export interface ZPlanRequest {
  /** Operation ID */
  opId: string;

  /** Z context */
  context: ZContext;

  /** Rough tool limits */
  roughTool: ZToolLimits;

  /** Finish tool limits */
  finishTool: ZToolLimits;

  /** Finish mode (optional, defaults to SKIM_LAST_ONLY) */
  finishMode?: FinishMode;

  /** Tabs enabled for this operation */
  tabsEnabled?: boolean;
}

// =============================================================================
// ISSUE CODES
// =============================================================================

/**
 * Z plan issue codes.
 */
export type ZPlanIssueCode =
  | "CUT_DEPTH_EXCEEDS_LIMIT"           // Depth > T + spoil
  | "STEPDOWN_EXCEEDS_TOOL_LIMIT"       // Pass stepdown > tool max
  | "ONION_SKIN_INVALID"                // Onion < 0 or >= T
  | "TAB_WITHOUT_ONION"                 // Tabs enabled but no onion skin
  | "THROUGH_HAS_TABS_GAPS"             // Through stage still has tab gaps
  | "TOO_MANY_PASSES"                   // Pass count > threshold (burn risk)
  | "ZERO_STEPDOWN"                     // Stepdown = 0
  | "NEGATIVE_Z_TOP"                    // zTop < zBottom (inverted)
  | "FINISH_DEEPER_THAN_ROUGH"          // Finish goes deeper than rough
  | "MISSING_THROUGH_STAGE";            // No through stage but should cut through

/**
 * Z plan issue.
 */
export interface ZPlanIssue {
  code: ZPlanIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  passIndex?: number;
  stage?: ZPassKind;
  data?: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Round to 3 decimal places (0.001mm precision).
 */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Calculate onion Z level.
 *
 * @param thickness Panel thickness (mm)
 * @param onionSkin Onion skin thickness (mm)
 * @returns Z level for onion plane (negative)
 */
export function calculateZOnion(thickness: number, onionSkin: number): number {
  return round3(-(thickness - onionSkin));
}

/**
 * Calculate through Z level.
 *
 * @param thickness Panel thickness (mm)
 * @param spoilExtra Spoilboard penetration (mm)
 * @returns Z level for through cut (negative)
 */
export function calculateZThrough(thickness: number, spoilExtra: number): number {
  return round3(-(thickness + spoilExtra));
}

/**
 * Get total pass count from Z plan.
 */
export function getTotalPassCount(plan: ZPlan): number {
  return (
    plan.stages.rough.length +
    plan.stages.finish.length +
    (plan.stages.through?.length ?? 0)
  );
}

/**
 * Get all passes in execution order.
 *
 * Order: ROUGH → FINISH → THROUGH
 */
export function getAllPassesInOrder(plan: ZPlan): ZPass[] {
  return [
    ...plan.stages.rough,
    ...plan.stages.finish,
    ...(plan.stages.through ?? []),
  ];
}

/**
 * Get deepest Z level in plan.
 */
export function getDeepestZ(plan: ZPlan): number {
  const allPasses = getAllPassesInOrder(plan);
  if (allPasses.length === 0) return 0;
  return Math.min(...allPasses.map((p) => p.zBottom));
}
