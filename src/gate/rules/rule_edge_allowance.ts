/**
 * Rule: Edge Allowance Sanity
 *
 * @module gate/rules/rule_edge_allowance
 * @version 0.1.0
 *
 * Validates that edge band configuration is sensible by checking
 * premill vs edge thickness relationships.
 *
 * ## Issue Codes
 * - `W_PREMILL_GT_EDGE` (WARNING): Premill exceeds edge thickness by >2mm
 *
 * ## Why This Matters
 * Premill is the material removed before edge banding. It should typically
 * be a small fraction of edge thickness (e.g., 0.3mm premill for 2mm edge).
 * If premill exceeds edge thickness significantly, it usually indicates:
 * - Data entry error (swapped values)
 * - Misconfigured material settings
 * - Copy-paste mistakes
 *
 * @example
 * // Normal: 2mm edge, 0.3mm premill → OK
 * // Suspicious: 2mm edge, 5mm premill → WARNING
 */

import type { GateIssue, GatePolicy, PartSpec, EdgeSide } from '../types';
import { computeCutW, computeCutH } from '../compute/cutSize';
import { issueId } from '../utils/idGen';

/**
 * Validates edge banding configuration sanity.
 *
 * Checks that premill values are reasonable relative to edge thickness.
 * Uses a 2mm tolerance threshold before flagging as suspicious.
 *
 * @param _policy - Gate policy (currently unused, reserved for future thresholds)
 * @param parts - Array of part specifications to validate
 * @returns Array of warning issues for suspicious edge configurations
 *
 * @example
 * const warnings = ruleEdgeAllowance(policy, parts);
 * if (warnings.length > 0) {
 *   console.warn('Check edge settings:', warnings);
 * }
 *
 * @see {@link computeCutW} for how edge settings affect cut size
 */
export function ruleEdgeAllowance(
  _policy: GatePolicy,
  parts: PartSpec[]
): GateIssue[] {
  const issues: GateIssue[] = [];

  const sides: EdgeSide[] = ['L', 'R', 'T', 'B'];

  for (const p of parts) {
    const cw = computeCutW(p);
    const ch = computeCutH(p);

    // Check each side for premill > edge thickness anomaly
    for (const s of sides) {
      const e = p.edges[s];
      if (!e?.enabled) continue;

      // Warning if premill exceeds edge thickness by more than 2mm
      // This is typically a configuration mistake
      if (e.premillMm > e.thicknessMm + 2) {
        issues.push({
          id: issueId('W_PREMILL_GT_EDGE', p.partId, s, e.premillMm, e.thicknessMm),
          severity: 'WARNING',
          code: 'W_PREMILL_GT_EDGE',
          message: `Premill (${e.premillMm}mm) is unusually larger than edge thickness (${e.thicknessMm}mm) on side ${s}.`,
          partIds: [p.partId],
          context: {
            side: s,
            premillMm: e.premillMm,
            edgeThicknessMm: e.thicknessMm,
            cutW: Math.round(cw * 100) / 100,
            cutH: Math.round(ch * 100) / 100,
          },
        });
      }
    }
  }

  return issues;
}
