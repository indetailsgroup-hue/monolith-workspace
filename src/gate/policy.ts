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

export const DEFAULT_GATE_POLICY_V1: GatePolicy = {
  policyVersion: 'gate-policy-0.1.0',

  // Safety margins
  thicknessSafetyMarginMm: MIN_RESIDUAL_MATERIAL_MM,
  minMarginToEdgeMm: 8,
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
