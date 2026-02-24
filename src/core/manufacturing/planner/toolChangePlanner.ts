// src/core/manufacturing/planner/toolChangePlanner.ts
/**
 * Tool Change Planner.
 *
 * Optimizes tool change ordering for CNC manufacturing:
 * 1. Stage-based macro ordering (safety constraints)
 * 2. Tool grouping within stages (minimize swaps)
 * 3. Nearest-neighbor micro ordering (minimize travel)
 * 4. Deterministic tie-breaking (reproducible results)
 *
 * Algorithm:
 * 1. Assign priority to each node based on stage
 * 2. Process stage windows in order (INTERNAL → PROFILE_ROUGH → FINISH → THROUGH)
 * 3. Within each window, group nodes by tool
 * 4. Within each tool group, order by nearest-neighbor with stable tie-break
 * 5. Compress consecutive blocks with same tool
 *
 * Safety guarantees:
 * - PROFILE_THROUGH always last (part release)
 * - Internal ops complete before through cuts
 * - Finish after rough on same part
 *
 * v0.10.6.9 - Tool Change Planner + Op Merge
 */

import {
  Stage,
  StageWindow,
  PassNode,
  ToolBlockPlan,
  ToolChangePlan,
  ToolChangePlanAudit,
  ToolChangePlanRequest,
  ToolChangePlanIssue,
  PlanObjective,
  Point2D,
  DEFAULT_STAGE_WINDOWS,
  getStagePriority,
  distance,
  getNodeStartPoint,
  getNodeEndPoint,
} from "./toolChangePlanner.v1";

// =============================================================================
// CONSTANTS
// =============================================================================

const PLANNER_VERSION = "0.10.6.9";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Planner result.
 */
export interface ToolChangePlannerResult {
  /** Generated plan */
  plan: ToolChangePlan;

  /** Issues found */
  issues: ToolChangePlanIssue[];

  /** Is the plan valid? */
  valid: boolean;
}

// =============================================================================
// SORTING HELPERS
// =============================================================================

/**
 * Compare function for deterministic node sorting.
 *
 * Sort order:
 * 1. Priority (stage-based)
 * 2. Risk (HIGH first for chip-out control)
 * 3. Tool ID (lexicographic)
 * 4. Sheet ID (lexicographic)
 * 5. Node ID (lexicographic, final tie-break)
 */
function compareNodes(a: PassNode, b: PassNode): number {
  // Priority (lower = earlier)
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  // Risk (HIGH = 0, NORMAL = 1, so HIGH comes first)
  const riskA = a.risk === "HIGH" ? 0 : 1;
  const riskB = b.risk === "HIGH" ? 0 : 1;
  if (riskA !== riskB) {
    return riskA - riskB;
  }

  // Tool ID
  const toolCmp = a.toolId.localeCompare(b.toolId);
  if (toolCmp !== 0) return toolCmp;

  // Sheet ID
  const sheetCmp = a.sheetId.localeCompare(b.sheetId);
  if (sheetCmp !== 0) return sheetCmp;

  // Node ID (final tie-break)
  return a.nodeId.localeCompare(b.nodeId);
}

/**
 * Compare nodes by distance from a point with stable tie-break.
 */
function compareByDistanceFrom(
  point: Point2D,
  a: PassNode,
  b: PassNode
): number {
  const distA = distance(point, getNodeStartPoint(a));
  const distB = distance(point, getNodeStartPoint(b));

  // Distance comparison with epsilon
  const epsilon = 1e-9;
  if (Math.abs(distA - distB) > epsilon) {
    return distA - distB;
  }

  // Tie-break: bbox minX, minY, then nodeId
  const bboxA = a.pathRefs[0]?.bbox ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const bboxB = b.pathRefs[0]?.bbox ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  if (bboxA.minX !== bboxB.minX) return bboxA.minX - bboxB.minX;
  if (bboxA.minY !== bboxB.minY) return bboxA.minY - bboxB.minY;

  return a.nodeId.localeCompare(b.nodeId);
}

// =============================================================================
// NEAREST NEIGHBOR ORDERING
// =============================================================================

/**
 * Order nodes using deterministic nearest-neighbor algorithm.
 *
 * Starting from a given point:
 * 1. Find the nearest unvisited node (by start point)
 * 2. Use stable tie-breaking if distances equal
 * 3. Move current position to node's end point
 * 4. Repeat until all nodes visited
 *
 * @param nodes Nodes to order
 * @param startPoint Starting position
 * @returns Ordered nodes
 */
function orderNodesNearestNeighbor(
  nodes: PassNode[],
  startPoint: Point2D
): PassNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [...nodes];

  // Copy and sort for deterministic initial state
  const remaining = [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const ordered: PassNode[] = [];
  let currentPoint = startPoint;

  while (remaining.length > 0) {
    // Find nearest node
    let bestIndex = 0;
    let bestDist = distance(currentPoint, getNodeStartPoint(remaining[0]));

    for (let i = 1; i < remaining.length; i++) {
      const node = remaining[i];
      const dist = distance(currentPoint, getNodeStartPoint(node));

      const cmp = compareByDistanceFrom(currentPoint, remaining[bestIndex], node);
      if (cmp > 0) {
        bestIndex = i;
        bestDist = dist;
      }
    }

    // Move to chosen node
    const chosen = remaining.splice(bestIndex, 1)[0];
    ordered.push(chosen);

    // Update current position to node end
    currentPoint = getNodeEndPoint(chosen);
  }

  return ordered;
}

/**
 * Calculate total travel distance for ordered nodes.
 */
function calculateTravel(
  nodes: PassNode[],
  startPoint: Point2D
): number {
  let total = 0;
  let current = startPoint;

  for (const node of nodes) {
    const nodeStart = getNodeStartPoint(node);
    total += distance(current, nodeStart);
    current = getNodeEndPoint(node);
  }

  return total;
}

// =============================================================================
// WINDOW PROCESSING
// =============================================================================

/**
 * Get nodes that belong to a stage window.
 */
function getNodesInWindow(
  nodes: PassNode[],
  window: StageWindow
): PassNode[] {
  return nodes.filter(
    (n) => n.priority >= window.minPriority && n.priority <= window.maxPriority
  );
}

/**
 * Group nodes by tool ID.
 */
function groupByTool(nodes: PassNode[]): Map<string, PassNode[]> {
  const groups = new Map<string, PassNode[]>();

  for (const node of nodes) {
    if (!groups.has(node.toolId)) {
      groups.set(node.toolId, []);
    }
    groups.get(node.toolId)!.push(node);
  }

  return groups;
}

// =============================================================================
// MAIN PLANNER
// =============================================================================

/**
 * Plan tool changes for a set of pass nodes.
 *
 * Algorithm:
 * 1. Normalize priorities from stages
 * 2. Process each stage window in order
 * 3. Within window: group by tool, optimize travel
 * 4. Compress consecutive blocks with same tool
 * 5. Build audit trail
 *
 * @param req Planning request
 * @returns Planning result with plan and issues
 */
export function planToolChanges(
  req: ToolChangePlanRequest
): ToolChangePlannerResult {
  const issues: ToolChangePlanIssue[] = [];
  const warnings: string[] = [];

  const {
    jobId,
    nodes,
    machineHome,
    stageWindows = DEFAULT_STAGE_WINDOWS,
    optimizeTravel = true,
    plannerVersion = PLANNER_VERSION,
  } = req;

  // Validate: check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.nodeId)) {
      issues.push({
        code: "DUPLICATE_NODE_ID",
        severity: "BLOCK",
        message: `Duplicate node ID: ${node.nodeId}`,
        nodeId: node.nodeId,
      });
    }
    nodeIds.add(node.nodeId);
  }

  // Validate: check for missing path refs
  for (const node of nodes) {
    if (!node.pathRefs || node.pathRefs.length === 0) {
      issues.push({
        code: "MISSING_PATH_REFS",
        severity: "WARN",
        message: `Node ${node.nodeId} has no path references`,
        nodeId: node.nodeId,
      });
    }
  }

  // Normalize priorities
  const normalizedNodes = nodes.map((n) => ({
    ...n,
    priority: getStagePriority(n.stage),
  }));

  // Process stage windows
  const allBlocks: ToolBlockPlan[] = [];
  const nodeOrder: string[] = [];
  let totalTravel = 0;
  let blockIndex = 0;

  for (const window of stageWindows) {
    const windowNodes = getNodesInWindow(normalizedNodes, window);
    if (windowNodes.length === 0) continue;

    // Sort nodes within window
    windowNodes.sort(compareNodes);

    // Group by tool
    const toolGroups = groupByTool(windowNodes);
    const toolIds = Array.from(toolGroups.keys()).sort();

    for (const toolId of toolIds) {
      const toolNodes = toolGroups.get(toolId)!;

      // Optimize travel within tool group
      const currentStart =
        allBlocks.length > 0
          ? getNodeEndPoint(
              allBlocks[allBlocks.length - 1].nodes[
                allBlocks[allBlocks.length - 1].nodes.length - 1
              ]
            )
          : machineHome;

      const orderedNodes = optimizeTravel
        ? orderNodesNearestNeighbor(toolNodes, currentStart)
        : toolNodes;

      // Calculate travel for this block
      const blockTravel = calculateTravel(orderedNodes, currentStart);
      totalTravel += blockTravel;

      // Create block
      allBlocks.push({
        toolId,
        toolDiameterMm: orderedNodes[0]?.toolDiameterMm,
        nodes: orderedNodes,
        blockIndex: blockIndex++,
        travelMm: Math.round(blockTravel * 1000) / 1000,
      });

      // Track node order
      nodeOrder.push(...orderedNodes.map((n) => n.nodeId));
    }
  }

  // Compress consecutive blocks with same tool
  const compressedBlocks: ToolBlockPlan[] = [];
  for (const block of allBlocks) {
    const last = compressedBlocks[compressedBlocks.length - 1];
    if (last && last.toolId === block.toolId) {
      // Merge into previous block
      last.nodes.push(...block.nodes);
      last.travelMm = (last.travelMm ?? 0) + (block.travelMm ?? 0);
    } else {
      // Start new block
      compressedBlocks.push({
        ...block,
        blockIndex: compressedBlocks.length,
        nodes: [...block.nodes],
      });
    }
  }

  // Build tool order
  const toolOrder = compressedBlocks.map((b) => b.toolId);
  const swaps = Math.max(0, compressedBlocks.length - 1);

  // Build objective
  const objective: PlanObjective = {
    swaps,
    travelMm: Math.round(totalTravel * 1000) / 1000,
    stageViolations: 0, // Validated separately
  };

  // Build audit
  const audit: ToolChangePlanAudit = {
    seed: jobId,
    nodeOrder,
    toolOrder,
    objective,
    plannerVersion,
    generatedAt: new Date().toISOString(),
  };

  // Check for warnings
  if (compressedBlocks.length === 0) {
    warnings.push("Plan has no tool blocks");
  }

  // Build plan
  const plan: ToolChangePlan = {
    version: "1.0",
    blocks: compressedBlocks,
    audit,
    warnings,
  };

  // Determine validity
  const blockingIssues = issues.filter((i) => i.severity === "BLOCK");
  const valid = blockingIssues.length === 0;

  return { plan, issues, valid };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get all nodes from a plan in execution order.
 */
export function getAllNodesInOrder(plan: ToolChangePlan): PassNode[] {
  return plan.blocks.flatMap((b) => b.nodes);
}

/**
 * Get nodes for a specific part.
 */
export function getNodesForPart(
  plan: ToolChangePlan,
  partId: string
): PassNode[] {
  return getAllNodesInOrder(plan).filter((n) => n.partId === partId);
}

/**
 * Get nodes for a specific operation.
 */
export function getNodesForOp(
  plan: ToolChangePlan,
  opId: string
): PassNode[] {
  return getAllNodesInOrder(plan).filter((n) => n.opId === opId);
}

/**
 * Get tool change sequence.
 */
export function getToolSequence(plan: ToolChangePlan): string[] {
  return plan.blocks.map((b) => b.toolId);
}

/**
 * Count tool changes.
 */
export function countToolChangesInPlan(plan: ToolChangePlan): number {
  return Math.max(0, plan.blocks.length - 1);
}

/**
 * Estimate total execution time.
 */
export function estimateExecutionTime(
  plan: ToolChangePlan,
  toolChangeTimeSec: number = 30
): number {
  let total = 0;

  for (let i = 0; i < plan.blocks.length; i++) {
    const block = plan.blocks[i];

    // Tool change time (except first block)
    if (i > 0) {
      total += toolChangeTimeSec;
    }

    // Node times
    for (const node of block.nodes) {
      total += node.estimatedTimeSec ?? 60; // Default 60 sec per node
    }
  }

  return total;
}

/**
 * Generate audit report for plan.
 */
export function generateToolChangePlanAuditReport(
  plan: ToolChangePlan
): Record<string, unknown> {
  return {
    version: plan.version,
    generatedAt: plan.audit.generatedAt,
    plannerVersion: plan.audit.plannerVersion,
    seed: plan.audit.seed,
    objective: {
      toolSwaps: plan.audit.objective.swaps,
      travelMm: plan.audit.objective.travelMm,
      stageViolations: plan.audit.objective.stageViolations,
    },
    blocks: plan.blocks.map((b) => ({
      tool: b.toolId,
      diameter: b.toolDiameterMm,
      nodeCount: b.nodes.length,
      travelMm: b.travelMm,
      nodeIds: b.nodes.map((n) => n.nodeId),
    })),
    summary: {
      totalBlocks: plan.blocks.length,
      totalNodes: getAllNodesInOrder(plan).length,
      toolSequence: plan.audit.toolOrder,
    },
    warnings: plan.warnings,
  };
}

// =============================================================================
// NODE BUILDER HELPERS
// =============================================================================

/**
 * Create a PassNode from components.
 *
 * Convenience function for building nodes.
 */
export function createPassNode(
  sheetId: string,
  opId: string,
  partId: string,
  stage: Stage,
  toolId: string,
  passIndex: number,
  pathRefs: import("./toolChangePlanner.v1").PathRef[],
  options?: {
    risk?: import("./toolChangePlanner.v1").RiskLevel;
    auditFp?: string;
    toolDiameterMm?: number;
    hasTabs?: boolean;
    estimatedTimeSec?: number;
  }
): PassNode {
  return {
    nodeId: `${sheetId}:${opId}:${stage}:${toolId}:${passIndex}`,
    opId,
    partId,
    stage,
    toolId,
    sheetId,
    pathRefs,
    priority: getStagePriority(stage),
    risk: options?.risk ?? "NORMAL",
    auditFp: options?.auditFp ?? `fp_${Date.now()}`,
    toolDiameterMm: options?.toolDiameterMm,
    passIndex,
    hasTabs: options?.hasTabs,
    estimatedTimeSec: options?.estimatedTimeSec,
  };
}
