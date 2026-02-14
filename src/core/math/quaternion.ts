/**
 * quaternion.ts - Quaternion Math Utilities
 *
 * FEATURES:
 * - Quaternion operations (multiply, normalize, rotate vector)
 * - Convert axis-angle to quaternion
 * - Extract world axes from quaternion
 *
 * WHY QUATERNION:
 * - No gimbal lock
 * - Smooth interpolation (SLERP)
 * - Accurate OBB generation for rotated cabinets
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// TYPES
// ============================================

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Identity quaternion (no rotation) */
export const QUAT_IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

// ============================================
// BASIC OPERATIONS
// ============================================

/**
 * Normalize quaternion to unit length
 */
export function quatNormalize(q: Quat): Quat {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) + 1e-9;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/**
 * Quaternion multiplication (Hamilton product)
 * Result = a * b (apply b rotation first, then a)
 */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/**
 * Quaternion conjugate (inverse for unit quaternion)
 */
export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/**
 * Dot product of two quaternions
 */
export function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

// ============================================
// CONVERSION
// ============================================

/**
 * Create quaternion from axis-angle representation
 *
 * @param axis - Rotation axis (will be normalized)
 * @param angleRad - Rotation angle in radians
 */
export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  // Normalize axis
  const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z) + 1e-9;
  const ax = axis.x / len;
  const ay = axis.y / len;
  const az = axis.z / len;

  const halfAngle = angleRad / 2;
  const s = Math.sin(halfAngle);
  const c = Math.cos(halfAngle);

  return quatNormalize({ x: ax * s, y: ay * s, z: az * s, w: c });
}

/**
 * Create quaternion from Euler angles (XYZ order)
 *
 * @param euler - Euler angles in radians { x: pitch, y: yaw, z: roll }
 */
export function quatFromEuler(euler: Vec3): Quat {
  const cx = Math.cos(euler.x / 2);
  const sx = Math.sin(euler.x / 2);
  const cy = Math.cos(euler.y / 2);
  const sy = Math.sin(euler.y / 2);
  const cz = Math.cos(euler.z / 2);
  const sz = Math.sin(euler.z / 2);

  // XYZ order
  return quatNormalize({
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  });
}

/**
 * Create quaternion for Y-axis rotation only (common for cabinets)
 *
 * @param yawRad - Rotation around Y axis in radians
 */
export function quatFromYaw(yawRad: number): Quat {
  const halfAngle = yawRad / 2;
  return quatNormalize({
    x: 0,
    y: Math.sin(halfAngle),
    z: 0,
    w: Math.cos(halfAngle),
  });
}

/**
 * Extract Euler angles from quaternion (XYZ order)
 */
export function quatToEuler(q: Quat): Vec3 {
  const qn = quatNormalize(q);

  // Roll (X)
  const sinr = 2 * (qn.w * qn.x + qn.y * qn.z);
  const cosr = 1 - 2 * (qn.x * qn.x + qn.y * qn.y);
  const roll = Math.atan2(sinr, cosr);

  // Pitch (Y)
  const sinp = 2 * (qn.w * qn.y - qn.z * qn.x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2; // Gimbal lock
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (Z)
  const siny = 2 * (qn.w * qn.z + qn.x * qn.y);
  const cosy = 1 - 2 * (qn.y * qn.y + qn.z * qn.z);
  const yaw = Math.atan2(siny, cosy);

  return { x: roll, y: pitch, z: yaw };
}

// ============================================
// VECTOR ROTATION
// ============================================

/**
 * Rotate a vector by quaternion
 *
 * Uses optimized formula: v' = v + 2w(q × v) + 2(q × (q × v))
 * where q = quaternion xyz components
 */
export function quatRotateVec3(qIn: Quat, v: Vec3): Vec3 {
  const q = quatNormalize(qIn);
  const { x: vx, y: vy, z: vz } = v;
  const { x: qx, y: qy, z: qz, w: qw } = q;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v' = v + qw*t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

// ============================================
// AXES EXTRACTION
// ============================================

/**
 * Extract world axes from quaternion (right-handed coordinate system)
 *
 * @returns axisX = rotated (1,0,0), axisY = rotated (0,1,0), axisZ = rotated (0,0,1)
 */
export function axesFromQuat(q: Quat): {
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
} {
  return {
    axisX: quatRotateVec3(q, { x: 1, y: 0, z: 0 }),
    axisY: quatRotateVec3(q, { x: 0, y: 1, z: 0 }),
    axisZ: quatRotateVec3(q, { x: 0, y: 0, z: 1 }),
  };
}

/**
 * Create rotation matrix columns from quaternion
 * Useful for Three.js Matrix4 integration
 */
export function quatToMatrix3Columns(q: Quat): [Vec3, Vec3, Vec3] {
  const { axisX, axisY, axisZ } = axesFromQuat(q);
  return [axisX, axisY, axisZ];
}

// ============================================
// INTERPOLATION
// ============================================

/**
 * Spherical linear interpolation (SLERP)
 *
 * @param a - Start quaternion
 * @param b - End quaternion
 * @param t - Interpolation factor (0..1)
 */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cosHalfTheta = quatDot(a, b);

  // If negative dot, negate one quaternion (shortest path)
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  // If quaternions are very close, use linear interpolation
  if (cosHalfTheta > 0.9999) {
    return quatNormalize({
      x: a.x + t * (bx - a.x),
      y: a.y + t * (by - a.y),
      z: a.z + t * (bz - a.z),
      w: a.w + t * (bw - a.w),
    });
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return quatNormalize({
    x: a.x * ratioA + bx * ratioB,
    y: a.y * ratioA + by * ratioB,
    z: a.z * ratioA + bz * ratioB,
    w: a.w * ratioA + bw * ratioB,
  });
}
