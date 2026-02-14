/**
 * Ramp Entry Geometry Helpers
 *
 * Step 10.5.2: Calculate ramp-in geometry for PROFILE/GROOVE cuts
 *
 * Ramp entry prevents:
 * - Tool deflection from vertical plunge
 * - Burn marks at plunge points
 * - Chip welding in melamine/HPL
 *
 * The tool enters at an angle along the first segment direction,
 * reaching full depth gradually instead of plunging vertically.
 */

import type { Point2D } from './transform.js';
import type { RampConfig } from './machineProfile.js';

// ============================================================================
// Types
// ============================================================================

export interface RampMove {
  /** Start point (at safe Z or previous Z) */
  start: Point2D;
  /** End point (at full depth) */
  end: Point2D;
  /** Target Z depth */
  targetZ: number;
  /** Horizontal distance traveled during ramp */
  horizontalLength: number;
}

export interface RampResult {
  /** Whether ramp is possible (segment long enough) */
  canRamp: boolean;
  /** Ramp move data if possible */
  ramp?: RampMove;
  /** Reason if ramp not possible */
  reason?: string;
}

// ============================================================================
// Ramp Calculations
// ============================================================================

/**
 * Calculate horizontal ramp length needed for given depth and angle.
 *
 * @param depth - Vertical depth to descend (positive value)
 * @param angleDeg - Ramp angle in degrees (3-5° typical)
 * @returns Horizontal length required
 */
export function rampLengthForDepth(depth: number, angleDeg: number): number {
  const rad = (angleDeg * Math.PI) / 180;
  const tan = Math.tan(rad);
  if (tan === 0) return Infinity;
  return Math.abs(depth) / tan;
}

/**
 * Calculate ramp end point along a segment direction.
 *
 * @param start - Start point of ramp
 * @param directionRad - Direction angle in radians
 * @param horizontalLength - Horizontal distance to travel
 * @returns End point of ramp
 */
export function rampEndPoint(
  start: Point2D,
  directionRad: number,
  horizontalLength: number
): Point2D {
  return {
    x: start.x + horizontalLength * Math.cos(directionRad),
    y: start.y + horizontalLength * Math.sin(directionRad),
  };
}

/**
 * Calculate ramp move for entering a cut.
 *
 * @param startPt - First point of cut path (where ramp begins at safe Z)
 * @param nextPt - Second point of cut path (direction reference)
 * @param targetZ - Target Z depth (negative for below surface)
 * @param config - Ramp configuration
 * @returns Ramp result with move data or reason for failure
 */
export function calculateRamp(
  startPt: Point2D,
  nextPt: Point2D,
  targetZ: number,
  config: RampConfig
): RampResult {
  if (!config.enabled) {
    return { canRamp: false, reason: 'Ramp disabled' };
  }

  // Calculate segment direction
  const dx = nextPt.x - startPt.x;
  const dy = nextPt.y - startPt.y;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength < 0.001) {
    return { canRamp: false, reason: 'Segment too short (near zero length)' };
  }

  // Calculate required ramp length
  const depth = Math.abs(targetZ);
  const rampLength = rampLengthForDepth(depth, config.angleDeg);

  // Check minimum segment length
  if (segmentLength < config.minLengthMm) {
    return {
      canRamp: false,
      reason: `Segment ${segmentLength.toFixed(1)}mm < min ${config.minLengthMm}mm`,
    };
  }

  // Check if ramp fits within segment
  if (rampLength > segmentLength) {
    return {
      canRamp: false,
      reason: `Ramp ${rampLength.toFixed(1)}mm > segment ${segmentLength.toFixed(1)}mm`,
    };
  }

  // Calculate ramp end point
  const directionRad = Math.atan2(dy, dx);
  const rampEnd = rampEndPoint(startPt, directionRad, rampLength);

  return {
    canRamp: true,
    ramp: {
      start: startPt,
      end: rampEnd,
      targetZ,
      horizontalLength: rampLength,
    },
  };
}

/**
 * Calculate ramp for multi-pass depth strategy.
 *
 * When cutting in multiple passes, each pass needs a ramp entry.
 * This calculates if the ramp is feasible for the pass depth increment.
 *
 * @param startPt - First point of cut path
 * @param nextPt - Second point of cut path
 * @param currentZ - Current Z position (from previous pass)
 * @param targetZ - Target Z for this pass
 * @param config - Ramp configuration
 * @returns Ramp result
 */
export function calculatePassRamp(
  startPt: Point2D,
  nextPt: Point2D,
  currentZ: number,
  targetZ: number,
  config: RampConfig
): RampResult {
  if (!config.enabled) {
    return { canRamp: false, reason: 'Ramp disabled' };
  }

  const passDepth = Math.abs(currentZ - targetZ);
  if (passDepth < 0.1) {
    return { canRamp: false, reason: 'Pass depth negligible' };
  }

  // Calculate segment direction
  const dx = nextPt.x - startPt.x;
  const dy = nextPt.y - startPt.y;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength < config.minLengthMm) {
    return {
      canRamp: false,
      reason: `Segment ${segmentLength.toFixed(1)}mm < min ${config.minLengthMm}mm`,
    };
  }

  // Calculate required ramp length for this pass
  const rampLength = rampLengthForDepth(passDepth, config.angleDeg);

  if (rampLength > segmentLength) {
    // Ramp would exceed segment - use steeper angle to fit
    // Or fall back to plunge
    return {
      canRamp: false,
      reason: `Ramp ${rampLength.toFixed(1)}mm > segment ${segmentLength.toFixed(1)}mm`,
    };
  }

  const directionRad = Math.atan2(dy, dx);
  const rampEnd = rampEndPoint(startPt, directionRad, rampLength);

  return {
    canRamp: true,
    ramp: {
      start: startPt,
      end: rampEnd,
      targetZ,
      horizontalLength: rampLength,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate direction angle between two points.
 */
export function segmentDirection(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Calculate segment length between two points.
 */
export function segmentLength(from: Point2D, to: Point2D): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
