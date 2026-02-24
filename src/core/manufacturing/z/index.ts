// src/core/manufacturing/z/index.ts
/**
 * Z-aware Path Planning Module.
 *
 * Converts 2D paths to Z-level manufacturing sequences:
 * - Stepdown scheduling by tool limits
 * - Onion skin support (hold-down strategy)
 * - Finish-only walls (SKIM_LAST_ONLY)
 * - Through stage (part release)
 * - Integration with tabs and entry/exit
 *
 * Usage:
 * ```typescript
 * import {
 *   buildProfileZPlan,
 *   validateZPlan,
 *   ZContext,
 *   ZToolLimits,
 * } from './z';
 *
 * // Define context
 * const context: ZContext = {
 *   finishedThicknessMm: 18,
 *   cutDepthMm: 18.6,
 *   spoilExtraMm: 0.6,
 *   onionSkinMm: 0.8,
 *   topZ: 0,
 *   safeZ: 10,
 * };
 *
 * // Define tool limits
 * const roughTool: ZToolLimits = { maxStepdownMm: 8 };
 * const finishTool: ZToolLimits = { maxStepdownMm: 4, finishStepdownMm: 4 };
 *
 * // Build Z plan
 * const plan = buildProfileZPlan({
 *   opId: 'op1',
 *   context,
 *   roughTool,
 *   finishTool,
 *   finishMode: { mode: 'SKIM_LAST_ONLY' },
 * });
 *
 * // Validate
 * const validation = validateZPlan(plan, { tabsEnabled: true });
 * if (!validation.valid) {
 *   console.error('Z plan invalid:', validation.blocks);
 * }
 * ```
 *
 * Stage mapping to planner:
 * - rough passes → PROFILE_ROUGH stage
 * - finish passes → PROFILE_FINISH stage
 * - through passes → PROFILE_THROUGH stage
 *
 * v0.10.6.8 - Z-aware Path Planning
 */

// =============================================================================
// TYPES
// =============================================================================

// Core types
export type {
  ZContext,
  ZToolLimits,
  ZPassKind,
  ZPass,
  FinishModeType,
  FinishMode,
  ZPlanStages,
  ZPlanAudit,
  ZPlan,
  ZPlanRequest,
  ZPlanIssueCode,
  ZPlanIssue,
} from "./zPlan.v1";

// Defaults
export {
  DEFAULT_Z_CONTEXT,
  DEFAULT_Z_TOOL_LIMITS,
  DEFAULT_FINISH_MODE,
} from "./zPlan.v1";

// Helpers
export {
  round3,
  calculateZOnion,
  calculateZThrough,
  getTotalPassCount,
  getAllPassesInOrder,
  getDeepestZ,
} from "./zPlan.v1";

// =============================================================================
// BUILDERS
// =============================================================================

export {
  splitDepth,
  calculateEqualStepdown,
  generateFinishPasses,
  generateSpringPass,
  generateThroughPasses,
  buildProfileZPlan,
  buildPocketZPlan,
  buildGrooveZPlan,
  estimateZPlanTime,
  generateZPlanSummary,
} from "./buildZPlan";

// =============================================================================
// VALIDATION
// =============================================================================

export type {
  ZPlanValidationResult,
  ZPlanValidationContext,
} from "./validateZPlan";

export {
  validateZPlan,
  quickValidateZPlan,
  generateZPlanValidationReport,
  formatZPlanValidationIssues,
  checkThroughStageRequired,
  shouldIgnoreTabsForThrough,
} from "./validateZPlan";
