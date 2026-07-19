/**
 * Gate Policy v0.1
 *
 * Default manufacturing constraints policy
 */

import type { GatePolicy } from './types';

// ============================================
// RESIDUAL MATERIAL MARGIN
// ============================================

/**
 * Minimum material, in mm, that must remain beyond the tip of a blind bore
 * before the Safety Gate calls it a drill-through.
 *
 * ## BASIS: UNSOURCED — NEEDS A HUMAN DECISION
 *
 * This number has no citation behind it. Searches of Häfele's published
 * Minifix documentation and of general woodworking-machinery guidance turned up
 * no minimum-residual figure for blind bores in particleboard or MDF. Nothing
 * in this repository sources it either. It is recorded here as unsourced rather
 * than dressed up with a plausible-looking reference.
 *
 * ## WHY THIS VALUE IS SUSPECT
 *
 * The Häfele S200 bolt bore is Ø10 x 17.5mm. Drilled into an 18mm panel FACE it
 * leaves exactly 0.50mm — precisely this margin. The rule therefore passes that
 * hole with zero margin to spare:
 *
 *     maxDepth  = 18.00 - 0.50 = 17.50
 *     17.5 > 17.50  →  false  →  PASS
 *
 * A tolerance set to exactly admit the case in front of it is not a safety
 * margin, it is a rubber stamp. Whoever set 0.5 may have picked it to fit this
 * hole, or may have picked it independently and hit the boundary by luck — the
 * history does not say.
 *
 * ## WHY IT HAS NOT BEEN RAISED HERE
 *
 * Raising it to any value above 0.5 makes that Ø10 x 17.5mm bolt bore FAIL on
 * every 18mm panel in the catalogue. That may be correct — 0.5mm of
 * particleboard over a Ø10 hole is very little, and it can blow out — but it is
 * a DESIGN decision (change the bolt spec, the panel thickness, or accept the
 * risk), not a lint fix. Changing it inside a review-fix lane would silently
 * convert a fleet-wide pass into a fleet-wide blocker.
 *
 * Left at 0.5 deliberately, and {@link ruleDrillDepthSafety} now emits
 * `W_SAFETY_DRILL_DEPTH_ZERO_MARGIN` for any hole that survives only because
 * its residual lands exactly on this number, so the situation is visible in
 * every gate run instead of hiding in a constant.
 *
 * ## COUPLING — read before changing
 *
 * `HINGE_RESIDUAL_MARGIN_MM` in
 * `core/manufacturing/drillMap/generateHingeCupPoints.ts` derives from this
 * value, so a change here also moves hinge-cup generation.
 *
 * Two other places in the codebase encode the same physical idea with a
 * different number and are NOT governed by this constant:
 *   - `core/manufacturing/flatPartGate.ts`  → drillDepthSafetyMargin: 2
 *   - `core/commands/gateFixCommands.ts`    → drillSafetyMargin: 2
 * Reconciling 0.5 against 2 is open work; they disagree by 4x.
 *
 * @see {@link ruleDrillDepthSafety}
 */
export const MIN_RESIDUAL_MATERIAL_MM = 0.5;

/**
 * Minimum wall, in mm, that must remain BESIDE an edge bore — between the bore
 * and the nearer face of the panel it runs through.
 *
 * ## BASIS: INHERITED FROM {@link MIN_RESIDUAL_MATERIAL_MM}, AND PROBABLY TOO LOW
 *
 * This is deliberately set equal to the residual-material margin, and that is a
 * decision worth stating plainly rather than burying:
 *
 * The two numbers describe DIFFERENT physics. `MIN_RESIDUAL_MATERIAL_MM` is
 * material ahead of the bit; the failure it prevents is the tip punching
 * through, making one small hole. This constant is material beside the bit
 * along the whole length of the bore; the failure it prevents is a wall
 * splitting open down that entire length. On a side panel's back-edge dowel the
 * bore runs 560mm, so the two failures are not remotely the same size.
 *
 * A worked case, which is the example that motivated {@link ruleEdgeBoreCentering}:
 *
 *     Ø8 dowel, 2mm off centre in an 18mm panel
 *     offset 7mm  →  wall = 7 - 4 = 3.00mm
 *     3.00 >= 0.50  →  PASSES
 *
 * Three millimetres of particleboard over a 560mm bore is thin, and a human who
 * knows this shop's material may well judge it unacceptable. The rule as it
 * stands does NOT catch that case.
 *
 * ## WHY IT HAS NOT SIMPLY BEEN RAISED
 *
 * Nothing sources a figure for this. Picking one that happens to catch the
 * example in front of it would be the same move criticised on
 * {@link MIN_RESIDUAL_MATERIAL_MM} — a threshold chosen to fit a case is not a
 * safety margin — only in the stricter direction, and it would convert a
 * fleet-wide pass into a fleet-wide blocker from inside a review-fix lane.
 *
 * So the rule ships at the floor it CAN defend ("do not break out of the
 * panel"), which catches bores outside the material, bores wider than the panel
 * and zero-wall bores, and the open question is recorded here instead of being
 * settled by whoever happened to write the rule.
 *
 * @see {@link ruleEdgeBoreCentering}
 * @see {@link MIN_RESIDUAL_MATERIAL_MM} for the same problem on the depth axis
 */
export const MIN_EDGE_BORE_WALL_MM = MIN_RESIDUAL_MATERIAL_MM;

/**
 * Minimum distance, in mm, from a drill's WALL to a panel edge before the
 * Safety Gate calls it a blowout risk.
 *
 * ## A FINDING, recorded per the Item 4 instruction — READ BEFORE TRUSTING A PASS
 *
 * This is a FREE-EDGE blowout margin: it exists because drilling too near an
 * unsupported edge splits it. `ruleMinMargins` was measuring from the hole
 * CENTRE, which understates the true wall by the bore radius; measuring from
 * the wall is correct and is what catches a Ø35 hinge cup whose centre clears
 * 8mm but whose rim has already broken through the edge.
 *
 * Applying the wall-based measurement to a REAL 7-cabinet scene turned up a
 * finding, exactly as Item 4 warned it might:
 *
 *     0 → 356 B_MIN_MARGIN_DRILL blockers, ALL one root cause:
 *       106  Minifix bolt   Ø10  → 4.0mm wall
 *       144  corner dowel   Ø8   → 5.0mm wall
 *       106  bolt thread    Ø5   → 6.5mm wall
 *
 * Every one is a CONNECTOR bore sitting 9mm — exactly half of an 18mm mating
 * panel's thickness — from its JOINT edge, because that is where it must sit to
 * align with the cam in the centre of the mating panel. This is correct Häfele
 * S200 placement, built this way millions of times. The 4–6.5mm walls are real,
 * but the edge they are near is a SUPPORTED joint edge, not the free edge this
 * threshold was written for.
 *
 * ## WHY THE THRESHOLD WAS NOT TUNED, AND CONNECTORS WERE NOT EXEMPTED
 *
 * Both are forbidden by this branch's charter: never move a threshold or carve
 * an exemption to make blockers disappear. Lowering 8mm to hide connector bores
 * would also blind the rule to genuine free-edge violations of the same size.
 *
 * The rule is therefore left failing LOUD. What it cannot yet TELL APART is a
 * bore near a free edge from a connector bore parallel to a supported joint
 * edge — the honest fix is that discrimination (it needs a joint-edge signal on
 * DrillOp, which the drill map does not currently carry), NOT a softer number.
 * Until that exists, or the shop rules on whether 4mm to a glued joint edge is
 * acceptable, the count stands and is reported rather than silently passed.
 *
 * @see {@link MIN_RESIDUAL_MATERIAL_MM} — the same unsourced-threshold-meets-
 *   real-geometry question, on the depth axis.
 */
export const MIN_MARGIN_TO_EDGE_MM = 8;

export const DEFAULT_GATE_POLICY_V1: GatePolicy = {
  policyVersion: 'gate-policy-0.1.0',

  // Safety margins
  thicknessSafetyMarginMm: MIN_RESIDUAL_MATERIAL_MM,
  minEdgeBoreWallMm: MIN_EDGE_BORE_WALL_MM,
  minMarginToEdgeMm: MIN_MARGIN_TO_EDGE_MM,
  minFeatureSizeMm: 12,

  // Clearance rules
  backPanelClearanceMm: 2,
  shelfToBackClearanceMm: 1,

  // Fitting rules
  minFittingSpacingMm: 32,
  minSetbackFromEdgeMm: 18,

  // Cut rules
  minCutDimensionMm: 20,
};
