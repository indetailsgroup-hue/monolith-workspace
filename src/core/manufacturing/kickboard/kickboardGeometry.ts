/**
 * kickboardGeometry.ts - Plinth / kickboard (บังตีนตู้) geometry
 *
 * `dimensions.toeKickHeight` (Leg) is a pure +Y offset: it lifts the carcass off
 * the floor and leaves open air underneath. This module computes the geometry of
 * the KICKBOARD panel that closes that void.
 *
 * Pure functions only — no store imports, no React. `generatePanels` in
 * useCabinetStore calls these and does the `panels.push` itself, so all costing
 * stays inside the `computePanel` closure while the maths stays unit-testable.
 *
 * ## Coordinate system (same as every carcass panel)
 * - X: -W/2 .. +W/2, origin at the cabinet width centre
 * - Y: 0 = floor. The carcass underside is at Y = Leg in BOTH joint modes
 *      (INSET bottom centre = T/2 + Leg; OVERLAY = bottomReduction - T/2 + Leg,
 *      and bottomReduction = T, so both reduce to T/2 + Leg).
 * - Z: -D/2 = back, +D/2 = carcass front face. Doors sit proud at D/2 + doorT.
 * - Positions are the panel CENTRE. Units are millimetres.
 *
 * @version 1.0.0
 */

import type {
  CabinetDimensions,
  CabinetType,
  KickboardConfig,
  KickboardSetbackDatum,
} from '../../types/Cabinet';
import { CABINET_TYPES } from '../../catalog/CabinetTaxonomy';
import {
  DEFAULT_APPLIED_PART_DATUM,
  DEFAULT_ASSUMED_FRONT_PROUD_MM,
  PLINTH_SETBACK_FROM_FRONT_MM,
  frontDatumOffsetMm,
} from '../../geometry/appliedPartDatum';

// ============================================
// CONSTANTS
// ============================================

/**
 * Fallback recess of the kickboard front face (mm), measured from
 * DEFAULT_KICK_SETBACK_DATUM.
 *
 * ── THE NUMBER CHANGED BECAUSE THE DATUM DID ─────────────────────────────────
 * Was 50, measured from the CARCASS. Now 65, measured from the FRONT (door
 * face). Under the default 18mm door that is 65 - 18 = 47mm from the carcass, so
 * the plinth moves 3mm forward and no more — the GEOMETRY is essentially
 * unchanged. What changed is that the figure now states what it is measured
 * from, and states it in the same terms as the worktop overhang above it.
 *
 * WHY NOT 70 FROM THE CARCASS, which is the figure the UK literature quotes?
 * Because no published setback figure the document audit read declares its own
 * datum — not one, including that 70. Adopting it as a carcass dimension gives
 * 70 + 18 = 88mm of recess from the door face, deeper than any figure in any
 * source. An undeclared number cannot be transplanted into a declared system
 * without first deciding what it meant, and we cannot decide that from here.
 *
 * Joinery convention is 50 - 100mm; 65 from the front sits inside it either way
 * you measure.
 */
export const DEFAULT_KICK_SETBACK = PLINTH_SETBACK_FROM_FRONT_MM;

/**
 * Datum DEFAULT_KICK_SETBACK is measured from.
 *
 * Was 'CARCASS' while the worktop's frontDatum was already 'FRONT'. Two applied
 * parts bracketing the same cabinet front, measuring from faces 18mm apart, with
 * nothing anywhere saying so. Both are now 'FRONT', from one shared constant.
 */
export const DEFAULT_KICK_SETBACK_DATUM = DEFAULT_APPLIED_PART_DATUM;

// ============================================
// TYPES
// ============================================

/** Finish dimensions of the kickboard panel (mm). */
export interface KickboardSize {
  /** Full cabinet width — NOT reduced by 2T. */
  width: number;
  /** Equal to dimensions.toeKickHeight. */
  height: number;
}

/** Minimal slice of CabinetStructure this module reads. */
export interface KickboardStructureInput {
  kickboardConfig?: KickboardConfig;
}

/** Minimal slice of CabinetDimensions this module reads. */
export type KickboardDimensionsInput = Pick<CabinetDimensions, 'width' | 'toeKickHeight'>;

// ============================================
// GEOMETRY
// ============================================

/**
 * Finish size of the kickboard.
 *
 * width = W (full cabinet width), deliberately NOT W - 2T: the plinth is applied
 * to the OUTSIDE of the carcass footprint so adjacent cabinets' kickboards butt
 * edge-to-edge. Reducing by 2T would leave a 2T notch at every cabinet seam.
 */
export function computeKickboardSize(dimensions: KickboardDimensionsInput): KickboardSize {
  return {
    width: dimensions.width,
    height: dimensions.toeKickHeight,
  };
}

/**
 * Z of the kickboard FRONT FACE.
 *
 * ── UNKNOWN FRONT PROUDNESS IS NO LONGER A SILENT DATUM SWITCH ───────────────
 * This used to fall back to the carcass plane whenever `doorThickness` was
 * undefined, while still reporting its datum as 'FRONT'. That is the same defect
 * this lane is here to fix, one layer down: the caller asks for 65mm from the
 * door face and silently receives 65mm from the carcass, an 18mm error in the
 * emitted geometry with nothing to signal it. It mattered more after the datum
 * unification, because 65-from-carcass is a visibly deeper recess than the 50
 * that shipped before.
 *
 * `undefined` now means UNKNOWN and resolves to DEFAULT_ASSUMED_FRONT_PROUD_MM,
 * matching what WorktopConfig.assumedDoorThickness has always done for the slab.
 * An explicit `0` still means "known to have no proud front" and is honoured as
 * 0 — a doorless carcass genuinely has its front face at +D/2.
 *
 * @param depth - Cabinet overall finished depth D (mm)
 * @param setback - Recess from the datum (mm)
 * @param datum - 'FRONT' (default) measures from the door / drawer-front outer
 *                face; 'CARCASS' measures from the cabinet front face at +D/2.
 * @param frontProud - How far the front sits proud of the carcass (mm). Only used
 *                     under 'FRONT'. `undefined` = UNKNOWN (assumed); `0` = none.
 * @param assumedFrontProud - Fallback for UNKNOWN. Defaults to 18mm.
 */
export function computeKickboardFrontZ(
  depth: number,
  setback: number,
  datum: KickboardSetbackDatum = DEFAULT_KICK_SETBACK_DATUM,
  frontProud?: number,
  assumedFrontProud: number = DEFAULT_ASSUMED_FRONT_PROUD_MM
): number {
  return depth / 2 + frontDatumOffsetMm(datum, frontProud, assumedFrontProud) - setback;
}

/**
 * Z of the kickboard panel CENTRE.
 *
 * Note there is NO carcassZ term. carcassZ (= backDepthReduction / 2) exists only
 * to pull the carcass forward out of an OVERLAY back panel; the kickboard is
 * referenced to the FRONT face, so applying carcassZ would double-count the back
 * offset and move the plinth backwards whenever the back construction changes.
 */
export function computeKickboardZ(
  depth: number,
  thickness: number,
  setback: number,
  datum: KickboardSetbackDatum = DEFAULT_KICK_SETBACK_DATUM,
  frontProud?: number,
  assumedFrontProud: number = DEFAULT_ASSUMED_FRONT_PROUD_MM
): number {
  return (
    computeKickboardFrontZ(depth, setback, datum, frontProud, assumedFrontProud) - thickness / 2
  );
}

// ============================================
// CONFIG RESOLUTION
// ============================================

/**
 * Cabinet categories that never stand on a plinth, DERIVED from the taxonomy
 * rather than hand-listed, so it cannot drift from CABINET_TYPES.
 *
 * A category qualifies only when EVERY entry in it declares hasToeKick: false.
 * Today that yields exactly {WALL}: WALL_STANDARD/WALL_HOOD/WALL_OPEN all hang
 * off the wall with no floor void.
 *
 * Deliberately NOT {WALL, TALL}: TALL_PANTRY and TALL_BROOM both declare
 * hasToeKick: true with toeKickHeight = DEFAULT_TOE_KICK_HEIGHT_MM (70mm on the
 * Thai default; formerly a hardcoded 100) — a pantry stands on the floor and
 * does get a plinth. The worktop lane's
 * NON_WORKTOP_CABINET_TYPES excludes TALL because a pantry carries no counter;
 * that is a different question and the two sets are correctly different.
 *
 * APPLIANCE is mixed (oven housing has a toe kick, an integrated fridge or
 * washer does not), so it is not excluded wholesale — those cabinets are
 * governed by their own toeKickHeight, which the check below still honours.
 */
export const NO_TOE_KICK_CABINET_TYPES: ReadonlySet<string> = (() => {
  const byCategory = new Map<string, boolean>();
  for (const def of Object.values(CABINET_TYPES)) {
    const soFar = byCategory.get(def.category);
    byCategory.set(def.category, (soFar ?? true) && !def.hasToeKick);
  }
  const out = new Set<string>();
  for (const [category, noneHaveToeKick] of byCategory) {
    if (noneHaveToeKick) out.add(category);
  }
  return out;
})();

/**
 * Whether this cabinet gets a kickboard.
 *
 * Two independent gates, because they fail independently:
 *   1. CABINET TYPE. createCabinet ignores `type` when it builds panels — it
 *      always passes DEFAULT_DIMENSIONS (useCabinetStore.ts:2302-2310), so a
 *      WALL cabinet is created carrying a toe-kick height it has no business
 *      having. Gating on toeKickHeight alone therefore put a fully-costed
 *      600 x DEFAULT_TOE_KICK_HEIGHT_MM plinth into the BOM and the cut list
 *      for a cabinet that hangs on a wall. Type is checked FIRST and does not
 *      depend on that bug ever being fixed.
 *   2. TOE-KICK HEIGHT. No void, nothing to close.
 *
 * Otherwise the default is ON: the toe-kick void is real material in a real
 * kitchen and leaving it out of the BOM under-quotes.
 *
 * @param cabinetType - Cabinet category. Omitted (legacy callers / bare
 *                      geometry tests) skips gate 1 only.
 */
export function shouldGenerateKickboard(
  dimensions: KickboardDimensionsInput,
  structure: KickboardStructureInput,
  cabinetType?: CabinetType
): boolean {
  if (cabinetType && NO_TOE_KICK_CABINET_TYPES.has(cabinetType)) return false;
  if (!(dimensions.toeKickHeight > 0)) return false;
  return structure.kickboardConfig?.hasKickboard ?? true;
}

/** Per-cabinet setback override, else the manufacturing param, else the module default. */
export function resolveKickboardSetback(
  structure: KickboardStructureInput,
  defaultSetback: number = DEFAULT_KICK_SETBACK
): number {
  return structure.kickboardConfig?.setback ?? defaultSetback;
}

/**
 * Setback datum for this cabinet.
 *
 * Defaults to DEFAULT_KICK_SETBACK_DATUM ('FRONT'), the SAME datum the worktop
 * above measures its front overhang from. Was 'CARCASS'. A per-cabinet override
 * can still select 'CARCASS' — that is a legitimate choice for a doorless
 * carcass — but it is now a choice someone made, not a default nobody declared.
 */
export function resolveKickboardSetbackDatum(
  structure: KickboardStructureInput
): KickboardSetbackDatum {
  return structure.kickboardConfig?.setbackDatum ?? DEFAULT_KICK_SETBACK_DATUM;
}
