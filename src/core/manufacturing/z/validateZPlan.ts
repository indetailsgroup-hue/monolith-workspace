// src/core/manufacturing/z/validateZPlan.ts
/**
 * Z Plan Validation.
 *
 * Validates Z plans for factory safety:
 * - Depth limits (not exceeding material + spoil)
 * - Stepdown limits (tool constraints)
 * - Onion skin validity
 * - Tab/onion compatibility
 * - Through stage requirements
 *
 * Gate checks:
 * - BLOCK: CUT_DEPTH_EXCEEDS_LIMIT, STEPDOWN_EXCEEDS_TOOL_LIMIT, etc.
 * - WARN: TOO_MANY_PASSES, etc.
 *
 * v0.10.6.8 - Z-aware Path Planning
 */

import {
  ZPlan,
  ZPlanIssue,
  ZPlanIssueCode,
  ZPass,
  ZPassKind,
  ZContext,
  ZToolLimits,
  round3,
  getDeepestZ,
  getTotalPassCount,
} from "./zPlan.v1";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum passes before warning (burn/efficiency risk) */
const MAX_PASSES_WARN = 30;

/** Minimum onion skin thickness (mm) */
const MIN_ONION_SKIN_MM = 0.2;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Validation result.
 */
export interface ZPlanValidationResult {
  /** Is the plan valid? */
  valid: boolean;

  /** All issues found */
  issues: ZPlanIssue[];

  /** Blocking issues */
  blocks: ZPlanIssue[];

  /** Warning issues */
  warnings: ZPlanIssue[];

  /** Info issues */
  info: ZPlanIssue[];
}

/**
 * Validation context (external factors).
 */
export interface ZPlanValidationContext {
  /** Tabs enabled for this operation */
  tabsEnabled?: boolean;

  /** Through cut is required */
  requiresThrough?: boolean;

  /** Has tab gaps in through stage spans */
  throughHasTabGaps?: boolean;
}

// =============================================================================
// INDIVIDUAL VALIDATORS
// =============================================================================

/**
 * Validate cut depth doesn't exceed limits.
 */
function validateCutDepth(
  plan: ZPlan,
  context: ZContext
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];
  const deepestZ = getDeepestZ(plan);
  const maxAllowedZ = round3(-(context.finishedThicknessMm + context.spoilExtraMm + 1)); // 1mm tolerance

  if (deepestZ < maxAllowedZ) {
    issues.push({
      code: "CUT_DEPTH_EXCEEDS_LIMIT",
      severity: "BLOCK",
      message: `Deepest Z (${deepestZ}mm) exceeds limit (${maxAllowedZ}mm)`,
      data: {
        deepestZ,
        maxAllowedZ,
        excessMm: round3(maxAllowedZ - deepestZ),
      },
    });
  }

  return issues;
}

/**
 * Validate stepdown doesn't exceed tool limits.
 */
function validateStepdown(
  plan: ZPlan
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];

  // Check rough passes
  const roughLimit = plan.toolLimits.rough.maxStepdownMm;
  for (const pass of plan.stages.rough) {
    if (pass.stepdownMm > roughLimit + 0.001) {
      issues.push({
        code: "STEPDOWN_EXCEEDS_TOOL_LIMIT",
        severity: "BLOCK",
        message: `Rough pass ${pass.passIndex} stepdown (${pass.stepdownMm}mm) exceeds limit (${roughLimit}mm)`,
        passIndex: pass.passIndex,
        stage: "ROUGH",
        data: {
          stepdown: pass.stepdownMm,
          limit: roughLimit,
        },
      });
    }
  }

  // Check finish passes
  const finishLimit = plan.toolLimits.finish.finishStepdownMm ?? plan.toolLimits.finish.maxStepdownMm;
  for (const pass of plan.stages.finish) {
    if (pass.stepdownMm > finishLimit + 0.001) {
      issues.push({
        code: "STEPDOWN_EXCEEDS_TOOL_LIMIT",
        severity: "BLOCK",
        message: `Finish pass ${pass.passIndex} stepdown (${pass.stepdownMm}mm) exceeds limit (${finishLimit}mm)`,
        passIndex: pass.passIndex,
        stage: "FINISH",
        data: {
          stepdown: pass.stepdownMm,
          limit: finishLimit,
        },
      });
    }
  }

  // Check through passes
  if (plan.stages.through) {
    for (const pass of plan.stages.through) {
      if (pass.stepdownMm > finishLimit + 0.001) {
        issues.push({
          code: "STEPDOWN_EXCEEDS_TOOL_LIMIT",
          severity: "BLOCK",
          message: `Through pass ${pass.passIndex} stepdown (${pass.stepdownMm}mm) exceeds limit (${finishLimit}mm)`,
          passIndex: pass.passIndex,
          stage: "THROUGH",
          data: {
            stepdown: pass.stepdownMm,
            limit: finishLimit,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Validate onion skin configuration.
 */
function validateOnionSkin(
  plan: ZPlan,
  context: ZContext
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];
  const onion = context.onionSkinMm;
  const T = context.finishedThicknessMm;

  // Check for invalid onion skin
  if (onion < 0) {
    issues.push({
      code: "ONION_SKIN_INVALID",
      severity: "BLOCK",
      message: `Onion skin cannot be negative (${onion}mm)`,
      data: { onionSkinMm: onion },
    });
  }

  if (onion >= T) {
    issues.push({
      code: "ONION_SKIN_INVALID",
      severity: "BLOCK",
      message: `Onion skin (${onion}mm) must be less than material thickness (${T}mm)`,
      data: {
        onionSkinMm: onion,
        thicknessMm: T,
      },
    });
  }

  // Warn if onion skin is very thin
  if (onion > 0 && onion < MIN_ONION_SKIN_MM) {
    issues.push({
      code: "ONION_SKIN_INVALID",
      severity: "WARN",
      message: `Onion skin (${onion}mm) is very thin - may break early`,
      data: {
        onionSkinMm: onion,
        recommendedMinMm: MIN_ONION_SKIN_MM,
      },
    });
  }

  return issues;
}

/**
 * Validate tab/onion compatibility.
 */
function validateTabOnion(
  plan: ZPlan,
  validationContext: ZPlanValidationContext
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];

  // If tabs enabled but no onion skin, part will release during cutting
  if (validationContext.tabsEnabled && plan.context.onionSkinMm === 0) {
    issues.push({
      code: "TAB_WITHOUT_ONION",
      severity: "BLOCK",
      message: "Tabs enabled but no onion skin - part will release during rough cutting",
      data: {
        tabsEnabled: true,
        onionSkinMm: 0,
      },
    });
  }

  // If through stage has tab gaps, part won't fully release
  if (validationContext.throughHasTabGaps && plan.stages.through) {
    issues.push({
      code: "THROUGH_HAS_TABS_GAPS",
      severity: "BLOCK",
      message: "Through stage has tab gaps - part will not fully release",
      data: {
        throughHasTabGaps: true,
        throughPassCount: plan.stages.through.length,
      },
    });
  }

  return issues;
}

/**
 * Validate through stage requirements.
 */
function validateThroughStage(
  plan: ZPlan,
  validationContext: ZPlanValidationContext
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];

  // If through cut required but no through stage
  if (validationContext.requiresThrough && !plan.stages.through) {
    issues.push({
      code: "MISSING_THROUGH_STAGE",
      severity: "BLOCK",
      message: "Through cut required but no through stage in plan",
      data: {
        requiresThrough: true,
        hasOnionSkin: plan.context.onionSkinMm > 0,
      },
    });
  }

  return issues;
}

/**
 * Validate pass count (efficiency warning).
 */
function validatePassCount(
  plan: ZPlan
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];
  const totalPasses = getTotalPassCount(plan);

  if (totalPasses > MAX_PASSES_WARN) {
    issues.push({
      code: "TOO_MANY_PASSES",
      severity: "WARN",
      message: `${totalPasses} passes may be slow and risk burning - consider larger stepdown`,
      data: {
        totalPasses,
        threshold: MAX_PASSES_WARN,
      },
    });
  }

  return issues;
}

/**
 * Validate Z ordering (no inverted passes).
 */
function validateZOrdering(
  plan: ZPlan
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];

  const validateStage = (passes: ZPass[], stageName: ZPassKind) => {
    for (const pass of passes) {
      if (pass.zTop < pass.zBottom) {
        issues.push({
          code: "NEGATIVE_Z_TOP",
          severity: "BLOCK",
          message: `${stageName} pass ${pass.passIndex} has inverted Z (top=${pass.zTop} < bottom=${pass.zBottom})`,
          passIndex: pass.passIndex,
          stage: stageName,
          data: {
            zTop: pass.zTop,
            zBottom: pass.zBottom,
          },
        });
      }

      if (pass.stepdownMm <= 0 && pass.zTop !== pass.zBottom) {
        issues.push({
          code: "ZERO_STEPDOWN",
          severity: "WARN",
          message: `${stageName} pass ${pass.passIndex} has zero or negative stepdown`,
          passIndex: pass.passIndex,
          stage: stageName,
          data: {
            stepdownMm: pass.stepdownMm,
          },
        });
      }
    }
  };

  validateStage(plan.stages.rough, "ROUGH");
  validateStage(plan.stages.finish, "FINISH");
  if (plan.stages.through) {
    validateStage(plan.stages.through, "THROUGH");
  }

  return issues;
}

/**
 * Validate finish doesn't go deeper than rough.
 */
function validateFinishDepth(
  plan: ZPlan
): ZPlanIssue[] {
  const issues: ZPlanIssue[] = [];

  if (plan.stages.rough.length === 0 || plan.stages.finish.length === 0) {
    return issues;
  }

  const deepestRough = Math.min(...plan.stages.rough.map((p) => p.zBottom));
  const deepestFinish = Math.min(...plan.stages.finish.map((p) => p.zBottom));

  // Finish should not go deeper than rough (with small tolerance)
  if (deepestFinish < deepestRough - 0.001) {
    issues.push({
      code: "FINISH_DEEPER_THAN_ROUGH",
      severity: "BLOCK",
      message: `Finish depth (${deepestFinish}mm) is deeper than rough (${deepestRough}mm)`,
      data: {
        deepestFinish,
        deepestRough,
        differenceMm: round3(deepestRough - deepestFinish),
      },
    });
  }

  return issues;
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Validate a Z plan.
 *
 * Checks:
 * - Cut depth limits
 * - Stepdown limits
 * - Onion skin validity
 * - Tab/onion compatibility
 * - Through stage requirements
 * - Pass count
 * - Z ordering
 * - Finish depth
 *
 * @param plan Z plan to validate
 * @param validationContext External validation context
 * @returns Validation result
 */
export function validateZPlan(
  plan: ZPlan,
  validationContext: ZPlanValidationContext = {}
): ZPlanValidationResult {
  const allIssues: ZPlanIssue[] = [];

  // Run all validations
  allIssues.push(...validateCutDepth(plan, plan.context));
  allIssues.push(...validateStepdown(plan));
  allIssues.push(...validateOnionSkin(plan, plan.context));
  allIssues.push(...validateTabOnion(plan, validationContext));
  allIssues.push(...validateThroughStage(plan, validationContext));
  allIssues.push(...validatePassCount(plan));
  allIssues.push(...validateZOrdering(plan));
  allIssues.push(...validateFinishDepth(plan));

  // Categorize issues
  const blocks = allIssues.filter((i) => i.severity === "BLOCK");
  const warnings = allIssues.filter((i) => i.severity === "WARN");
  const info = allIssues.filter((i) => i.severity === "INFO");

  // Determine validity
  const valid = blocks.length === 0;

  return {
    valid,
    issues: allIssues,
    blocks,
    warnings,
    info,
  };
}

/**
 * Quick validation (blocking issues only).
 */
export function quickValidateZPlan(
  plan: ZPlan,
  validationContext: ZPlanValidationContext = {}
): boolean {
  const result = validateZPlan(plan, validationContext);
  return result.valid;
}

// =============================================================================
// AUDIT HELPERS
// =============================================================================

/**
 * Generate validation audit report.
 */
export function generateZPlanValidationReport(
  result: ZPlanValidationResult
): Record<string, unknown> {
  return {
    valid: result.valid,
    summary: {
      total: result.issues.length,
      blocks: result.blocks.length,
      warnings: result.warnings.length,
      info: result.info.length,
    },
    blockingIssues: result.blocks.map((i) => ({
      code: i.code,
      message: i.message,
      stage: i.stage,
      passIndex: i.passIndex,
    })),
    warnings: result.warnings.map((i) => ({
      code: i.code,
      message: i.message,
    })),
  };
}

/**
 * Format validation issues for display.
 */
export function formatZPlanValidationIssues(
  result: ZPlanValidationResult
): string[] {
  return result.issues.map((i) => {
    const prefix = i.severity === "BLOCK" ? "ERROR" : i.severity;
    const context = i.stage ? ` [${i.stage}:${i.passIndex ?? "?"}]` : "";
    return `[${prefix}]${context} ${i.message}`;
  });
}

// =============================================================================
// POLICY HELPERS
// =============================================================================

/**
 * Check if plan needs through stage based on operation.
 */
export function checkThroughStageRequired(
  opKind: "PROFILE" | "POCKET" | "GROOVE",
  cutSide?: "INSIDE" | "OUTSIDE"
): boolean {
  // Profiles always need through stage for part release
  if (opKind === "PROFILE") {
    return true;
  }

  // Inside cuts (holes) need through stage
  if (cutSide === "INSIDE") {
    return true;
  }

  // Pockets and grooves don't need through stage
  return false;
}

/**
 * Check if tabs should be ignored for through stage.
 *
 * Factory rule: Through stage ignores tabs (full perimeter)
 * to ensure complete part release.
 */
export function shouldIgnoreTabsForThrough(
  tabsEnabled: boolean,
  onionSkinMm: number
): boolean {
  // If tabs enabled and we have onion skin, through stage should ignore tabs
  return tabsEnabled && onionSkinMm > 0;
}
