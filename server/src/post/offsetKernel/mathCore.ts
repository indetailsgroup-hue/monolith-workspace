/**
 * Math Core - Stable numeric tolerances and core utilities
 *
 * Step 10.5.7: Deterministic CAM-grade geometry with stable epsilon values.
 *
 * Key principles:
 * - All tolerances must be stable and deterministic
 * - No random or time-based values
 * - Consistent epsilon hierarchy: EPS_POS < EPS_ANG
 */

// ============================================================================
// Numeric Tolerances (stable + deterministic)
// ============================================================================

/** Position tolerance for point comparisons (1 micron) */
export const EPS_POS = 1e-6;

/** Angular tolerance for angle comparisons (radians) */
export const EPS_ANG = 1e-9;

/** Tolerance for parameter comparisons (t values on segments) */
export const EPS_PARAM = 1e-8;

// ============================================================================
// Types
// ============================================================================

export type Vec2 = { x: number; y: number };

// ============================================================================
// Vector Operations
// ============================================================================

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec2, b: Vec2): number {
  return len(sub(a, b));
}

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS_POS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function perpLeft(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

export function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}

export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

// ============================================================================
// Numeric Utilities
// ============================================================================

export function almostEq(a: number, b: number, eps = EPS_POS): boolean {
  return Math.abs(a - b) <= eps;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(t: number): number {
  return clamp(t, 0, 1);
}

// ============================================================================
// Angle Operations (degrees)
// ============================================================================

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Normalize angle to [0, 360) range.
 */
export function normDeg(a: number): number {
  let x = a % 360;
  if (x < 0) x += 360;
  // Prevent 360 due to floating error
  return x >= 360 - 1e-12 ? 0 : x;
}

/**
 * Normalize angle to [-180, 180) range.
 */
export function normDeg180(a: number): number {
  let x = normDeg(a);
  if (x >= 180) x -= 360;
  return x;
}

/**
 * Smallest positive modular distance from a -> b in CCW direction (0..360].
 */
export function ccwDeltaDeg(a: number, b: number): number {
  const aa = normDeg(a);
  const bb = normDeg(b);
  const d = bb - aa;
  return d > 0 ? d : d + 360;
}

/**
 * Smallest positive modular distance from a -> b in CW direction (0..360].
 */
export function cwDeltaDeg(a: number, b: number): number {
  const aa = normDeg(a);
  const bb = normDeg(b);
  const d = aa - bb;
  return d > 0 ? d : d + 360;
}

/**
 * Angle of vector in degrees [0, 360).
 */
export function angleDeg(v: Vec2): number {
  return normDeg(radToDeg(Math.atan2(v.y, v.x)));
}

/**
 * Angle from center to point in degrees [0, 360).
 */
export function angleOfPointDeg(center: Vec2, p: Vec2): number {
  return normDeg(radToDeg(Math.atan2(p.y - center.y, p.x - center.x)));
}

/**
 * Point on circle at given angle.
 */
export function pointAtAngleDeg(center: Vec2, r: number, deg: number): Vec2 {
  const rad = degToRad(deg);
  return {
    x: center.x + r * Math.cos(rad),
    y: center.y + r * Math.sin(rad),
  };
}

// ============================================================================
// Angle Operations (radians)
// ============================================================================

/**
 * Normalize angle to [0, 2π) range.
 */
export function normRad(a: number): number {
  const TWO_PI = 2 * Math.PI;
  let x = a % TWO_PI;
  if (x < 0) x += TWO_PI;
  return x >= TWO_PI - 1e-14 ? 0 : x;
}

/**
 * Signed angle between two vectors in radians [-π, π].
 */
export function signedAngleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(cross(from, to), dot(from, to));
}

// ============================================================================
// Stable Sorting Utilities
// ============================================================================

/**
 * Stable lexicographic sort for points.
 * Used to ensure deterministic ordering of intersection candidates.
 */
export function stableSortPoints(ps: Vec2[]): Vec2[] {
  return ps.slice().sort((a, b) => {
    if (!almostEq(a.x, b.x)) return a.x - b.x;
    return a.y - b.y;
  });
}

/**
 * Stable comparison for two points (for sorting).
 */
export function comparePoints(a: Vec2, b: Vec2): number {
  if (!almostEq(a.x, b.x)) return a.x - b.x;
  if (!almostEq(a.y, b.y)) return a.y - b.y;
  return 0;
}
