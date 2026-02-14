// src/core/cutDirection/applyDirectionPolicy.ts
/**
 * Apply Direction Policy Integration Helper.
 *
 * Integrates cut direction policy with toolpath generation.
 *
 * Workflow:
 * 1. Receive toolpaths from CAM engine
 * 2. Determine cut context (material, tool, side)
 * 3. Apply policy decision (climb/conventional)
 * 4. Ensure correct path winding
 * 5. Return processed toolpaths with audit trail
 *
 * v0.10.6.4 - Climb / Conventional Policy Engine
 */

import {
  CutContext,
  CutDirectionPolicy,
  DirectionDecision,
  MaterialTag,
  ToolClass,
  OpKind,
  CutSide,
  PassKind,
  ToolPath,
} from "./cutDirectionTypes";
import { defaultCutDirectionPolicy } from "./cutDirectionPolicy";
import { ensureWinding, detectWinding } from "./pathReverse";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toolpath with direction metadata applied.
 */
export interface ProcessedToolPath extends ToolPath {
  /** Original winding before policy applied */
  originalWinding: "CW" | "CCW";

  /** Direction decision applied */
  decision: DirectionDecision;

  /** Whether path was reversed to match policy */
  wasReversed: boolean;
}

/**
 * Input for toolpath direction processing.
 */
export interface ToolPathInput {
  /** The toolpath to process */
  path: ToolPath;

  /** Cut side for this path */
  side: CutSide;

  /** Optional path-specific context overrides */
  contextOverride?: Partial<CutContext>;
}

/**
 * Batch processing options.
 */
export interface ProcessingOptions {
  /** Material being cut */
  material: MaterialTag;

  /** Tool being used */
  tool: ToolClass;

  /** Operation type */
  op: OpKind;

  /** Pass type (rough/finish) */
  pass?: PassKind;

  /** Laminate face orientation */
  laminateFace?: "TOP" | "BOTTOM" | "BOTH" | "NONE";

  /** Spindle rotation */
  spindleDirection?: "CW" | "CCW";

  /** Policy to use (defaults to defaultCutDirectionPolicy) */
  policy?: CutDirectionPolicy;
}

/**
 * Result of batch processing.
 */
export interface ProcessingResult {
  /** Processed toolpaths with correct winding */
  paths: ProcessedToolPath[];

  /** Summary of decisions made */
  summary: ProcessingSummary;
}

/**
 * Summary statistics for processing.
 */
export interface ProcessingSummary {
  /** Total paths processed */
  totalPaths: number;

  /** Paths that were reversed */
  reversedCount: number;

  /** Unique decisions made */
  decisions: Map<string, number>;

  /** Any warnings generated */
  warnings: string[];

  /** Policy used */
  policyName: string;

  /** Policy version */
  policyVersion: string;
}

// =============================================================================
// SINGLE PATH PROCESSING
// =============================================================================

/**
 * Apply direction policy to a single toolpath.
 *
 * @param path Toolpath to process
 * @param ctx Full cut context
 * @param policy Policy to use (defaults to default policy)
 * @returns Processed toolpath with correct winding
 */
export function applyDirectionToPath(
  path: ToolPath,
  ctx: CutContext,
  policy: CutDirectionPolicy = defaultCutDirectionPolicy
): ProcessedToolPath {
  // Detect original winding
  const originalWinding = path.winding ?? detectWinding(path);

  // Get policy decision
  const decision = policy.decide(ctx);

  // Ensure path has correct winding
  const processedPath = ensureWinding(path, decision.pathWinding);
  const wasReversed = processedPath !== path;

  return {
    ...processedPath,
    originalWinding,
    decision,
    wasReversed,
  };
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Process multiple toolpaths with direction policy.
 *
 * All paths share the same material/tool/op context,
 * but each can have different cut side (inside/outside).
 *
 * @param inputs Toolpath inputs with side information
 * @param options Processing options (material, tool, etc.)
 * @returns Processed paths with summary
 */
export function processToolPaths(
  inputs: ToolPathInput[],
  options: ProcessingOptions
): ProcessingResult {
  const policy = options.policy ?? defaultCutDirectionPolicy;
  const warnings: string[] = [];
  const decisions = new Map<string, number>();

  const paths: ProcessedToolPath[] = inputs.map((input) => {
    // Build context for this path
    const ctx: CutContext = {
      material: options.material,
      tool: options.tool,
      op: options.op,
      side: input.side,
      pass: options.pass ?? "FINISH",
      laminateFace: options.laminateFace,
      spindleDirection: options.spindleDirection,
      ...input.contextOverride,
    };

    // Apply policy
    const processed = applyDirectionToPath(input.path, ctx, policy);

    // Track decision
    const reasonKey = processed.decision.reason;
    decisions.set(reasonKey, (decisions.get(reasonKey) ?? 0) + 1);

    // Collect warnings
    if (processed.decision.warnings) {
      warnings.push(...processed.decision.warnings);
    }

    return processed;
  });

  // Build summary
  const summary: ProcessingSummary = {
    totalPaths: paths.length,
    reversedCount: paths.filter((p) => p.wasReversed).length,
    decisions,
    warnings: [...new Set(warnings)], // Deduplicate
    policyName: policy.name,
    policyVersion: policy.version,
  };

  return { paths, summary };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Process outside profile cuts.
 *
 * Convenience wrapper for common outside profile operation.
 *
 * @param paths Toolpaths to process
 * @param material Material being cut
 * @param tool Tool being used
 * @param policy Optional policy override
 * @returns Processed paths
 */
export function processOutsideProfiles(
  paths: ToolPath[],
  material: MaterialTag,
  tool: ToolClass,
  policy?: CutDirectionPolicy
): ProcessedToolPath[] {
  const inputs: ToolPathInput[] = paths.map((path) => ({
    path,
    side: "OUTSIDE" as CutSide,
  }));

  const result = processToolPaths(inputs, {
    material,
    tool,
    op: "PROFILE",
    policy,
  });

  return result.paths;
}

/**
 * Process inside profile cuts (pockets, cutouts).
 *
 * @param paths Toolpaths to process
 * @param material Material being cut
 * @param tool Tool being used
 * @param policy Optional policy override
 * @returns Processed paths
 */
export function processInsideProfiles(
  paths: ToolPath[],
  material: MaterialTag,
  tool: ToolClass,
  policy?: CutDirectionPolicy
): ProcessedToolPath[] {
  const inputs: ToolPathInput[] = paths.map((path) => ({
    path,
    side: "INSIDE" as CutSide,
  }));

  const result = processToolPaths(inputs, {
    material,
    tool,
    op: "PROFILE",
    policy,
  });

  return result.paths;
}

/**
 * Process centerline operations (grooves, engravings).
 *
 * @param paths Toolpaths to process
 * @param material Material being cut
 * @param tool Tool being used
 * @param policy Optional policy override
 * @returns Processed paths
 */
export function processCenterline(
  paths: ToolPath[],
  material: MaterialTag,
  tool: ToolClass,
  policy?: CutDirectionPolicy
): ProcessedToolPath[] {
  const inputs: ToolPathInput[] = paths.map((path) => ({
    path,
    side: "ON" as CutSide,
  }));

  const result = processToolPaths(inputs, {
    material,
    tool,
    op: "GROOVE",
    policy,
  });

  return result.paths;
}

// =============================================================================
// AUDIT & DEBUGGING
// =============================================================================

/**
 * Generate audit report for processed paths.
 *
 * @param result Processing result
 * @returns Human-readable audit report
 */
export function generateAuditReport(result: ProcessingResult): string {
  const lines: string[] = [
    "=== Cut Direction Audit Report ===",
    `Policy: ${result.summary.policyName} v${result.summary.policyVersion}`,
    `Total Paths: ${result.summary.totalPaths}`,
    `Reversed: ${result.summary.reversedCount}`,
    "",
    "Decision Breakdown:",
  ];

  result.summary.decisions.forEach((count, reason) => {
    lines.push(`  ${reason}: ${count}`);
  });

  if (result.summary.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    result.summary.warnings.forEach((w) => {
      lines.push(`  ⚠️ ${w}`);
    });
  }

  lines.push("");
  lines.push("Path Details:");
  result.paths.forEach((path, i) => {
    const rev = path.wasReversed ? " (REVERSED)" : "";
    lines.push(
      `  [${i}] ${path.decision.mode} → ${path.decision.pathWinding}${rev}`
    );
    lines.push(`       Reason: ${path.decision.reason}`);
  });

  return lines.join("\n");
}

/**
 * Validate processing result for errors.
 *
 * @param result Processing result to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateProcessingResult(result: ProcessingResult): string[] {
  const errors: string[] = [];

  // Check for low-confidence decisions
  const lowConfidence = result.paths.filter(
    (p) => p.decision.confidence === "LOW"
  );
  if (lowConfidence.length > 0) {
    errors.push(
      `${lowConfidence.length} paths have LOW confidence decisions - review recommended`
    );
  }

  // Check for mixed modes (unusual, might indicate misconfiguration)
  const modes = new Set(result.paths.map((p) => p.decision.mode));
  if (modes.size > 1) {
    errors.push(
      "Mixed CLIMB/CONVENTIONAL modes detected - verify this is intentional"
    );
  }

  // Check for warnings
  if (result.summary.warnings.length > 0) {
    errors.push(
      `${result.summary.warnings.length} warnings generated during processing`
    );
  }

  return errors;
}
