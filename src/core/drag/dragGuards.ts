/**
 * dragGuards.ts - Edge Case Guards for Drag Operations
 *
 * PURPOSE:
 * - Detect and handle abnormal drag conditions
 * - Prevent wild behavior from frame hitches, tab switches, teleports
 * - Maintain deterministic behavior under edge cases
 *
 * GUARDS:
 * 1. shouldResetDrag - Large dt indicates stale data
 * 2. isTeleport - Large position jump indicates teleport
 * 3. isStalled - No movement for extended period
 * 4. isOverspeed - Unrealistic velocity
 */

import type { Vec3 } from '../types/SnapTypes';
import { sub, len } from '../math/vec3Utils';

// ============================================
// GUARD CONFIGURATION
// ============================================

export interface DragGuardConfig {
  /** Max dt before reset (seconds) - e.g., 0.2 = 200ms */
  resetDtThreshold: number;

  /** Max position jump before teleport (mm) - e.g., 1000mm */
  teleportDistanceThreshold: number;

  /** Max velocity before overspeed (mm/s) - e.g., 5000 mm/s */
  overspeedThreshold: number;

  /** Min time without movement before stall (seconds) - e.g., 0.5 = 500ms */
  stallTimeThreshold: number;

  /** Min movement distance to not be stalled (mm) - e.g., 0.5mm */
  stallDistanceThreshold: number;
}

export const DEFAULT_DRAG_GUARDS: DragGuardConfig = {
  resetDtThreshold: 0.2,
  teleportDistanceThreshold: 1000,
  overspeedThreshold: 5000,
  stallTimeThreshold: 0.5,
  stallDistanceThreshold: 0.5,
} as const;

// ============================================
// GUARD CHECKS
// ============================================

/**
 * Check if drag should be reset due to large dt
 *
 * Triggers when:
 * - Tab was switched and came back
 * - Browser throttled the tab
 * - Major frame hitch occurred
 *
 * Action: Reset velocity and fixed-step states
 */
export function shouldResetDrag(
  dtSec: number,
  cfg: DragGuardConfig = DEFAULT_DRAG_GUARDS
): boolean {
  return dtSec > cfg.resetDtThreshold;
}

/**
 * Check if position change is a teleport (not physical drag)
 *
 * Triggers when:
 * - Pointer warped to new location
 * - Touch jumped to different finger
 * - Window was resized/moved
 *
 * Action: Don't create deltas, just update position
 */
export function isTeleport(
  prevPos: Vec3,
  nextPos: Vec3,
  cfg: DragGuardConfig = DEFAULT_DRAG_GUARDS
): boolean {
  const dist = len(sub(nextPos, prevPos));
  return dist > cfg.teleportDistanceThreshold;
}

/**
 * Check if velocity is unrealistically high
 *
 * Triggers when:
 * - Calculation error
 * - Invalid dt
 * - Noise in position data
 *
 * Action: Clamp velocity or skip update
 */
export function isOverspeed(
  velocity: Vec3,
  cfg: DragGuardConfig = DEFAULT_DRAG_GUARDS
): boolean {
  return len(velocity) > cfg.overspeedThreshold;
}

// ============================================
// STALL DETECTION
// ============================================

export interface StallState {
  /** Time since last significant movement (seconds) */
  stallTime: number;

  /** Last position where movement was detected */
  lastMovementPos: Vec3 | null;

  /** Whether currently stalled */
  isStalled: boolean;
}

export function createStallState(): StallState {
  return {
    stallTime: 0,
    lastMovementPos: null,
    isStalled: false,
  };
}

/**
 * Update stall detection state
 */
export function updateStallState(
  st: StallState,
  currentPos: Vec3,
  dtSec: number,
  cfg: DragGuardConfig = DEFAULT_DRAG_GUARDS
): StallState {
  // First update: initialize
  if (!st.lastMovementPos) {
    return {
      stallTime: 0,
      lastMovementPos: currentPos,
      isStalled: false,
    };
  }

  const dist = len(sub(currentPos, st.lastMovementPos));

  if (dist >= cfg.stallDistanceThreshold) {
    // Movement detected: reset stall timer
    return {
      stallTime: 0,
      lastMovementPos: currentPos,
      isStalled: false,
    };
  }

  // No significant movement: accumulate stall time
  const newStallTime = st.stallTime + dtSec;
  const isStalled = newStallTime >= cfg.stallTimeThreshold;

  return {
    stallTime: newStallTime,
    lastMovementPos: st.lastMovementPos,
    isStalled,
  };
}

// ============================================
// COMBINED GUARD RESULT
// ============================================

export interface DragGuardResult {
  /** Should reset all drag state */
  shouldReset: boolean;

  /** Is this a teleport (don't process as drag) */
  isTeleport: boolean;

  /** Is velocity unrealistic */
  isOverspeed: boolean;

  /** Is drag stalled */
  isStalled: boolean;

  /** Should skip this frame's update */
  shouldSkip: boolean;

  /** Reason for action (for debugging) */
  reason: string | null;
}

/**
 * Run all guards and return combined result
 */
export function runDragGuards(args: {
  dtSec: number;
  prevPos: Vec3 | null;
  currentPos: Vec3;
  velocity: Vec3;
  stallState: StallState;
  cfg?: DragGuardConfig;
}): DragGuardResult {
  const { dtSec, prevPos, currentPos, velocity, stallState, cfg = DEFAULT_DRAG_GUARDS } = args;

  // Check reset
  if (shouldResetDrag(dtSec, cfg)) {
    return {
      shouldReset: true,
      isTeleport: false,
      isOverspeed: false,
      isStalled: false,
      shouldSkip: true,
      reason: `dt=${(dtSec * 1000).toFixed(0)}ms exceeds threshold`,
    };
  }

  // Check teleport
  if (prevPos && isTeleport(prevPos, currentPos, cfg)) {
    return {
      shouldReset: false,
      isTeleport: true,
      isOverspeed: false,
      isStalled: false,
      shouldSkip: true,
      reason: `teleport detected: ${len(sub(currentPos, prevPos)).toFixed(0)}mm`,
    };
  }

  // Check overspeed
  if (isOverspeed(velocity, cfg)) {
    return {
      shouldReset: false,
      isTeleport: false,
      isOverspeed: true,
      isStalled: false,
      shouldSkip: true,
      reason: `overspeed: ${len(velocity).toFixed(0)}mm/s`,
    };
  }

  // Check stall
  const isCurrentlyStalled = stallState.isStalled;

  return {
    shouldReset: false,
    isTeleport: false,
    isOverspeed: false,
    isStalled: isCurrentlyStalled,
    shouldSkip: false,
    reason: isCurrentlyStalled ? 'stalled' : null,
  };
}

// ============================================
// SAFE VELOCITY CLAMP
// ============================================

/**
 * Clamp velocity to safe range
 */
export function clampVelocity(
  velocity: Vec3,
  cfg: DragGuardConfig = DEFAULT_DRAG_GUARDS
): Vec3 {
  const speed = len(velocity);

  if (speed <= cfg.overspeedThreshold || speed === 0) {
    return velocity;
  }

  // Scale down to max speed
  const scale = cfg.overspeedThreshold / speed;
  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
    z: velocity.z * scale,
  };
}

/**
 * Clamp delta to safe range
 */
export function clampDelta(
  delta: Vec3,
  maxDist: number
): Vec3 {
  const dist = len(delta);

  if (dist <= maxDist || dist === 0) {
    return delta;
  }

  const scale = maxDist / dist;
  return {
    x: delta.x * scale,
    y: delta.y * scale,
    z: delta.z * scale,
  };
}
