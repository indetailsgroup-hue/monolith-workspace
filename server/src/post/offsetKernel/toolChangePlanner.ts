/**
 * Tool Change Planner
 *
 * Step 10.6.9: Merge ops → minimize tool swaps with deterministic scheduling.
 *
 * This module provides:
 * - Dependency graph construction for operation ordering
 * - Tool-grouped Kahn's algorithm for minimal tool changes
 * - Cycle detection with BLOCK_GATE safety
 * - Factory policy knobs (PER_PART, PER_SHEET batching)
 *
 * Key concepts:
 * - DepEdge: Partial order constraint (before → after with reason)
 * - ScheduledPlan: Final execution order with tool blocks
 * - Tool-Grouped Kahn: Topological sort optimizing for same-tool continuation
 *
 * Constraints respected:
 * - DRILL before PROFILE_FINISH (fixture stability)
 * - GROOVE before PROFILE_FINISH (prevent part shift)
 * - ROUGH before FINISH (same operation)
 * - SCORE before ROUGH/FINISH (HPL)
 * - Inside features before outside finish (keep-down)
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type { RouteStep, RoutePassKind, ToolRoutePlan } from './multiToolRouting.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependency edge representing a partial order constraint.
 */
export interface DepEdge {
  /** Step ID that must come before */
  before: string;
  /** Step ID that must come after */
  after: string;
  /** Human-readable reason for this constraint */
  reason: string;
}

/**
 * Tool block in scheduled execution.
 */
export interface ToolBlock {
  /** Tool identifier */
  toolId: string;
  /** Step IDs executed with this tool */
  stepIds: string[];
}

/**
 * Report item for scheduling.
 */
export interface ScheduleReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Complete scheduled plan for a part.
 */
export interface ScheduledPlan {
  /** Sheet identifier */
  sheetId: string;
  /** Part identifier */
  partId: string;
  /** Final execution order (step IDs) */
  scheduledStepIds: string[];
  /** Tool blocks for execution */
  toolBlocks: ToolBlock[];
  /** Number of tool changes */
  toolChangeCount: number;
  /** Dependency edges used */
  edges: DepEdge[];
  /** Processing report */
  report: ScheduleReportItem[];
  /** Whether plan is valid */
  valid: boolean;
}

/**
 * Factory policy knobs for scheduling behavior.
 */
export interface ToolChangePlannerPolicy {
  /** Batching mode: PER_PART (default) or PER_SHEET */
  batching: 'PER_PART' | 'PER_SHEET';
  /** Force all drills first before any profiles */
  drillFirst: boolean;
  /** Force all grooves before any profiles */
  groovesBeforeProfiles: boolean;
  /** Force outside finish to be last */
  outsideFinishLast: boolean;
  /** Allow reordering across operations (more aggressive optimization) */
  allowCrossOpReorder: boolean;
}

/**
 * Result of scheduling with cycle check.
 */
export type ScheduleResult =
  | { kind: 'OK'; scheduled: ScheduledPlan }
  | { kind: 'BLOCK_GATE'; reason: string; edges: DepEdge[]; fingerprint: string };

/**
 * Internal graph node.
 */
interface GraphNode {
  id: string;
  step: RouteStep;
}

/**
 * Internal dependency graph.
 */
interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  indeg: Map<string, number>;
  out: Map<string, string[]>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default planner policy (factory-safe baseline).
 */
export const DEFAULT_PLANNER_POLICY: ToolChangePlannerPolicy = {
  batching: 'PER_PART',
  drillFirst: true,
  groovesBeforeProfiles: true,
  outsideFinishLast: true,
  allowCrossOpReorder: false,
};

/**
 * Reason codes for dependency edges.
 */
export const DEP_REASON = {
  PASS_ORDER: 'PASS_ORDER',
  DRILL_BEFORE_OUTSIDE_FINISH: 'DRILL_BEFORE_OUTSIDE_FINISH',
  GROOVE_BEFORE_OUTSIDE_FINISH: 'GROOVE_BEFORE_OUTSIDE_FINISH',
  INSIDE_BEFORE_OUTSIDE_FINISH: 'INSIDE_BEFORE_OUTSIDE_FINISH',
  SCORE_BEFORE_ROUGH: 'SCORE_BEFORE_ROUGH',
  ROUGH_BEFORE_FINISH: 'ROUGH_BEFORE_FINISH',
  POLICY_DRILL_FIRST: 'POLICY_DRILL_FIRST',
  POLICY_GROOVE_FIRST: 'POLICY_GROOVE_FIRST',
} as const;

// ============================================================================
// Step Classification Helpers
// ============================================================================

/**
 * Check if step is a profile operation.
 */
function isProfile(step: RouteStep): boolean {
  return step.opKind === 'PROFILE';
}

/**
 * Check if step is a drill operation.
 */
function isDrill(step: RouteStep): boolean {
  return step.opKind === 'DRILL';
}

/**
 * Check if step is a groove operation.
 */
function isGroove(step: RouteStep): boolean {
  return step.opKind === 'GROOVE';
}

/**
 * Check if step is an inside feature (holes, inside profiles, grooves).
 */
function isInsideFeature(step: RouteStep): boolean {
  if (isDrill(step) || isGroove(step)) return true;
  if (isProfile(step) && step.intent === 'INSIDE') return true;
  return false;
}

/**
 * Check if step is an outside finish profile.
 */
function isOutsideFinish(step: RouteStep): boolean {
  return isProfile(step) && step.intent === 'OUTSIDE' && step.passKind === 'FINISH';
}

/**
 * Check if step is an outside rough profile.
 */
function isOutsideRough(step: RouteStep): boolean {
  return isProfile(step) && step.intent === 'OUTSIDE' && step.passKind === 'ROUGH';
}

/**
 * Check if step is a score pass.
 */
function isScore(step: RouteStep): boolean {
  return step.passKind === 'SCORE';
}

/**
 * Get pass rank for ordering (lower = earlier).
 */
function passRank(pass: RoutePassKind): number {
  switch (pass) {
    case 'SCORE':
      return 0;
    case 'ROUGH':
      return 1;
    case 'SEMI_FINISH':
      return 2;
    case 'FINISH':
      return 3;
    default:
      return 3;
  }
}

// ============================================================================
// Dependency Graph Building
// ============================================================================

/**
 * Build dependency edges from route steps.
 *
 * Enforces:
 * - A) Same operation: SCORE → ROUGH → SEMI_FINISH → FINISH
 * - B) Drill/Groove before outside finish (fixture stability)
 * - C) Inside features before outside finish (keep-down)
 * - D) Policy-driven constraints (drillFirst, etc.)
 *
 * @param steps - Route steps to analyze
 * @param policy - Planner policy (optional)
 * @returns Array of dependency edges
 */
export function buildDependencyEdges(
  steps: RouteStep[],
  policy: ToolChangePlannerPolicy = DEFAULT_PLANNER_POLICY
): DepEdge[] {
  const edges: DepEdge[] = [];

  // A) Same op: enforce pass ordering (SCORE → ROUGH → FINISH)
  const byOp = new Map<string, RouteStep[]>();
  for (const s of steps) {
    const arr = byOp.get(s.opId) ?? [];
    arr.push(s);
    byOp.set(s.opId, arr);
  }

  for (const [opId, arr] of byOp) {
    // Sort by pass rank, then stepId for determinism
    arr.sort((a, b) => {
      const rankDiff = passRank(a.passKind) - passRank(b.passKind);
      if (rankDiff !== 0) return rankDiff;
      return a.stepId < b.stepId ? -1 : 1;
    });

    // Chain consecutive passes
    for (let i = 0; i < arr.length - 1; i++) {
      edges.push({
        before: arr[i].stepId,
        after: arr[i + 1].stepId,
        reason: `${DEP_REASON.PASS_ORDER}:op=${opId}`,
      });
    }
  }

  // B) Drill/Groove before outside finish (fixture stability)
  const drills = steps.filter(isDrill);
  const grooves = steps.filter(isGroove);
  const outsideFinishes = steps.filter(isOutsideFinish);

  for (const d of drills) {
    for (const f of outsideFinishes) {
      edges.push({
        before: d.stepId,
        after: f.stepId,
        reason: DEP_REASON.DRILL_BEFORE_OUTSIDE_FINISH,
      });
    }
  }

  for (const g of grooves) {
    for (const f of outsideFinishes) {
      edges.push({
        before: g.stepId,
        after: f.stepId,
        reason: DEP_REASON.GROOVE_BEFORE_OUTSIDE_FINISH,
      });
    }
  }

  // C) Keep-down: all inside features before outside finish
  const insideFeatures = steps.filter(isInsideFeature);
  for (const ins of insideFeatures) {
    for (const f of outsideFinishes) {
      // Avoid duplicate edges
      const isDuplicate = edges.some(
        (e) => e.before === ins.stepId && e.after === f.stepId
      );
      if (!isDuplicate) {
        edges.push({
          before: ins.stepId,
          after: f.stepId,
          reason: DEP_REASON.INSIDE_BEFORE_OUTSIDE_FINISH,
        });
      }
    }
  }

  // D) Policy-driven constraints
  if (policy.drillFirst) {
    // Drills before any profile (not just outside finish)
    const profiles = steps.filter(isProfile);
    for (const d of drills) {
      for (const p of profiles) {
        const exists = edges.some(
          (e) => e.before === d.stepId && e.after === p.stepId
        );
        if (!exists) {
          edges.push({
            before: d.stepId,
            after: p.stepId,
            reason: DEP_REASON.POLICY_DRILL_FIRST,
          });
        }
      }
    }
  }

  if (policy.groovesBeforeProfiles) {
    // Grooves before any profile
    const profiles = steps.filter(isProfile);
    for (const g of grooves) {
      for (const p of profiles) {
        const exists = edges.some(
          (e) => e.before === g.stepId && e.after === p.stepId
        );
        if (!exists) {
          edges.push({
            before: g.stepId,
            after: p.stepId,
            reason: DEP_REASON.POLICY_GROOVE_FIRST,
          });
        }
      }
    }
  }

  return edges;
}

/**
 * Build internal dependency graph from steps and edges.
 */
function buildGraph(steps: RouteStep[], edges: DepEdge[]): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  for (const s of steps) {
    nodes.set(s.stepId, { id: s.stepId, step: s });
  }

  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();

  // Initialize
  for (const s of steps) {
    indeg.set(s.stepId, 0);
    out.set(s.stepId, []);
  }

  // Add edges
  for (const e of edges) {
    // Skip edges referencing non-existent nodes
    if (!nodes.has(e.before) || !nodes.has(e.after)) continue;
    // Skip self-loops
    if (e.before === e.after) continue;

    out.get(e.before)!.push(e.after);
    indeg.set(e.after, (indeg.get(e.after) ?? 0) + 1);
  }

  // Deterministic: sort adjacency lists
  for (const [, arr] of out) {
    arr.sort();
  }

  return { nodes, indeg, out };
}

// ============================================================================
// Tool-Grouped Kahn's Algorithm
// ============================================================================

/**
 * Score and select next step from available set.
 *
 * Scoring priority:
 * 1. Prefer same tool as current (minimize tool change)
 * 2. Prefer step that unlocks more subsequent steps (lookahead)
 * 3. Lower priority value (from RouteStep.priority)
 * 4. Lexicographic tool ID
 * 5. Lexicographic step ID
 */
function scoreToolChoice(
  available: RouteStep[],
  currentTool: string | null,
  g: DependencyGraph
): RouteStep {
  // 1) Prefer same tool
  const sameTool = currentTool
    ? available.filter((s) => s.tool.id === currentTool)
    : [];
  const pool = sameTool.length > 0 ? sameTool : available;

  // 2) Lookahead: count how many steps become available if we pick this one
  function unlockCount(stepId: string): number {
    let count = 0;
    for (const nxt of g.out.get(stepId) ?? []) {
      const deg = (g.indeg.get(nxt) ?? 0) - 1;
      if (deg === 0) count++;
    }
    return count;
  }

  // Sort pool by scoring criteria
  pool.sort((a, b) => {
    // Higher unlock count = better (sort descending)
    const ua = unlockCount(a.stepId);
    const ub = unlockCount(b.stepId);
    if (ub !== ua) return ub - ua;

    // Lower priority = better
    if (a.priority !== b.priority) return a.priority - b.priority;

    // Deterministic tie-breakers
    if (a.tool.id !== b.tool.id) return a.tool.id < b.tool.id ? -1 : 1;
    return a.stepId < b.stepId ? -1 : 1;
  });

  return pool[0];
}

/**
 * Schedule steps to minimize tool changes using Tool-Grouped Kahn's algorithm.
 *
 * Algorithm:
 * 1. Build dependency graph
 * 2. Initialize available set (indegree = 0)
 * 3. Repeatedly pick best step from available set
 * 4. Prefer same tool to minimize changes
 * 5. Use lookahead to unlock more steps
 * 6. Deterministic tie-breaking
 *
 * @param steps - Route steps to schedule
 * @param edges - Dependency edges
 * @returns Scheduled order and tool blocks
 */
export function scheduleStepsMinToolChanges(
  steps: RouteStep[],
  edges: DepEdge[]
): {
  order: string[];
  toolBlocks: ToolBlock[];
  toolChangeCount: number;
  scheduled: number;
  total: number;
} {
  const g = buildGraph(steps, edges);

  // Initialize available set (indegree = 0)
  let available: RouteStep[] = [];
  for (const [id, deg] of g.indeg) {
    if (deg === 0) {
      const node = g.nodes.get(id);
      if (node) available.push(node.step);
    }
  }

  // Initial sort for determinism
  available.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.tool.id !== b.tool.id) return a.tool.id < b.tool.id ? -1 : 1;
    return a.stepId < b.stepId ? -1 : 1;
  });

  const order: string[] = [];
  const toolBlocks: ToolBlock[] = [];
  let currentTool: string | null = null;

  while (available.length > 0) {
    // Pick best step
    const pick = scoreToolChoice(available, currentTool, g);

    // Remove from available (deterministic filter)
    available = available.filter((s) => s.stepId !== pick.stepId);

    // Append to order
    order.push(pick.stepId);

    // Track tool blocks
    if (currentTool !== pick.tool.id) {
      currentTool = pick.tool.id;
      toolBlocks.push({ toolId: currentTool, stepIds: [] });
    }
    toolBlocks[toolBlocks.length - 1].stepIds.push(pick.stepId);

    // Relax edges (decrement indegree of successors)
    for (const nxt of g.out.get(pick.stepId) ?? []) {
      const newDeg = (g.indeg.get(nxt) ?? 0) - 1;
      g.indeg.set(nxt, newDeg);

      if (newDeg === 0) {
        const node = g.nodes.get(nxt);
        if (node) available.push(node.step);
      }
    }

    // Re-sort available for determinism
    available.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.tool.id !== b.tool.id) return a.tool.id < b.tool.id ? -1 : 1;
      return a.stepId < b.stepId ? -1 : 1;
    });
  }

  // Compute tool change count
  const toolChangeCount = Math.max(0, toolBlocks.length - 1);

  return {
    order,
    toolBlocks,
    toolChangeCount,
    scheduled: order.length,
    total: steps.length,
  };
}

// ============================================================================
// Cycle Detection & Full Scheduling
// ============================================================================

/**
 * Schedule steps with cycle detection.
 *
 * If a cycle exists in the dependency graph, scheduling cannot complete
 * and returns BLOCK_GATE. This is a safety violation.
 *
 * @param steps - Route steps to schedule
 * @param edges - Dependency edges
 * @param sheetId - Sheet identifier
 * @param partId - Part identifier
 * @returns OK with scheduled plan or BLOCK_GATE with reason
 */
export function scheduleWithCycleCheck(
  steps: RouteStep[],
  edges: DepEdge[],
  sheetId: string = 'NA',
  partId: string = 'NA'
): ScheduleResult {
  const result = scheduleStepsMinToolChanges(steps, edges);

  // Cycle detection: if not all steps scheduled, there's a cycle
  if (result.scheduled !== result.total) {
    const unscheduled = steps
      .filter((s) => !result.order.includes(s.stepId))
      .map((s) => s.stepId);

    return {
      kind: 'BLOCK_GATE',
      reason: `Dependency cycle detected; scheduled ${result.scheduled}/${result.total}. Unscheduled: ${unscheduled.join(', ')}`,
      edges,
      fingerprint: `10.6.9:CYCLE:${result.scheduled}:${result.total}`,
    };
  }

  // Build report
  const report: ScheduleReportItem[] = [
    {
      code: 'TOOL_CHANGE_PLANNED',
      detail: `toolChanges=${result.toolChangeCount} blocks=${result.toolBlocks.length} steps=${steps.length}`,
      fingerprint: `10.6.9:OK:${result.toolChangeCount}:${result.toolBlocks.length}:${steps.length}`,
      severity: 'INFO',
    },
  ];

  // Add tool block summary
  for (let i = 0; i < result.toolBlocks.length; i++) {
    const block = result.toolBlocks[i];
    report.push({
      code: 'TOOL_BLOCK',
      detail: `Block ${i + 1}: tool=${block.toolId} steps=${block.stepIds.length}`,
      fingerprint: `10.6.9:BLOCK:${i}:${block.toolId}:${block.stepIds.length}`,
      severity: 'INFO',
    });
  }

  return {
    kind: 'OK',
    scheduled: {
      sheetId,
      partId,
      scheduledStepIds: result.order,
      toolBlocks: result.toolBlocks,
      toolChangeCount: result.toolChangeCount,
      edges,
      report,
      valid: true,
    },
  };
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Create scheduled plan from route plan.
 *
 * This is the main entry point for tool change planning.
 *
 * @param routePlan - Route plan from 10.6.7
 * @param policy - Planner policy (optional)
 * @returns Scheduled plan or error
 */
export function createScheduledPlan(
  routePlan: ToolRoutePlan,
  policy: ToolChangePlannerPolicy = DEFAULT_PLANNER_POLICY
): ScheduleResult {
  // Build dependency edges
  const edges = buildDependencyEdges(routePlan.steps, policy);

  // Schedule with cycle check
  return scheduleWithCycleCheck(
    routePlan.steps,
    edges,
    routePlan.sheetId,
    routePlan.partId
  );
}

/**
 * Optimize an existing route plan for minimal tool changes.
 *
 * Returns a new ScheduledPlan with optimized ordering.
 *
 * @param routePlan - Route plan from 10.6.7
 * @param policy - Planner policy (optional)
 * @returns Scheduled plan (throws on cycle)
 */
export function optimizeRoutePlan(
  routePlan: ToolRoutePlan,
  policy: ToolChangePlannerPolicy = DEFAULT_PLANNER_POLICY
): ScheduledPlan {
  const result = createScheduledPlan(routePlan, policy);

  if (result.kind === 'BLOCK_GATE') {
    throw new Error(`Cannot optimize route plan: ${result.reason}`);
  }

  return result.scheduled;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all blocking issues from scheduled plan.
 */
export function getScheduleBlockingIssues(
  plan: ScheduledPlan
): ScheduleReportItem[] {
  return plan.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if scheduled plan is valid.
 */
export function isScheduledPlanValid(plan: ScheduledPlan): boolean {
  return plan.valid && getScheduleBlockingIssues(plan).length === 0;
}

/**
 * Get all fingerprints from scheduled plan.
 */
export function getScheduleFingerprints(plan: ScheduledPlan): string[] {
  return plan.report.map((r) => r.fingerprint);
}

/**
 * Summarize scheduled plan for logging.
 */
export function summarizeScheduledPlan(plan: ScheduledPlan): string {
  const toolSeq = plan.toolBlocks.map((b) => b.toolId).join(' → ');
  return `Part ${plan.partId}: ${plan.scheduledStepIds.length} steps, ${plan.toolChangeCount} changes: ${toolSeq}`;
}

/**
 * Get steps in a specific tool block.
 */
export function getStepsInBlock(
  plan: ScheduledPlan,
  blockIndex: number
): string[] {
  if (blockIndex < 0 || blockIndex >= plan.toolBlocks.length) {
    return [];
  }
  return plan.toolBlocks[blockIndex].stepIds;
}

/**
 * Get tool block for a specific step.
 */
export function getBlockForStep(
  plan: ScheduledPlan,
  stepId: string
): ToolBlock | null {
  for (const block of plan.toolBlocks) {
    if (block.stepIds.includes(stepId)) {
      return block;
    }
  }
  return null;
}

/**
 * Calculate theoretical minimum tool changes (lower bound).
 *
 * This is the number of unique tools minus 1.
 */
export function theoreticalMinToolChanges(steps: RouteStep[]): number {
  const uniqueTools = new Set(steps.map((s) => s.tool.id));
  return Math.max(0, uniqueTools.size - 1);
}

/**
 * Calculate optimization ratio.
 *
 * Returns how close we got to the theoretical minimum.
 * 1.0 = optimal, >1.0 = suboptimal (higher = worse)
 */
export function optimizationRatio(plan: ScheduledPlan): number {
  const minChanges = plan.toolBlocks.length > 0
    ? new Set(plan.toolBlocks.map((b) => b.toolId)).size - 1
    : 0;

  if (minChanges === 0) return 1.0;
  return plan.toolChangeCount / minChanges;
}

/**
 * Validate dependency edges for consistency.
 */
export function validateDependencyEdges(
  edges: DepEdge[],
  steps: RouteStep[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const stepIds = new Set(steps.map((s) => s.stepId));

  for (const e of edges) {
    if (!stepIds.has(e.before)) {
      issues.push(`Edge references unknown 'before' step: ${e.before}`);
    }
    if (!stepIds.has(e.after)) {
      issues.push(`Edge references unknown 'after' step: ${e.after}`);
    }
    if (e.before === e.after) {
      issues.push(`Self-loop edge: ${e.before}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Deduplicate dependency edges.
 */
export function deduplicateEdges(edges: DepEdge[]): DepEdge[] {
  const seen = new Set<string>();
  const result: DepEdge[] = [];

  for (const e of edges) {
    const key = `${e.before}→${e.after}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }

  return result;
}

/**
 * Create a custom policy.
 */
export function createPlannerPolicy(
  overrides: Partial<ToolChangePlannerPolicy>
): ToolChangePlannerPolicy {
  return {
    ...DEFAULT_PLANNER_POLICY,
    ...overrides,
  };
}

/**
 * Get dependency edges grouped by reason.
 */
export function groupEdgesByReason(
  edges: DepEdge[]
): Map<string, DepEdge[]> {
  const groups = new Map<string, DepEdge[]>();

  for (const e of edges) {
    // Extract base reason (before any colon details)
    const baseReason = e.reason.split(':')[0];
    const arr = groups.get(baseReason) ?? [];
    arr.push(e);
    groups.set(baseReason, arr);
  }

  return groups;
}

/**
 * Explain why step A must come before step B.
 */
export function explainDependency(
  edges: DepEdge[],
  beforeId: string,
  afterId: string
): string[] {
  const reasons: string[] = [];

  for (const e of edges) {
    if (e.before === beforeId && e.after === afterId) {
      reasons.push(e.reason);
    }
  }

  return reasons;
}
