/**
 * Cut Size Calculation Module
 *
 * @module gate/compute/cutSize
 * @version 0.1.0
 *
 * Calculates the actual cut dimensions for CNC panel saws based on finish
 * dimensions and edge band requirements.
 *
 * ## Formula
 * ```
 * CutW = FinishW − (EdgeL + EdgeR) + (PremillL + PremillR)
 * CutH = FinishH − (EdgeT + EdgeB) + (PremillT + PremillB)
 * ```
 *
 * ## Edge Convention
 * - If edge.enabled === false => edge thickness and premill are treated as 0
 * - Edge thickness is subtracted (edge banding adds back)
 * - Premill is added (CNC needs extra material to mill off)
 *
 * @example
 * // Part: 600mm finish width, 2mm edges on L/R, 0.3mm premill each
 * // CutW = 600 - (2 + 2) + (0.3 + 0.3) = 596.6mm
 */

import type { EdgeSide, PartSpec } from '../types';

/**
 * Gets the edge band thickness for a specific side.
 *
 * @param part - The part specification containing edge data
 * @param side - Edge side: 'L' (left), 'R' (right), 'T' (top), 'B' (bottom)
 * @returns Edge thickness in mm, or 0 if edge is disabled/invalid
 *
 * @internal
 */
function edgeT(part: PartSpec, side: EdgeSide): number {
  const e = part.edges[side];
  if (!e?.enabled) return 0;
  return Math.max(0, e.thicknessMm);
}

/**
 * Gets the premill allowance for a specific side.
 *
 * Premill is the extra material added for CNC edge milling before edge
 * banding application. This material gets removed during the edge
 * preparation process.
 *
 * @param part - The part specification containing edge data
 * @param side - Edge side: 'L' (left), 'R' (right), 'T' (top), 'B' (bottom)
 * @returns Premill in mm, or 0 if edge is disabled/invalid
 *
 * @internal
 */
function premill(part: PartSpec, side: EdgeSide): number {
  const e = part.edges[side];
  if (!e?.enabled) return 0;
  return Math.max(0, e.premillMm);
}

/**
 * Computes the cut width from finish width.
 *
 * Used by CNC panel saws to determine raw cut dimension.
 *
 * @param part - The part specification with finish dimensions and edge config
 * @returns Cut width in mm
 *
 * @example
 * const part = {
 *   finishW: 600,
 *   edges: {
 *     L: { enabled: true, thicknessMm: 2, premillMm: 0.3 },
 *     R: { enabled: true, thicknessMm: 2, premillMm: 0.3 },
 *     // ...
 *   }
 * };
 * const cutW = computeCutW(part); // 596.6mm
 *
 * @see {@link computeCutH} for height calculation
 * @see {@link computeCutSize} for combined dimensions
 */
export function computeCutW(part: PartSpec): number {
  return (
    part.finishW -
    (edgeT(part, 'L') + edgeT(part, 'R')) +
    (premill(part, 'L') + premill(part, 'R'))
  );
}

/**
 * Computes the cut height from finish height.
 *
 * Used by CNC panel saws to determine raw cut dimension.
 *
 * @param part - The part specification with finish dimensions and edge config
 * @returns Cut height in mm
 *
 * @example
 * const part = {
 *   finishH: 720,
 *   edges: {
 *     T: { enabled: true, thicknessMm: 0.45, premillMm: 0 },
 *     B: { enabled: false, thicknessMm: 0, premillMm: 0 },
 *     // ...
 *   }
 * };
 * const cutH = computeCutH(part); // 719.55mm
 *
 * @see {@link computeCutW} for width calculation
 * @see {@link computeCutSize} for combined dimensions
 */
export function computeCutH(part: PartSpec): number {
  return (
    part.finishH -
    (edgeT(part, 'T') + edgeT(part, 'B')) +
    (premill(part, 'T') + premill(part, 'B'))
  );
}

/**
 * Computes both cut dimensions (width and height) for a part.
 *
 * Convenience function that returns both cut dimensions in a single call.
 *
 * @param part - The part specification with finish dimensions and edge config
 * @returns Object containing cutW and cutH in mm
 *
 * @example
 * const { cutW, cutH } = computeCutSize(part);
 * console.log(`Cut sheet to ${cutW}mm x ${cutH}mm`);
 *
 * @see {@link computeCutW} for width calculation details
 * @see {@link computeCutH} for height calculation details
 */
export function computeCutSize(part: PartSpec): { cutW: number; cutH: number } {
  return {
    cutW: computeCutW(part),
    cutH: computeCutH(part),
  };
}
