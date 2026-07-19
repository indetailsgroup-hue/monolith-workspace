/**
 * Gate v0.1 Orchestrator
 *
 * Runs all validation rules and aggregates results
 * Deterministic execution order ensures reproducible gate reports
 *
 * "โรงงานก่อน ความสวยทีหลัง"
 */

import type { GateInput, GateOutput, GatePolicy, GateIssue } from './types';
import { DEFAULT_GATE_POLICY_V1 } from './policy';
import { resetIssueCounter, issueId } from './utils/idGen';

import { ruleCutSizeNonNegative } from './rules/rule_cutSize_nonNegative';
import { ruleEdgeAllowance } from './rules/rule_edge_allowance';
import { ruleMinMargins } from './rules/rule_minMargins';
import { ruleClearanceBackPanel } from './rules/rule_clearance_backPanel';
import { ruleDrillDepthSafety } from './rules/rule_drillDepthSafety';
import { ruleEdgeBoreCentering } from './rules/rule_edgeBoreCentering';
import { ruleFittingSpacing } from './rules/rule_fitting_spacing';

/**
 * Run Gate v0.1 validation
 *
 * Executes all rules in deterministic order and returns aggregated issues
 *
 * @param input - Gate input containing parts, drill ops, fittings
 * @param policy - Gate policy (defaults to v0.1)
 * @returns Gate output with issues and metrics
 */
export function runGateV01(
  input: GateInput,
  policy: GatePolicy = DEFAULT_GATE_POLICY_V1
): GateOutput {
  // Reset issue counter for deterministic IDs
  resetIssueCounter();

  const issues: GateIssue[] = [];

  // ============================================
  // RULE EXECUTION (Deterministic Order)
  // ============================================

  // 1. Cut Size Validation (highest priority - if cut size is wrong, nothing else matters)
  issues.push(...ruleCutSizeNonNegative(policy, input.parts));

  // 2. Edge Allowance Sanity (configuration warnings)
  issues.push(...ruleEdgeAllowance(policy, input.parts));

  // 3. Minimum Margins (drill/fitting distance from edges)
  issues.push(...ruleMinMargins(policy, input.parts, input.drillOps, input.fittings));

  // 4. Drill Depth Safety (critical safety check)
  issues.push(...ruleDrillDepthSafety(policy, input.parts, input.drillOps));

  // 4b. Edge Bore Centring — depth safety checks the material AHEAD of the bit;
  // this checks the material BESIDE it. An edge bore off-centre in the panel's
  // thickness breaks out sideways along the whole length of the bore, and no
  // other rule can see it.
  issues.push(...ruleEdgeBoreCentering(policy, input.parts, input.drillOps));

  // 5. Fitting Spacing (hardware clearance)
  issues.push(...ruleFittingSpacing(policy, input.parts, input.fittings));

  // 6. Back Panel Clearance (cabinet-level check)
  issues.push(...ruleClearanceBackPanel(policy, input));

  // ============================================
  // UNRESOLVED OPS — REFUSE LOUDLY, NEVER SILENTLY
  // ============================================
  //
  // Every material rule above joins an op to its part by partId and does
  // `if (!p) continue` on a miss. That drop is invisible: an op whose partId
  // matches no part is neither passed nor failed, it is simply not examined, and
  // a report full of such ops reads as a clean pass over holes nobody checked.
  // That is precisely how an id-scheme mismatch (ops keyed 'panel-left', parts
  // keyed 'PANEL_SIDE_L') let a real drill-through reach release. Surface it: an
  // unexamined hole must be visible, not absent. This is diagnostic (WARNING),
  // and does not by itself gate release — but it makes "checked nothing" legible
  // in every gate run and to every future caller of this function.
  const knownPartIds = new Set(input.parts.map((p) => p.partId));
  const unresolvedOps = input.drillOps.filter((op) => !knownPartIds.has(op.partId));
  if (unresolvedOps.length > 0) {
    const unresolvedPartIds = [...new Set(unresolvedOps.map((op) => op.partId))].sort();
    issues.push({
      id: issueId('W_DRILLOPS_UNRESOLVED', String(unresolvedOps.length), ...unresolvedPartIds),
      severity: 'WARNING',
      code: 'W_DRILLOPS_UNRESOLVED',
      message:
        `${unresolvedOps.length} drill op(s) reference a partId with no matching part and were ` +
        `NOT evaluated by the depth, margin or edge-bore safety rules. Unmatched partId(s): ` +
        `${unresolvedPartIds.join(', ')}. The ops and parts use mismatched id schemes — this is ` +
        `not a pass; the holes were dropped unchecked.`,
      partIds: unresolvedPartIds,
      context: {
        unresolvedOpCount: unresolvedOps.length,
        totalOpCount: input.drillOps.length,
        unresolvedPartIds: unresolvedPartIds.join(','),
      },
    });
  }

  // ============================================
  // METRICS AGGREGATION
  // ============================================

  const blockers = issues.filter((i) => i.severity === 'BLOCKER').length;
  const warnings = issues.filter((i) => i.severity === 'WARNING').length;
  const info = issues.filter((i) => i.severity === 'INFO').length;

  return {
    issues,
    metrics: {
      partsCount: input.parts.length,
      blockers,
      warnings,
      info,
    },
  };
}

/**
 * Check if gate output allows release
 */
export function canReleaseFromGate(output: GateOutput): boolean {
  return output.metrics.blockers === 0;
}

/**
 * Get blocker issues only
 */
export function getBlockers(output: GateOutput): GateIssue[] {
  return output.issues.filter((i) => i.severity === 'BLOCKER');
}

/**
 * Get warning issues only
 */
export function getWarnings(output: GateOutput): GateIssue[] {
  return output.issues.filter((i) => i.severity === 'WARNING');
}
