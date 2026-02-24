/**
 * Offset Geometry Helpers
 *
 * Step 10.5.2: Rectangle inset/outset for finishing passes
 *
 * Finishing pass strategy:
 * 1. Rough cut leaves material (radialMm) on all edges
 * 2. Finish cut removes remaining material for clean edge
 *
 * This module provides inset rectangle calculation for profile cuts.
 */

import type { Point2D } from './transform.js';

// ============================================================================
// Types
// ============================================================================

export interface InsetResult {
  /** Inset width (reduced by 2*d) */
  W: number;
  /** Inset height (reduced by 2*d) */
  H: number;
  /** X offset to apply to points */
  ox: number;
  /** Y offset to apply to points */
  oy: number;
  /** Whether inset is valid (dimensions > 0) */
  valid: boolean;
}

export interface OffsetRectPoints {
  /** Corner points of offset rectangle (5 points, closed) */
  points: Point2D[];
  /** Whether offset produced valid rectangle */
  valid: boolean;
}

// ============================================================================
// Inset Calculations
// ============================================================================

/**
 * Calculate inset rectangle dimensions.
 *
 * For roughing pass with finishing: tool cuts inner rectangle,
 * leaving `d` mm of material on all sides for finish pass.
 *
 * @param W - Original width
 * @param H - Original height
 * @param d - Inset distance (radial offset)
 * @returns Inset dimensions and offsets
 */
export function insetRect(W: number, H: number, d: number): InsetResult {
  const newW = Math.max(0, W - 2 * d);
  const newH = Math.max(0, H - 2 * d);

  return {
    W: newW,
    H: newH,
    ox: d,
    oy: d,
    valid: newW > 0 && newH > 0,
  };
}

/**
 * Calculate outset rectangle dimensions.
 *
 * For cutter compensation or oversized cuts.
 *
 * @param W - Original width
 * @param H - Original height
 * @param d - Outset distance
 * @returns Outset dimensions and offsets
 */
export function outsetRect(W: number, H: number, d: number): InsetResult {
  return {
    W: W + 2 * d,
    H: H + 2 * d,
    ox: -d,
    oy: -d,
    valid: true,
  };
}

/**
 * Generate corner points for an inset rectangle.
 *
 * @param W - Original rectangle width
 * @param H - Original rectangle height
 * @param d - Inset distance
 * @returns Array of 5 points (closed rectangle) or empty if invalid
 */
export function insetRectPoints(W: number, H: number, d: number): OffsetRectPoints {
  const inset = insetRect(W, H, d);

  if (!inset.valid) {
    return { points: [], valid: false };
  }

  // Generate corner points with offset applied
  const points: Point2D[] = [
    { x: inset.ox, y: inset.oy },
    { x: inset.ox + inset.W, y: inset.oy },
    { x: inset.ox + inset.W, y: inset.oy + inset.H },
    { x: inset.ox, y: inset.oy + inset.H },
    { x: inset.ox, y: inset.oy },  // Close
  ];

  return { points, valid: true };
}

/**
 * Apply offset to a list of rectangle corner points.
 *
 * Takes existing profile points and applies inset/outset.
 *
 * @param points - Original corner points (4 or 5 points)
 * @param d - Offset distance (positive = inset, negative = outset)
 * @returns Offset points
 */
export function offsetRectPoints(points: Point2D[], d: number): Point2D[] {
  if (points.length < 4) return points;

  // Find bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const W = maxX - minX;
  const H = maxY - minY;

  // Calculate inset dimensions
  const inset = insetRect(W, H, d);
  if (!inset.valid) return points;

  // Generate new corner points
  const newMinX = minX + d;
  const newMinY = minY + d;

  return [
    { x: newMinX, y: newMinY },
    { x: newMinX + inset.W, y: newMinY },
    { x: newMinX + inset.W, y: newMinY + inset.H },
    { x: newMinX, y: newMinY + inset.H },
    { x: newMinX, y: newMinY },  // Close
  ];
}

// ============================================================================
// Tool Compensation Helpers
// ============================================================================

/**
 * Calculate effective cut path offset for tool diameter.
 *
 * When cutting on the outside of a profile (climb milling):
 * - Tool center follows path offset by toolRadius outward
 *
 * When cutting on the inside (conventional):
 * - Tool center follows path offset by toolRadius inward
 *
 * @param toolDiaMm - Tool diameter
 * @param outside - Whether cutting outside the profile
 * @returns Offset to apply to profile points
 */
export function toolRadiusOffset(toolDiaMm: number, outside: boolean): number {
  const radius = toolDiaMm / 2;
  return outside ? radius : -radius;
}

/**
 * Calculate combined offset for roughing with finish allowance.
 *
 * @param toolDiaMm - Tool diameter
 * @param finishAllowance - Material to leave for finishing (mm)
 * @param outside - Whether cutting outside the profile
 * @returns Combined offset
 */
export function roughingOffset(
  toolDiaMm: number,
  finishAllowance: number,
  outside: boolean
): number {
  const toolOffset = toolRadiusOffset(toolDiaMm, outside);
  // For outside cuts: offset further out by finish allowance
  // For inside cuts: offset further in by finish allowance
  return outside
    ? toolOffset + finishAllowance
    : toolOffset - finishAllowance;
}
