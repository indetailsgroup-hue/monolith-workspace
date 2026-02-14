/**
 * Corner Arc Geometry Helpers
 *
 * Step 10.5.3: Generate rectangle paths with rounded corners
 *
 * Sharp corners cause:
 * - Tool deflection at direction change
 * - Burn marks from dwell time
 * - Chatter in HPL/melamine
 *
 * Tiny arcs at corners maintain constant tool engagement
 * and eliminate full-stop direction changes.
 */

import type { Point2D } from './transform.js';
import type { SmoothingConfig } from './machineProfile.js';

// ============================================================================
// Types
// ============================================================================

export type MoveType = 'LINE' | 'ARC_CW' | 'ARC_CCW';

export interface PathSegment {
  /** Segment type */
  type: MoveType;
  /** End point of segment */
  end: Point2D;
  /** Arc center (only for ARC_CW/ARC_CCW) */
  center?: Point2D;
  /** Arc radius (only for ARC_CW/ARC_CCW) */
  radius?: number;
}

export interface SmoothedPath {
  /** Starting point */
  start: Point2D;
  /** Path segments */
  segments: PathSegment[];
  /** Whether smoothing was applied */
  smoothed: boolean;
}

// ============================================================================
// Corner Arc Generation
// ============================================================================

/**
 * Generate a rectangle path with rounded corners.
 *
 * The path starts at corner 0 (bottom-left) and proceeds counter-clockwise:
 * Corner 0 → Corner 1 (bottom-right) → Corner 2 (top-right) → Corner 3 (top-left) → back to 0
 *
 * Each corner is replaced with a tiny arc that maintains tool direction flow.
 *
 * @param W - Rectangle width
 * @param H - Rectangle height
 * @param r - Corner radius (clamped to fit)
 * @param ox - X offset (default 0)
 * @param oy - Y offset (default 0)
 * @returns Smoothed path with line and arc segments
 */
export function smoothedRectPath(
  W: number,
  H: number,
  r: number,
  ox: number = 0,
  oy: number = 0
): SmoothedPath {
  // Clamp radius to half of smallest dimension
  const maxRadius = Math.min(W, H) / 2;
  const radius = Math.min(r, maxRadius);

  // If radius is too small, return sharp corners
  if (radius < 0.1) {
    return sharpRectPath(W, H, ox, oy);
  }

  // Corner centers (inside the rectangle by radius amount)
  const c0: Point2D = { x: ox + radius, y: oy + radius };           // Bottom-left
  const c1: Point2D = { x: ox + W - radius, y: oy + radius };       // Bottom-right
  const c2: Point2D = { x: ox + W - radius, y: oy + H - radius };   // Top-right
  const c3: Point2D = { x: ox + radius, y: oy + H - radius };       // Top-left

  // Start point: end of corner 0 arc (going CCW, this is on the bottom edge)
  const start: Point2D = { x: ox + radius, y: oy };

  const segments: PathSegment[] = [
    // Bottom edge: from corner 0 to corner 1
    {
      type: 'LINE',
      end: { x: ox + W - radius, y: oy },
    },
    // Corner 1 arc (bottom-right, CCW = 270° to 0°)
    {
      type: 'ARC_CCW',
      end: { x: ox + W, y: oy + radius },
      center: c1,
      radius,
    },
    // Right edge: from corner 1 to corner 2
    {
      type: 'LINE',
      end: { x: ox + W, y: oy + H - radius },
    },
    // Corner 2 arc (top-right, CCW = 0° to 90°)
    {
      type: 'ARC_CCW',
      end: { x: ox + W - radius, y: oy + H },
      center: c2,
      radius,
    },
    // Top edge: from corner 2 to corner 3
    {
      type: 'LINE',
      end: { x: ox + radius, y: oy + H },
    },
    // Corner 3 arc (top-left, CCW = 90° to 180°)
    {
      type: 'ARC_CCW',
      end: { x: ox, y: oy + H - radius },
      center: c3,
      radius,
    },
    // Left edge: from corner 3 to corner 0
    {
      type: 'LINE',
      end: { x: ox, y: oy + radius },
    },
    // Corner 0 arc (bottom-left, CCW = 180° to 270°)
    {
      type: 'ARC_CCW',
      end: { x: ox + radius, y: oy },
      center: c0,
      radius,
    },
  ];

  return { start, segments, smoothed: true };
}

/**
 * Generate a rectangle path with sharp corners.
 *
 * Used when smoothing is disabled or radius is too small.
 *
 * @param W - Rectangle width
 * @param H - Rectangle height
 * @param ox - X offset
 * @param oy - Y offset
 * @returns Sharp corner path (LINE segments only)
 */
export function sharpRectPath(
  W: number,
  H: number,
  ox: number = 0,
  oy: number = 0
): SmoothedPath {
  const start: Point2D = { x: ox, y: oy };

  const segments: PathSegment[] = [
    { type: 'LINE', end: { x: ox + W, y: oy } },
    { type: 'LINE', end: { x: ox + W, y: oy + H } },
    { type: 'LINE', end: { x: ox, y: oy + H } },
    { type: 'LINE', end: { x: ox, y: oy } },
  ];

  return { start, segments, smoothed: false };
}

/**
 * Generate smoothed rectangle path based on config.
 *
 * Checks if smoothing is enabled and segments are long enough.
 *
 * @param W - Rectangle width
 * @param H - Rectangle height
 * @param config - Smoothing configuration
 * @param ox - X offset
 * @param oy - Y offset
 * @returns Smoothed or sharp path based on config
 */
export function generateProfilePath(
  W: number,
  H: number,
  config: SmoothingConfig,
  ox: number = 0,
  oy: number = 0
): SmoothedPath {
  if (!config.enabled) {
    return sharpRectPath(W, H, ox, oy);
  }

  // Check minimum segment length
  const minSegment = Math.min(W, H);
  if (minSegment < config.minSegmentMm) {
    return sharpRectPath(W, H, ox, oy);
  }

  return smoothedRectPath(W, H, config.cornerRadiusMm, ox, oy);
}

/**
 * Calculate the tangent point on an arc given direction.
 *
 * Used for lead-in/lead-out to arc corners.
 *
 * @param center - Arc center
 * @param radius - Arc radius
 * @param angleDeg - Angle in degrees (0 = +X, 90 = +Y)
 * @returns Point on arc at given angle
 */
export function arcTangentPoint(
  center: Point2D,
  radius: number,
  angleDeg: number
): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(rad),
    y: center.y + radius * Math.sin(rad),
  };
}

/**
 * Get corner arc info for a specific corner.
 *
 * @param corner - Corner index (0-3, CCW from bottom-left)
 * @param W - Rectangle width
 * @param H - Rectangle height
 * @param r - Corner radius
 * @param ox - X offset
 * @param oy - Y offset
 * @returns Arc center, start angle, end angle, and tangent points
 */
export function getCornerArc(
  corner: 0 | 1 | 2 | 3,
  W: number,
  H: number,
  r: number,
  ox: number = 0,
  oy: number = 0
): {
  center: Point2D;
  startAngle: number;
  endAngle: number;
  startPoint: Point2D;
  endPoint: Point2D;
} {
  const maxRadius = Math.min(W, H) / 2;
  const radius = Math.min(r, maxRadius);

  // Define corners and their arc angles (CCW direction)
  const corners: Array<{
    center: Point2D;
    startAngle: number;
    endAngle: number;
  }> = [
    // Corner 0: bottom-left (180° to 270°)
    {
      center: { x: ox + radius, y: oy + radius },
      startAngle: 180,
      endAngle: 270,
    },
    // Corner 1: bottom-right (270° to 360°)
    {
      center: { x: ox + W - radius, y: oy + radius },
      startAngle: 270,
      endAngle: 360,
    },
    // Corner 2: top-right (0° to 90°)
    {
      center: { x: ox + W - radius, y: oy + H - radius },
      startAngle: 0,
      endAngle: 90,
    },
    // Corner 3: top-left (90° to 180°)
    {
      center: { x: ox + radius, y: oy + H - radius },
      startAngle: 90,
      endAngle: 180,
    },
  ];

  const c = corners[corner];
  return {
    center: c.center,
    startAngle: c.startAngle,
    endAngle: c.endAngle,
    startPoint: arcTangentPoint(c.center, radius, c.startAngle),
    endPoint: arcTangentPoint(c.center, radius, c.endAngle),
  };
}
