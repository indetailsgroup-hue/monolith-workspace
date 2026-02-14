// src/core/manufacturing/planner/multiToolPlan.v1.ts
/**
 * Multi-Tool Routing Plan Types.
 *
 * Defines contracts for multi-tool manufacturing:
 * - Roughing tool (large/fast) → Finishing tool (small/precise)
 * - Deterministic pass ordering
 * - Tool change minimization
 * - Audit-friendly fingerprints
 *
 * Key concepts:
 * - ToolDef: Tool specifications (diameter, class, feeds)
 * - ToolStrategy: Which tools for rough/finish
 * - OpIntent: Operation intent with geometry and allowances
 * - PlannedPass: Single pass with tool and offset specs
 * - ToolChangeBlock: Group of passes with same tool
 * - MultiToolPlan: Complete ordered plan
 *
 * v0.10.6.7 - Multi-Tool Routing
 */

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool identifier (unique within tool library).
 */
export type ToolId = string;

/**
 * Tool classification for manufacturing decisions.
 */
export type ToolClass =
  | "COMPRESSION"  // Compression spiral (best for laminates)
  | "DOWNCUT"      // Downcut spiral (clean top surface)
  | "UPCUT"        // Upcut spiral (clean bottom, chip ejection)
  | "STRAIGHT"     // Straight flute (plunge capable)
  | "BALLNOSE"     // Ball nose (3D profiling)
  | "VBIT";        // V-bit (chamfers, engraving)

/**
 * Tool definition with manufacturing parameters.
 */
export interface ToolDef {
  /** Unique tool identifier */
  id: ToolId;

  /** Tool diameter in mm */
  diameterMm: number;

  /** Tool classification */
  class: ToolClass;

  /** Cutting edge length (flute length) in mm */
  fluteLenMm?: number;

  /** Maximum depth per pass in mm */
  maxStepdownMm: number;

  /** Maximum lateral step (for pocketing) in mm */
  maxStepoverMm: number;

  /** Default feed rates */
  defaultFeeds: {
    /** Cutting feed rate (mm/min) */
    cut: number;
    /** Plunge feed rate (mm/min) */
    plunge: number;
  };

  /** Tool priority (lower = prefer for finish) */
  priority?: number;

  /** Human-readable description */
  description?: string;
}

// =============================================================================
// TOOL STRATEGY
// =============================================================================

/**
 * Tool strategy for an operation.
 *
 * Defines which tools to use for rough and finish passes.
 */
export interface ToolStrategy {
  /** Roughing tool ID (optional - skip rough if not specified) */
  roughTool?: ToolId;

  /** Finishing tool ID (required) */
  finishTool: ToolId;

  /** Stock to leave on rough pass (mm) - for finish to clean up */
  roughStockToLeaveMm: number;

  /** Number of finish passes (usually 1) */
  finishPassCount: number;

  /** Number of rough passes (1..N, stepdown handled separately) */
  roughPassCount: number;
}

/**
 * Default tool strategy (single tool, no roughing).
 */
export const DEFAULT_TOOL_STRATEGY: Omit<ToolStrategy, "finishTool"> = {
  roughStockToLeaveMm: 0,
  finishPassCount: 1,
  roughPassCount: 1,
};

// =============================================================================
// OPERATION INTENT
// =============================================================================

/**
 * Operation kind.
 */
export type OpKind = "PROFILE" | "GROOVE" | "POCKET";

/**
 * Cut side for profile operations.
 */
export type CutSide = "OUTSIDE" | "INSIDE";

/**
 * Geometry reference for an operation.
 */
export interface GeometryRef {
  /** Outer boundary path ID */
  outerPathId: string;

  /** Inner boundary (hole) path IDs */
  innerPathIds: string[];
}

/**
 * Manufacturing allowances.
 */
export interface Allowances {
  /** User/designer adjustment (mm) */
  userMm: number;

  /** Kerf/saw allowance (mm) */
  kerfMm: number;

  /** Finish allowance - stock left for finish pass (mm) */
  finishAllowMm: number;
}

/**
 * Default allowances.
 */
export const DEFAULT_ALLOWANCES: Allowances = {
  userMm: 0,
  kerfMm: 0,
  finishAllowMm: 0.3,
};

/**
 * Tab configuration for an operation.
 */
export interface TabConfig {
  /** Enable tabs for this operation */
  enabled: boolean;

  /** Tab policy ID (references tab placement policy) */
  tabPolicyId?: string;

  /** Override: minimum tab count */
  minTabCount?: number;

  /** Override: tab width (mm) */
  tabWidthMm?: number;
}

/**
 * Operation intent - what to manufacture.
 *
 * This is the input to the multi-tool planner.
 */
export interface OpIntent {
  /** Unique operation ID */
  opId: string;

  /** Operation kind */
  kind: OpKind;

  /** Cut side (PROFILE only) */
  cutSide?: CutSide;

  /** Geometry reference */
  geometryRef: GeometryRef;

  /** Material reference (ID in material library) */
  materialRef: string;

  /** Manufacturing allowances */
  allowances: Allowances;

  /** Tab configuration */
  tabs?: TabConfig;

  /** Tool strategy for this operation */
  toolStrategy: ToolStrategy;

  /** Operation priority (lower = machine first) */
  priority?: number;

  /** Human-readable description */
  description?: string;
}

// =============================================================================
// PLANNED PASS
// =============================================================================

/**
 * Pass stage (rough or finish).
 */
export type PassStage = "ROUGH" | "FINISH";

/**
 * A planned manufacturing pass.
 *
 * One pass = one complete toolpath at one Z level with one tool.
 */
export interface PlannedPass {
  /** Unique pass ID (format: opId:stage:index) */
  passId: string;

  /** Parent operation ID */
  opId: string;

  /** Pass stage */
  stage: PassStage;

  /** Pass index within stage (1-based) */
  passIndex: number;

  /** Tool ID for this pass */
  toolId: ToolId;

  /** Tool diameter (cached for convenience) */
  toolDiameterMm: number;

  /** SHA-256 fingerprint of OffsetSpec */
  offsetSpecFp: string;

  /** SHA-256 fingerprint of EntryExitDecision */
  entryExitFp: string;

  /** Emitted toolpath IDs (filled by compiler) */
  pathIds: string[];

  /** Stock to leave for this pass (mm) */
  stockToLeaveMm: number;

  /** Z depth for this pass (mm, negative) */
  zDepthMm?: number;

  /** Estimated machining time (seconds) */
  estimatedTimeSec?: number;
}

// =============================================================================
// TOOL CHANGE BLOCK
// =============================================================================

/**
 * A block of passes using the same tool.
 *
 * Minimizes tool changes by grouping operations.
 */
export interface ToolChangeBlock {
  /** Tool ID for this block */
  toolId: ToolId;

  /** Tool diameter (mm) */
  toolDiameterMm: number;

  /** Tool class */
  toolClass: ToolClass;

  /** Ordered passes in this block */
  passes: PlannedPass[];

  /** Block index (0-based, for ordering) */
  blockIndex: number;

  /** Estimated total time for block (seconds) */
  estimatedTimeSec?: number;
}

// =============================================================================
// MULTI-TOOL PLAN
// =============================================================================

/**
 * Audit trail for multi-tool plan.
 */
export interface PlanAudit {
  /** Original operation order */
  opOrder: string[];

  /** Tool usage order */
  toolOrder: ToolId[];

  /** All fingerprints (offset + entry/exit) in order */
  fingerprints: string[];

  /** Plan generation timestamp */
  generatedAt: string;

  /** Planner version */
  plannerVersion: string;
}

/**
 * Plan statistics.
 */
export interface PlanStats {
  /** Total number of operations */
  totalOps: number;

  /** Total number of passes */
  totalPasses: number;

  /** Number of tool changes */
  toolChanges: number;

  /** Number of unique tools */
  uniqueTools: number;

  /** Rough passes count */
  roughPasses: number;

  /** Finish passes count */
  finishPasses: number;

  /** Estimated total time (seconds) */
  estimatedTotalTimeSec?: number;
}

/**
 * Complete multi-tool manufacturing plan.
 *
 * This is the output of the multi-tool planner.
 */
export interface MultiToolPlan {
  /** Plan version */
  version: "1.0";

  /** Ordered tool change blocks */
  blocks: ToolChangeBlock[];

  /** Audit trail */
  audit: PlanAudit;

  /** Plan statistics */
  stats: PlanStats;

  /** Validation warnings (non-blocking) */
  warnings: string[];
}

// =============================================================================
// ISSUE CODES
// =============================================================================

/**
 * Multi-tool plan issue codes for gate checks.
 */
export type MultiToolIssueCode =
  | "LAMINATE_NO_COMPRESSION_FINISH"   // Laminate without compression/downcut finish
  | "ROUGH_STOCK_NEGATIVE"             // Rough stock calculation went negative
  | "ROUGH_PATH_COLLAPSED"             // Rough offset resulted in empty path
  | "TOOL_TOO_BIG_FOR_FEATURE"         // Tool diameter > feature size
  | "TOOL_NOT_FOUND"                   // Referenced tool not in library
  | "FINISH_TOOL_MISSING"              // No finish tool specified
  | "DUPLICATE_OP_ID"                  // Duplicate operation ID
  | "INVALID_GEOMETRY_REF"             // Invalid geometry reference
  | "ROUGH_BIGGER_THAN_FINISH";        // Rough tool bigger than finish (unusual)

/**
 * Multi-tool plan issue.
 */
export interface MultiToolIssue {
  code: MultiToolIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  opId?: string;
  toolId?: ToolId;
  data?: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate recommended rough stock to leave.
 *
 * Formula: max(finishAllow, (Rr - Rf) + finishAllow)
 * - If rough tool <= finish tool: just use finishAllow
 * - If rough tool > finish tool: add radius difference
 *
 * @param roughDiaMm Rough tool diameter (mm)
 * @param finishDiaMm Finish tool diameter (mm)
 * @param finishAllowMm Desired finish allowance (mm)
 * @returns Recommended stock to leave (mm)
 */
export function calculateRoughStockToLeave(
  roughDiaMm: number,
  finishDiaMm: number,
  finishAllowMm: number
): number {
  const Rr = roughDiaMm * 0.5;
  const Rf = finishDiaMm * 0.5;
  const radiusDiff = Rr - Rf;

  // If rough is smaller or equal, just use finish allowance
  if (radiusDiff <= 0) {
    return Math.max(0, finishAllowMm);
  }

  // If rough is bigger, add the radius difference
  return Math.max(0, radiusDiff + finishAllowMm);
}

/**
 * Generate pass ID from components.
 *
 * @param opId Operation ID
 * @param stage Pass stage
 * @param index Pass index (1-based)
 * @returns Pass ID string
 */
export function generatePassId(
  opId: string,
  stage: PassStage,
  index: number
): string {
  return `${opId}:${stage.toLowerCase()}:${index}`;
}

/**
 * Parse pass ID into components.
 *
 * @param passId Pass ID string
 * @returns Parsed components or null if invalid
 */
export function parsePassId(
  passId: string
): { opId: string; stage: PassStage; index: number } | null {
  const parts = passId.split(":");
  if (parts.length !== 3) return null;

  const [opId, stageStr, indexStr] = parts;
  const stage = stageStr.toUpperCase() as PassStage;
  const index = parseInt(indexStr, 10);

  if (stage !== "ROUGH" && stage !== "FINISH") return null;
  if (isNaN(index) || index < 1) return null;

  return { opId, stage, index };
}
