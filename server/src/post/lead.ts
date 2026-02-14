/**
 * Lead-In / Lead-Out Geometry Helpers
 *
 * Step 10.5.1: Calculate lead-in and lead-out positions for profile/groove cuts
 *
 * Lead-in/out prevents:
 * - Burn marks at plunge points
 * - Dwell marks on finished edges
 * - Premature tool breakage
 *
 * Supports:
 * - LINE lead: Straight approach at angle
 * - ARC lead: Tangent arc approach (future)
 */

import type { Point2D } from './transform.js';
import type { LeadMode } from './machineProfile.js';

// ============================================================================
// Types
// ============================================================================

export interface LeadConfig {
  mode: LeadMode;
  lengthMm: number;
  angleDeg: number;
  arcRadiusMm?: number;
}

export interface LeadResult {
  point: Point2D;
  /** Arc center for ARC mode, undefined for LINE */
  arcCenter?: Point2D;
  /** Clockwise for ARC mode */
  arcCW?: boolean;
}

// ============================================================================
// Lead-In Calculation
// ============================================================================

/**
 * Calculate lead-in start point.
 *
 * The lead-in starts from outside the part and approaches the first cut point
 * at an angle, allowing the cutter to engage material smoothly.
 *
 * @param startPt - First point of the cut path
 * @param pathAngleRad - Direction of the path at startPt (radians)
 * @param lengthMm - Lead distance
 * @param entryAngleDeg - Entry angle offset from path direction (degrees)
 * @returns Lead-in start point
 */
export function leadInLine(
  startPt: Point2D,
  pathAngleRad: number,
  lengthMm: number,
  entryAngleDeg: number
): Point2D {
  const entryRad = (entryAngleDeg * Math.PI) / 180;
  // Lead-in comes from behind the path direction + offset angle
  const angle = pathAngleRad + Math.PI + entryRad;
  return {
    x: startPt.x + lengthMm * Math.cos(angle),
    y: startPt.y + lengthMm * Math.sin(angle),
  };
}

/**
 * Calculate lead-in with arc approach (tangent entry).
 *
 * @param startPt - First point of the cut path
 * @param pathAngleRad - Direction of the path at startPt (radians)
 * @param arcRadiusMm - Arc radius
 * @param entryAngleDeg - Entry angle (determines arc extent)
 * @returns Lead-in result with arc center
 */
export function leadInArc(
  startPt: Point2D,
  pathAngleRad: number,
  arcRadiusMm: number,
  entryAngleDeg: number
): LeadResult {
  const entryRad = (entryAngleDeg * Math.PI) / 180;

  // Arc center is perpendicular to path direction
  const centerAngle = pathAngleRad - Math.PI / 2;
  const arcCenter: Point2D = {
    x: startPt.x + arcRadiusMm * Math.cos(centerAngle),
    y: startPt.y + arcRadiusMm * Math.sin(centerAngle),
  };

  // Start point of arc (on circle, offset by entry angle)
  const startAngle = centerAngle + Math.PI + entryRad;
  const point: Point2D = {
    x: arcCenter.x + arcRadiusMm * Math.cos(startAngle),
    y: arcCenter.y + arcRadiusMm * Math.sin(startAngle),
  };

  return {
    point,
    arcCenter,
    arcCW: true,  // Clockwise arc to reach startPt
  };
}

// ============================================================================
// Lead-Out Calculation
// ============================================================================

/**
 * Calculate lead-out end point.
 *
 * The lead-out extends past the last cut point, allowing the cutter
 * to exit material cleanly without dwelling.
 *
 * @param endPt - Last point of the cut path
 * @param pathAngleRad - Direction of the path at endPt (radians)
 * @param lengthMm - Lead distance
 * @param exitAngleDeg - Exit angle offset from path direction (degrees)
 * @returns Lead-out end point
 */
export function leadOutLine(
  endPt: Point2D,
  pathAngleRad: number,
  lengthMm: number,
  exitAngleDeg: number
): Point2D {
  const exitRad = (exitAngleDeg * Math.PI) / 180;
  // Lead-out continues in path direction + offset angle
  const angle = pathAngleRad + exitRad;
  return {
    x: endPt.x + lengthMm * Math.cos(angle),
    y: endPt.y + lengthMm * Math.sin(angle),
  };
}

/**
 * Calculate lead-out with arc departure (tangent exit).
 *
 * @param endPt - Last point of the cut path
 * @param pathAngleRad - Direction of the path at endPt (radians)
 * @param arcRadiusMm - Arc radius
 * @param exitAngleDeg - Exit angle (determines arc extent)
 * @returns Lead-out result with arc center
 */
export function leadOutArc(
  endPt: Point2D,
  pathAngleRad: number,
  arcRadiusMm: number,
  exitAngleDeg: number
): LeadResult {
  const exitRad = (exitAngleDeg * Math.PI) / 180;

  // Arc center is perpendicular to path direction
  const centerAngle = pathAngleRad + Math.PI / 2;
  const arcCenter: Point2D = {
    x: endPt.x + arcRadiusMm * Math.cos(centerAngle),
    y: endPt.y + arcRadiusMm * Math.sin(centerAngle),
  };

  // End point of arc (on circle, offset by exit angle)
  const endAngle = centerAngle + Math.PI - exitRad;
  const point: Point2D = {
    x: arcCenter.x + arcRadiusMm * Math.cos(endAngle),
    y: arcCenter.y + arcRadiusMm * Math.sin(endAngle),
  };

  return {
    point,
    arcCenter,
    arcCW: false,  // Counter-clockwise arc from endPt
  };
}

// ============================================================================
// Path Angle Calculation
// ============================================================================

/**
 * Calculate angle of path segment between two points.
 *
 * @param from - Start point
 * @param to - End point
 * @returns Angle in radians
 */
export function pathAngle(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Calculate average angle at a point (for smooth entry/exit at corners).
 *
 * @param prev - Previous point
 * @param current - Current point
 * @param next - Next point
 * @returns Average angle in radians
 */
export function averageAngle(
  prev: Point2D,
  current: Point2D,
  next: Point2D
): number {
  const inAngle = pathAngle(prev, current);
  const outAngle = pathAngle(current, next);

  // Handle angle wrap-around
  let diff = outAngle - inAngle;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;

  return inAngle + diff / 2;
}

// ============================================================================
// High-Level Lead Functions
// ============================================================================

/**
 * Calculate lead-in point based on config.
 */
export function calculateLeadIn(
  startPt: Point2D,
  pathAngleRad: number,
  config: LeadConfig
): LeadResult {
  if (config.mode === 'NONE') {
    return { point: startPt };
  }

  if (config.mode === 'ARC' && config.arcRadiusMm) {
    return leadInArc(startPt, pathAngleRad, config.arcRadiusMm, config.angleDeg);
  }

  // Default to LINE
  return {
    point: leadInLine(startPt, pathAngleRad, config.lengthMm, config.angleDeg),
  };
}

/**
 * Calculate lead-out point based on config.
 */
export function calculateLeadOut(
  endPt: Point2D,
  pathAngleRad: number,
  config: LeadConfig
): LeadResult {
  if (config.mode === 'NONE') {
    return { point: endPt };
  }

  if (config.mode === 'ARC' && config.arcRadiusMm) {
    return leadOutArc(endPt, pathAngleRad, config.arcRadiusMm, config.angleDeg);
  }

  // Default to LINE
  return {
    point: leadOutLine(endPt, pathAngleRad, config.lengthMm, config.angleDeg),
  };
}
