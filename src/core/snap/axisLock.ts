/**
 * axisLock.ts - Axis Lock for Constrained Dragging
 *
 * ARCHITECTURE:
 * - Constrains drag delta to single axis
 * - Reduces jitter during snap engagement
 * - Supports world axes and local (cabinet) axes
 *
 * USAGE:
 * 1. User starts dragging
 * 2. Snap zone entered → axis lock engaged
 * 3. Drag delta filtered to locked axis only
 * 4. Snap zone exited → axis lock released
 */

import type { Vec3 } from '../types/SnapTypes';
import { dot } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * Axis lock state
 */
export type AxisLock = 'NONE' | 'X' | 'Y' | 'Z';

/**
 * Cabinet axes in world space (from quaternion)
 */
export interface CabinetAxes {
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
}

// ============================================
// WORLD AXIS LOCK
// ============================================

/**
 * Apply axis lock to delta (world axes)
 *
 * @param delta - Free drag delta
 * @param lock - Axis to lock to
 * @returns Constrained delta
 */
export function applyAxisLock(delta: Vec3, lock: AxisLock): Vec3 {
  switch (lock) {
    case 'NONE':
      return delta;
    case 'X':
      return { x: delta.x, y: 0, z: 0 };
    case 'Y':
      return { x: 0, y: delta.y, z: 0 };
    case 'Z':
      return { x: 0, y: 0, z: delta.z };
  }
}

// ============================================
// LOCAL AXIS LOCK (Cabinet Frame)
// ============================================

/**
 * Apply axis lock in cabinet's local frame
 *
 * @param delta - Free drag delta (world space)
 * @param lock - Axis to lock to (in cabinet frame)
 * @param axes - Cabinet axes in world space
 * @returns Constrained delta (world space)
 */
export function applyLocalAxisLock(
  delta: Vec3,
  lock: AxisLock,
  axes: CabinetAxes
): Vec3 {
  if (lock === 'NONE') return delta;

  // Project delta onto locked axis
  let axis: Vec3;
  switch (lock) {
    case 'X':
      axis = axes.axisX;
      break;
    case 'Y':
      axis = axes.axisY;
      break;
    case 'Z':
      axis = axes.axisZ;
      break;
  }

  // Component along locked axis
  const component = dot(delta, axis);

  // Return delta along that axis only
  return {
    x: axis.x * component,
    y: axis.y * component,
    z: axis.z * component,
  };
}

// ============================================
// AXIS LOCK SELECTION
// ============================================

/**
 * Choose axis lock from intent axis hint
 */
export function axisLockFromHint(hint: 'X' | 'Y' | 'Z' | 'NONE'): AxisLock {
  return hint;
}

/**
 * Choose axis lock from velocity (dominant axis)
 */
export function axisLockFromVelocity(velocity: Vec3): AxisLock {
  const ax = Math.abs(velocity.x);
  const ay = Math.abs(velocity.y);
  const az = Math.abs(velocity.z);

  const max = Math.max(ax, ay, az);
  if (max < 1e-6) return 'NONE';

  if (ax === max) return 'X';
  if (ay === max) return 'Y';
  return 'Z';
}

// ============================================
// AXIS LOCK STATE MACHINE
// ============================================

export interface AxisLockState {
  /** Current lock */
  lock: AxisLock;

  /** When lock was set (for debouncing) */
  lockedAtMs: number;

  /** Whether currently engaged */
  engaged: boolean;
}

/**
 * Create initial axis lock state
 */
export function createAxisLockState(): AxisLockState {
  return {
    lock: 'NONE',
    lockedAtMs: 0,
    engaged: false,
  };
}

/**
 * Update axis lock state
 */
export function updateAxisLockState(
  state: AxisLockState,
  shouldEngage: boolean,
  axisHint: AxisLock,
  nowMs: number,
  minLockDurationMs: number = 100
): AxisLockState {
  // Disengage
  if (!shouldEngage) {
    return {
      lock: 'NONE',
      lockedAtMs: 0,
      engaged: false,
    };
  }

  // Already engaged: keep current lock (sticky)
  if (state.engaged) {
    // Only change lock if held long enough
    const elapsed = nowMs - state.lockedAtMs;
    if (elapsed < minLockDurationMs) {
      return state;
    }

    // Allow lock change if hint differs significantly
    if (axisHint !== 'NONE' && axisHint !== state.lock) {
      return {
        lock: axisHint,
        lockedAtMs: nowMs,
        engaged: true,
      };
    }

    return state;
  }

  // Engage with hint
  return {
    lock: axisHint,
    lockedAtMs: nowMs,
    engaged: true,
  };
}
