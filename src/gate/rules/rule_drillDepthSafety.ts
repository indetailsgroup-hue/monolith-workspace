/**
 * Rule: Drill Depth Safety
 *
 * @module gate/rules/rule_drillDepthSafety
 * @version 0.1.0
 *
 * Validates that drill depths do not exceed safe maximums for the material.
 * This prevents drilling through panels, which would damage the work and
 * potentially the machine bed.
 *
 * ## Formula
 * ```
 * maxDepth = compositeThickness - safetyMargin
 * ```
 *
 * ## Issue Codes
 * - `B_SAFETY_DRILL_DEPTH` (BLOCKER): Drill would exceed safe depth
 *
 * ## Industry Context
 * - Typical safety margin: 0.5-1.0mm
 * - Minifix cam housing: 12.5mm depth in 16mm panel (3.5mm remaining)
 * - System 32 shelf pins: 13mm depth in 18mm panel (5mm remaining)
 *
 * @example
 * // 16mm panel (16.4mm with surfaces), 0.5mm margin
 * // maxDepth = 16.4 - 0.5 = 15.9mm
 * // Drill at 16mm → BLOCKER
 */

import type { DrillOp, GateIssue, GatePolicy, PartSpec } from '../types';
import { compositeThicknessMm } from '../compute/composite';
import { issueId } from '../utils/idGen';

/**
 * Validates that drill operations stay within safe depth limits.
 *
 * Calculates maximum safe depth for each part's material and checks all
 * drill operations against this limit.
 *
 * @param policy - Gate policy containing thicknessSafetyMarginMm
 * @param parts - Array of part specifications with material data
 * @param drillOps - Array of drill operations with depth values
 * @returns Array of blocker issues for depth violations
 *
 * @example
 * const issues = ruleDrillDepthSafety(policy, parts, drillOps);
 * if (issues.length > 0) {
 *   // Adjust drill depths or reject manufacturing
 *   for (const issue of issues) {
 *     console.error(issue.message);
 *   }
 * }
 *
 * @see {@link compositeThicknessMm} for thickness calculation
 * @see {@link GatePolicy.thicknessSafetyMarginMm} for safety margin setting
 */
export function ruleDrillDepthSafety(
  policy: GatePolicy,
  parts: PartSpec[],
  drillOps: DrillOp[]
): GateIssue[] {
  const byId = new Map(parts.map((p) => [p.partId, p]));
  const issues: GateIssue[] = [];

  for (const op of drillOps) {
    const p = byId.get(op.partId);
    if (!p) continue;

    const thickness = compositeThicknessMm(p.material);
    const maxDepth = Math.max(0, thickness - policy.thicknessSafetyMarginMm);

    if (op.depthMm > maxDepth) {
      issues.push({
        id: issueId('B_SAFETY_DRILL_DEPTH', op.opId, op.depthMm, maxDepth),
        severity: 'BLOCKER',
        code: 'B_SAFETY_DRILL_DEPTH',
        message: `Drill depth ${op.depthMm}mm exceeds safe max ${maxDepth.toFixed(2)}mm for thickness ${thickness.toFixed(2)}mm.`,
        partIds: [p.partId],
        context: {
          opId: op.opId,
          depthMm: op.depthMm,
          thicknessMm: Math.round(thickness * 100) / 100,
          safetyMarginMm: policy.thicknessSafetyMarginMm,
          safeMaxDepthMm: Math.round(maxDepth * 100) / 100,
          x: op.x,
          y: op.y,
        },
      });
    }
  }

  return issues;
}
