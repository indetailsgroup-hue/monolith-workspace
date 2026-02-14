// src/core/manufacturing/offset/offsetSide.ts
/**
 * Offset Side Calculation.
 *
 * Determines the correct offset side (LEFT/RIGHT) based on:
 * - Path winding (CW/CCW)
 * - Cut side (OUTSIDE/INSIDE)
 *
 * Convention:
 * - "normal-left" = perpendicular left of tangent direction
 * - "normal-right" = perpendicular right of tangent direction
 *
 * For closed paths:
 * - CCW winding: interior is on LEFT side of path
 * - CW winding: interior is on RIGHT side of path
 *
 * Therefore:
 * - OUTSIDE cut: offset AWAY from interior
 * - INSIDE cut: offset TOWARD interior
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

import { OffsetSide } from "./offsetSpec.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Path winding direction.
 */
export type Winding = "CW" | "CCW";

/**
 * Cut side relative to part boundary.
 */
export type CutSide = "OUTSIDE" | "INSIDE";

// =============================================================================
// INTERIOR SIDE
// =============================================================================

/**
 * Determine which side of the path is the interior (part material).
 *
 * Convention:
 * - CCW path: interior is on LEFT
 * - CW path: interior is on RIGHT
 *
 * This follows the standard convention where CCW is "positive area"
 * and the interior is always to the left when walking the path.
 *
 * @param winding Path winding direction
 * @returns Side where interior/material is located
 */
export function interiorSideFromWinding(winding: Winding): OffsetSide {
  return winding === "CCW" ? "LEFT" : "RIGHT";
}

/**
 * Get the exterior side (opposite of interior).
 *
 * @param winding Path winding direction
 * @returns Side where exterior/waste is located
 */
export function exteriorSideFromWinding(winding: Winding): OffsetSide {
  return winding === "CCW" ? "RIGHT" : "LEFT";
}

// =============================================================================
// OFFSET SIDE FOR PROFILE
// =============================================================================

/**
 * Determine offset side for a profile cut.
 *
 * For OUTSIDE cuts:
 * - We want to offset AWAY from the part (toward waste)
 * - This is the OPPOSITE of the interior side
 *
 * For INSIDE cuts (holes):
 * - We want to offset INTO the hole (toward waste)
 * - This is the SAME as the interior side
 *
 * Note: This function is direction-safe. When a path is reversed:
 * - Winding flips (CW ↔ CCW)
 * - Interior side flips
 * - But the physical relationship is preserved
 *
 * @param winding Path winding direction
 * @param cutSide Whether this is an outside or inside cut
 * @returns Side to offset toward
 */
export function offsetSideForProfile(
  winding: Winding,
  cutSide: CutSide
): OffsetSide {
  const interior = interiorSideFromWinding(winding);

  if (cutSide === "INSIDE") {
    // Inside cut (hole): offset toward interior (into the hole)
    return interior;
  }

  // Outside cut: offset away from interior (toward waste)
  return interior === "LEFT" ? "RIGHT" : "LEFT";
}

/**
 * Get offset side with detailed reason.
 *
 * Returns both the side and an explanation for audit trail.
 *
 * @param winding Path winding direction
 * @param cutSide Whether this is an outside or inside cut
 * @returns Object with side and explanation
 */
export function offsetSideForProfileWithReason(
  winding: Winding,
  cutSide: CutSide
): { side: OffsetSide; reason: string } {
  const interior = interiorSideFromWinding(winding);
  const side = offsetSideForProfile(winding, cutSide);

  const reason =
    cutSide === "OUTSIDE"
      ? `Outside cut on ${winding} path: interior=${interior}, offset=${side} (away from part)`
      : `Inside cut on ${winding} path: interior=${interior}, offset=${side} (into hole)`;

  return { side, reason };
}

// =============================================================================
// OFFSET SIDE FOR GROOVE
// =============================================================================

/**
 * Determine offset side for a groove cut.
 *
 * Grooves can be:
 * - Centerline: no offset (follow the path exactly)
 * - Offset: offset to one side of the centerline
 *
 * For offset grooves, the side depends on the groove definition.
 * This function defaults to LEFT for consistency.
 *
 * @param grooveSide Explicit groove side or undefined for centerline
 * @returns Offset side
 */
export function offsetSideForGroove(
  grooveSide?: "LEFT" | "RIGHT"
): OffsetSide {
  return grooveSide ?? "LEFT";
}

// =============================================================================
// OFFSET SIDE FOR POCKET
// =============================================================================

/**
 * Determine offset side for pocket clearing.
 *
 * Pocket clearing typically offsets inward from the boundary.
 * The boundary winding determines the interior direction.
 *
 * @param boundaryWinding Winding of pocket boundary
 * @returns Offset side (toward pocket interior)
 */
export function offsetSideForPocket(boundaryWinding: Winding): OffsetSide {
  // Pocket interior is where we want to clear material
  return interiorSideFromWinding(boundaryWinding);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Flip offset side (LEFT ↔ RIGHT).
 *
 * @param side Current side
 * @returns Opposite side
 */
export function flipOffsetSide(side: OffsetSide): OffsetSide {
  return side === "LEFT" ? "RIGHT" : "LEFT";
}

/**
 * Flip winding (CW ↔ CCW).
 *
 * @param winding Current winding
 * @returns Opposite winding
 */
export function flipWinding(winding: Winding): Winding {
  return winding === "CW" ? "CCW" : "CW";
}

/**
 * Check if reversing a path would change the offset side.
 *
 * When a path is reversed:
 * - Winding flips
 * - But cutSide stays the same (physical relationship)
 * - So offsetSide also flips to maintain physical relationship
 *
 * This function verifies this invariant.
 *
 * @param winding Original winding
 * @param cutSide Cut side
 * @returns True if sides flip correctly after reverse
 */
export function verifyOffsetSideAfterReverse(
  winding: Winding,
  cutSide: CutSide
): boolean {
  const originalSide = offsetSideForProfile(winding, cutSide);
  const reversedSide = offsetSideForProfile(flipWinding(winding), cutSide);

  // After reverse, side should flip
  return originalSide !== reversedSide;
}
