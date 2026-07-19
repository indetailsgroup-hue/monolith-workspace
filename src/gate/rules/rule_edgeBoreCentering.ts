/**
 * Rule: Edge Bore Centring
 *
 * @module gate/rules/rule_edgeBoreCentering
 * @version 0.1.0
 *
 * Validates that a bore running INTO a panel's edge stays inside the panel's
 * thickness, with wall left on both sides.
 *
 * ## The gap this closes
 *
 * Every other field on a `DrillOp` describes the bore along its own axis:
 * `boreAxisMaterialMm` says how much material lies ahead of the bit (560mm down
 * a side panel's depth), `boreType` says it is an edge bore, `edgeEntryAxis`
 * says which face-plane axis the margin rule must ignore. None of them says how
 * close to a FACE the bore runs.
 *
 * So an Ø8 dowel driven into the back edge of an 18mm side panel reads as
 * perfectly healthy whether its axis sits at 9mm across the thickness (4mm wall
 * each side, correct) or at 2mm (3mm on one side, 11mm on the other — one clamp
 * or one damp panel away from bursting through the face). The bore is 560mm
 * long, so a breakout runs the length of the joint and the part is scrap.
 *
 * ## Formula
 * ```
 * wall = min(offset, thickness - offset) - diameter / 2
 * wall >= MIN_RESIDUAL_MATERIAL_MM
 * ```
 * `offset` is the bore axis's distance from the lower-coordinate face.
 *
 * ## Issue Codes
 * - `B_SAFETY_EDGE_BORE_OFF_CENTRE` (BLOCKER): wall thinner than the margin
 * - `W_SAFETY_EDGE_BORE_NOT_EVALUATED` (WARNING): offset or diameter unknown
 *
 * ## Threshold — READ THIS BEFORE TRUSTING A PASS
 *
 * Governed by `policy.minEdgeBoreWallMm`, which defaults to
 * {@link MIN_EDGE_BORE_WALL_MM}. That constant is currently INHERITED from the
 * depth-axis residual margin (0.5mm) and is very probably too low for this
 * failure mode, because a side wall runs the whole length of the bore while a
 * tip residual is a single point. The motivating example — an Ø8 dowel 2mm off
 * centre in an 18mm panel, leaving 3mm of wall over a 560mm bore — PASSES.
 *
 * The number was not raised to catch it, because nothing sources a figure and
 * choosing one to fit the case in front of you is how the existing unsourced
 * margin got there. What this rule reliably catches today is the unambiguous
 * class: bores outside the panel, bores wider than the panel, and zero wall.
 * The open decision is recorded on {@link MIN_EDGE_BORE_WALL_MM}.
 */

import type { DrillOp, GateIssue, GatePolicy, PartSpec } from '../types';
import { compositeThicknessMm } from '../compute/composite';
import { MIN_EDGE_BORE_WALL_MM } from '../policy';
import { issueId } from '../utils/idGen';

/**
 * Validates that every EDGE bore has wall left on both sides of its thickness.
 *
 * FACE bores are not examined: they enter through a face by definition, so
 * their offset across the thickness is zero by construction and carries no
 * meaning. Their equivalent check is depth, which {@link ruleDrillDepthSafety}
 * already performs.
 *
 * @param policy - Gate policy supplying the residual material margin
 * @param parts - Part specifications, for material thickness
 * @param drillOps - Drill operations to examine
 * @returns Blockers for off-centre bores, warnings for unmeasurable ones
 */
export function ruleEdgeBoreCentering(
  policy: GatePolicy,
  parts: PartSpec[],
  drillOps: DrillOp[]
): GateIssue[] {
  const byId = new Map(parts.map((p) => [p.partId, p]));
  const issues: GateIssue[] = [];

  for (const op of drillOps) {
    if (op.boreType !== 'EDGE_BORE') continue;

    const p = byId.get(op.partId);
    if (!p) continue;

    const thickness = compositeThicknessMm(p.material);
    const margin = policy.minEdgeBoreWallMm ?? MIN_EDGE_BORE_WALL_MM;

    // Refuse to judge rather than assume the bore is centred. A missing offset
    // means the panel's thickness axis was never established; a missing
    // diameter means the bore's own width is unknown. Either way the wall
    // cannot be computed, and treating that as a pass is exactly the permissive
    // guess this gate is being cured of.
    if (op.boreThicknessOffsetMm === undefined || op.diaMm === undefined) {
      issues.push({
        id: issueId('W_SAFETY_EDGE_BORE_NOT_EVALUATED', op.opId),
        severity: 'WARNING',
        code: 'W_SAFETY_EDGE_BORE_NOT_EVALUATED',
        message:
          `Edge bore ${op.opId} NOT CHECKED for breakout: ` +
          `${op.boreThicknessOffsetMm === undefined ? 'its position across the panel thickness' : 'its diameter'} ` +
          `is unknown, so the wall left beside it cannot be measured. This is not a pass.`,
        partIds: [p.partId],
        context: {
          opId: op.opId,
          thicknessMm: Math.round(thickness * 100) / 100,
          boreThicknessOffsetMm: op.boreThicknessOffsetMm ?? null,
          diaMm: op.diaMm ?? null,
        },
      });
      continue;
    }

    const offset = op.boreThicknessOffsetMm;
    const radius = op.diaMm / 2;

    // The bore axis must lie WITHIN the panel it is drilled into: 0 ≤ offset ≤
    // thickness. An offset outside that range is not an off-centre bore, it is
    // inconsistent geometry — the point's world position does not sit inside
    // the panel its panelId names. (This is real: the B-run dowel generator
    // labels its "side leg" with the side panel's id but places it at the
    // HORIZONTAL panel's width coordinate, so a left-side dowel lands at a
    // world X hundreds of mm outside the left panel.) Blocking it as
    // "off-centre by 540mm" would be a confident, wrong verdict. Refuse.
    const OFFSET_SLOP_MM = 0.51;
    if (offset < -OFFSET_SLOP_MM || offset > thickness + OFFSET_SLOP_MM) {
      issues.push({
        id: issueId('W_SAFETY_EDGE_BORE_NOT_EVALUATED', op.opId, offset),
        severity: 'WARNING',
        code: 'W_SAFETY_EDGE_BORE_NOT_EVALUATED',
        message:
          `Edge bore ${op.opId} NOT CHECKED for breakout: its axis is ${offset.toFixed(1)}mm ` +
          `across a ${thickness.toFixed(2)}mm panel, i.e. OUTSIDE the panel. The point's ` +
          `position is inconsistent with the panel ${op.partId} it is assigned to, so the wall ` +
          `beside it cannot be measured. This is not a pass — the geometry needs fixing upstream.`,
        partIds: [p.partId],
        context: {
          opId: op.opId,
          thicknessMm: Math.round(thickness * 100) / 100,
          boreThicknessOffsetMm: Math.round(offset * 100) / 100,
          diaMm: op.diaMm,
        },
      });
      continue;
    }

    // Thinner of the two walls the bore leaves across the panel thickness.
    const wall = Math.min(offset, thickness - offset) - radius;

    if (wall < margin) {
      issues.push({
        id: issueId('B_SAFETY_EDGE_BORE_OFF_CENTRE', op.opId, offset, op.diaMm),
        severity: 'BLOCKER',
        code: 'B_SAFETY_EDGE_BORE_OFF_CENTRE',
        message:
          `Edge bore ${op.opId}: Ø${op.diaMm} at ${offset.toFixed(2)}mm across a ` +
          `${thickness.toFixed(2)}mm panel leaves ${wall.toFixed(2)}mm of wall ` +
          `(min ${margin}mm). Centred would be ${(thickness / 2).toFixed(2)}mm. ` +
          `The bore runs ${op.boreAxisMaterialMm?.toFixed(0) ?? '?'}mm down the panel, ` +
          `so a breakout runs that whole length.`,
        partIds: [p.partId],
        context: {
          opId: op.opId,
          diaMm: op.diaMm,
          thicknessMm: Math.round(thickness * 100) / 100,
          boreThicknessOffsetMm: Math.round(offset * 100) / 100,
          centredOffsetMm: Math.round((thickness / 2) * 100) / 100,
          wallMm: Math.round(wall * 100) / 100,
          minWallMm: margin,
          boreAxisMaterialMm: op.boreAxisMaterialMm ?? null,
        },
      });
    }
  }

  return issues;
}
