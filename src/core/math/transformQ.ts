/**
 * transformQ.ts - Transform with Quaternion Rotation
 *
 * ARCHITECTURE:
 * - Position in world space (mm)
 * - Rotation as quaternion (no gimbal lock)
 * - Utilities for local/world space conversion
 */

import type { Vec3 } from '../types/SnapTypes';
import type { Quat } from './quaternion';
import {
  QUAT_IDENTITY,
  axesFromQuat,
  quatRotateVec3,
  quatMul,
  quatFromYaw,
  quatFromEuler,
} from './quaternion';

// ============================================
// TYPES
// ============================================

/**
 * Transform with quaternion rotation
 */
export interface TransformQ {
  /** Position in world space (mm) */
  position: Vec3;

  /** Rotation as quaternion */
  rotation: Quat;
}

/**
 * Cabinet local axes in world space
 */
export interface CabinetAxes {
  /** Right direction (+X in local) */
  axisX: Vec3;

  /** Up direction (+Y in local) */
  axisY: Vec3;

  /** Front direction (+Z in local) */
  axisZ: Vec3;
}

// ============================================
// FACTORY
// ============================================

/**
 * Create a transform with optional rotation
 */
export function makeTransformQ(
  position: Vec3,
  rotation: Quat = QUAT_IDENTITY
): TransformQ {
  return { position, rotation };
}

/**
 * Create transform with Y-axis rotation only
 */
export function makeTransformYaw(position: Vec3, yawRad: number): TransformQ {
  return {
    position,
    rotation: quatFromYaw(yawRad),
  };
}

/**
 * Create transform from Euler angles (for compatibility)
 */
export function makeTransformEuler(position: Vec3, euler: Vec3): TransformQ {
  return {
    position,
    rotation: quatFromEuler(euler),
  };
}

// ============================================
// COORDINATE TRANSFORMS
// ============================================

/**
 * Transform local point to world space
 */
export function localToWorldPoint(t: TransformQ, pLocal: Vec3): Vec3 {
  const { axisX, axisY, axisZ } = axesFromQuat(t.rotation);

  // pWorld = position + axisX * pLocal.x + axisY * pLocal.y + axisZ * pLocal.z
  return {
    x: t.position.x + axisX.x * pLocal.x + axisY.x * pLocal.y + axisZ.x * pLocal.z,
    y: t.position.y + axisX.y * pLocal.x + axisY.y * pLocal.y + axisZ.y * pLocal.z,
    z: t.position.z + axisX.z * pLocal.x + axisY.z * pLocal.y + axisZ.z * pLocal.z,
  };
}

/**
 * Transform world point to local space
 */
export function worldToLocalPoint(t: TransformQ, pWorld: Vec3): Vec3 {
  // Translate relative to origin
  const rel: Vec3 = {
    x: pWorld.x - t.position.x,
    y: pWorld.y - t.position.y,
    z: pWorld.z - t.position.z,
  };

  const { axisX, axisY, axisZ } = axesFromQuat(t.rotation);

  // Project onto local axes (axes are orthonormal, so dot product gives component)
  return {
    x: rel.x * axisX.x + rel.y * axisX.y + rel.z * axisX.z,
    y: rel.x * axisY.x + rel.y * axisY.y + rel.z * axisY.z,
    z: rel.x * axisZ.x + rel.y * axisZ.y + rel.z * axisZ.z,
  };
}

/**
 * Transform local direction to world space
 */
export function localToWorldDir(t: TransformQ, dirLocal: Vec3): Vec3 {
  return quatRotateVec3(t.rotation, dirLocal);
}

/**
 * Transform world direction to local space
 */
export function worldToLocalDir(t: TransformQ, dirWorld: Vec3): Vec3 {
  // Inverse rotation = conjugate for unit quaternion
  const { axisX, axisY, axisZ } = axesFromQuat(t.rotation);

  return {
    x: dirWorld.x * axisX.x + dirWorld.y * axisX.y + dirWorld.z * axisX.z,
    y: dirWorld.x * axisY.x + dirWorld.y * axisY.y + dirWorld.z * axisY.z,
    z: dirWorld.x * axisZ.x + dirWorld.y * axisZ.y + dirWorld.z * axisZ.z,
  };
}

// ============================================
// AXES
// ============================================

/**
 * Get cabinet axes in world space
 */
export function getCabinetAxes(t: TransformQ): CabinetAxes {
  return axesFromQuat(t.rotation);
}

// ============================================
// TRANSFORM OPERATIONS
// ============================================

/**
 * Translate transform by delta
 */
export function translateTransform(t: TransformQ, delta: Vec3): TransformQ {
  return {
    position: {
      x: t.position.x + delta.x,
      y: t.position.y + delta.y,
      z: t.position.z + delta.z,
    },
    rotation: t.rotation,
  };
}

/**
 * Rotate transform by additional rotation
 */
export function rotateTransform(t: TransformQ, additionalRotation: Quat): TransformQ {
  return {
    position: t.position,
    rotation: quatMul(additionalRotation, t.rotation),
  };
}

/**
 * Compose two transforms (child relative to parent)
 */
export function composeTransforms(parent: TransformQ, child: TransformQ): TransformQ {
  return {
    position: localToWorldPoint(parent, child.position),
    rotation: quatMul(parent.rotation, child.rotation),
  };
}

// ============================================
// COMPATIBILITY
// ============================================

/**
 * Convert corner position to center position
 * (Cabinet store uses corner, collision uses center)
 */
export function cornerToCenter(
  corner: Vec3,
  dimensions: { width: number; height: number; depth: number }
): Vec3 {
  return {
    x: corner.x + dimensions.width / 2,
    y: corner.y + dimensions.height / 2,
    z: corner.z + dimensions.depth / 2,
  };
}

/**
 * Convert center position to corner position
 */
export function centerToCorner(
  center: Vec3,
  dimensions: { width: number; height: number; depth: number }
): Vec3 {
  return {
    x: center.x - dimensions.width / 2,
    y: center.y - dimensions.height / 2,
    z: center.z - dimensions.depth / 2,
  };
}
