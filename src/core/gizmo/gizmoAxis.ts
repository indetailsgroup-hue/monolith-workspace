/**
 * gizmoAxis.ts - Axis Resolution for World/Local Space
 *
 * ARCHITECTURE:
 * - World axes are fixed: X=(1,0,0), Y=(0,1,0), Z=(0,0,1)
 * - Local axes are transformed by the object's rotation (quaternion)
 * - This module resolves which axis to use based on GizmoSpace
 *
 * For cabinets:
 * - Local X = cabinet's width direction (left-right when facing)
 * - Local Y = cabinet's height direction (up-down)
 * - Local Z = cabinet's depth direction (front-back)
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoAxis, GizmoSpace } from './gizmoTypes';

// ============================================
// TYPES
// ============================================

/**
 * Local coordinate axes derived from object rotation
 * These are world-space unit vectors representing the object's local frame
 */
export interface LocalAxes {
  /** X axis (width direction) as world vector */
  axisX: Vec3;
  /** Y axis (height direction) as world vector */
  axisY: Vec3;
  /** Z axis (depth direction) as world vector */
  axisZ: Vec3;
}

// ============================================
// CONSTANTS
// ============================================

/** World X axis unit vector */
export const WORLD_AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
/** World Y axis unit vector */
export const WORLD_AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };
/** World Z axis unit vector */
export const WORLD_AXIS_Z: Vec3 = { x: 0, y: 0, z: 1 };

/** Identity local axes (no rotation) */
export const IDENTITY_LOCAL_AXES: LocalAxes = {
  axisX: WORLD_AXIS_X,
  axisY: WORLD_AXIS_Y,
  axisZ: WORLD_AXIS_Z,
};

// ============================================
// AXIS RESOLUTION
// ============================================

/**
 * Get the unit axis vector based on space mode and constraint
 *
 * @param axis - Which axis to get (X, Y, Z)
 * @param space - Coordinate space (WORLD or LOCAL)
 * @param localAxes - Object's local axes (only used if space is LOCAL)
 * @returns Unit vector for the requested axis in world space
 */
export function getAxisUnit(
  axis: GizmoAxis,
  space: GizmoSpace,
  localAxes: LocalAxes = IDENTITY_LOCAL_AXES
): Vec3 | null {
  if (axis === null) return null;

  if (space === 'WORLD') {
    switch (axis) {
      case 'X': return WORLD_AXIS_X;
      case 'Y': return WORLD_AXIS_Y;
      case 'Z': return WORLD_AXIS_Z;
    }
  }

  // LOCAL space - use object's rotated axes
  switch (axis) {
    case 'X': return localAxes.axisX;
    case 'Y': return localAxes.axisY;
    case 'Z': return localAxes.axisZ;
  }
}

/**
 * Build local axes from a Y-rotation angle (radians)
 * Most cabinets only rotate around Y axis
 *
 * @param yRotation - Rotation around Y axis in radians
 * @returns Local axes for the rotated object
 */
export function localAxesFromYRotation(yRotation: number): LocalAxes {
  const cos = Math.cos(yRotation);
  const sin = Math.sin(yRotation);

  return {
    // X axis rotates in XZ plane
    axisX: { x: cos, y: 0, z: -sin },
    // Y axis stays the same (rotation is around Y)
    axisY: { x: 0, y: 1, z: 0 },
    // Z axis rotates in XZ plane
    axisZ: { x: sin, y: 0, z: cos },
  };
}

/**
 * Build local axes from Euler angles (XYZ order)
 *
 * @param rotation - [x, y, z] rotation in radians
 * @returns Local axes for the rotated object
 */
export function localAxesFromEuler(rotation: [number, number, number]): LocalAxes {
  const [rx, ry, rz] = rotation;

  // For simplicity with cabinet workflow, we mostly care about Y rotation
  // Full Euler would need proper matrix composition
  // This simplified version handles the common Y-only case well
  if (Math.abs(rx) < 0.001 && Math.abs(rz) < 0.001) {
    return localAxesFromYRotation(ry);
  }

  // Full Euler rotation matrix (ZYX convention for intrinsic rotations)
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // Rotation matrix columns give us the local axes
  return {
    axisX: {
      x: cy * cz,
      y: sx * sy * cz + cx * sz,
      z: -cx * sy * cz + sx * sz,
    },
    axisY: {
      x: -cy * sz,
      y: -sx * sy * sz + cx * cz,
      z: cx * sy * sz + sx * cz,
    },
    axisZ: {
      x: sy,
      y: -sx * cy,
      z: cx * cy,
    },
  };
}

// ============================================
// UTILITIES
// ============================================

/**
 * Get the axis that is most aligned with a given direction
 * Useful for auto-selecting constraint axis based on drag direction
 *
 * @param dir - Direction vector (normalized)
 * @param space - Coordinate space
 * @param localAxes - Object's local axes
 * @returns The axis most aligned with the direction
 */
export function getMostAlignedAxis(
  dir: Vec3,
  space: GizmoSpace,
  localAxes: LocalAxes = IDENTITY_LOCAL_AXES
): GizmoAxis {
  const axes: GizmoAxis[] = ['X', 'Y', 'Z'];
  let bestAxis: GizmoAxis = 'X';
  let bestDot = 0;

  for (const axis of axes) {
    const axisVec = getAxisUnit(axis, space, localAxes);
    if (!axisVec) continue;

    const d = Math.abs(dir.x * axisVec.x + dir.y * axisVec.y + dir.z * axisVec.z);
    if (d > bestDot) {
      bestDot = d;
      bestAxis = axis;
    }
  }

  return bestAxis;
}

/**
 * Check if a point is near a gizmo axis handle
 * Used for hit testing gizmo arrow handles
 *
 * @param point - Point to test (in gizmo local space)
 * @param axis - Which axis handle to test
 * @param handleLength - Length of the axis handle
 * @param handleRadius - Radius for hit testing
 * @returns true if point is near the axis handle
 */
export function isNearAxisHandle(
  point: Vec3,
  axis: GizmoAxis,
  handleLength: number,
  handleRadius: number
): boolean {
  if (!axis) return false;

  // Get the axis direction
  const axisVec = getAxisUnit(axis, 'WORLD', IDENTITY_LOCAL_AXES);
  if (!axisVec) return false;

  // Project point onto axis
  const t = point.x * axisVec.x + point.y * axisVec.y + point.z * axisVec.z;

  // Check if within handle length
  if (t < 0 || t > handleLength) return false;

  // Calculate distance from axis line
  const projX = axisVec.x * t;
  const projY = axisVec.y * t;
  const projZ = axisVec.z * t;

  const distSq =
    (point.x - projX) ** 2 +
    (point.y - projY) ** 2 +
    (point.z - projZ) ** 2;

  return distSq <= handleRadius * handleRadius;
}
