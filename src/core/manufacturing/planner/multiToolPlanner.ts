// src/core/manufacturing/planner/multiToolPlanner.ts
/**
 * Multi-Tool Routing Planner.
 *
 * Generates deterministic manufacturing plans for multi-tool operations:
 * 1. Expand operations into passes (ROUGH/FINISH)
 * 2. Compute offset and entry/exit fingerprints
 * 3. Group passes by tool to minimize tool changes
 * 4. Order: all ROUGH blocks first, then FINISH blocks
 *
 * Key features:
 * - Deterministic ordering (same input = same output)
 * - Audit-friendly (fingerprints for every spec)
 * - Tool change minimization
 * - Integration with 10.6.2 (offset) and 10.6.6 (entry/exit)
 *
 * v0.10.6.7 - Multi-Tool Routing
 */

import {
  ToolDef,
  ToolId,
  ToolClass,
  OpIntent,
  OpKind,
  CutSide,
  PlannedPass,
  PassStage,
  ToolChangeBlock,
  MultiToolPlan,
  PlanAudit,
  PlanStats,
  MultiToolIssue,
  calculateRoughStockToLeave,
  generatePassId,
} from "./multiToolPlan.v1";

import {
  buildOffsetSpec,
  BuildOffsetRequest,
} from "../offset/buildOffsetSpec";

import {
  OffsetSpec,
} from "../offset/offsetSpec.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Planner configuration.
 */
export interface PlannerConfig {
  /** Default winding for planning (actual winding computed by compiler) */
  defaultWinding: "CW" | "CCW";

  /** Default machine capabilities */
  machine: {
    supportsArc: boolean;
    safeZ: number;
  };

  /** Planner version string */
  version: string;
}

/**
 * Default planner configuration.
 */
export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  defaultWinding: "CCW",
  machine: {
    supportsArc: true,
    safeZ: 15,
  },
  version: "0.10.6.7",
};

/**
 * Tool library (map of tool ID to definition).
 */
export type ToolLibrary = Map<ToolId, ToolDef>;

/**
 * Planner result.
 */
export interface PlannerResult {
  /** Generated plan */
  plan: MultiToolPlan;

  /** Issues found during planning */
  issues: MultiToolIssue[];

  /** Is the plan valid (no blocking issues)? */
  valid: boolean;
}

// =============================================================================
// FINGERPRINT GENERATION
// =============================================================================

/**
 * Simple hash function for fingerprinting.
 *
 * In production, use proper SHA-256.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Stable stringify for deterministic fingerprinting.
 */
function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

/**
 * Generate fingerprint for an object.
 */
function fingerprint(obj: unknown): string {
  return `fp_${simpleHash(stableStringify(obj))}`;
}

// =============================================================================
// TOOL LOOKUP
// =============================================================================

/**
 * Look up tool by ID in library.
 *
 * @param library Tool library
 * @param toolId Tool ID to find
 * @returns Tool definition
 * @throws Error if tool not found
 */
function getToolById(library: ToolLibrary, toolId: ToolId): ToolDef {
  const tool = library.get(toolId);
  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }
  return tool;
}

/**
 * Convert array of tools to library map.
 */
export function createToolLibrary(tools: ToolDef[]): ToolLibrary {
  const library = new Map<ToolId, ToolDef>();
  for (const tool of tools) {
    library.set(tool.id, tool);
  }
  return library;
}

// =============================================================================
// PASS GENERATION
// =============================================================================

/**
 * Generate offset spec fingerprint for a pass.
 */
function generateOffsetFp(
  op: OpIntent,
  stage: PassStage,
  toolDiaMm: number,
  stockToLeaveMm: number,
  config: PlannerConfig
): string {
  const request: BuildOffsetRequest = {
    opKind: op.kind,
    pass: stage,
    cutSide: op.cutSide,
    pathWinding: config.defaultWinding,
    toolDiameterMm: toolDiaMm,
    userAllowanceMm: op.allowances.userMm,
    kerfAllowanceMm: op.allowances.kerfMm,
    stockToLeaveMm: stage === "ROUGH" ? stockToLeaveMm : 0,
  };

  try {
    const { spec } = buildOffsetSpec(request);
    return fingerprint(spec);
  } catch {
    // Return placeholder if build fails (will be caught in validation)
    return "fp_error";
  }
}

/**
 * Generate entry/exit fingerprint for a pass.
 *
 * Note: This is a planning-level fingerprint. The compiler will
 * recompute with actual geometry and verify.
 */
function generateEntryExitFp(
  op: OpIntent,
  stage: PassStage,
  toolClass: ToolClass,
  config: PlannerConfig
): string {
  // Simplified entry/exit context for planning
  const ctx = {
    opKind: op.kind,
    pass: stage,
    toolClass,
    hasLaminate: false, // Will be determined by material lookup
    isOpenSpan: op.tabs?.enabled ?? false,
    supportsArc: config.machine.supportsArc,
  };

  return fingerprint(ctx);
}

/**
 * Generate passes for a single operation.
 */
function generatePassesForOp(
  op: OpIntent,
  library: ToolLibrary,
  config: PlannerConfig,
  issues: MultiToolIssue[]
): PlannedPass[] {
  const passes: PlannedPass[] = [];

  // Get finish tool (required)
  let finishTool: ToolDef;
  try {
    finishTool = getToolById(library, op.toolStrategy.finishTool);
  } catch {
    issues.push({
      code: "TOOL_NOT_FOUND",
      severity: "BLOCK",
      message: `Finish tool not found: ${op.toolStrategy.finishTool}`,
      opId: op.opId,
      toolId: op.toolStrategy.finishTool,
    });
    return passes;
  }

  // Get rough tool (optional)
  let roughTool: ToolDef | null = null;
  if (op.toolStrategy.roughTool) {
    try {
      roughTool = getToolById(library, op.toolStrategy.roughTool);
    } catch {
      issues.push({
        code: "TOOL_NOT_FOUND",
        severity: "BLOCK",
        message: `Rough tool not found: ${op.toolStrategy.roughTool}`,
        opId: op.opId,
        toolId: op.toolStrategy.roughTool,
      });
      return passes;
    }
  }

  const finishDia = finishTool.diameterMm;
  const roughDia = roughTool?.diameterMm ?? finishDia;

  // Calculate rough stock to leave
  let roughStock = 0;
  if (roughTool) {
    // Use explicit value if provided, otherwise calculate
    if (op.toolStrategy.roughStockToLeaveMm > 0) {
      roughStock = op.toolStrategy.roughStockToLeaveMm;
    } else {
      roughStock = calculateRoughStockToLeave(
        roughDia,
        finishDia,
        op.allowances.finishAllowMm
      );
    }

    // Warn if rough tool is bigger than finish (unusual but valid)
    if (roughDia > finishDia) {
      issues.push({
        code: "ROUGH_BIGGER_THAN_FINISH",
        severity: "INFO",
        message: `Rough tool (${roughDia}mm) is larger than finish tool (${finishDia}mm)`,
        opId: op.opId,
        data: { roughDia, finishDia },
      });
    }
  }

  // Generate ROUGH passes
  if (roughTool) {
    const roughPassCount = Math.max(1, op.toolStrategy.roughPassCount);

    for (let i = 1; i <= roughPassCount; i++) {
      const passId = generatePassId(op.opId, "ROUGH", i);

      const offsetFp = generateOffsetFp(
        op,
        "ROUGH",
        roughDia,
        roughStock,
        config
      );

      const entryExitFp = generateEntryExitFp(
        op,
        "ROUGH",
        roughTool.class,
        config
      );

      passes.push({
        passId,
        opId: op.opId,
        stage: "ROUGH",
        passIndex: i,
        toolId: roughTool.id,
        toolDiameterMm: roughDia,
        offsetSpecFp: offsetFp,
        entryExitFp: entryExitFp,
        pathIds: [],
        stockToLeaveMm: roughStock,
      });
    }
  }

  // Generate FINISH passes
  const finishPassCount = Math.max(1, op.toolStrategy.finishPassCount);

  for (let i = 1; i <= finishPassCount; i++) {
    const passId = generatePassId(op.opId, "FINISH", i);

    const offsetFp = generateOffsetFp(
      op,
      "FINISH",
      finishDia,
      0, // No stock left on finish
      config
    );

    const entryExitFp = generateEntryExitFp(
      op,
      "FINISH",
      finishTool.class,
      config
    );

    passes.push({
      passId,
      opId: op.opId,
      stage: "FINISH",
      passIndex: i,
      toolId: finishTool.id,
      toolDiameterMm: finishDia,
      offsetSpecFp: offsetFp,
      entryExitFp: entryExitFp,
      pathIds: [],
      stockToLeaveMm: 0,
    });
  }

  return passes;
}

// =============================================================================
// TOOL BLOCK ORDERING
// =============================================================================

/**
 * Group passes by tool ID.
 */
function groupPassesByTool(
  passes: PlannedPass[],
  library: ToolLibrary,
  opOrder: string[]
): Map<ToolId, PlannedPass[]> {
  const groups = new Map<ToolId, PlannedPass[]>();

  for (const pass of passes) {
    if (!groups.has(pass.toolId)) {
      groups.set(pass.toolId, []);
    }
    groups.get(pass.toolId)!.push(pass);
  }

  // Sort passes within each group by original op order
  for (const [toolId, toolPasses] of groups) {
    toolPasses.sort((a, b) => {
      const aIdx = opOrder.indexOf(a.opId);
      const bIdx = opOrder.indexOf(b.opId);
      if (aIdx !== bIdx) return aIdx - bIdx;
      // Same op, sort by pass index
      return a.passIndex - b.passIndex;
    });
  }

  return groups;
}

/**
 * Create tool change blocks from grouped passes.
 */
function createToolBlocks(
  groups: Map<ToolId, PlannedPass[]>,
  library: ToolLibrary,
  startIndex: number
): ToolChangeBlock[] {
  const blocks: ToolChangeBlock[] = [];

  // Sort tool IDs lexicographically for determinism
  const toolIds = Array.from(groups.keys()).sort();

  for (let i = 0; i < toolIds.length; i++) {
    const toolId = toolIds[i];
    const passes = groups.get(toolId)!;
    const tool = library.get(toolId);

    blocks.push({
      toolId,
      toolDiameterMm: tool?.diameterMm ?? 0,
      toolClass: tool?.class ?? "STRAIGHT",
      passes,
      blockIndex: startIndex + i,
    });
  }

  return blocks;
}

// =============================================================================
// MAIN PLANNER
// =============================================================================

/**
 * Plan multi-tool routing for a set of operations.
 *
 * Algorithm:
 * 1. Validate inputs
 * 2. Expand each operation into passes
 * 3. Separate ROUGH and FINISH passes
 * 4. Group by tool within each stage
 * 5. Order: ROUGH blocks first, then FINISH blocks
 *
 * @param ops Operation intents to plan
 * @param tools Tool library
 * @param config Planner configuration
 * @returns Planning result with plan and issues
 */
export function planMultiTool(
  ops: OpIntent[],
  tools: ToolDef[],
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG
): PlannerResult {
  const issues: MultiToolIssue[] = [];
  const warnings: string[] = [];

  // Create tool library
  const library = createToolLibrary(tools);

  // Validate: check for duplicate op IDs
  const opIds = new Set<string>();
  for (const op of ops) {
    if (opIds.has(op.opId)) {
      issues.push({
        code: "DUPLICATE_OP_ID",
        severity: "BLOCK",
        message: `Duplicate operation ID: ${op.opId}`,
        opId: op.opId,
      });
    }
    opIds.add(op.opId);
  }

  // Generate passes for all operations
  const allPasses: PlannedPass[] = [];
  const opOrder = ops.map((op) => op.opId);

  for (const op of ops) {
    const passes = generatePassesForOp(op, library, config, issues);
    allPasses.push(...passes);
  }

  // Separate ROUGH and FINISH passes
  const roughPasses = allPasses.filter((p) => p.stage === "ROUGH");
  const finishPasses = allPasses.filter((p) => p.stage === "FINISH");

  // Group by tool
  const roughGroups = groupPassesByTool(roughPasses, library, opOrder);
  const finishGroups = groupPassesByTool(finishPasses, library, opOrder);

  // Create blocks: ROUGH first, then FINISH
  const roughBlocks = createToolBlocks(roughGroups, library, 0);
  const finishBlocks = createToolBlocks(
    finishGroups,
    library,
    roughBlocks.length
  );

  const allBlocks = [...roughBlocks, ...finishBlocks];

  // Build tool order
  const toolOrder = allBlocks.map((b) => b.toolId);

  // Build fingerprints list
  const fingerprints = allBlocks.flatMap((b) =>
    b.passes.flatMap((p) => [p.offsetSpecFp, p.entryExitFp])
  );

  // Build audit
  const audit: PlanAudit = {
    opOrder,
    toolOrder,
    fingerprints,
    generatedAt: new Date().toISOString(),
    plannerVersion: config.version,
  };

  // Build stats
  const stats: PlanStats = {
    totalOps: ops.length,
    totalPasses: allPasses.length,
    toolChanges: Math.max(0, allBlocks.length - 1),
    uniqueTools: new Set(toolOrder).size,
    roughPasses: roughPasses.length,
    finishPasses: finishPasses.length,
  };

  // Add warnings from issues
  for (const issue of issues) {
    if (issue.severity === "WARN" || issue.severity === "INFO") {
      warnings.push(`[${issue.code}] ${issue.message}`);
    }
  }

  // Build plan
  const plan: MultiToolPlan = {
    version: "1.0",
    blocks: allBlocks,
    audit,
    stats,
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
 * Get all passes from a plan in execution order.
 */
export function getAllPassesInOrder(plan: MultiToolPlan): PlannedPass[] {
  return plan.blocks.flatMap((b) => b.passes);
}

/**
 * Get passes for a specific operation.
 */
export function getPassesForOp(
  plan: MultiToolPlan,
  opId: string
): PlannedPass[] {
  return getAllPassesInOrder(plan).filter((p) => p.opId === opId);
}

/**
 * Get the tool change sequence.
 */
export function getToolChangeSequence(plan: MultiToolPlan): ToolId[] {
  return plan.blocks.map((b) => b.toolId);
}

/**
 * Count tool changes in plan.
 */
export function countToolChanges(plan: MultiToolPlan): number {
  return Math.max(0, plan.blocks.length - 1);
}

/**
 * Estimate total machining time (placeholder).
 */
export function estimateTotalTime(
  plan: MultiToolPlan,
  library: ToolLibrary
): number {
  let total = 0;

  for (const block of plan.blocks) {
    // Add tool change time (e.g., 30 seconds)
    if (block.blockIndex > 0) {
      total += 30;
    }

    // Add pass times (placeholder: 60 seconds per pass)
    total += block.passes.length * 60;
  }

  return total;
}

/**
 * Generate audit report for plan.
 */
export function generatePlanAuditReport(
  plan: MultiToolPlan
): Record<string, unknown> {
  return {
    version: plan.version,
    generatedAt: plan.audit.generatedAt,
    plannerVersion: plan.audit.plannerVersion,
    stats: {
      operations: plan.stats.totalOps,
      passes: plan.stats.totalPasses,
      toolChanges: plan.stats.toolChanges,
      uniqueTools: plan.stats.uniqueTools,
      roughPasses: plan.stats.roughPasses,
      finishPasses: plan.stats.finishPasses,
    },
    toolOrder: plan.audit.toolOrder,
    blocks: plan.blocks.map((b) => ({
      tool: b.toolId,
      diameter: b.toolDiameterMm,
      class: b.toolClass,
      passes: b.passes.length,
      passIds: b.passes.map((p) => p.passId),
    })),
    fingerprints: {
      count: plan.audit.fingerprints.length,
      sample: plan.audit.fingerprints.slice(0, 5),
    },
    warnings: plan.warnings,
  };
}
