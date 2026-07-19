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
 * - `W_MIN_MARGIN_NOT_EVALUATED` (WARNING): Hole has no face-plane position
 * - `W_MIN_MARGIN_DIAMETER_UNKNOWN` (WARNING): Measured from centre, not wall
 *
 * ## Why This Matters
 * - **Drill ops**: Too close to edge can cause panel blowout/splitting
 * - **Fittings**: Hardware like Minifix needs setback for cam housing
 *
 * ## Measured from the bore WALL
 *
 * The distance that decides whether an edge blows out is the material between
 * the hole and the edge, so the bore RADIUS comes off the centre distance
 * before comparing. This rule read centres until the drill map was wired in and
 * it had nothing but an empty array to run over; the moment it saw real holes
 * that understatement became load-bearing, and the Ø35 hinge cup understates by
 * 17.5mm — more than twice the 8mm threshold.
 *
 * ## Industry Standards
 * - Typical minimum drill margin: 8mm from edge
 * - Typical Minifix setback: 18mm from edge (per Häfele spec)
 *
 * @example
 * // Ø8 drill at x=11mm with minMargin=8mm → wall at 7mm → BLOCKER
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

    // No position: the panel's orientation could not be established, so which
    // world axis is the face plane is unknown and there is no coordinate to
    // measure. Say so — an unmeasured hole must not look like a clean one.
    if (d.x === undefined || d.y === undefined) {
      issues.push({
        id: issueId('W_MIN_MARGIN_NOT_EVALUATED', d.opId),
        severity: 'WARNING',
        code: 'W_MIN_MARGIN_NOT_EVALUATED',
        message:
          `Edge margin NOT CHECKED for ${d.opId}: panel ${d.partId} has no established ` +
          `orientation, so the hole has no face-plane position to measure. This is not a pass.`,
        partIds: [p.partId],
        context: { opId: d.opId, minMarginToEdgeMm: min },
      });
      continue;
    }

    // Measure from the hole WALL, not its centre. The margin that matters is
    // the material left between the bore and the edge, and that is short of the
    // centre distance by the bore RADIUS. Reading centres understates every
    // margin by r — harmless while this rule ran over an empty array, but the
    // Ø35 hinge cup is 17.5mm of understatement, enough for a cup whose wall
    // has already broken through the edge to be reported as compliant.
    const r = (d.diaMm ?? 0) / 2;

    // An EDGE bore enters through one of the face-plane edges: along that axis
    // its distance to the edge is zero by construction, which is geometry, not
    // a blowout risk. Measuring it there would condemn every correct edge bore
    // — the same category error that made G11 reject 18mm dowel joinery. The
    // perpendicular axis is still a real margin and is still checked.
    const skipX = d.edgeEntryAxis === 'x';
    const skipY = d.edgeEntryAxis === 'y';

    const nearEdge =
      (!skipX && (d.x - r < min || p.finishW - d.x - r < min)) ||
      (!skipY && (d.y - r < min || p.finishH - d.y - r < min));

    if (nearEdge) {
      issues.push({
        id: issueId('B_MIN_MARGIN_DRILL', d.opId, d.x, d.y),
        severity: 'BLOCKER',
        code: 'B_MIN_MARGIN_DRILL',
        message:
          `Drill op is too close to edge (min ${min}mm required, measured from the ` +
          `${d.diaMm !== undefined ? `Ø${d.diaMm} bore wall` : 'bore centre — diameter unknown'}).`,
        partIds: [p.partId],
        context: {
          opId: d.opId,
          x: d.x,
          y: d.y,
          diaMm: d.diaMm ?? null,
          boreRadiusMm: r,
          finishW: p.finishW,
          finishH: p.finishH,
          minMarginToEdgeMm: min,
        },
      });
    }

    // A hole with no recorded diameter was just measured from its centre, which
    // is the permissive reading. Flag it rather than let the understatement
    // pass as a clean result.
    if (d.diaMm === undefined) {
      issues.push({
        id: issueId('W_MIN_MARGIN_DIAMETER_UNKNOWN', d.opId),
        severity: 'WARNING',
        code: 'W_MIN_MARGIN_DIAMETER_UNKNOWN',
        message:
          `Drill op ${d.opId} has no recorded diameter, so its edge margin was measured ` +
          `from the bore centre. The real margin is smaller by the bore radius.`,
        partIds: [p.partId],
        context: { opId: d.opId, x: d.x, y: d.y, minMarginToEdgeMm: min },
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
