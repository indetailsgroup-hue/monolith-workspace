/**
 * Arc Sweep Membership
 *
 * Step 10.5.7: Deterministic arc sweep membership tests.
 *
 * Critical for join solving: a candidate intersection is only valid if it lies
 * on the arc's directed sweep from startDeg to endDeg following cw/ccw direction.
 *
 * Arc definition:
 * - center (c), radius (r)
 * - startDeg, endDeg: angles in degrees
 * - cw: true = clockwise sweep, false = counter-clockwise sweep
 */

import type { SegArc } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  sub,
  len,
  normDeg,
  ccwDeltaDeg,
  cwDeltaDeg,
  angleOfPointDeg,
  pointAtAngleDeg,
  degToRad,
  norm,
} from './mathCore.js';

// ============================================================================
// Arc Sweep Membership
// ============================================================================

/**
 * Check if angle `aDeg` lies on the directed sweep from startDeg to endDeg.
 *
 * @param aDeg - Angle to test (degrees)
 * @param startDeg - Arc start angle (degrees)
 * @param endDeg - Arc end angle (degrees)
 * @param cw - Direction: true = clockwise, false = counter-clockwise
 * @param epsDeg - Angular tolerance in degrees
 * @returns True if angle is on the sweep
 */
export function angleOnArcSweepDeg(
  aDeg: number,
  startDeg: number,
  endDeg: number,
  cw: boolean,
  epsDeg = 1e-7
): boolean {
  const a = normDeg(aDeg);
  const s = normDeg(startDeg);
  const e = normDeg(endDeg);

  if (!cw) {
    // CCW sweep: s -> e (angles increase, with wrap-around)
    const total = ccwDeltaDeg(s, e);
    const at = ccwDeltaDeg(s, a);
    return at <= total + epsDeg;
  } else {
    // CW sweep: s -> e (angles decrease, with wrap-around)
    const total = cwDeltaDeg(s, e);
    const at = cwDeltaDeg(s, a);
    return at <= total + epsDeg;
  }
}

/**
 * Check if a point lies on an arc's sweep (both radius and angle).
 *
 * @param arc - Arc segment
 * @param p - Point to test
 * @param epsPos - Position tolerance
 * @returns True if point is on the arc sweep
 */
export function pointOnArcSweep(
  arc: SegArc,
  p: Vec2,
  epsPos = EPS_POS * 10 // Slightly larger for practical use
): boolean {
  // Check radius first
  const d = len(sub(p, arc.c));
  if (Math.abs(d - arc.r) > epsPos) return false;

  // Check angle membership
  const a = angleOfPointDeg(arc.c, p);
  return angleOnArcSweepDeg(a, arc.startDeg, arc.endDeg, arc.cw);
}

/**
 * Check if point is on arc sweep (using mathCore Vec2 type for center).
 */
export function pointOnArcSweepVec(
  c: Vec2,
  r: number,
  startDeg: number,
  endDeg: number,
  cw: boolean,
  p: Vec2,
  epsPos = EPS_POS * 10
): boolean {
  const d = len(sub(p, c));
  if (Math.abs(d - r) > epsPos) return false;

  const a = angleOfPointDeg(c, p);
  return angleOnArcSweepDeg(a, startDeg, endDeg, cw);
}

// ============================================================================
// Arc Point and Tangent Calculations
// ============================================================================

/**
 * Get point on arc at given angle.
 */
export function arcPointAtDeg(arc: SegArc, deg: number): Vec2 {
  return pointAtAngleDeg(arc.c, arc.r, deg);
}

/**
 * Get arc start point.
 */
export function arcStartPoint(arc: SegArc): Vec2 {
  return pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
}

/**
 * Get arc end point.
 */
export function arcEndPoint(arc: SegArc): Vec2 {
  return pointAtAngleDeg(arc.c, arc.r, arc.endDeg);
}

/**
 * Get arc tangent direction at given angle (unit vector).
 *
 * For CCW arc: tangent is perpendicular left of radius vector
 * For CW arc: tangent is perpendicular right of radius vector
 *
 * @param arc - Arc segment
 * @param deg - Angle in degrees
 * @returns Unit tangent vector in travel direction
 */
export function arcTangentDirAtDeg(arc: SegArc, deg: number): Vec2 {
  const r = degToRad(deg);

  // Position derivative for CCW is (-sin, cos)
  // Position derivative for CW is (sin, -cos)
  const t = !arc.cw
    ? { x: -Math.sin(r), y: Math.cos(r) }
    : { x: Math.sin(r), y: -Math.cos(r) };

  return norm(t);
}

/**
 * Get arc tangent at start point.
 */
export function arcTangentAtStart(arc: SegArc): Vec2 {
  return arcTangentDirAtDeg(arc, arc.startDeg);
}

/**
 * Get arc tangent at end point.
 */
export function arcTangentAtEnd(arc: SegArc): Vec2 {
  return arcTangentDirAtDeg(arc, arc.endDeg);
}

// ============================================================================
// Arc Sweep Length and Midpoint
// ============================================================================

/**
 * Calculate the sweep angle of an arc in degrees (always positive).
 */
export function arcSweepDeg(arc: SegArc): number {
  if (arc.cw) {
    return cwDeltaDeg(arc.startDeg, arc.endDeg);
  } else {
    return ccwDeltaDeg(arc.startDeg, arc.endDeg);
  }
}

/**
 * Calculate arc length.
 */
export function arcLength(arc: SegArc): number {
  const sweepDeg = arcSweepDeg(arc);
  const sweepRad = degToRad(sweepDeg);
  return arc.r * sweepRad;
}

/**
 * Get the midpoint of an arc (on the arc sweep).
 */
export function arcMidpoint(arc: SegArc): Vec2 {
  const sweepDeg = arcSweepDeg(arc);
  const halfSweep = sweepDeg / 2;

  // Calculate midpoint angle based on direction
  const midDeg = arc.cw
    ? normDeg(arc.startDeg - halfSweep)
    : normDeg(arc.startDeg + halfSweep);

  return pointAtAngleDeg(arc.c, arc.r, midDeg);
}

/**
 * Get arc midpoint given center, radius, angles, and direction.
 */
export function arcMidpointVec(
  center: Vec2,
  r: number,
  startDeg: number,
  endDeg: number,
  cw: boolean
): Vec2 {
  const sweepDeg = cw
    ? cwDeltaDeg(startDeg, endDeg)
    : ccwDeltaDeg(startDeg, endDeg);
  const halfSweep = sweepDeg / 2;

  const midDeg = cw
    ? normDeg(startDeg - halfSweep)
    : normDeg(startDeg + halfSweep);

  return pointAtAngleDeg(center, r, midDeg);
}

// ============================================================================
// Parameter Conversion
// ============================================================================

/**
 * Convert distance along arc to angle offset (degrees).
 *
 * @param arc - Arc segment
 * @param distance - Distance along arc from start
 * @returns Angle at that distance (degrees)
 */
export function arcDistanceToAngle(arc: SegArc, distance: number): number {
  const angleOffset = (distance / arc.r) * (180 / Math.PI);
  return arc.cw
    ? normDeg(arc.startDeg - angleOffset)
    : normDeg(arc.startDeg + angleOffset);
}

/**
 * Get parametric t value [0, 1] for a point on arc.
 * Returns -1 if point is not on arc.
 */
export function arcParamForPoint(arc: SegArc, p: Vec2, eps = EPS_POS * 10): number {
  if (!pointOnArcSweep(arc, p, eps)) return -1;

  const pAngle = angleOfPointDeg(arc.c, p);
  const totalSweep = arcSweepDeg(arc);

  if (totalSweep < 1e-9) return 0;

  const pointSweep = arc.cw
    ? cwDeltaDeg(arc.startDeg, pAngle)
    : ccwDeltaDeg(arc.startDeg, pAngle);

  return pointSweep / totalSweep;
}
