/**
 * localVelocity.ts - Transform Velocity to Cabinet Local Frame
 *
 * ARCHITECTURE:
 * - Converts world velocity to cabinet's local coordinate frame
 * - Uses cabinet axes from quaternion rotation
 * - Enables accurate intent detection for rotated cabinets
 *
 * WHY LOCAL VELOCITY:
 * - If cabinet is rotated 45°, "left-right" is not world X
 * - Local velocity gives us movement relative to cabinet orientation
 * - SIDE_JOIN intent works correctly even when cabinet is rotated
 */

import type { Vec3 } from '../types/SnapTypes';
import { dot } from '../math/vec3Utils';
import type { CabinetAxes } from './axisLock';

// ============================================
// VELOCITY TRANSFORMATION
// ============================================

/**
 * Transform world velocity to cabinet local frame
 *
 * @param vWorld - Velocity in world space (mm/s)
 * @param axes - Cabinet axes in world space
 * @returns Velocity in cabinet local space
 */
export function worldToLocalVelocity(vWorld: Vec3, axes: CabinetAxes): Vec3 {
  // Project world velocity onto each cabinet axis
  return {
    x: dot(vWorld, axes.axisX),
    y: dot(vWorld, axes.axisY),
    z: dot(vWorld, axes.axisZ),
  };
}

/**
 * Transform local velocity back to world frame
 *
 * @param vLocal - Velocity in cabinet local space
 * @param axes - Cabinet axes in world space
 * @returns Velocity in world space
 */
export function localToWorldVelocity(vLocal: Vec3, axes: CabinetAxes): Vec3 {
  // Combine local components along world-space axes
  return {
    x: vLocal.x * axes.axisX.x + vLocal.y * axes.axisY.x + vLocal.z * axes.axisZ.x,
    y: vLocal.x * axes.axisX.y + vLocal.y * axes.axisY.y + vLocal.z * axes.axisZ.y,
    z: vLocal.x * axes.axisX.z + vLocal.y * axes.axisY.z + vLocal.z * axes.axisZ.z,
  };
}

// ============================================
// LOCAL INTENT RESOLVER
// ============================================

import type { DragKinematics, IntentWeights, SnapIntentResult } from './intentTypes';
import { resolveSnapIntent } from './intentResolver';

/**
 * Resolve snap intent using cabinet's local axes
 *
 * @param velocityWorld - World velocity
 * @param speed - Speed magnitude
 * @param axesB - Target cabinet's axes
 * @param weights - Intent weights
 * @returns Intent result in cabinet's frame
 */
export function resolveSnapIntentLocal(args: {
  velocityWorld: Vec3;
  speed: number;
  axesB: CabinetAxes;
  weights: IntentWeights;
}): SnapIntentResult {
  // Transform velocity to cabinet B's local frame
  const vLocal = worldToLocalVelocity(args.velocityWorld, args.axesB);

  // Resolve intent using local velocity
  // The resolver interprets X/Y/Z as cabinet-relative now
  const kinematics: DragKinematics = {
    velocityWorld: vLocal, // Actually local, but resolver treats as "velocity"
    speed: args.speed,
  };

  return resolveSnapIntent(kinematics, args.weights);
}

// ============================================
// UTILITY: GET CABINET AXES
// ============================================

import { axesFromQuat, quatFromEuler, type Quat } from '../math/quaternion';

/**
 * Get cabinet axes from quaternion rotation
 */
export function getCabinetAxesFromQuat(rotation: Quat): CabinetAxes {
  return axesFromQuat(rotation);
}

/**
 * Get cabinet axes from Euler rotation
 */
export function getCabinetAxesFromEuler(euler: Vec3): CabinetAxes {
  // Convert Euler to quaternion first
  const quat = quatFromEuler(euler);
  return axesFromQuat(quat);
}

// ============================================
// DEFAULT WORLD AXES
// ============================================

/**
 * Default world axes (identity rotation)
 */
export const WORLD_AXES: CabinetAxes = {
  axisX: { x: 1, y: 0, z: 0 },
  axisY: { x: 0, y: 1, z: 0 },
  axisZ: { x: 0, y: 0, z: 1 },
};
