// src/core/manufacturing/sim/arcUtils.ts
/**
 * Arc Geometry Utilities.
 *
 * Helpers for arc length calculation and geometry validation.
 * Used by simulator for G2/G3 arc moves.
 *
 * v0.10.7.3 - Simulation Kernel
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * 2D point.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 3D point.
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Arc geometry result.
 */
export interface ArcGeometry {
  /** Arc length (mm) */
  length: number;

  /** Arc radius (average of start/end radii) */
  radius: number;

  /** Sweep angle (radians) */
  sweepRad: number;

  /** Start radius */
  startRadius: number;

  /** End radius */
  endRadius: number;

  /** Radius mismatch (|startRadius - endRadius|) */
  radiusMismatch: number;
}

// =============================================================================
// DISTANCE CALCULATIONS
// =============================================================================

/**
 * Calculate 2D distance.
 */
export function dist2D(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculate 3D distance.
 */
export function dist3D(a: Point3D, b: Point3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.hypot(dx, dy, dz);
}

/**
 * Calculate distance with optional coordinates.
 */
export function distOptional(
  from: Point3D,
  to: { x?: number; y?: number; z?: number }
): number {
  const dx = (to.x ?? from.x) - from.x;
  const dy = (to.y ?? from.y) - from.y;
  const dz = (to.z ?? from.z) - from.z;
  return Math.hypot(dx, dy, dz);
}

// =============================================================================
// ARC CALCULATIONS
// =============================================================================

/**
 * Calculate arc geometry from IJ format.
 *
 * @param start Start point (current position)
 * @param end End point (target position)
 * @param i I offset (X distance to center from start)
 * @param j J offset (Y distance to center from start)
 * @param clockwise Is clockwise arc (G2)
 * @returns Arc geometry
 */
export function calculateArcGeometry(
  start: Point2D,
  end: Point2D,
  i: number,
  j: number,
  clockwise: boolean
): ArcGeometry {
  // Calculate center point
  const cx = start.x + i;
  const cy = start.y + j;

  // Calculate radii
  const startRadius = dist2D(start, { x: cx, y: cy });
  const endRadius = dist2D(end, { x: cx, y: cy });
  const radius = (startRadius + endRadius) * 0.5;
  const radiusMismatch = Math.abs(startRadius - endRadius);

  // Calculate angles
  const startAngle = Math.atan2(start.y - cy, start.x - cx);
  const endAngle = Math.atan2(end.y - cy, end.x - cx);

  // Calculate sweep angle
  let sweep = endAngle - startAngle;
  const TWO_PI = Math.PI * 2;

  if (clockwise) {
    // CW: sweep should be negative (going clockwise)
    if (sweep > 0) {
      sweep -= TWO_PI;
    }
    sweep = Math.abs(sweep);
  } else {
    // CCW: sweep should be positive (going counter-clockwise)
    if (sweep < 0) {
      sweep += TWO_PI;
    }
  }

  // Handle full circle case
  if (Math.abs(sweep) < 0.0001) {
    sweep = TWO_PI;
  }

  // Calculate arc length
  const length = radius * sweep;

  return {
    length,
    radius,
    sweepRad: sweep,
    startRadius,
    endRadius,
    radiusMismatch,
  };
}

/**
 * Calculate arc length (simplified).
 *
 * @param start Start point
 * @param end End point
 * @param center Center point
 * @param clockwise Is clockwise
 * @returns Arc length in mm
 */
export function arcLength(
  start: Point2D,
  end: Point2D,
  center: Point2D,
  clockwise: boolean
): number {
  const i = center.x - start.x;
  const j = center.y - start.y;
  const geo = calculateArcGeometry(start, end, i, j, clockwise);
  return geo.length;
}

/**
 * Check if arc radius is consistent (within tolerance).
 *
 * @param start Start point
 * @param end End point
 * @param i I offset
 * @param j J offset
 * @param tolerance Tolerance in mm
 * @returns True if radius is consistent
 */
export function isArcRadiusConsistent(
  start: Point2D,
  end: Point2D,
  i: number,
  j: number,
  tolerance: number = 0.05
): boolean {
  const geo = calculateArcGeometry(start, end, i, j, true);
  return geo.radiusMismatch <= tolerance;
}

/**
 * Get arc center from IJ format.
 *
 * @param start Start point
 * @param i I offset
 * @param j J offset
 * @returns Center point
 */
export function getArcCenter(start: Point2D, i: number, j: number): Point2D {
  return {
    x: start.x + i,
    y: start.y + j,
  };
}

// =============================================================================
// INTERPOLATION
// =============================================================================

/**
 * Interpolate point along arc.
 *
 * @param center Arc center
 * @param radius Arc radius
 * @param startAngle Start angle (radians)
 * @param t Parameter (0-1)
 * @param sweepRad Sweep angle (radians)
 * @returns Interpolated point
 */
export function interpolateArc(
  center: Point2D,
  radius: number,
  startAngle: number,
  t: number,
  sweepRad: number
): Point2D {
  const angle = startAngle + t * sweepRad;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

/**
 * Sample points along arc.
 *
 * @param start Start point
 * @param end End point
 * @param i I offset
 * @param j J offset
 * @param clockwise Is clockwise
 * @param count Number of samples
 * @returns Array of points along arc
 */
export function sampleArc(
  start: Point2D,
  end: Point2D,
  i: number,
  j: number,
  clockwise: boolean,
  count: number = 10
): Point2D[] {
  const center = getArcCenter(start, i, j);
  const geo = calculateArcGeometry(start, end, i, j, clockwise);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);

  const points: Point2D[] = [];
  const sweep = clockwise ? -geo.sweepRad : geo.sweepRad;

  for (let n = 0; n <= count; n++) {
    const t = n / count;
    points.push(interpolateArc(center, geo.radius, startAngle, t, sweep));
  }

  return points;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate arc parameters.
 *
 * @param start Start point
 * @param end End point
 * @param i I offset
 * @param j J offset
 * @returns Validation result
 */
export function validateArc(
  start: Point2D,
  end: Point2D,
  i: number,
  j: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for zero radius
  const center = getArcCenter(start, i, j);
  const startRadius = dist2D(start, center);
  const endRadius = dist2D(end, center);

  if (startRadius < 0.001) {
    issues.push("Arc start radius is essentially zero");
  }

  if (endRadius < 0.001) {
    issues.push("Arc end radius is essentially zero");
  }

  // Check radius consistency
  const mismatch = Math.abs(startRadius - endRadius);
  if (mismatch > 0.1) {
    issues.push(`Arc radius mismatch: ${mismatch.toFixed(3)}mm`);
  }

  // Check if start equals end with no i/j (invalid arc)
  if (
    Math.abs(start.x - end.x) < 0.001 &&
    Math.abs(start.y - end.y) < 0.001 &&
    Math.abs(i) < 0.001 &&
    Math.abs(j) < 0.001
  ) {
    issues.push("Arc has zero length (start == end with no center offset)");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
