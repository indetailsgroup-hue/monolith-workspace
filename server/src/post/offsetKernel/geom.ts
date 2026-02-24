/**
 * Geometry Kernel Utilities
 *
 * Step 10.5.6: Basic vector/point operations and intersection helpers
 * for CAM-grade offset calculations.
 */

// ============================================================================
// Types
// ============================================================================

export type Pt = { x: number; y: number };
export type Vec = { x: number; y: number };

// ============================================================================
// Constants
// ============================================================================

export const EPS = 1e-8;
export const TOLERANCE = 1e-6;

// ============================================================================
// Basic Vector Operations
// ============================================================================

export function add(a: Pt, b: Vec): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Pt, b: Pt): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(v: Vec, s: number): Vec {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec, b: Vec): number {
  return a.x * b.y - a.y * b.x;
}

export function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function unit(v: Vec): Vec {
  const L = len(v);
  if (L < EPS) return { x: 1, y: 0 };
  return { x: v.x / L, y: v.y / L };
}

export function perpLeft(v: Vec): Vec {
  return { x: -v.y, y: v.x };
}

export function perpRight(v: Vec): Vec {
  return { x: v.y, y: -v.x };
}

export function negate(v: Vec): Vec {
  return { x: -v.x, y: -v.y };
}

export function nearly(a: number, b: number, e: number = TOLERANCE): boolean {
  return Math.abs(a - b) <= e;
}

export function nearlyPt(a: Pt, b: Pt, e: number = TOLERANCE): boolean {
  return dist(a, b) <= e;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

// ============================================================================
// Angle Operations
// ============================================================================

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Normalize angle to [0, 2π) range.
 */
export function normalizeAngle(rad: number): number {
  const TWO_PI = 2 * Math.PI;
  let a = rad % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

/**
 * Angle from positive X-axis to vector.
 */
export function angle(v: Vec): number {
  return Math.atan2(v.y, v.x);
}

/**
 * Angle between two vectors (unsigned, 0 to π).
 */
export function angleBetween(a: Vec, b: Vec): number {
  const d = dot(unit(a), unit(b));
  return Math.acos(clamp(d, -1, 1));
}

// ============================================================================
// Line-Line Intersection
// ============================================================================

export interface LineIntersectResult {
  hit: boolean;
  /** Parameter along first line */
  t?: number;
  /** Parameter along second line */
  u?: number;
  /** Intersection point */
  pt?: Pt;
  /** Lines are parallel */
  parallel?: boolean;
}

/**
 * Intersect two infinite lines defined by point + direction vector.
 * Line 1: p + t*r
 * Line 2: q + u*s
 *
 * @returns Intersection result with parameters t and u
 */
export function intersectLines(
  p: Pt,
  r: Vec,
  q: Pt,
  s: Vec
): LineIntersectResult {
  const rxs = cross(r, s);
  const q_p = sub(q, p);

  if (Math.abs(rxs) < EPS) {
    // Parallel or collinear
    return { hit: false, parallel: true };
  }

  const t = cross(q_p, s) / rxs;
  const u = cross(q_p, r) / rxs;

  return {
    hit: true,
    t,
    u,
    pt: add(p, mul(r, t)),
  };
}

/**
 * Intersect two line segments.
 * Segment 1: a to b
 * Segment 2: c to d
 *
 * @returns Intersection point if segments actually cross, null otherwise
 */
export function intersectSegments(
  a: Pt,
  b: Pt,
  c: Pt,
  d: Pt
): Pt | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const result = intersectLines(a, r, c, s);

  if (!result.hit || result.t === undefined || result.u === undefined) {
    return null;
  }

  // Check if intersection is within both segments
  if (result.t >= -EPS && result.t <= 1 + EPS &&
      result.u >= -EPS && result.u <= 1 + EPS) {
    return result.pt!;
  }

  return null;
}

// ============================================================================
// Point-to-Line Projection
// ============================================================================

export interface ProjectResult {
  /** Parameter along line (0 = at a, 1 = at b) */
  t: number;
  /** Closest point on line */
  pt: Pt;
  /** Distance from p to closest point */
  dist: number;
}

/**
 * Project point onto infinite line defined by two points.
 */
export function projectPointToLine(p: Pt, a: Pt, b: Pt): ProjectResult {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const lenSq = dot(ab, ab);

  if (lenSq < EPS * EPS) {
    // Degenerate line (a == b)
    return { t: 0, pt: a, dist: dist(p, a) };
  }

  const t = dot(ap, ab) / lenSq;
  const pt = add(a, mul(ab, t));

  return { t, pt, dist: dist(p, pt) };
}

/**
 * Project point onto line segment (clamp t to [0, 1]).
 */
export function projectPointToSegment(p: Pt, a: Pt, b: Pt): ProjectResult {
  const result = projectPointToLine(p, a, b);
  const tClamped = clamp(result.t, 0, 1);

  if (tClamped !== result.t) {
    const ab = sub(b, a);
    const pt = add(a, mul(ab, tClamped));
    return { t: tClamped, pt, dist: dist(p, pt) };
  }

  return result;
}

// ============================================================================
// Circle-Circle Intersection
// ============================================================================

/**
 * Find intersection points of two circles.
 *
 * @param c1 - Center of first circle
 * @param r1 - Radius of first circle
 * @param c2 - Center of second circle
 * @param r2 - Radius of second circle
 * @returns Array of intersection points (0, 1, or 2)
 */
export function circleCircleIntersections(
  c1: Pt,
  r1: number,
  c2: Pt,
  r2: number
): Pt[] {
  const d = dist(c1, c2);

  // Circles are coincident
  if (d < EPS && Math.abs(r1 - r2) < EPS) {
    return []; // Infinite intersections, return empty
  }

  // Circles too far apart
  if (d > r1 + r2 + TOLERANCE) {
    return [];
  }

  // One circle inside the other
  if (d < Math.abs(r1 - r2) - TOLERANCE) {
    return [];
  }

  // Calculate intersection
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;

  if (h2 < -TOLERANCE) {
    return [];
  }

  const h = Math.sqrt(Math.max(0, h2));

  // Unit vector from c1 to c2
  const v = unit(sub(c2, c1));

  // Point on line between centers at distance a from c1
  const p = add(c1, mul(v, a));

  // Normal to the line between centers
  const n = perpLeft(v);

  // Two intersection points
  const p1 = add(p, mul(n, h));
  const p2 = add(p, mul(n, -h));

  // If h is very small, circles are tangent
  if (h < TOLERANCE) {
    return [p1];
  }

  return [p1, p2];
}

// ============================================================================
// Line-Circle Intersection
// ============================================================================

/**
 * Find intersection points of an infinite line with a circle.
 *
 * @param a - First point on line
 * @param b - Second point on line
 * @param c - Circle center
 * @param r - Circle radius
 * @returns Array of intersection points (0, 1, or 2)
 */
export function lineCircleIntersections(
  a: Pt,
  b: Pt,
  c: Pt,
  r: number
): Pt[] {
  const d = sub(b, a);
  const f = sub(a, c);

  const A = dot(d, d);
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;

  const disc = B * B - 4 * A * C;

  if (disc < -TOLERANCE) {
    return [];
  }

  const sqrtD = Math.sqrt(Math.max(0, disc));

  const t1 = (-B - sqrtD) / (2 * A);
  const t2 = (-B + sqrtD) / (2 * A);

  const p1 = add(a, mul(d, t1));
  const p2 = add(a, mul(d, t2));

  // If discriminant is very small, line is tangent
  if (sqrtD < TOLERANCE) {
    return [p1];
  }

  return [p1, p2];
}

/**
 * Find intersection points of a line segment with a circle.
 * Only returns points where t ∈ [0, 1].
 */
export function segmentCircleIntersections(
  a: Pt,
  b: Pt,
  c: Pt,
  r: number
): Pt[] {
  const d = sub(b, a);
  const f = sub(a, c);

  const A = dot(d, d);
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;

  const disc = B * B - 4 * A * C;

  if (disc < -TOLERANCE) {
    return [];
  }

  const sqrtD = Math.sqrt(Math.max(0, disc));
  const results: Pt[] = [];

  const t1 = (-B - sqrtD) / (2 * A);
  const t2 = (-B + sqrtD) / (2 * A);

  if (t1 >= -TOLERANCE && t1 <= 1 + TOLERANCE) {
    results.push(add(a, mul(d, t1)));
  }

  if (sqrtD >= TOLERANCE && t2 >= -TOLERANCE && t2 <= 1 + TOLERANCE) {
    results.push(add(a, mul(d, t2)));
  }

  return results;
}

// ============================================================================
// Arc Utilities
// ============================================================================

/**
 * Calculate point on arc at given angle.
 */
export function arcPoint(c: Pt, r: number, angleRad: number): Pt {
  return {
    x: c.x + Math.cos(angleRad) * r,
    y: c.y + Math.sin(angleRad) * r,
  };
}

/**
 * Calculate signed sweep angle from start to end following CW/CCW direction.
 */
export function arcSweep(
  startRad: number,
  endRad: number,
  cw: boolean
): number {
  let s = endRad - startRad;
  if (cw && s > 0) s -= 2 * Math.PI;
  if (!cw && s < 0) s += 2 * Math.PI;
  return s;
}

/**
 * Check if an angle is within an arc's sweep.
 */
export function angleInArcSweep(
  testAngle: number,
  startRad: number,
  endRad: number,
  cw: boolean
): boolean {
  const sweep = arcSweep(startRad, endRad, cw);
  const delta = arcSweep(startRad, testAngle, cw);

  // delta should be between 0 and sweep (same sign)
  if (cw) {
    // CW: sweep is negative, delta should be negative and >= sweep
    return delta <= TOLERANCE && delta >= sweep - TOLERANCE;
  } else {
    // CCW: sweep is positive, delta should be positive and <= sweep
    return delta >= -TOLERANCE && delta <= sweep + TOLERANCE;
  }
}

/**
 * Arc length from radius and sweep angle.
 */
export function arcLength(r: number, sweepRad: number): number {
  return Math.abs(r * sweepRad);
}
