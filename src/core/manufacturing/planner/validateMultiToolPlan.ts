// src/core/manufacturing/planner/validateMultiToolPlan.ts
/**
 * Multi-Tool Plan Validation.
 *
 * Gate checks for multi-tool manufacturing plans:
 * - Laminate surfaces have appropriate finish tools
 * - Tool diameters fit features
 * - Stock calculations are valid
 * - All referenced tools exist
 *
 * v0.10.6.7 - Multi-Tool Routing
 */

import {
  MultiToolPlan,
  MultiToolIssue,
  MultiToolIssueCode,
  ToolDef,
  ToolId,
  ToolClass,
  OpIntent,
  PlannedPass,
  ToolChangeBlock,
} from "./multiToolPlan.v1";

import { createToolLibrary, ToolLibrary } from "./multiToolPlanner";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Material specification for validation.
 */
export interface MaterialForValidation {
  /** Material reference ID */
  id: string;

  /** Has laminate surface (HPL/Melamine/Veneer) */
  hasLaminate: boolean;

  /** Surface A material */
  surfaceA?: string;

  /** Surface B material */
  surfaceB?: string;
}

/**
 * Geometry specification for validation.
 */
export interface GeometryForValidation {
  /** Path ID */
  pathId: string;

  /** Minimum feature size (narrowest point, mm) */
  minFeatureSizeMm: number;

  /** Is this a closed path */
  closed: boolean;
}

/**
 * Validation context.
 */
export interface ValidationContext {
  /** Tool library */
  tools: ToolDef[];

  /** Material lookup by ID */
  materials: Map<string, MaterialForValidation>;

  /** Geometry lookup by path ID */
  geometries: Map<string, GeometryForValidation>;

  /** Allow warnings to pass validation */
  allowWarnings?: boolean;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Is the plan valid? */
  valid: boolean;

  /** All issues found */
  issues: MultiToolIssue[];

  /** Blocking issues only */
  blocks: MultiToolIssue[];

  /** Warning issues only */
  warnings: MultiToolIssue[];

  /** Info issues only */
  info: MultiToolIssue[];
}

// =============================================================================
// TOOL CLASS VALIDATION
// =============================================================================

/**
 * Tool classes approved for laminate finish.
 */
const LAMINATE_APPROVED_CLASSES: ToolClass[] = [
  "COMPRESSION",
  "DOWNCUT",
];

/**
 * Check if tool class is approved for laminate finish.
 */
function isLaminateApproved(toolClass: ToolClass): boolean {
  return LAMINATE_APPROVED_CLASSES.includes(toolClass);
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate that laminate materials have appropriate finish tools.
 */
function validateLaminateFinishTools(
  plan: MultiToolPlan,
  ops: OpIntent[],
  ctx: ValidationContext
): MultiToolIssue[] {
  const issues: MultiToolIssue[] = [];
  const library = createToolLibrary(ctx.tools);

  for (const op of ops) {
    const material = ctx.materials.get(op.materialRef);
    if (!material?.hasLaminate) continue;

    // Find finish passes for this op
    const finishPasses = plan.blocks
      .flatMap((b) => b.passes)
      .filter((p) => p.opId === op.opId && p.stage === "FINISH");

    for (const pass of finishPasses) {
      const tool = library.get(pass.toolId);
      if (!tool) continue;

      if (!isLaminateApproved(tool.class)) {
        issues.push({
          code: "LAMINATE_NO_COMPRESSION_FINISH",
          severity: "BLOCK",
          message: `Laminate material "${op.materialRef}" requires COMPRESSION or DOWNCUT finish tool, got ${tool.class}`,
          opId: op.opId,
          toolId: pass.toolId,
          data: {
            materialRef: op.materialRef,
            toolClass: tool.class,
            approvedClasses: LAMINATE_APPROVED_CLASSES,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * Validate that tool diameters fit features.
 */
function validateToolFeatureFit(
  plan: MultiToolPlan,
  ops: OpIntent[],
  ctx: ValidationContext
): MultiToolIssue[] {
  const issues: MultiToolIssue[] = [];
  const library = createToolLibrary(ctx.tools);

  for (const op of ops) {
    // Check inner paths (holes)
    for (const innerPathId of op.geometryRef.innerPathIds) {
      const geom = ctx.geometries.get(innerPathId);
      if (!geom) continue;

      // Get all tools used for this op
      const opPasses = plan.blocks
        .flatMap((b) => b.passes)
        .filter((p) => p.opId === op.opId);

      for (const pass of opPasses) {
        const tool = library.get(pass.toolId);
        if (!tool) continue;

        // Tool diameter must be smaller than feature
        if (tool.diameterMm >= geom.minFeatureSizeMm) {
          issues.push({
            code: "TOOL_TOO_BIG_FOR_FEATURE",
            severity: "BLOCK",
            message: `Tool ${tool.id} (${tool.diameterMm}mm) too large for feature "${innerPathId}" (min ${geom.minFeatureSizeMm}mm)`,
            opId: op.opId,
            toolId: tool.id,
            data: {
              toolDiameter: tool.diameterMm,
              featureSize: geom.minFeatureSizeMm,
              pathId: innerPathId,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate stock calculations are positive.
 */
function validateStockCalculations(
  plan: MultiToolPlan,
  ops: OpIntent[],
  ctx: ValidationContext
): MultiToolIssue[] {
  const issues: MultiToolIssue[] = [];
  const library = createToolLibrary(ctx.tools);

  for (const block of plan.blocks) {
    for (const pass of block.passes) {
      // Check for negative stock (should not happen with our formulas)
      if (pass.stockToLeaveMm < 0) {
        issues.push({
          code: "ROUGH_STOCK_NEGATIVE",
          severity: "BLOCK",
          message: `Pass ${pass.passId} has negative stock to leave: ${pass.stockToLeaveMm}mm`,
          opId: pass.opId,
          toolId: pass.toolId,
          data: {
            stockToLeaveMm: pass.stockToLeaveMm,
            passId: pass.passId,
          },
        });
      }

      // Check for zero stock on rough pass (warning only)
      if (pass.stage === "ROUGH" && pass.stockToLeaveMm === 0) {
        // Find if there's a finish pass with different tool
        const op = ops.find((o) => o.opId === pass.opId);
        if (op?.toolStrategy.roughTool !== op?.toolStrategy.finishTool) {
          issues.push({
            code: "ROUGH_PATH_COLLAPSED",
            severity: "WARN",
            message: `Rough pass ${pass.passId} has zero stock but different finish tool. Finish may re-cut same path.`,
            opId: pass.opId,
            toolId: pass.toolId,
            data: {
              passId: pass.passId,
              roughTool: op?.toolStrategy.roughTool,
              finishTool: op?.toolStrategy.finishTool,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate all referenced tools exist.
 */
function validateToolReferences(
  plan: MultiToolPlan,
  ctx: ValidationContext
): MultiToolIssue[] {
  const issues: MultiToolIssue[] = [];
  const library = createToolLibrary(ctx.tools);

  const referencedTools = new Set<ToolId>();
  for (const block of plan.blocks) {
    referencedTools.add(block.toolId);
    for (const pass of block.passes) {
      referencedTools.add(pass.toolId);
    }
  }

  for (const toolId of referencedTools) {
    if (!library.has(toolId)) {
      issues.push({
        code: "TOOL_NOT_FOUND",
        severity: "BLOCK",
        message: `Referenced tool not found in library: ${toolId}`,
        toolId,
      });
    }
  }

  return issues;
}

/**
 * Validate plan has finish tools for all operations.
 */
function validateFinishToolPresence(
  plan: MultiToolPlan,
  ops: OpIntent[]
): MultiToolIssue[] {
  const issues: MultiToolIssue[] = [];

  for (const op of ops) {
    const finishPasses = plan.blocks
      .flatMap((b) => b.passes)
      .filter((p) => p.opId === op.opId && p.stage === "FINISH");

    if (finishPasses.length === 0) {
      issues.push({
        code: "FINISH_TOOL_MISSING",
        severity: "BLOCK",
        message: `Operation ${op.opId} has no finish passes`,
        opId: op.opId,
      });
    }
  }

  return issues;
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Validate a multi-tool plan.
 *
 * @param plan Plan to validate
 * @param ops Original operation intents
 * @param ctx Validation context with tools, materials, geometries
 * @returns Validation result
 */
export function validateMultiToolPlan(
  plan: MultiToolPlan,
  ops: OpIntent[],
  ctx: ValidationContext
): ValidationResult {
  const allIssues: MultiToolIssue[] = [];

  // Run all validations
  allIssues.push(...validateToolReferences(plan, ctx));
  allIssues.push(...validateFinishToolPresence(plan, ops));
  allIssues.push(...validateLaminateFinishTools(plan, ops, ctx));
  allIssues.push(...validateToolFeatureFit(plan, ops, ctx));
  allIssues.push(...validateStockCalculations(plan, ops, ctx));

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
 * Quick validation (just check for blocking issues).
 */
export function quickValidatePlan(
  plan: MultiToolPlan,
  tools: ToolDef[]
): boolean {
  const ctx: ValidationContext = {
    tools,
    materials: new Map(),
    geometries: new Map(),
  };

  const issues = validateToolReferences(plan, ctx);
  return issues.filter((i) => i.severity === "BLOCK").length === 0;
}

// =============================================================================
// AUDIT HELPERS
// =============================================================================

/**
 * Generate validation audit report.
 */
export function generateValidationAuditReport(
  result: ValidationResult
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
      opId: i.opId,
      toolId: i.toolId,
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
  result: ValidationResult
): string[] {
  return result.issues.map((i) => {
    const prefix = i.severity === "BLOCK" ? "ERROR" : i.severity;
    const context = i.opId ? ` [op: ${i.opId}]` : "";
    return `[${prefix}]${context} ${i.message}`;
  });
}
