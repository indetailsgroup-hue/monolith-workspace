/**
 * Rule: Minimum Margins
 *
 * @module gate/rules/rule_minMargins
 * @version 0.1.0
 *
 * Validates that drill operations and hardware fittings maintain minimum
 * safe distance from panel edges.
 *
 * ## Issue Codes
 * - `B_MIN_MARGIN_DRILL` (BLOCKER): Drill op too close to edge
 * - `B_MIN_SETBACK_FITTING` (BLOCKER): Fitting intent too close to edge
 *
 * ## Why This Matters
 * - **Drill ops**: Too close to edge can cause panel blowout/splitting
 * - **Fittings**: Hardware like Minifix needs setback for cam housing
 *
 * ## Industry Standards
 * - Typical minimum drill margin: 8mm from edge
 * - Typical Minifix setback: 18mm from edge (per Häfele spec)
 *
 * @example
 * // Drill at x=5mm with minMargin=8mm → BLOCKER
 * // Minifix at x=15mm with minSetback=18mm → BLOCKER
 */

import type { DrillOp, FittingIntent, GateIssue, GatePolicy, PartSpec } from '../types';
import { issueId } from '../utils/idGen';

/**
 * Validates minimum distance constraints for drill operations and fittings.
 *
 * Checks both drill ops (using minMarginToEdgeMm) and fitting intents
 * (using minSetbackFromEdgeMm) against panel boundaries.
 *
 * @param policy - Gate policy containing margin thresholds
 * @param parts - Array of part specifications (for panel dimensions)
 * @param drillOps - Array of drill operations with x,y positions
 * @param fittings - Array of fitting intents with x,y positions
 * @returns Array of blocker issues for margin violations
 *
 * @example
 * const issues = ruleMinMargins(policy, parts, drillOps, fittings);
 * const drillIssues = issues.filter(i => i.code === 'B_MIN_MARGIN_DRILL');
 * const fittingIssues = issues.filter(i => i.code === 'B_MIN_SETBACK_FITTING');
 *
 * @see {@link GatePolicy.minMarginToEdgeMm} for drill margin setting
 * @see {@link GatePolicy.minSetbackFromEdgeMm} for fitting setback setting
 */
export function ruleMinMargins(
  policy: GatePolicy,
  parts: PartSpec[],
  drillOps: DrillOp[],
  fittings: FittingIntent[]
): GateIssue[] {
  const byId = new Map(parts.map((p) => [p.partId, p]));
  const issues: GateIssue[] = [];

  // Check drill ops
  for (const d of drillOps) {
    const p = byId.get(d.partId);
    if (!p) continue;

    const min = policy.minMarginToEdgeMm;

    // An EDGE bore enters through one of the face-plane edges: along that axis
    // its distance to the edge is zero by construction, which is geometry, not
    // a blowout risk. Measuring it there would condemn every correct edge bore
    // — the same category error that made G11 reject 18mm dowel joinery. The
    // perpendicular axis is still a real margin and is still checked.
    const skipX = d.edgeEntryAxis === 'x';
    const skipY = d.edgeEntryAxis === 'y';

    const nearEdge =
      (!skipX && (d.x < min || p.finishW - d.x < min)) ||
      (!skipY && (d.y < min || p.finishH - d.y < min));

    if (nearEdge) {
      issues.push({
        id: issueId('B_MIN_MARGIN_DRILL', d.opId, d.x, d.y),
        severity: 'BLOCKER',
        code: 'B_MIN_MARGIN_DRILL',
        message: `Drill op is too close to edge (min ${min}mm required).`,
        partIds: [p.partId],
        context: {
          opId: d.opId,
          x: d.x,
          y: d.y,
          finishW: p.finishW,
          finishH: p.finishH,
          minMarginToEdgeMm: min,
        },
      });
    }
  }

  // Check fittings (typically need larger setback)
  for (const f of fittings) {
    const p = byId.get(f.partId);
    if (!p) continue;

    const min = policy.minSetbackFromEdgeMm;
    const nearEdge =
      f.x < min ||
      f.y < min ||
      p.finishW - f.x < min ||
      p.finishH - f.y < min;

    if (nearEdge) {
      issues.push({
        id: issueId('B_MIN_SETBACK_FITTING', f.fittingId, f.x, f.y),
        severity: 'BLOCKER',
        code: 'B_MIN_SETBACK_FITTING',
        message: `Fitting intent is too close to edge (min ${min}mm required).`,
        partIds: [p.partId],
        context: {
          fittingId: f.fittingId,
          x: f.x,
          y: f.y,
          finishW: p.finishW,
          finishH: p.finishH,
          minSetbackFromEdgeMm: min,
        },
      });
    }
  }

  return issues;
}
