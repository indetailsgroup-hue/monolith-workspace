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

import type { CabinetDimensions, KickboardConfig, KickboardSetbackDatum } from '../../types/Cabinet';

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
 * Whether this cabinet gets a kickboard.
 *
 * A cabinet with no toe kick (WALL cabinets) has no void to close, so it never
 * gets one regardless of config. Otherwise the default is ON: the toe-kick void
 * is real material in a real kitchen and leaving it out of the BOM under-quotes.
 */
export function shouldGenerateKickboard(
  dimensions: KickboardDimensionsInput,
  structure: KickboardStructureInput
): boolean {
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
