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

// ============================================
// CONSTANTS
// ============================================

/**
 * Fallback recess of the kickboard front face (mm).
 * Mirrors MANUFACTURING_PARAMS.kickSetback; used when no param is supplied.
 * Joinery convention is 50 - 100mm.
 */
export const DEFAULT_KICK_SETBACK = 50;

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
 * @param depth - Cabinet overall finished depth D (mm)
 * @param setback - Recess from the datum (mm)
 * @param datum - 'CARCASS' (default) measures from the cabinet front face at +D/2;
 *                'FRONT' measures from the door / drawer-front outer face.
 * @param doorThickness - Door thickness (mm); only used under the 'FRONT' datum.
 *                        Omitted / 0 falls back to the carcass datum.
 */
export function computeKickboardFrontZ(
  depth: number,
  setback: number,
  datum: KickboardSetbackDatum = 'CARCASS',
  doorThickness?: number
): number {
  const frontDatumZ =
    datum === 'FRONT' && doorThickness !== undefined && doorThickness > 0
      ? depth / 2 + doorThickness
      : depth / 2;

  return frontDatumZ - setback;
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
  datum: KickboardSetbackDatum = 'CARCASS',
  doorThickness?: number
): number {
  return computeKickboardFrontZ(depth, setback, datum, doorThickness) - thickness / 2;
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

/** Setback datum for this cabinet ('CARCASS' unless overridden). */
export function resolveKickboardSetbackDatum(
  structure: KickboardStructureInput
): KickboardSetbackDatum {
  return structure.kickboardConfig?.setbackDatum ?? 'CARCASS';
}
