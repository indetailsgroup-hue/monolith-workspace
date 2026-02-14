// src/core/manufacturing/toolpath/geom/tangentUtils.ts
/**
 * Tangent Extraction Utilities.
 *
 * Extracts tangent vectors from LINE and ARC segments for
 * entry/exit strategy calculations.
 *
 * Key uses:
 * - Lead-in direction for ramp entry
 * - Lead-out direction for exit
 * - Arc tangent-continuous lead-in calculation
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

import { PathSegment, LineSegment, ArcSegment } from "../tabs/tabTypes";
import { Path } from "../tabs/pathParam";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-9;

// =============================================================================
// TYPES
// =============================================================================

/**
 * 2D vector.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 2D point (same as Vec2 but semantically different).
 */
export interface Point2 {
  x: number;
  y: number;
}

// =============================================================================
// VECTOR OPERATIONS
// =============================================================================

/**
 * Calculate vector length.
 */
export function vecLen(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Normalize vector to unit length.
 */
export function vecNormalize(v: Vec2): Vec2 {
  const len = vecLen(v);
  if (len < EPS) return { x: 1, y: 0 }; // Default direction
  return { x: v.x / len, y: v.y / len };
}

/**
 * Scale vector by scalar.
 */
export function vecScale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/**
 * Add two vectors.
 */
export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract vectors (a - b).
 */
export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Negate vector.
 */
export function vecNeg(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

/**
 * Rotate vector 90° counter-clockwise (left normal).
 */
export function normalLeft(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/**
 * Rotate vector 90° clockwise (right normal).
 */
export function normalRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}

/**
 * Dot product.
 */
export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

// =============================================================================
// LINE TANGENT
// =============================================================================

/**
 * Get tangent vector at start of a line segment.
 *
 * For lines, tangent is constant along the segment.
 *
 * @param seg Line segment
 * @returns Unit tangent vector pointing in direction of travel
 */
export function lineTangentAtStart(seg: LineSegment): Vec2 {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  return vecNormalize({ x: dx, y: dy });
}

/**
 * Get tangent vector at end of a line segment.
 *
 * Same as start for lines.
 */
export function lineTangentAtEnd(seg: LineSegment): Vec2 {
  return lineTangentAtStart(seg);
}

// =============================================================================
// ARC TANGENT
// =============================================================================

/**
 * Get tangent vector at start of an arc segment.
 *
 * Arc tangent is perpendicular to the radius at that point.
 * Direction depends on CW/CCW.
 *
 * @param seg Arc segment
 * @returns Unit tangent vector pointing in direction of travel
 */
export function arcTangentAtStart(seg: ArcSegment): Vec2 {
  const angle = seg.startDeg * DEG_TO_RAD;

  // Radial vector from center to point on arc
  const radial = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };

  // Tangent is perpendicular to radial
  // CW: tangent points clockwise (right of radial)
  // CCW: tangent points counter-clockwise (left of radial)
  if (seg.cw) {
    return normalRight(radial); // CW: right normal
  } else {
    return normalLeft(radial); // CCW: left normal
  }
}

/**
 * Get tangent vector at end of an arc segment.
 *
 * @param seg Arc segment
 * @returns Unit tangent vector pointing in direction of travel
 */
export function arcTangentAtEnd(seg: ArcSegment): Vec2 {
  const angle = seg.endDeg * DEG_TO_RAD;

  // Radial vector from center to point on arc
  const radial = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };

  // Same direction logic as start
  if (seg.cw) {
    return normalRight(radial);
  } else {
    return normalLeft(radial);
  }
}

// =============================================================================
// GENERIC TANGENT EXTRACTION
// =============================================================================

/**
 * Get tangent vector at start of any segment.
 *
 * @param seg Segment (LINE or ARC)
 * @returns Unit tangent vector
 */
export function segmentTangentAtStart(seg: PathSegment): Vec2 {
  if (seg.kind === "LINE") {
    return lineTangentAtStart(seg);
  }
  return arcTangentAtStart(seg);
}

/**
 * Get tangent vector at end of any segment.
 *
 * @param seg Segment (LINE or ARC)
 * @returns Unit tangent vector
 */
export function segmentTangentAtEnd(seg: PathSegment): Vec2 {
  if (seg.kind === "LINE") {
    return lineTangentAtEnd(seg);
  }
  return arcTangentAtEnd(seg);
}

// =============================================================================
// PATH TANGENT EXTRACTION
// =============================================================================

/**
 * Get tangent vector at start of a path.
 *
 * @param path Path with segments
 * @returns Unit tangent vector at path start
 */
export function pathTangentAtStart(path: Path): Vec2 {
  if (!path.segs || path.segs.length === 0) {
    return { x: 1, y: 0 }; // Default
  }
  return segmentTangentAtStart(path.segs[0]);
}

/**
 * Get tangent vector at end of a path.
 *
 * @param path Path with segments
 * @returns Unit tangent vector at path end
 */
export function pathTangentAtEnd(path: Path): Vec2 {
  if (!path.segs || path.segs.length === 0) {
    return { x: 1, y: 0 }; // Default
  }
  return segmentTangentAtEnd(path.segs[path.segs.length - 1]);
}

// =============================================================================
// LEAD-IN/OUT CALCULATIONS
// =============================================================================

/**
 * Calculate lead-in start point for ramp entry.
 *
 * Lead-in point is offset from path start opposite to tangent direction.
 *
 * @param startPoint Path/span start point
 * @param tangent Unit tangent vector at start
 * @param leadLength Lead-in length (mm)
 * @returns Lead-in start point
 */
export function calculateLeadInPoint(
  startPoint: Point2,
  tangent: Vec2,
  leadLength: number
): Point2 {
  // Lead point is behind the start (opposite to tangent)
  return {
    x: startPoint.x - tangent.x * leadLength,
    y: startPoint.y - tangent.y * leadLength,
  };
}

/**
 * Calculate lead-out end point.
 *
 * Lead-out point extends from path end in tangent direction.
 *
 * @param endPoint Path/span end point
 * @param tangent Unit tangent vector at end
 * @param leadLength Lead-out length (mm)
 * @returns Lead-out end point
 */
export function calculateLeadOutPoint(
  endPoint: Point2,
  tangent: Vec2,
  leadLength: number
): Point2 {
  // Lead point is ahead of the end (along tangent)
  return {
    x: endPoint.x + tangent.x * leadLength,
    y: endPoint.y + tangent.y * leadLength,
  };
}

/**
 * Calculate arc lead-in center and start point.
 *
 * Creates a tangent-continuous arc lead-in.
 * The arc starts perpendicular to the path tangent.
 *
 * @param startPoint Path start point
 * @param tangent Unit tangent at start
 * @param arcRadius Arc radius for lead-in
 * @param side "LEFT" or "RIGHT" - which side to place the arc
 * @returns Object with center and arc start point
 */
export function calculateArcLeadIn(
  startPoint: Point2,
  tangent: Vec2,
  arcRadius: number,
  side: "LEFT" | "RIGHT" = "LEFT"
): { center: Point2; arcStart: Point2; cw: boolean } {
  // Normal vector perpendicular to tangent
  const normal = side === "LEFT" ? normalLeft(tangent) : normalRight(tangent);

  // Arc center is offset by radius in normal direction
  const center: Point2 = {
    x: startPoint.x + normal.x * arcRadius,
    y: startPoint.y + normal.y * arcRadius,
  };

  // Arc start is opposite to tangent from center (90° behind)
  const arcStart: Point2 = {
    x: center.x - tangent.x * arcRadius,
    y: center.y - tangent.y * arcRadius,
  };

  // CW if side is RIGHT, CCW if side is LEFT
  const cw = side === "RIGHT";

  return { center, arcStart, cw };
}

// =============================================================================
// SPAN TANGENT EXTRACTION (CutSpan compatible)
// =============================================================================

/**
 * Extract start and end tangents from a cut span.
 *
 * @param segs Segment array from CutSpan
 * @returns Object with start and end tangent vectors
 */
export function extractSpanTangents(
  segs: PathSegment[]
): { startTangent: Vec2; endTangent: Vec2 } {
  if (!segs || segs.length === 0) {
    return {
      startTangent: { x: 1, y: 0 },
      endTangent: { x: 1, y: 0 },
    };
  }

  return {
    startTangent: segmentTangentAtStart(segs[0]),
    endTangent: segmentTangentAtEnd(segs[segs.length - 1]),
  };
}
