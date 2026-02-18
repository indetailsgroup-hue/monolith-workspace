/**
 * placeMeshByDrillPoint.ts — Anchor-based hardware mesh placement
 *
 * Pure math utility (no Three.js dependency) that computes world
 * position and rotation for a hardware mesh given:
 * - A DrillMap point (position + normal in world space)
 * - An AnchorSpec (localAxis + localAnchor in model space)
 *
 * Algorithm:
 * 1. Compute quaternion q = rotation from localAxis → drillNormal
 * 2. Rotate localAnchor by q to get anchorInWorld
 * 3. worldPos = drillPosition - anchorInWorld
 * 4. Convert quaternion to Euler angles
 *
 * This produces a placement where:
 * - The mesh's localAxis direction aligns with the drill normal
 * - The mesh's localAnchor point sits exactly at the drill position
 *
 * @version 1.0.0
 */

import type { AnchorSpec, PlacementResult, Vec3Tuple } from './anchorTypes';

// ============================================================================
// Vector Math (pure, no Three.js)
// ============================================================================

/** Dot product of two Vec3Tuples */
function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Cross product of two Vec3Tuples */
function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Length of a Vec3Tuple */
function length(v: Vec3Tuple): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/** Normalize a Vec3Tuple. Returns [0,1,0] for zero-length vectors. */
function normalize(v: Vec3Tuple): Vec3Tuple {
  const len = length(v);
  if (len < 1e-10) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Subtract: a - b */
function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

// ============================================================================
// Quaternion Math (pure, [x, y, z, w] convention)
// ============================================================================

type Quat4 = [number, number, number, number]; // [x, y, z, w]

/** Identity quaternion */
const QUAT_IDENTITY: Quat4 = [0, 0, 0, 1];

/**
 * Compute quaternion that rotates unit vector `from` to unit vector `to`.
 *
 * Uses the half-angle formula:
 *   q = [cross(from, to), dot(from, to) + 1], then normalize
 *
 * Special cases:
 * - Parallel vectors (from ≈ to): identity quaternion
 * - Anti-parallel vectors (from ≈ -to): 180° rotation around perpendicular axis
 */
function quatFromUnitVectors(from: Vec3Tuple, to: Vec3Tuple): Quat4 {
  const d = dot(from, to);

  // Nearly parallel — identity
  if (d >= 1.0 - 1e-8) {
    return QUAT_IDENTITY;
  }

  // Nearly anti-parallel — 180° rotation
  if (d <= -1.0 + 1e-8) {
    // Find perpendicular axis
    let perp: Vec3Tuple = cross(from, [1, 0, 0]);
    if (length(perp) < 1e-6) {
      perp = cross(from, [0, 1, 0]);
    }
    perp = normalize(perp);
    // 180° rotation: q = [axis, 0]
    return [perp[0], perp[1], perp[2], 0];
  }

  // General case: half-angle formula
  const c = cross(from, to);
  const w = d + 1;
  const invLen = 1 / Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2] + w * w);
  return [c[0] * invLen, c[1] * invLen, c[2] * invLen, w * invLen];
}

/**
 * Rotate a Vec3Tuple by a quaternion.
 *
 * Uses: v' = q * v * q^-1
 * Expanded without creating intermediate quaternions.
 */
function rotateByQuat(v: Vec3Tuple, q: Quat4): Vec3Tuple {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // result = v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * Convert quaternion to Euler angles (XYZ intrinsic order).
 *
 * Matches Three.js default Euler order ('XYZ').
 * Returns [rx, ry, rz] in radians.
 */
function quatToEulerXYZ(q: Quat4): Vec3Tuple {
  const [x, y, z, w] = q;

  // Rotation matrix elements
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m21 = 2 * (x * y + z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  // const m31 = 2 * (x * z - y * w); // not needed
  // const m32 = 2 * (y * z + x * w); // not needed
  const m33 = 1 - 2 * (x * x + y * y);

  // Extract Euler angles (XYZ order)
  const ry = Math.asin(clamp(m13, -1, 1));

  let rx: number;
  let rz: number;

  if (Math.abs(m13) < 0.9999999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    // Gimbal lock
    rx = Math.atan2(m21, m22);
    rz = 0;
  }

  return [rx, ry, rz];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Main Placement Function
// ============================================================================

/**
 * Compute world position and rotation for a hardware mesh
 * given a DrillMap point and an AnchorSpec.
 *
 * @param drillPosition - World position of the drill point
 * @param drillNormal   - Drill direction (unit vector, INTO material)
 * @param anchor        - AnchorSpec for the hardware part
 * @returns PlacementResult with worldPos and worldEuler
 *
 * @example
 * ```typescript
 * import { DEFAULT_MINIFIX_ANCHORS } from '../manufacturing/hardware/anchors/minifixAnchors';
 *
 * const result = placeMeshByDrillPoint(
 *   camPoint.position,     // [100, 400, 37]
 *   camPoint.normal,       // [1, 0, 0] (into left side panel)
 *   DEFAULT_MINIFIX_ANCHORS.cam,
 * );
 *
 * // Apply to Three.js mesh:
 * // meshRef.current.position.set(...result.worldPos);
 * // meshRef.current.rotation.set(...result.worldEuler);
 * ```
 */
export function placeMeshByDrillPoint(
  drillPosition: Vec3Tuple,
  drillNormal: Vec3Tuple,
  anchor: AnchorSpec,
): PlacementResult {
  // 1. Normalize inputs
  const normalDir = normalize(drillNormal);
  const localDir = normalize(anchor.localAxis);

  // 2. Compute quaternion: localAxis → drillNormal
  const quat = quatFromUnitVectors(localDir, normalDir);

  // 3. Rotate localAnchor by the quaternion
  const anchorRotated = rotateByQuat(anchor.localAnchor, quat);

  // 4. worldPos = drillPosition - rotatedAnchor
  //    (we want the anchor point to land at drillPosition)
  const worldPos = sub(drillPosition, anchorRotated);

  // 5. Convert quaternion to Euler
  const worldEuler = quatToEulerXYZ(quat);

  return { worldPos, worldEuler };
}

// ============================================================================
// Quaternion-based Placement (for Three.js direct quaternion use)
// ============================================================================

/**
 * Same as placeMeshByDrillPoint but returns quaternion [x,y,z,w]
 * instead of Euler angles.
 *
 * Use this when applying to Three.js mesh.quaternion directly
 * (avoids Euler→Quaternion re-conversion).
 */
export interface PlacementResultQuat {
  worldPos: Vec3Tuple;
  worldQuat: Quat4;
}

export function placeMeshByDrillPointQuat(
  drillPosition: Vec3Tuple,
  drillNormal: Vec3Tuple,
  anchor: AnchorSpec,
): PlacementResultQuat {
  const normalDir = normalize(drillNormal);
  const localDir = normalize(anchor.localAxis);

  const quat = quatFromUnitVectors(localDir, normalDir);
  const anchorRotated = rotateByQuat(anchor.localAnchor, quat);
  const worldPos = sub(drillPosition, anchorRotated);

  return { worldPos, worldQuat: quat };
}

// ============================================================================
// Exports (for testing internal math)
// ============================================================================

/** @internal Exported for unit testing only */
export const _internals = {
  quatFromUnitVectors,
  rotateByQuat,
  quatToEulerXYZ,
  dot,
  cross,
  normalize,
  length,
} as const;

export type { Quat4 };
