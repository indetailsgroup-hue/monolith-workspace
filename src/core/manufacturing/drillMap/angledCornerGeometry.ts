/**
 * Angled Corner Geometry Utilities
 *
 * Provides calculations for Minifix hardware placement on cabinet corners
 * at angles other than 90 degrees (supports 30-150 degree range).
 *
 * Key insight: The bolt orientation policy already handles arbitrary angles
 * via cross(panelNormal, boltDir). This module handles:
 * - Angle validation against physical limits
 * - Distance B adjustment based on corner angle
 * - Position calculations for angled corners
 */

import { MINIFIX_ANGLE_LIMITS, type CornerType, type Vec3Tuple } from './types';

// ============================================
// ANGLE VALIDATION
// ============================================

export interface AngleValidationResult {
  valid: boolean;
  blocked: boolean;
  warning: boolean;
  message?: string;
}

/**
 * Validates a corner angle against Minifix physical limits.
 *
 * @param angleDeg - Corner angle in degrees
 * @returns Validation result with status and optional message
 */
export function validateCornerAngle(angleDeg: number): AngleValidationResult {
  const { MIN_ANGLE, MAX_ANGLE, WARNING_MIN, WARNING_MAX } = MINIFIX_ANGLE_LIMITS;

  // Block invalid angles
  if (angleDeg < MIN_ANGLE) {
    return {
      valid: false,
      blocked: true,
      warning: false,
      message: `Corner angle ${angleDeg}° is below minimum ${MIN_ANGLE}°. Panels are nearly parallel.`,
    };
  }

  if (angleDeg > MAX_ANGLE) {
    return {
      valid: false,
      blocked: true,
      warning: false,
      message: `Corner angle ${angleDeg}° exceeds maximum ${MAX_ANGLE}°. Panels are nearly parallel.`,
    };
  }

  // Warn for extreme but valid angles
  if (angleDeg < WARNING_MIN) {
    return {
      valid: true,
      blocked: false,
      warning: true,
      message: `Corner angle ${angleDeg}° may require longer bolts for secure connection.`,
    };
  }

  if (angleDeg > WARNING_MAX) {
    return {
      valid: true,
      blocked: false,
      warning: true,
      message: `Corner angle ${angleDeg}° may require longer bolts for secure connection.`,
    };
  }

  // Standard range - no issues
  return {
    valid: true,
    blocked: false,
    warning: false,
  };
}

/**
 * Checks if angle is effectively 90 degrees (within tolerance).
 */
export function isRightAngle(angleDeg: number, toleranceDeg = 0.1): boolean {
  return Math.abs(angleDeg - 90) <= toleranceDeg;
}

// ============================================
// DISTANCE B CALCULATION
// ============================================

/**
 * Calculates adjusted Distance B for angled corners.
 *
 * Formula: adjustedB = standardB × (sin(45°) / sin(angleDeg/2))
 *
 * Explanation:
 * - At 90°: sin(45°)/sin(45°) = 1.0 (unchanged)
 * - At 60°: sin(45°)/sin(30°) = 1.41 (increase B for acute angle)
 * - At 120°: sin(45°)/sin(60°) = 0.82 (decrease B for obtuse angle)
 *
 * @param standardB - Standard Distance B in mm (typically 24mm)
 * @param angleDeg - Corner angle in degrees
 * @returns Adjusted Distance B in mm
 */
export function calculateAngledDistanceB(standardB: number, angleDeg: number): number {
  // For 90° corners, return standard B unchanged
  if (isRightAngle(angleDeg)) {
    return standardB;
  }

  // Convert to radians for calculation
  const halfAngleRad = (angleDeg / 2) * (Math.PI / 180);
  const sin45 = Math.sin(Math.PI / 4); // sin(45°) ≈ 0.7071

  // Calculate adjustment factor
  const adjustmentFactor = sin45 / Math.sin(halfAngleRad);

  // Apply adjustment
  return standardB * adjustmentFactor;
}

// ============================================
// POSITION CALCULATIONS
// ============================================

export interface AngledCornerPositions {
  /** CAM housing position on receiving panel (face drilling) */
  camPosition: Vec3Tuple;
  /** Bolt hole position on mating panel (edge drilling) */
  boltPosition: Vec3Tuple;
  /** Normal direction for CAM drilling (into receiving panel) */
  camNormal: Vec3Tuple;
  /** Normal direction for bolt drilling (into mating panel edge) */
  boltNormal: Vec3Tuple;
  /** Adjusted Distance B used */
  adjustedDistanceB: number;
}

/**
 * Corner configuration for position calculation.
 */
export interface CornerConfig {
  /** Corner type (TOP_LEFT, TOP_RIGHT, etc.) */
  cornerType: CornerType;
  /** Corner angle in degrees */
  angleDeg: number;
  /** System 32 Z position (distance from front edge) */
  sys32Z: number;
  /** Standard Distance B (mm) */
  standardDistanceB: number;
  /** Panel thickness (mm) */
  panelThickness: number;
}

/**
 * Panel dimensions and position for corner calculations.
 */
export interface CornerPanelInfo {
  /** Receiving panel (gets CAM housing) */
  receivingPanel: {
    width: number;
    height: number;
    thickness: number;
    worldPosition: Vec3Tuple;
    worldRotation: Vec3Tuple;
  };
  /** Mating panel (gets bolt hole) */
  matingPanel: {
    width: number;
    height: number;
    thickness: number;
    worldPosition: Vec3Tuple;
    worldRotation: Vec3Tuple;
  };
}

/**
 * Calculates CAM and bolt positions for an angled corner joint.
 *
 * For angled corners, the geometry changes:
 * - Distance B is adjusted based on angle
 * - Drill normals rotate with the panel angle
 * - Position offsets account for angle geometry
 *
 * @param config - Corner configuration
 * @param panels - Panel information
 * @returns Calculated positions for CAM and bolt
 */
export function calculateAngledCornerPositions(
  config: CornerConfig,
  panels: CornerPanelInfo
): AngledCornerPositions {
  const { angleDeg, sys32Z, standardDistanceB, panelThickness } = config;

  // Calculate adjusted Distance B
  const adjustedDistanceB = calculateAngledDistanceB(standardDistanceB, angleDeg);

  // Convert angle to radians for trigonometry
  const angleRad = angleDeg * (Math.PI / 180);

  // Calculate the angular offset from 90 degrees
  const offsetAngleRad = (angleDeg - 90) * (Math.PI / 180);

  // Get base positions from receiving panel (the panel with CAM housing)
  const [rx, ry, rz] = panels.receivingPanel.worldPosition;

  // For CAM position: face of receiving panel
  // The CAM is positioned at adjustedDistanceB from the corner
  const camX = rx + adjustedDistanceB * Math.cos(offsetAngleRad / 2);
  const camY = ry + adjustedDistanceB * Math.sin(offsetAngleRad / 2);
  const camZ = rz + sys32Z;

  // CAM normal points into the receiving panel face
  // For angled corners, this rotates with the panel
  const camNormal: Vec3Tuple = [
    Math.sin(offsetAngleRad / 2),
    -Math.cos(offsetAngleRad / 2),
    0,
  ];

  // For bolt position: edge of mating panel
  // The bolt is at the corner intersection point
  const [mx, my, mz] = panels.matingPanel.worldPosition;
  const boltX = mx + (panelThickness / 2) * Math.cos(angleRad / 2);
  const boltY = my + (panelThickness / 2) * Math.sin(angleRad / 2);
  const boltZ = mz + sys32Z;

  // Bolt normal points into the mating panel edge
  // This is perpendicular to the mating panel's edge face
  const boltNormal: Vec3Tuple = [
    -Math.cos(angleRad / 2),
    -Math.sin(angleRad / 2),
    0,
  ];

  return {
    camPosition: [camX, camY, camZ],
    boltPosition: [boltX, boltY, boltZ],
    camNormal: normalizeVec3(camNormal),
    boltNormal: normalizeVec3(boltNormal),
    adjustedDistanceB,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalizes a 3D vector to unit length.
 */
function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Converts degrees to radians.
 */
export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Converts radians to degrees.
 */
export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Gets the default corner angle for a corner type.
 * Used when cabinet doesn't specify custom angles.
 */
export function getDefaultCornerAngle(_cornerType: CornerType): number {
  return 90; // Default to right angle
}

/**
 * Determines if an angle requires special handling (non-standard drilling).
 */
export function requiresAngledDrilling(angleDeg: number): boolean {
  return !isRightAngle(angleDeg, 1.0); // More than 1 degree from 90
}
