// src/core/manufacturing/planner/validateToolChangePlan.ts
/**
 * Tool Change Plan Validation.
 *
 * Validates precedence constraints and safety rules:
 * - PROFILE_THROUGH must be last for each part
 * - Internal ops must precede through cuts
 * - Finish after rough on same part
 * - No orphan nodes
 *
 * v0.10.6.9 - Tool Change Planner + Op Merge
 */

import {
  ToolChangePlan,
  ToolChangePlanIssue,
  ToolChangePlanIssueCode,
  PassNode,
  Stage,
  getStagePriority,
  mustPrecede,
} from "./toolChangePlanner.v1";

import { getAllNodesInOrder } from "./toolChangePlanner";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Validation result.
 */
export interface ToolChangePlanValidationResult {
  /** Is the plan valid? */
  valid: boolean;

  /** All issues found */
  issues: ToolChangePlanIssue[];

  /** Blocking issues */
  blocks: ToolChangePlanIssue[];

  /** Warning issues */
  warnings: ToolChangePlanIssue[];

  /** Info issues */
  info: ToolChangePlanIssue[];
}

// =============================================================================
// PRECEDENCE VALIDATION
// =============================================================================

/**
 * Build precedence map: partId → list of (nodeId, stage, executionOrder)
 */
function buildPartPrecedenceMap(
  plan: ToolChangePlan
): Map<string, Array<{ nodeId: string; stage: Stage; order: number }>> {
  const map = new Map<string, Array<{ nodeId: string; stage: Stage; order: number }>>();
  const allNodes = getAllNodesInOrder(plan);

  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    if (!map.has(node.partId)) {
      map.set(node.partId, []);
    }
    map.get(node.partId)!.push({
      nodeId: node.nodeId,
      stage: node.stage,
      order: i,
    });
  }

  return map;
}

/**
 * Validate precedence constraints within each part.
 */
function validatePrecedenceConstraints(
  plan: ToolChangePlan
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];
  const partMap = buildPartPrecedenceMap(plan);

  for (const [partId, nodes] of partMap) {
    // Check each pair for precedence violations
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const earlier = nodes[i];
        const later = nodes[j];

        // If stage B must precede stage A but A comes first, violation
        if (mustPrecede(later.stage, earlier.stage)) {
          issues.push({
            code: "PRECEDENCE_VIOLATION",
            severity: "BLOCK",
            message: `${later.stage} (${later.nodeId}) must precede ${earlier.stage} (${earlier.nodeId}) on part ${partId}`,
            nodeId: later.nodeId,
            partId,
            data: {
              violatingNode: earlier.nodeId,
              violatingStage: earlier.stage,
              expectedBefore: later.nodeId,
              expectedStage: later.stage,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate that through cuts are last for each part.
 */
function validateThroughCutsLast(
  plan: ToolChangePlan
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];
  const partMap = buildPartPrecedenceMap(plan);

  for (const [partId, nodes] of partMap) {
    // Find all through cuts
    const throughCuts = nodes.filter((n) => n.stage === "PROFILE_THROUGH");
    if (throughCuts.length === 0) continue;

    // Find all non-through cuts
    const otherCuts = nodes.filter((n) => n.stage !== "PROFILE_THROUGH");
    if (otherCuts.length === 0) continue;

    // Through cuts must have higher order than all other cuts
    const maxOtherOrder = Math.max(...otherCuts.map((n) => n.order));
    const minThroughOrder = Math.min(...throughCuts.map((n) => n.order));

    if (minThroughOrder < maxOtherOrder) {
      const violatingThrough = throughCuts.find((n) => n.order < maxOtherOrder);
      const violatingOther = otherCuts.find((n) => n.order > minThroughOrder);

      issues.push({
        code: "THROUGH_BEFORE_INTERNAL",
        severity: "BLOCK",
        message: `Through cut ${violatingThrough?.nodeId} executed before other operations on part ${partId}`,
        nodeId: violatingThrough?.nodeId,
        partId,
        data: {
          throughCutOrder: minThroughOrder,
          otherCutOrder: maxOtherOrder,
          otherCutNode: violatingOther?.nodeId,
        },
      });
    }
  }

  return issues;
}

/**
 * Validate that finish comes after rough on same part.
 */
function validateFinishAfterRough(
  plan: ToolChangePlan
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];
  const partMap = buildPartPrecedenceMap(plan);

  for (const [partId, nodes] of partMap) {
    // Find rough and finish passes
    const roughPasses = nodes.filter((n) => n.stage === "PROFILE_ROUGH");
    const finishPasses = nodes.filter((n) => n.stage === "PROFILE_FINISH");

    if (roughPasses.length === 0 || finishPasses.length === 0) continue;

    // All rough passes must come before all finish passes
    const maxRoughOrder = Math.max(...roughPasses.map((n) => n.order));
    const minFinishOrder = Math.min(...finishPasses.map((n) => n.order));

    if (minFinishOrder < maxRoughOrder) {
      issues.push({
        code: "FINISH_BEFORE_ROUGH",
        severity: "BLOCK",
        message: `Finish pass executed before rough pass on part ${partId}`,
        partId,
        data: {
          minFinishOrder,
          maxRoughOrder,
        },
      });
    }
  }

  return issues;
}

/**
 * Validate no empty blocks.
 */
function validateNoEmptyBlocks(
  plan: ToolChangePlan
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];

  for (const block of plan.blocks) {
    if (block.nodes.length === 0) {
      issues.push({
        code: "EMPTY_BLOCK",
        severity: "WARN",
        message: `Tool block ${block.toolId} has no nodes`,
        data: { toolId: block.toolId, blockIndex: block.blockIndex },
      });
    }
  }

  return issues;
}

/**
 * Validate all nodes are accounted for (no orphans).
 */
function validateNoOrphanNodes(
  plan: ToolChangePlan,
  expectedNodeIds: Set<string>
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];
  const plannedIds = new Set(plan.audit.nodeOrder);

  for (const expectedId of expectedNodeIds) {
    if (!plannedIds.has(expectedId)) {
      issues.push({
        code: "ORPHAN_NODE",
        severity: "BLOCK",
        message: `Node ${expectedId} not included in plan`,
        nodeId: expectedId,
      });
    }
  }

  return issues;
}

/**
 * Check for potential part release issues.
 *
 * If a part has through cuts but no tabs, warn about potential early release.
 */
function validatePartHoldDown(
  plan: ToolChangePlan
): ToolChangePlanIssue[] {
  const issues: ToolChangePlanIssue[] = [];
  const allNodes = getAllNodesInOrder(plan);

  // Group by part
  const partNodes = new Map<string, PassNode[]>();
  for (const node of allNodes) {
    if (!partNodes.has(node.partId)) {
      partNodes.set(node.partId, []);
    }
    partNodes.get(node.partId)!.push(node);
  }

  for (const [partId, nodes] of partNodes) {
    const throughCuts = nodes.filter((n) => n.stage === "PROFILE_THROUGH");
    const hasTabs = nodes.some((n) => n.hasTabs);

    // If through cuts without tabs, warn
    if (throughCuts.length > 0 && !hasTabs) {
      issues.push({
        code: "PART_RELEASED_EARLY",
        severity: "WARN",
        message: `Part ${partId} has through cuts but no tabs - may release early`,
        partId,
        data: {
          throughCutCount: throughCuts.length,
          hasTabs: false,
        },
      });
    }
  }

  return issues;
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Validate a tool change plan.
 *
 * Checks:
 * - Precedence constraints (stage ordering)
 * - Through cuts last
 * - Finish after rough
 * - No empty blocks
 * - No orphan nodes
 * - Part hold-down warnings
 *
 * @param plan Plan to validate
 * @param expectedNodeIds Optional: set of node IDs that should be in plan
 * @returns Validation result
 */
export function validateToolChangePlan(
  plan: ToolChangePlan,
  expectedNodeIds?: Set<string>
): ToolChangePlanValidationResult {
  const allIssues: ToolChangePlanIssue[] = [];

  // Run all validations
  allIssues.push(...validatePrecedenceConstraints(plan));
  allIssues.push(...validateThroughCutsLast(plan));
  allIssues.push(...validateFinishAfterRough(plan));
  allIssues.push(...validateNoEmptyBlocks(plan));

  if (expectedNodeIds) {
    allIssues.push(...validateNoOrphanNodes(plan, expectedNodeIds));
  }

  allIssues.push(...validatePartHoldDown(plan));

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
 * Quick validation (just blocking issues).
 */
export function quickValidateToolChangePlan(
  plan: ToolChangePlan
): boolean {
  const issues = [
    ...validatePrecedenceConstraints(plan),
    ...validateThroughCutsLast(plan),
    ...validateFinishAfterRough(plan),
  ];

  return issues.filter((i) => i.severity === "BLOCK").length === 0;
}

// =============================================================================
// AUDIT HELPERS
// =============================================================================

/**
 * Generate validation audit report.
 */
export function generateValidationReport(
  result: ToolChangePlanValidationResult
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
      nodeId: i.nodeId,
      partId: i.partId,
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
export function formatValidationIssues(
  result: ToolChangePlanValidationResult
): string[] {
  return result.issues.map((i) => {
    const prefix = i.severity === "BLOCK" ? "ERROR" : i.severity;
    const context = i.partId ? ` [part: ${i.partId}]` : i.nodeId ? ` [node: ${i.nodeId}]` : "";
    return `[${prefix}]${context} ${i.message}`;
  });
}

// =============================================================================
// PRECEDENCE GRAPH
// =============================================================================

/**
 * Build precedence graph for visualization/debugging.
 *
 * Returns edges: nodeA → nodeB means A must execute before B.
 */
export function buildPrecedenceGraph(
  plan: ToolChangePlan
): Array<{ from: string; to: string; reason: string }> {
  const edges: Array<{ from: string; to: string; reason: string }> = [];
  const partMap = buildPartPrecedenceMap(plan);

  for (const [partId, nodes] of partMap) {
    // Sort by stage priority
    const sorted = [...nodes].sort(
      (a, b) => getStagePriority(a.stage) - getStagePriority(b.stage)
    );

    // Create edges between consecutive stages
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];

      if (from.stage !== to.stage) {
        edges.push({
          from: from.nodeId,
          to: to.nodeId,
          reason: `${from.stage} → ${to.stage}`,
        });
      }
    }
  }

  return edges;
}
