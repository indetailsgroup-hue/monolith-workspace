/**
 * gate10_2DxfSemantic.ts - DXF Semantic Validation Gate
 *
 * GATE 10.2: Semantic validation for manufacturing safety
 *
 * ## Philosophy
 * - G10.1 ensures DXF is deterministic (byte-for-byte reproducible)
 * - G10.2 ensures DXF is semantically valid for manufacturing
 *
 * ## Tolerances (CNC Woodworking Standards)
 * - Position: 0.1mm (drill inside outline, distance B)
 * - Overlap: 0.5mm (drill collision detection)
 * - Depth: 0.5mm (material penetration safety)
 *
 * ## Severity Levels
 * - BLOCK: Must not proceed to manufacturing (safety-critical)
 * - WARN: Alert operator but allow production
 *
 * @version 1.0.0 - GATE10.2: Semantic Validation
 */

import type { OperationGraph, Operation, DrillOperation, BoreOperation } from '../../cnc/operation/operationTypes';

// ============================================
// CONSTANTS
// ============================================

/**
 * Tolerances for semantic validation (in mm)
 */
export const TOLERANCES = {
  /** Drill must be inside panel outline */
  DRILL_INSIDE_OUTLINE: 0.1,
  /** Minimum distance between drill centers to avoid overlap */
  NO_OVERLAPPING_DRILLS: 0.5,
  /** Safety margin for drill depth vs panel thickness */
  DRILL_DEPTH_SAFE: 0.5,
  /** Minifix Distance B tolerance (±0.1mm from 24mm spec) */
  MINIFIX_DISTANCE_B: 0.1,
} as const;

/**
 * Minifix S200 specifications (Häfele standard)
 */
export const MINIFIX_SPEC = {
  /** Distance B: edge to bolt center */
  DISTANCE_B: 24,
  /** Cam housing diameter */
  CAM_DIAMETER: 15,
  /** Bolt sleeve diameter */
  BOLT_DIAMETER: 10,
  /** System 32 first hole from front edge */
  FIRST_HOLE_Z: 37,
} as const;

// ============================================
// TYPES
// ============================================

export type SemanticSeverity = 'BLOCK' | 'WARN';

export interface SemanticIssue {
  rule: SemanticRule;
  severity: SemanticSeverity;
  message: string;
  operationId?: string;
  position?: { x: number; y: number; z: number };
  details?: Record<string, unknown>;
}

export type SemanticRule =
  | 'DRILL_INSIDE_OUTLINE'
  | 'NO_ORPHAN_DRILL'
  | 'DRILL_DEPTH_SAFE'
  | 'MINIFIX_DISTANCE_B'
  | 'MINIFIX_PAIR_MUTUAL'
  | 'NO_OVERLAPPING_DRILLS'
  | 'TOOL_RADIUS_VALID';

export interface SemanticValidationResult {
  valid: boolean;
  blocked: boolean;
  issues: SemanticIssue[];
  summary: {
    totalChecks: number;
    blockCount: number;
    warnCount: number;
  };
}

export interface PanelContext {
  panelId: string;
  width: number;
  height: number;
  thickness: number;
}

export interface SemanticValidationOptions {
  /** Panel dimensions for bounds checking */
  panel?: PanelContext;
  /** Skip specific rules */
  skipRules?: SemanticRule[];
  /** Treat warnings as blocks (strict mode) */
  strictMode?: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a point is inside panel bounds (with tolerance)
 */
function isInsideBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  tolerance: number
): boolean {
  return (
    x >= -tolerance &&
    x <= width + tolerance &&
    y >= -tolerance &&
    y <= height + tolerance
  );
}

/**
 * Calculate Euclidean distance between two points
 */
function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Get operation diameter (handles both DRILL and BORE)
 * Returns 0 if diameter is not specified (backward compat)
 */
function getOpDiameter(op: Operation): number {
  if (op.type === 'DRILL') {
    return (op as DrillOperation).diameter ?? 0;
  }
  if (op.type === 'BORE') {
    return (op as BoreOperation).diameter;
  }
  return 0;
}

/**
 * Get operation depth
 */
function getOpDepth(op: Operation): number {
  if (op.type === 'DRILL' || op.type === 'BORE') {
    return (op as DrillOperation | BoreOperation).depth;
  }
  return 0;
}

/**
 * Check if operation is a drill/bore type
 */
function isDrillOrBore(op: Operation): op is DrillOperation | BoreOperation {
  return op.type === 'DRILL' || op.type === 'BORE';
}

// ============================================
// VALIDATION RULES
// ============================================

/**
 * Rule: DRILL_INSIDE_OUTLINE
 * Severity: BLOCK
 * Check that all drill operations are within panel bounds
 */
function checkDrillInsideOutline(
  graph: OperationGraph,
  panel: PanelContext,
  issues: SemanticIssue[]
): void {
  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    const { x, y } = op.position;
    const radius = getOpDiameter(op) / 2;

    // Check if drill circle is fully inside panel
    const insideX = x - radius >= -TOLERANCES.DRILL_INSIDE_OUTLINE &&
                    x + radius <= panel.width + TOLERANCES.DRILL_INSIDE_OUTLINE;
    const insideY = y - radius >= -TOLERANCES.DRILL_INSIDE_OUTLINE &&
                    y + radius <= panel.height + TOLERANCES.DRILL_INSIDE_OUTLINE;

    if (!insideX || !insideY) {
      issues.push({
        rule: 'DRILL_INSIDE_OUTLINE',
        severity: 'BLOCK',
        message: `Drill ${op.id} at (${x.toFixed(2)}, ${y.toFixed(2)}) exceeds panel bounds [${panel.width}x${panel.height}]`,
        operationId: op.id,
        position: op.position,
        details: {
          drillRadius: radius,
          panelWidth: panel.width,
          panelHeight: panel.height,
        },
      });
    }
  }
}

/**
 * Rule: NO_ORPHAN_DRILL
 * Severity: BLOCK
 * Check that all drills have valid workpiece context
 */
function checkNoOrphanDrill(
  graph: OperationGraph,
  issues: SemanticIssue[]
): void {
  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    if (!op.workpieceContext || !op.workpieceContext.panelId) {
      issues.push({
        rule: 'NO_ORPHAN_DRILL',
        severity: 'BLOCK',
        message: `Drill ${op.id} has no workpiece context (orphan operation)`,
        operationId: op.id,
        position: op.position,
      });
    }
  }
}

/**
 * Rule: DRILL_DEPTH_SAFE
 * Severity: BLOCK
 * Check that drill depth doesn't exceed panel thickness (with safety margin)
 */
function checkDrillDepthSafe(
  graph: OperationGraph,
  panel: PanelContext,
  issues: SemanticIssue[]
): void {
  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    const depth = getOpDepth(op);
    const maxSafeDepth = panel.thickness + TOLERANCES.DRILL_DEPTH_SAFE;

    // Only block if drill would go through panel
    // Allow blind holes up to thickness + tolerance
    if (depth > maxSafeDepth) {
      issues.push({
        rule: 'DRILL_DEPTH_SAFE',
        severity: 'BLOCK',
        message: `Drill ${op.id} depth ${depth.toFixed(2)}mm exceeds safe limit ${maxSafeDepth.toFixed(2)}mm (panel: ${panel.thickness}mm)`,
        operationId: op.id,
        position: op.position,
        details: {
          drillDepth: depth,
          panelThickness: panel.thickness,
          maxSafeDepth,
        },
      });
    }
  }
}

/**
 * Rule: MINIFIX_DISTANCE_B
 * Severity: BLOCK
 * Check that Minifix bolt holes are at correct Distance B (24mm from edge)
 */
function checkMinifixDistanceB(
  graph: OperationGraph,
  panel: PanelContext,
  issues: SemanticIssue[]
): void {
  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    // Check if this is a bolt sleeve operation (Ø10, horizontal)
    const isBoltSleeve =
      getOpDiameter(op) === MINIFIX_SPEC.BOLT_DIAMETER &&
      op.direction === 'H';

    if (!isBoltSleeve) continue;

    // Distance B is measured from panel edge to bolt center
    // For horizontal drills on side panel, y position is Distance B
    const distanceB = op.position.y;
    const deviation = Math.abs(distanceB - MINIFIX_SPEC.DISTANCE_B);

    if (deviation > TOLERANCES.MINIFIX_DISTANCE_B) {
      issues.push({
        rule: 'MINIFIX_DISTANCE_B',
        severity: 'BLOCK',
        message: `Minifix bolt ${op.id} Distance B = ${distanceB.toFixed(2)}mm (expected: ${MINIFIX_SPEC.DISTANCE_B}mm ±${TOLERANCES.MINIFIX_DISTANCE_B}mm)`,
        operationId: op.id,
        position: op.position,
        details: {
          actualDistanceB: distanceB,
          expectedDistanceB: MINIFIX_SPEC.DISTANCE_B,
          deviation,
          tolerance: TOLERANCES.MINIFIX_DISTANCE_B,
        },
      });
    }
  }
}

/**
 * Rule: MINIFIX_PAIR_MUTUAL
 * Severity: BLOCK
 * Check that Minifix cam/bolt pairs reference each other correctly
 */
function checkMinifixPairMutual(
  graph: OperationGraph,
  issues: SemanticIssue[]
): void {
  // Build map of operation IDs to operations
  const opMap = new Map<string, Operation>();
  for (const op of graph.operations) {
    opMap.set(op.id, op);
  }

  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    // Check for paired hole reference in metadata
    const pairedId = (op as any).metadata?.pairedHoleId;
    if (!pairedId) continue;

    // Verify the paired operation exists
    const pairedOp = opMap.get(pairedId);
    if (!pairedOp) {
      issues.push({
        rule: 'MINIFIX_PAIR_MUTUAL',
        severity: 'BLOCK',
        message: `Operation ${op.id} references non-existent paired hole: ${pairedId}`,
        operationId: op.id,
        position: op.position,
        details: {
          referencedPairId: pairedId,
        },
      });
      continue;
    }

    // Verify mutual reference (the paired op should reference back)
    const backRef = (pairedOp as any).metadata?.pairedHoleId;
    if (backRef && backRef !== op.id) {
      issues.push({
        rule: 'MINIFIX_PAIR_MUTUAL',
        severity: 'BLOCK',
        message: `Minifix pair mismatch: ${op.id} → ${pairedId}, but ${pairedId} → ${backRef}`,
        operationId: op.id,
        position: op.position,
        details: {
          operationId: op.id,
          expectedBackRef: op.id,
          actualBackRef: backRef,
        },
      });
    }
  }
}

/**
 * Rule: NO_OVERLAPPING_DRILLS
 * Severity: WARN
 * Check that drills don't overlap (collision detection)
 */
function checkNoOverlappingDrills(
  graph: OperationGraph,
  issues: SemanticIssue[]
): void {
  const drillOps = graph.operations.filter(isDrillOrBore);

  for (let i = 0; i < drillOps.length; i++) {
    for (let j = i + 1; j < drillOps.length; j++) {
      const op1 = drillOps[i];
      const op2 = drillOps[j];

      const dist = distance2D(
        op1.position.x,
        op1.position.y,
        op2.position.x,
        op2.position.y
      );

      const r1 = getOpDiameter(op1) / 2;
      const r2 = getOpDiameter(op2) / 2;
      const minDist = r1 + r2 + TOLERANCES.NO_OVERLAPPING_DRILLS;

      if (dist < minDist) {
        issues.push({
          rule: 'NO_OVERLAPPING_DRILLS',
          severity: 'WARN',
          message: `Drills ${op1.id} and ${op2.id} overlap (distance: ${dist.toFixed(2)}mm, min required: ${minDist.toFixed(2)}mm)`,
          operationId: op1.id,
          position: op1.position,
          details: {
            drill1: { id: op1.id, radius: r1 },
            drill2: { id: op2.id, radius: r2 },
            actualDistance: dist,
            minRequiredDistance: minDist,
          },
        });
      }
    }
  }
}

/**
 * Rule: TOOL_RADIUS_VALID
 * Severity: WARN
 * Check that tool radii are reasonable (positive, not too large)
 */
function checkToolRadiusValid(
  graph: OperationGraph,
  issues: SemanticIssue[]
): void {
  const MAX_REASONABLE_DIAMETER = 50; // 50mm max drill diameter

  for (const op of graph.operations) {
    if (!isDrillOrBore(op)) continue;

    const diameter = getOpDiameter(op);

    if (diameter <= 0) {
      issues.push({
        rule: 'TOOL_RADIUS_VALID',
        severity: 'WARN',
        message: `Operation ${op.id} has invalid diameter: ${diameter}mm`,
        operationId: op.id,
        position: op.position,
        details: { diameter },
      });
    } else if (diameter > MAX_REASONABLE_DIAMETER) {
      issues.push({
        rule: 'TOOL_RADIUS_VALID',
        severity: 'WARN',
        message: `Operation ${op.id} has unusually large diameter: ${diameter}mm (max expected: ${MAX_REASONABLE_DIAMETER}mm)`,
        operationId: op.id,
        position: op.position,
        details: { diameter, maxReasonable: MAX_REASONABLE_DIAMETER },
      });
    }
  }
}

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Validate OperationGraph semantically for manufacturing safety
 *
 * @param graph - OperationGraph to validate
 * @param options - Validation options
 * @returns Validation result with issues
 *
 * @example
 * ```typescript
 * const result = validateDxfSemantic(graph, {
 *   panel: { panelId: 'p1', width: 800, height: 400, thickness: 18 }
 * });
 *
 * if (result.blocked) {
 *   throw new Error(`DXF blocked: ${result.issues.map(i => i.message).join(', ')}`);
 * }
 * ```
 */
export function validateDxfSemantic(
  graph: OperationGraph,
  options: SemanticValidationOptions = {}
): SemanticValidationResult {
  const { panel, skipRules = [], strictMode = false } = options;
  const issues: SemanticIssue[] = [];

  // Track which rules we run
  let totalChecks = 0;

  // Rule: NO_ORPHAN_DRILL (always runs)
  if (!skipRules.includes('NO_ORPHAN_DRILL')) {
    totalChecks++;
    checkNoOrphanDrill(graph, issues);
  }

  // Rule: TOOL_RADIUS_VALID (always runs)
  if (!skipRules.includes('TOOL_RADIUS_VALID')) {
    totalChecks++;
    checkToolRadiusValid(graph, issues);
  }

  // Rule: NO_OVERLAPPING_DRILLS (always runs)
  if (!skipRules.includes('NO_OVERLAPPING_DRILLS')) {
    totalChecks++;
    checkNoOverlappingDrills(graph, issues);
  }

  // Rules requiring panel context
  if (panel) {
    // Rule: DRILL_INSIDE_OUTLINE
    if (!skipRules.includes('DRILL_INSIDE_OUTLINE')) {
      totalChecks++;
      checkDrillInsideOutline(graph, panel, issues);
    }

    // Rule: DRILL_DEPTH_SAFE
    if (!skipRules.includes('DRILL_DEPTH_SAFE')) {
      totalChecks++;
      checkDrillDepthSafe(graph, panel, issues);
    }

    // Rule: MINIFIX_DISTANCE_B
    if (!skipRules.includes('MINIFIX_DISTANCE_B')) {
      totalChecks++;
      checkMinifixDistanceB(graph, panel, issues);
    }
  }

  // Rule: MINIFIX_PAIR_MUTUAL (always runs if operations have metadata)
  if (!skipRules.includes('MINIFIX_PAIR_MUTUAL')) {
    totalChecks++;
    checkMinifixPairMutual(graph, issues);
  }

  // Count by severity
  const blockCount = issues.filter(i => i.severity === 'BLOCK').length;
  const warnCount = issues.filter(i => i.severity === 'WARN').length;

  // In strict mode, warnings also block
  const blocked = strictMode
    ? issues.length > 0
    : blockCount > 0;

  return {
    valid: issues.length === 0,
    blocked,
    issues,
    summary: {
      totalChecks,
      blockCount,
      warnCount,
    },
  };
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

/**
 * Quick check if graph passes semantic validation
 */
export function isDxfSemanticValid(
  graph: OperationGraph,
  options?: SemanticValidationOptions
): boolean {
  return validateDxfSemantic(graph, options).valid;
}

/**
 * Get blocking issues only
 */
export function getBlockingIssues(
  graph: OperationGraph,
  options?: SemanticValidationOptions
): SemanticIssue[] {
  return validateDxfSemantic(graph, options).issues.filter(
    i => i.severity === 'BLOCK'
  );
}

/**
 * Format issues as human-readable report
 */
export function formatSemanticReport(result: SemanticValidationResult): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════');
  lines.push('  DXF Semantic Validation Report (G10.2)');
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  if (result.valid) {
    lines.push('✅ All semantic checks passed');
  } else {
    lines.push(`❌ Found ${result.issues.length} issue(s)`);
    lines.push(`   • BLOCK: ${result.summary.blockCount}`);
    lines.push(`   • WARN:  ${result.summary.warnCount}`);
  }

  lines.push('');

  if (result.issues.length > 0) {
    lines.push('Issues:');
    lines.push('───────────────────────────────────────────');

    for (const issue of result.issues) {
      const icon = issue.severity === 'BLOCK' ? '🛑' : '⚠️';
      lines.push(`${icon} [${issue.rule}] ${issue.message}`);
      if (issue.operationId) {
        lines.push(`   Operation: ${issue.operationId}`);
      }
      if (issue.position) {
        const { x, y, z } = issue.position;
        lines.push(`   Position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
      }
      lines.push('');
    }
  }

  lines.push('───────────────────────────────────────────');
  lines.push(`Status: ${result.blocked ? '🚫 BLOCKED' : '✅ PASSED'}`);

  return lines.join('\n');
}
