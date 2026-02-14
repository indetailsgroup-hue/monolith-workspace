/**
 * Sketch Projection Utilities
 *
 * Pure functions for 2D snap and constraint operations on the construction plane.
 * No Three.js dependencies - works with plain [u, v] coordinates.
 *
 * @version 1.0.0
 */

import { SketchPoint } from './types';

// ============================================================================
// Snap Functions
// ============================================================================

/**
 * Snap a 2D point to a grid.
 * @param point - Point to snap [u, v]
 * @param gridSize - Grid cell size in mm
 * @returns Snapped point
 */
export function snapToGrid2D(point: SketchPoint, gridSize: number): SketchPoint {
  return [
    Math.round(point[0] / gridSize) * gridSize,
    Math.round(point[1] / gridSize) * gridSize,
  ];
}

/**
 * Find the nearest point from a list of points.
 * Returns null if no point is within threshold.
 *
 * @param point - Target point [u, v]
 * @param points - Array of candidate points
 * @param threshold - Maximum distance to consider (mm)
 * @returns Nearest point or null
 */
export function snapToPoints2D(
  point: SketchPoint,
  points: SketchPoint[],
  threshold: number
): SketchPoint | null {
  if (points.length === 0) return null;

  let nearest: SketchPoint | null = null;
  let minDist = threshold;

  for (const p of points) {
    const dist = distance2D(point, p);
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }

  return nearest;
}

/**
 * Calculate Euclidean distance between two 2D points.
 */
export function distance2D(a: SketchPoint, b: SketchPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// Axis Constraint Functions
// ============================================================================

export type AxisMode = 'none' | 'x' | 'y';

/**
 * Constrain a point to move only along one axis from an origin.
 *
 * @param origin - Reference point (start of line)
 * @param point - Current mouse position
 * @param axis - 'x' for horizontal, 'y' for vertical, 'none' for free
 * @returns Constrained point
 */
export function axisConstrain2D(
  origin: SketchPoint,
  point: SketchPoint,
  axis: AxisMode
): SketchPoint {
  switch (axis) {
    case 'x':
      // Lock to horizontal (same V as origin)
      return [point[0], origin[1]];
    case 'y':
      // Lock to vertical (same U as origin)
      return [origin[0], point[1]];
    case 'none':
    default:
      return point;
  }
}

/**
 * Determine which axis is dominant based on mouse movement from origin.
 * Useful for auto-detecting axis lock.
 *
 * @param origin - Reference point
 * @param point - Current point
 * @returns Dominant axis or 'none' if ambiguous
 */
export function getDominantAxis(
  origin: SketchPoint,
  point: SketchPoint
): AxisMode {
  const dx = Math.abs(point[0] - origin[0]);
  const dy = Math.abs(point[1] - origin[1]);

  // Need significant movement and clear dominance
  const minMovement = 10; // mm
  const dominanceRatio = 2; // One axis must be 2x the other

  if (dx < minMovement && dy < minMovement) {
    return 'none';
  }

  if (dx > dy * dominanceRatio) {
    return 'x';
  }
  if (dy > dx * dominanceRatio) {
    return 'y';
  }

  return 'none';
}

// ============================================================================
// Angle & Distance Helpers
// ============================================================================

/**
 * Calculate angle from origin to point (in degrees, 0° = right, CCW positive).
 */
export function angle2D(origin: SketchPoint, point: SketchPoint): number {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const radians = Math.atan2(dy, dx);
  return (radians * 180) / Math.PI;
}

/**
 * Snap angle to nearest increment (e.g., 15° or 45°).
 */
export function snapAngle(angleDeg: number, increment: number): number {
  return Math.round(angleDeg / increment) * increment;
}

/**
 * Calculate a point at a given distance and angle from origin.
 */
export function polarToPoint(
  origin: SketchPoint,
  distance: number,
  angleDeg: number
): SketchPoint {
  const radians = (angleDeg * Math.PI) / 180;
  return [
    origin[0] + distance * Math.cos(radians),
    origin[1] + distance * Math.sin(radians),
  ];
}

// ============================================================================
// Rectangle Helpers
// ============================================================================

/**
 * Get the four corners of a rectangle from two diagonal corners.
 */
export function getRectCorners(
  corner1: SketchPoint,
  corner2: SketchPoint
): SketchPoint[] {
  const [u1, v1] = corner1;
  const [u2, v2] = corner2;

  return [
    [u1, v1], // Bottom-left
    [u2, v1], // Bottom-right
    [u2, v2], // Top-right
    [u1, v2], // Top-left
  ];
}

/**
 * Get the center of a rectangle.
 */
export function getRectCenter(
  corner1: SketchPoint,
  corner2: SketchPoint
): SketchPoint {
  return [
    (corner1[0] + corner2[0]) / 2,
    (corner1[1] + corner2[1]) / 2,
  ];
}

// ============================================================================
// Snap Result Type
// ============================================================================

export interface SnapResult {
  /** Final snapped point */
  point: SketchPoint;
  /** Type of snap that was applied */
  snapType: 'grid' | 'point' | 'axis' | 'none';
  /** Original point before snapping */
  original: SketchPoint;
  /** For point snap, the point it snapped to */
  snapTarget?: SketchPoint;
}

/**
 * Apply all snap operations in priority order.
 *
 * @param point - Raw mouse position on plane
 * @param options - Snap options
 * @returns Snap result with final point and metadata
 */
export function applySnap(
  point: SketchPoint,
  options: {
    gridSize: number;
    snapToGrid: boolean;
    snapToPoints: boolean;
    points: SketchPoint[];
    pointThreshold: number;
    axisLock: AxisMode;
    axisOrigin?: SketchPoint;
  }
): SnapResult {
  let current = point;
  let snapType: SnapResult['snapType'] = 'none';
  let snapTarget: SketchPoint | undefined;

  // 1. Apply axis constraint first (if origin provided)
  if (options.axisLock !== 'none' && options.axisOrigin) {
    current = axisConstrain2D(options.axisOrigin, current, options.axisLock);
    snapType = 'axis';
  }

  // 2. Try point snap (highest priority)
  if (options.snapToPoints && options.points.length > 0) {
    const snapped = snapToPoints2D(current, options.points, options.pointThreshold);
    if (snapped) {
      current = snapped;
      snapType = 'point';
      snapTarget = snapped;
    }
  }

  // 3. Grid snap (if point snap didn't trigger)
  if (snapType !== 'point' && options.snapToGrid) {
    current = snapToGrid2D(current, options.gridSize);
    if (snapType === 'none') {
      snapType = 'grid';
    }
  }

  return {
    point: current,
    snapType,
    original: point,
    snapTarget,
  };
}
