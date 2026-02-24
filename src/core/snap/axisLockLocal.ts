/**
 * axisLockLocal.ts - Axis Lock in Cabinet's Local Frame
 *
 * ARCHITECTURE:
 * - Locks movement along cabinet's own axes (not world)
 * - Works correctly even when cabinet is rotated
 * - Uses quaternion-derived axes
 *
 * ALGORITHM:
 * 1. Project world delta onto cabinet axes (world → local)
 * 2. Zero out components that aren't locked
 * 3. Reconstruct world delta from remaining component (local → world)
 *
 * EXAMPLE:
 * - Cabinet rotated 45° around Y
 * - Lock = X (cabinet's X axis)
 * - Drag gets constrained to cabinet's "left-right" direction
 * - Not world X (which would be diagonal relative to cabinet)
 */

import type { Vec3 } from '../types/SnapTypes';
import { dot, scale, add } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * Axis lock enum
 */
export type AxisLock = 'NONE' | 'X' | 'Y' | 'Z';

/**
 * Cabinet axes in world space
 */
export interface CabinetAxes {
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
}

// ============================================
// LOCAL AXIS LOCK
// ============================================

/**
 * Apply axis lock in cabinet's local frame
 *
 * @param deltaWorld - Free drag delta in world space
 * @param lock - Which cabinet axis to lock to
 * @param axes - Cabinet axes in world space (from quaternion)
 * @returns Constrained delta in world space
 */
export function applyAxisLockLocal(
  deltaWorld: Vec3,
  lock: AxisLock,
  axes: CabinetAxes
): Vec3 {
  // No lock: return original delta
  if (lock === 'NONE') return deltaWorld;

  // Project world delta onto each cabinet axis
  const dx = dot(deltaWorld, axes.axisX);
  const dy = dot(deltaWorld, axes.axisY);
  const dz = dot(deltaWorld, axes.axisZ);

  // Keep only the locked axis component
  let lx = 0, ly = 0, lz = 0;
  switch (lock) {
    case 'X':
      lx = dx;
      break;
    case 'Y':
      ly = dy;
      break;
    case 'Z':
      lz = dz;
      break;
  }

  // Reconstruct world delta from local component
  // deltaWorldLocked = axisX * lx + axisY * ly + axisZ * lz
  const componentX = scale(axes.axisX, lx);
  const componentY = scale(axes.axisY, ly);
  const componentZ = scale(axes.axisZ, lz);

  return add(add(componentX, componentY), componentZ);
}

// ============================================
// WORLD AXIS LOCK (for comparison)
// ============================================

/**
 * Apply axis lock in world frame
 * Simpler but doesn't account for cabinet rotation
 */
export function applyAxisLockWorld(deltaWorld: Vec3, lock: AxisLock): Vec3 {
  switch (lock) {
    case 'NONE':
      return deltaWorld;
    case 'X':
      return { x: deltaWorld.x, y: 0, z: 0 };
    case 'Y':
      return { x: 0, y: deltaWorld.y, z: 0 };
    case 'Z':
      return { x: 0, y: 0, z: deltaWorld.z };
  }
}

// ============================================
// MULTI-AXIS LOCK
// ============================================

/**
 * Multi-axis lock (lock to plane instead of line)
 * E.g., lock to XZ plane (floor plane)
 */
export type PlaneAxisLock = 'NONE' | 'XY' | 'XZ' | 'YZ';

/**
 * Apply plane lock in cabinet's local frame
 * Constrains movement to a plane
 */
export function applyPlaneAxisLockLocal(
  deltaWorld: Vec3,
  planeLock: PlaneAxisLock,
  axes: CabinetAxes
): Vec3 {
  if (planeLock === 'NONE') return deltaWorld;

  // Project world delta onto each cabinet axis
  const dx = dot(deltaWorld, axes.axisX);
  const dy = dot(deltaWorld, axes.axisY);
  const dz = dot(deltaWorld, axes.axisZ);

  // Keep components based on plane
  let lx = 0, ly = 0, lz = 0;
  switch (planeLock) {
    case 'XY':
      lx = dx;
      ly = dy;
      break;
    case 'XZ':
      lx = dx;
      lz = dz;
      break;
    case 'YZ':
      ly = dy;
      lz = dz;
      break;
  }

  // Reconstruct world delta
  const componentX = scale(axes.axisX, lx);
  const componentY = scale(axes.axisY, ly);
  const componentZ = scale(axes.axisZ, lz);

  return add(add(componentX, componentY), componentZ);
}

// ============================================
// UTILITY: GET AXES FROM QUATERNION
// ============================================

import { axesFromQuat, type Quat } from '../math/quaternion';

/**
 * Get cabinet axes from rotation quaternion
 */
export function getCabinetAxesFromRotation(rotation: Quat): CabinetAxes {
  return axesFromQuat(rotation);
}

// ============================================
// DEFAULT WORLD AXES
// ============================================

/**
 * World axes (identity rotation)
 */
export const WORLD_AXES: CabinetAxes = {
  axisX: { x: 1, y: 0, z: 0 },
  axisY: { x: 0, y: 1, z: 0 },
  axisZ: { x: 0, y: 0, z: 1 },
};
