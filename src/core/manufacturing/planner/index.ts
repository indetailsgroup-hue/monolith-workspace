// src/core/manufacturing/planner/index.ts
/**
 * Manufacturing Planner Module.
 *
 * Multi-tool routing, operation planning, and tool change optimization.
 *
 * Key features:
 * - Rough → Finish tool workflows
 * - Deterministic pass ordering
 * - Tool change minimization
 * - Stage-based macro ordering (safety constraints)
 * - Nearest-neighbor micro ordering (travel optimization)
 * - Audit-friendly fingerprints
 *
 * Usage:
 * ```typescript
 * import {
 *   planMultiTool,
 *   validateMultiToolPlan,
 *   planToolChanges,
 *   ToolDef,
 *   OpIntent,
 *   PassNode,
 * } from './planner';
 *
 * // Define tools
 * const tools: ToolDef[] = [
 *   { id: 'rough6', diameterMm: 6, class: 'UPCUT', ... },
 *   { id: 'finish3', diameterMm: 3, class: 'COMPRESSION', ... },
 * ];
 *
 * // Define operations
 * const ops: OpIntent[] = [
 *   {
 *     opId: 'profile1',
 *     kind: 'PROFILE',
 *     cutSide: 'OUTSIDE',
 *     toolStrategy: { roughTool: 'rough6', finishTool: 'finish3', ... },
 *     ...
 *   },
 * ];
 *
 * // Generate multi-tool plan
 * const { plan, issues, valid } = planMultiTool(ops, tools);
 *
 * // Validate with context
 * const validation = validateMultiToolPlan(plan, ops, context);
 *
 * // Tool change planning (stage-based + travel optimization)
 * const nodes: PassNode[] = [...]; // From multi-tool plan
 * const toolChangePlan = planToolChanges({
 *   jobId: 'job123',
 *   nodes,
 *   machineHome: { x: 0, y: 0 },
 * });
 * ```
 *
 * v0.10.6.9 - Tool Change Planner + Op Merge
 */

// =============================================================================
// TYPES
// =============================================================================

// Tool Types
export type {
  ToolId,
  ToolClass,
  ToolDef,
  ToolStrategy,
} from "./multiToolPlan.v1";

export {
  DEFAULT_TOOL_STRATEGY,
} from "./multiToolPlan.v1";

// Operation Types
export type {
  OpKind,
  CutSide,
  GeometryRef,
  Allowances,
  TabConfig,
  OpIntent,
} from "./multiToolPlan.v1";

export {
  DEFAULT_ALLOWANCES,
} from "./multiToolPlan.v1";

// Pass Types
export type {
  PassStage,
  PlannedPass,
  ToolChangeBlock,
} from "./multiToolPlan.v1";

// Plan Types
export type {
  PlanAudit,
  PlanStats,
  MultiToolPlan,
  MultiToolIssueCode,
  MultiToolIssue,
} from "./multiToolPlan.v1";

// Helpers
export {
  calculateRoughStockToLeave,
  generatePassId,
  parsePassId,
} from "./multiToolPlan.v1";

// =============================================================================
// PLANNER
// =============================================================================

export type {
  PlannerConfig,
  ToolLibrary,
  PlannerResult,
} from "./multiToolPlanner";

export {
  DEFAULT_PLANNER_CONFIG,
  createToolLibrary,
  planMultiTool,
  getAllPassesInOrder,
  getPassesForOp,
  getToolChangeSequence,
  countToolChanges,
  estimateTotalTime,
  generatePlanAuditReport,
} from "./multiToolPlanner";

// =============================================================================
// VALIDATION
// =============================================================================

export type {
  MaterialForValidation,
  GeometryForValidation,
  ValidationContext,
  ValidationResult,
} from "./validateMultiToolPlan";

export {
  validateMultiToolPlan,
  quickValidatePlan,
  generateValidationAuditReport,
  formatValidationIssues,
} from "./validateMultiToolPlan";

// =============================================================================
// TOOL CHANGE PLANNER (v0.10.6.9)
// =============================================================================

// Stage & Window Types
export type {
  Stage,
  StageWindow,
  BBox,
  Point2D,
  PathRef,
  RiskLevel,
  PassNode,
  ToolBlockPlan,
  PlanObjective,
  ToolChangePlanAudit,
  ToolChangePlan,
  ToolChangePlanRequest,
  ToolChangePlanIssueCode,
  ToolChangePlanIssue,
} from "./toolChangePlanner.v1";

export {
  STAGE_PRIORITY,
  DEFAULT_STAGE_WINDOWS,
  getStagePriority,
  generateNodeId,
  parseNodeId,
  distance,
  bboxCenter,
  getNodeStartPoint,
  getNodeEndPoint,
  mustPrecede,
  canShareWindow,
} from "./toolChangePlanner.v1";

// Planner
export type {
  ToolChangePlannerResult,
} from "./toolChangePlanner";

export {
  planToolChanges,
  getAllNodesInOrder,
  getNodesForPart,
  getNodesForOp,
  getToolSequence,
  countToolChangesInPlan,
  estimateExecutionTime,
  generateToolChangePlanAuditReport,
  createPassNode,
} from "./toolChangePlanner";

// Validation
export type {
  ToolChangePlanValidationResult,
} from "./validateToolChangePlan";

export {
  validateToolChangePlan,
  quickValidateToolChangePlan,
  generateValidationReport,
  formatValidationIssues as formatToolChangePlanIssues,
  buildPrecedenceGraph,
} from "./validateToolChangePlan";
