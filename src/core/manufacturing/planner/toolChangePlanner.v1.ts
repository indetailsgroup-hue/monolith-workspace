// src/core/manufacturing/planner/toolChangePlanner.v1.ts
/**
 * Tool Change Planner Types.
 *
 * Defines contracts for optimized tool change planning:
 * - Stage-based ordering (safety first)
 * - Tool grouping (minimize swaps)
 * - Travel optimization (within safety constraints)
 * - Deterministic + auditable
 *
 * Key concepts:
 * - Stage: Operation phase (DRILL → POCKET → PROFILE_ROUGH → FINISH → THROUGH)
 * - PassNode: Single executable unit with geometry refs
 * - ToolBlockPlan: Group of nodes using same tool
 * - ToolChangePlan: Complete ordered plan
 *
 * Safety constraints:
 * - PROFILE_THROUGH must be last (part release)
 * - Internal ops before profile (part stability)
 * - Onion skin ops before through cuts
 *
 * v0.10.6.9 - Tool Change Planner + Op Merge
 */

// =============================================================================
// STAGE DEFINITIONS
// =============================================================================

/**
 * Operation stage for priority ordering.
 *
 * Priority order (lower = earlier):
 * 1. DRILL (10) - Locating/alignment holes first
 * 2. POCKET (20) - Internal features while part is stable
 * 3. GROOVE (30) - Internal grooves/dados
 * 4. PROFILE_ROUGH (40) - Rough profile with onion skin
 * 5. PROFILE_FINISH (50) - Finish profile (still held by onion)
 * 6. PROFILE_THROUGH (60) - Final through cut (part release)
 */
export type Stage =
  | "DRILL"
  | "POCKET"
  | "GROOVE"
  | "PROFILE_ROUGH"
  | "PROFILE_FINISH"
  | "PROFILE_THROUGH";

/**
 * Stage priority values.
 */
export const STAGE_PRIORITY: Record<Stage, number> = {
  DRILL: 10,
  POCKET: 20,
  GROOVE: 30,
  PROFILE_ROUGH: 40,
  PROFILE_FINISH: 50,
  PROFILE_THROUGH: 60,
};

/**
 * Stage windows for macro ordering.
 *
 * Nodes are grouped into windows, and tool changes
 * are minimized within each window.
 */
export interface StageWindow {
  /** Window name for audit */
  name: string;

  /** Minimum priority (inclusive) */
  minPriority: number;

  /** Maximum priority (inclusive) */
  maxPriority: number;

  /** Stages included in this window */
  stages: Stage[];
}

/**
 * Default stage windows.
 */
export const DEFAULT_STAGE_WINDOWS: StageWindow[] = [
  {
    name: "INTERNAL",
    minPriority: 10,
    maxPriority: 30,
    stages: ["DRILL", "POCKET", "GROOVE"],
  },
  {
    name: "PROFILE_ROUGH",
    minPriority: 40,
    maxPriority: 40,
    stages: ["PROFILE_ROUGH"],
  },
  {
    name: "PROFILE_FINISH",
    minPriority: 50,
    maxPriority: 50,
    stages: ["PROFILE_FINISH"],
  },
  {
    name: "PROFILE_THROUGH",
    minPriority: 60,
    maxPriority: 60,
    stages: ["PROFILE_THROUGH"],
  },
];

// =============================================================================
// PATH REFERENCE
// =============================================================================

/**
 * Bounding box for a path.
 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 2D point.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Reference to a toolpath with geometry info.
 *
 * Used for travel optimization calculations.
 */
export interface PathRef {
  /** Path/span ID */
  pathId: string;

  /** Start point (tool entry) */
  start: Point2D;

  /** End point (tool exit) */
  end: Point2D;

  /** Bounding box */
  bbox: BBox;

  /** Sheet/nest ID */
  sheetId: string;

  /** Estimated cut length (mm) */
  lengthMm?: number;

  /** Estimated cut time (seconds) */
  timeSec?: number;
}

// =============================================================================
// PASS NODE
// =============================================================================

/**
 * Risk level for a pass.
 *
 * HIGH: Laminate finish, tight tolerance, chip-out prone
 * NORMAL: Standard operation
 */
export type RiskLevel = "HIGH" | "NORMAL";

/**
 * A pass node - single executable unit.
 *
 * One node = one complete pass that can be executed atomically.
 * Nodes are the units of ordering in the planner.
 */
export interface PassNode {
  /** Unique node ID (deterministic: sheetId:opId:stage:toolId:passIndex) */
  nodeId: string;

  /** Parent operation ID */
  opId: string;

  /** Part ID (for precedence constraints within part) */
  partId: string;

  /** Stage for priority ordering */
  stage: Stage;

  /** Tool ID */
  toolId: string;

  /** Sheet/nest ID */
  sheetId: string;

  /** Path references (can be multiple spans) */
  pathRefs: PathRef[];

  /** Computed priority (from stage) */
  priority: number;

  /** Risk level (affects ordering within stage) */
  risk: RiskLevel;

  /** Audit fingerprint (sha256 of specs) */
  auditFp: string;

  /** Tool diameter (cached for convenience) */
  toolDiameterMm?: number;

  /** Pass index (1-based) */
  passIndex?: number;

  /** Has tabs (affects through cut safety) */
  hasTabs?: boolean;

  /** Estimated time (seconds) */
  estimatedTimeSec?: number;
}

// =============================================================================
// TOOL BLOCK
// =============================================================================

/**
 * A block of nodes using the same tool.
 *
 * Executing a block = no tool changes within.
 */
export interface ToolBlockPlan {
  /** Tool ID */
  toolId: string;

  /** Tool diameter (mm) */
  toolDiameterMm?: number;

  /** Ordered nodes in this block */
  nodes: PassNode[];

  /** Block index (0-based) */
  blockIndex: number;

  /** Total travel distance within block (mm) */
  travelMm?: number;

  /** Total cut time within block (seconds) */
  cutTimeSec?: number;
}

// =============================================================================
// TOOL CHANGE PLAN
// =============================================================================

/**
 * Optimization objective values.
 */
export interface PlanObjective {
  /** Number of tool swaps */
  swaps: number;

  /** Total rapid travel distance (mm) */
  travelMm: number;

  /** Number of stage violations (should be 0) */
  stageViolations: number;
}

/**
 * Audit trail for tool change plan.
 */
export interface ToolChangePlanAudit {
  /** Deterministic seed (job ID) */
  seed: string;

  /** Node order (list of nodeIds) */
  nodeOrder: string[];

  /** Tool order (list of toolIds) */
  toolOrder: string[];

  /** Optimization objective achieved */
  objective: PlanObjective;

  /** Planner version */
  plannerVersion: string;

  /** Generation timestamp */
  generatedAt: string;
}

/**
 * Complete tool change plan.
 *
 * This is the output of the tool change planner.
 */
export interface ToolChangePlan {
  /** Plan version */
  version: "1.0";

  /** Ordered tool blocks */
  blocks: ToolBlockPlan[];

  /** Audit trail */
  audit: ToolChangePlanAudit;

  /** Validation warnings */
  warnings: string[];
}

// =============================================================================
// PLANNING REQUEST
// =============================================================================

/**
 * Request to create a tool change plan.
 */
export interface ToolChangePlanRequest {
  /** Job ID (used as deterministic seed) */
  jobId: string;

  /** Pass nodes to plan */
  nodes: PassNode[];

  /** Machine home position (deterministic start point) */
  machineHome: Point2D;

  /** Stage windows (optional, defaults to DEFAULT_STAGE_WINDOWS) */
  stageWindows?: StageWindow[];

  /** Enable travel optimization within blocks */
  optimizeTravel?: boolean;

  /** Custom planner version string */
  plannerVersion?: string;
}

// =============================================================================
// ISSUE CODES
// =============================================================================

/**
 * Tool change plan issue codes.
 */
export type ToolChangePlanIssueCode =
  | "PRECEDENCE_VIOLATION"          // Stage ordering violated
  | "THROUGH_BEFORE_INTERNAL"       // Through cut before internal ops
  | "FINISH_BEFORE_ROUGH"           // Finish before rough on same part
  | "PART_RELEASED_EARLY"           // Part may release before ops complete
  | "EMPTY_BLOCK"                   // Tool block with no nodes
  | "ORPHAN_NODE"                   // Node not in any block
  | "DUPLICATE_NODE_ID"             // Same nodeId appears twice
  | "INVALID_STAGE"                 // Unknown stage value
  | "MISSING_PATH_REFS";            // Node has no path references

/**
 * Tool change plan issue.
 */
export interface ToolChangePlanIssue {
  code: ToolChangePlanIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  nodeId?: string;
  partId?: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get priority value for a stage.
 */
export function getStagePriority(stage: Stage): number {
  return STAGE_PRIORITY[stage] ?? 99;
}

/**
 * Generate deterministic node ID.
 *
 * Format: sheetId:opId:stage:toolId:passIndex
 */
export function generateNodeId(
  sheetId: string,
  opId: string,
  stage: Stage,
  toolId: string,
  passIndex: number
): string {
  return `${sheetId}:${opId}:${stage}:${toolId}:${passIndex}`;
}

/**
 * Parse node ID into components.
 */
export function parseNodeId(
  nodeId: string
): { sheetId: string; opId: string; stage: string; toolId: string; passIndex: number } | null {
  const parts = nodeId.split(":");
  if (parts.length !== 5) return null;

  const [sheetId, opId, stage, toolId, passIndexStr] = parts;
  const passIndex = parseInt(passIndexStr, 10);

  if (isNaN(passIndex)) return null;

  return { sheetId, opId, stage, toolId, passIndex };
}

/**
 * Calculate Euclidean distance between two points.
 */
export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculate center of bounding box.
 */
export function bboxCenter(bbox: BBox): Point2D {
  return {
    x: (bbox.minX + bbox.maxX) / 2,
    y: (bbox.minY + bbox.maxY) / 2,
  };
}

/**
 * Get start point for a node (first path ref start).
 */
export function getNodeStartPoint(node: PassNode): Point2D {
  const first = node.pathRefs[0];
  if (first) return first.start;
  return { x: 0, y: 0 };
}

/**
 * Get end point for a node (last path ref end).
 */
export function getNodeEndPoint(node: PassNode): Point2D {
  const last = node.pathRefs[node.pathRefs.length - 1];
  if (last) return last.end;
  return { x: 0, y: 0 };
}

/**
 * Check if stage A must precede stage B.
 */
export function mustPrecede(stageA: Stage, stageB: Stage): boolean {
  return getStagePriority(stageA) < getStagePriority(stageB);
}

/**
 * Check if two stages can be in the same window.
 */
export function canShareWindow(stageA: Stage, stageB: Stage): boolean {
  const pA = getStagePriority(stageA);
  const pB = getStagePriority(stageB);

  // Internal ops can share window
  if (pA <= 30 && pB <= 30) return true;

  // Same stage can share
  return stageA === stageB;
}
