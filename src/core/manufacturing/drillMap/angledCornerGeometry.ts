/**
 * angledCornerGeometry.ts
 *
 * Utilities for validating and computing adjusted drilling distances
 * for non-90° corner joints. Used by generateDrillMap.ts v4.0.
 */

export interface AngleValidation {
  valid: boolean;
  message: string;
  warning?: string;
}

/**
 * Validate whether a corner angle is within manufacturable range.
 * Minifix connectors work reliably between 30° and 150°.
 */
export function validateCornerAngle(angleDeg: number): AngleValidation {
  if (angleDeg < 30 || angleDeg > 150) {
    return {
      valid: false,
      message: `Corner angle ${angleDeg}° is outside valid range (30°-150°)`,
    };
  }
  if (angleDeg < 60 || angleDeg > 120) {
    return {
      valid: true,
      message: `Corner angle ${angleDeg}° is within range but may reduce connector strength`,
      warning: `Non-standard angle: ${angleDeg}°`,
    };
  }
  return { valid: true, message: 'OK' };
}

/**
 * Calculate adjusted Distance B for non-90° corner joints.
 * The effective distance changes as the angle deviates from 90°.
 */
export function calculateAngledDistanceB(distanceB: number, angleDeg: number): number {
  if (isRightAngle(angleDeg)) return distanceB;
  const angleRad = (angleDeg * Math.PI) / 180;
  return distanceB / Math.sin(angleRad);
}

/**
 * Check if an angle is effectively 90° (within 0.5° tolerance).
 */
export function isRightAngle(angleDeg: number): boolean {
  return Math.abs(angleDeg - 90) < 0.5;
}
