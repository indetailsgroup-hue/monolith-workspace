/**
 * Offset Primitives
 *
 * Step 10.5.6: Offset individual LINE and ARC segments
 * with proper side selection based on path winding and mode.
 */

import type { SegLine, SegArc } from '../planTypes.js';
import {
  type Pt,
  type Vec,
  unit,
  perpLeft,
  add,
  sub,
  mul,
  dist,
  degToRad,
  radToDeg,
  arcPoint,
  arcSweep,
  EPS,
} from './geom.js';

// ============================================================================
// Types
// ============================================================================

export type OffsetMode = 'INSET' | 'OUTSET';
export type CapStyle = 'BUTT' | 'ROUND' | 'SQUARE';
export type Winding = 'CW' | 'CCW';

export interface OffsetSegment {
  /** The offset segment */
  seg: SegLine | SegArc;
  /** Original segment for reference */
  original: SegLine | SegArc;
  /** Start point before join adjustment */
  rawStart: Pt;
  /** End point before join adjustment */
  rawEnd: Pt;
  /** Direction vector at start (for lines and arc tangent) */
  dirAtStart: Vec;
  /** Direction vector at end */
  dirAtEnd: Vec;
}

// ============================================================================
// Interior Normal Calculation
// ============================================================================

/**
 * Calculate interior-facing normal for a direction vector.
 *
 * Interior is:
 * - Left of travel direction for CCW winding
 * - Right of travel direction for CW winding
 *
 * @param dir - Unit direction vector of travel
 * @param winding - Path winding direction
 */
export function interiorNormal(dir: Vec, winding: Winding): Vec {
  const left = perpLeft(dir);
  return winding === 'CCW' ? left : mul(left, -1);
}

/**
 * Calculate offset normal based on mode.
 *
 * @param dir - Unit direction vector of travel
 * @param winding - Path winding direction
 * @param mode - INSET (toward interior) or OUTSET (away from interior)
 */
export function offsetNormal(
  dir: Vec,
  winding: Winding,
  mode: OffsetMode
): Vec {
  const interior = interiorNormal(dir, winding);
  return mode === 'INSET' ? interior : mul(interior, -1);
}

// ============================================================================
// Line Offset
// ============================================================================

/**
 * Offset a LINE segment by shifting perpendicular to travel direction.
 *
 * @param seg - Original LINE segment
 * @param winding - Path winding direction
 * @param mode - INSET or OUTSET
 * @param d - Offset distance (positive)
 */
export function offsetLine(
  seg: SegLine,
  winding: Winding,
  mode: OffsetMode,
  d: number
): OffsetSegment {
  const dir = unit(sub(seg.b, seg.a));
  const normal = offsetNormal(dir, winding, mode);
  const offset = mul(normal, d);

  const a = add(seg.a, offset);
  const b = add(seg.b, offset);

  return {
    seg: { kind: 'LINE', a, b },
    original: seg,
    rawStart: a,
    rawEnd: b,
    dirAtStart: dir,
    dirAtEnd: dir,
  };
}

// ============================================================================
// Arc Offset
// ============================================================================

/**
 * Calculate tangent direction at a point on an arc.
 *
 * @param arcCenter - Arc center
 * @param point - Point on arc
 * @param cw - Is arc clockwise?
 */
export function arcTangentAt(arcCenter: Pt, point: Pt, cw: boolean): Vec {
  const radial = unit(sub(point, arcCenter));
  // Tangent is perpendicular to radius
  // CW: tangent is 90° CW from radius (pointing in direction of travel)
  // CCW: tangent is 90° CCW from radius
  if (cw) {
    return { x: radial.y, y: -radial.x }; // 90° CW
  } else {
    return { x: -radial.y, y: radial.x }; // 90° CCW
  }
}

/**
 * Offset an ARC segment by adjusting the radius.
 *
 * The offset direction is determined by the interior normal at the arc's
 * midpoint, ensuring consistent behavior with the path's winding.
 *
 * @param seg - Original ARC segment
 * @param winding - Path winding direction
 * @param mode - INSET or OUTSET
 * @param d - Offset distance (positive)
 * @returns Offset segment, or null if arc collapses (r <= 0)
 */
export function offsetArc(
  seg: SegArc,
  winding: Winding,
  mode: OffsetMode,
  d: number
): OffsetSegment | null {
  const startRad = degToRad(seg.startDeg);
  const endRad = degToRad(seg.endDeg);
  const sweep = arcSweep(startRad, endRad, seg.cw);

  // Calculate midpoint on arc
  const midAngle = startRad + sweep * 0.5;
  const midPt = arcPoint(seg.c, seg.r, midAngle);

  // Get tangent direction at midpoint
  const tangent = arcTangentAt(seg.c, midPt, seg.cw);

  // Calculate offset normal
  const normal = offsetNormal(tangent, winding, mode);

  // Offset the midpoint
  const midOffset = add(midPt, mul(normal, d));

  // New radius is distance from center to offset midpoint
  const newR = dist(seg.c, midOffset);

  if (newR < EPS) {
    // Arc collapses to a point
    return null;
  }

  // Recompute endpoints at new radius (same angles)
  const newStart = arcPoint(seg.c, newR, startRad);
  const newEnd = arcPoint(seg.c, newR, endRad);

  // Direction at start and end
  const dirAtStart = arcTangentAt(seg.c, newStart, seg.cw);
  const dirAtEnd = arcTangentAt(seg.c, newEnd, seg.cw);

  return {
    seg: {
      kind: 'ARC',
      c: seg.c,
      r: newR,
      startDeg: seg.startDeg,
      endDeg: seg.endDeg,
      cw: seg.cw,
      start: newStart,
      end: newEnd,
    },
    original: seg,
    rawStart: newStart,
    rawEnd: newEnd,
    dirAtStart,
    dirAtEnd,
  };
}

// ============================================================================
// Offset Any Segment
// ============================================================================

/**
 * Offset any segment (LINE or ARC).
 */
export function offsetSegment(
  seg: SegLine | SegArc,
  winding: Winding,
  mode: OffsetMode,
  d: number
): OffsetSegment | null {
  if (seg.kind === 'LINE') {
    return offsetLine(seg, winding, mode, d);
  } else {
    return offsetArc(seg, winding, mode, d);
  }
}

// ============================================================================
// Segment Accessors
// ============================================================================

/**
 * Get start point of a segment.
 */
export function segStart(seg: SegLine | SegArc): Pt {
  return seg.kind === 'LINE' ? seg.a : seg.start;
}

/**
 * Get end point of a segment.
 */
export function segEnd(seg: SegLine | SegArc): Pt {
  return seg.kind === 'LINE' ? seg.b : seg.end;
}

/**
 * Set start point of a segment (mutates).
 */
export function setSegStart(seg: SegLine | SegArc, pt: Pt): void {
  if (seg.kind === 'LINE') {
    seg.a = pt;
  } else {
    seg.start = pt;
    // Also update startDeg to match
    const angle = Math.atan2(pt.y - seg.c.y, pt.x - seg.c.x);
    seg.startDeg = radToDeg(angle);
  }
}

/**
 * Set end point of a segment (mutates).
 */
export function setSegEnd(seg: SegLine | SegArc, pt: Pt): void {
  if (seg.kind === 'LINE') {
    seg.b = pt;
  } else {
    seg.end = pt;
    // Also update endDeg to match
    const angle = Math.atan2(pt.y - seg.c.y, pt.x - seg.c.x);
    seg.endDeg = radToDeg(angle);
  }
}

/**
 * Get direction vector at start of segment.
 */
export function segDirAtStart(seg: SegLine | SegArc): Vec {
  if (seg.kind === 'LINE') {
    return unit(sub(seg.b, seg.a));
  } else {
    return arcTangentAt(seg.c, seg.start, seg.cw);
  }
}

/**
 * Get direction vector at end of segment.
 */
export function segDirAtEnd(seg: SegLine | SegArc): Vec {
  if (seg.kind === 'LINE') {
    return unit(sub(seg.b, seg.a));
  } else {
    return arcTangentAt(seg.c, seg.end, seg.cw);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if an offset distance would collapse an arc.
 */
export function wouldCollapseArc(
  seg: SegArc,
  winding: Winding,
  mode: OffsetMode,
  d: number
): boolean {
  // For INSET on the interior side, check if d >= r
  // The actual calculation depends on the relationship between
  // arc direction and path winding

  const startRad = degToRad(seg.startDeg);
  const endRad = degToRad(seg.endDeg);
  const sweep = arcSweep(startRad, endRad, seg.cw);
  const midAngle = startRad + sweep * 0.5;
  const midPt = arcPoint(seg.c, seg.r, midAngle);

  const tangent = arcTangentAt(seg.c, midPt, seg.cw);
  const normal = offsetNormal(tangent, winding, mode);
  const midOffset = add(midPt, mul(normal, d));

  return dist(seg.c, midOffset) < EPS;
}

/**
 * Calculate maximum safe inset distance for an arc.
 */
export function maxArcInset(
  seg: SegArc,
  winding: Winding
): number {
  // The maximum inset is roughly the arc radius, but depends on
  // which side the inset is on relative to the arc center
  return seg.r * 0.95; // Conservative limit
}
