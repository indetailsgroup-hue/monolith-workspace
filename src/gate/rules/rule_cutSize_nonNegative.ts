/**
 * Rule: Cut Size Non-Negative
 *
 * @module gate/rules/rule_cutSize_nonNegative
 * @version 0.1.0
 *
 * Validates that computed cut sizes are positive and meet minimum dimensions.
 * This is a critical safety rule - negative or zero cut sizes indicate
 * impossible geometry (edge banding thicker than the panel).
 *
 * ## Issue Codes
 * - `B_CUTSIZE_NONPOSITIVE` (BLOCKER): Cut size is zero or negative
 * - `W_CUTSIZE_TOO_SMALL` (WARNING): Cut size below recommended minimum
 *
 * ## Common Causes
 * - Edge band thickness exceeds finish dimension
 * - Incorrect premill settings
 * - Data entry errors
 *
 * @example
 * // Part with 10mm finish width but 6mm edge each side = impossible
 * // CutW = 10 - (6 + 6) = -2mm → BLOCKER
 */

import type { GateIssue, GatePolicy, PartSpec } from '../types';
import { computeCutW, computeCutH } from '../compute/cutSize';
import { issueId } from '../utils/idGen';

/**
 * Validates that cut sizes are positive and meet minimum requirements.
 *
 * @param policy - Gate policy containing minCutDimensionMm threshold
 * @param parts - Array of part specifications to validate
 * @returns Array of gate issues (empty if all parts pass)
 *
 * @example
 * const issues = ruleCutSizeNonNegative(policy, parts);
 * const blockers = issues.filter(i => i.severity === 'BLOCKER');
 * if (blockers.length > 0) {
 *   throw new Error('Cannot manufacture: invalid cut sizes');
 * }
 *
 * @see {@link computeCutW} for width calculation
 * @see {@link computeCutH} for height calculation
 */
export function ruleCutSizeNonNegative(
  policy: GatePolicy,
  parts: PartSpec[]
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const p of parts) {
    const cw = computeCutW(p);
    const ch = computeCutH(p);

    // BLOCKER: Non-positive cut size
    if (cw <= 0 || ch <= 0) {
      issues.push({
        id: issueId('B_CUTSIZE_NONPOSITIVE', p.partId, cw, ch),
        severity: 'BLOCKER',
        code: 'B_CUTSIZE_NONPOSITIVE',
        message: `Cut size is non-positive (CutW=${cw.toFixed(2)}mm, CutH=${ch.toFixed(2)}mm). Check edge thickness/premill vs finish size.`,
        partIds: [p.partId],
        context: {
          finishW: p.finishW,
          finishH: p.finishH,
          cutW: Math.round(cw * 100) / 100,
          cutH: Math.round(ch * 100) / 100,
        },
      });
      continue; // Skip further checks for this part
    }

    // WARNING: Cut size below minimum
    if (cw < policy.minCutDimensionMm || ch < policy.minCutDimensionMm) {
      issues.push({
        id: issueId('W_CUTSIZE_TOO_SMALL', p.partId, cw, ch),
        severity: 'WARNING',
        code: 'W_CUTSIZE_TOO_SMALL',
        message: `Cut size is below minimum recommended (${policy.minCutDimensionMm}mm).`,
        partIds: [p.partId],
        context: {
          cutW: Math.round(cw * 100) / 100,
          cutH: Math.round(ch * 100) / 100,
          minCutDimensionMm: policy.minCutDimensionMm,
        },
      });
    }
  }

  return issues;
}
