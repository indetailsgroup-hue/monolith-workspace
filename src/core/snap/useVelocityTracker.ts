/**
 * useVelocityTracker.ts - Track drag velocity for snap intent
 *
 * FEATURES:
 * - Exponential Moving Average (EMA) smoothing
 * - Configurable sample window
 * - Outputs velocity in mm/s
 *
 * @version 1.0.0
 */

import { useRef, useCallback } from 'react';
import type { Vec3 } from '../types/SnapTypes';
import { sub, scale, len } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

export interface VelocityTrackerConfig {
  /** EMA smoothing factor (0-1). Higher = more responsive, lower = smoother */
  smoothingFactor: number;
  /** Minimum time between samples (ms) */
  minSampleInterval: number;
  /** Maximum velocity magnitude (mm/s) - clamp to prevent outliers */
  maxVelocity: number;
}

export interface VelocityTrackerState {
  /** Last position (mm) */
  lastPosition: Vec3 | null;
  /** Last timestamp (ms) */
  lastTimestamp: number | null;
  /** Current smoothed velocity (mm/s) */
  velocity: Vec3;
  /** Current speed magnitude (mm/s) */
  speed: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_VELOCITY_CONFIG: VelocityTrackerConfig = {
  smoothingFactor: 0.3, // Moderate smoothing
  minSampleInterval: 16, // ~60fps
  maxVelocity: 5000, // 5000mm/s max (very fast drag)
};

// ============================================
// HOOK
// ============================================

/**
 * Hook to track drag velocity
 *
 * Usage:
 * ```tsx
 * const tracker = useVelocityTracker();
 *
 * function onDrag(position: Vec3) {
 *   const velocity = tracker.update(position);
 *   // Use velocity for snap intent
 * }
 *
 * function onDragEnd() {
 *   tracker.reset();
 * }
 * ```
 */
export function useVelocityTracker(config: Partial<VelocityTrackerConfig> = {}) {
  const cfg: VelocityTrackerConfig = { ...DEFAULT_VELOCITY_CONFIG, ...config };

  const stateRef = useRef<VelocityTrackerState>({
    lastPosition: null,
    lastTimestamp: null,
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
  });

  /**
   * Update tracker with new position
   * @param positionMm Current position in mm
   * @returns Current velocity in mm/s
   */
  const update = useCallback((positionMm: Vec3): Vec3 => {
    const now = performance.now();
    const state = stateRef.current;

    // First sample: just store position
    if (state.lastPosition === null || state.lastTimestamp === null) {
      state.lastPosition = { ...positionMm };
      state.lastTimestamp = now;
      return state.velocity;
    }

    // Calculate time delta
    const dtMs = now - state.lastTimestamp;

    // Skip if too soon (prevents divide-by-zero and noise)
    if (dtMs < cfg.minSampleInterval) {
      return state.velocity;
    }

    // Calculate instantaneous velocity (mm/s)
    const dtSec = dtMs / 1000;
    const delta = sub(positionMm, state.lastPosition);
    let instantVelocity = scale(delta, 1 / dtSec);

    // Clamp magnitude
    const instantSpeed = len(instantVelocity);
    if (instantSpeed > cfg.maxVelocity) {
      instantVelocity = scale(instantVelocity, cfg.maxVelocity / instantSpeed);
    }

    // Apply EMA smoothing
    const a = cfg.smoothingFactor;
    state.velocity = {
      x: a * instantVelocity.x + (1 - a) * state.velocity.x,
      y: a * instantVelocity.y + (1 - a) * state.velocity.y,
      z: a * instantVelocity.z + (1 - a) * state.velocity.z,
    };
    state.speed = len(state.velocity);

    // Update last position/time
    state.lastPosition = { ...positionMm };
    state.lastTimestamp = now;

    return state.velocity;
  }, [cfg.smoothingFactor, cfg.minSampleInterval, cfg.maxVelocity]);

  /**
   * Reset tracker (call on drag end)
   */
  const reset = useCallback(() => {
    stateRef.current = {
      lastPosition: null,
      lastTimestamp: null,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
    };
  }, []);

  /**
   * Get current velocity without updating
   */
  const getVelocity = useCallback((): Vec3 => {
    return { ...stateRef.current.velocity };
  }, []);

  /**
   * Get current speed without updating
   */
  const getSpeed = useCallback((): number => {
    return stateRef.current.speed;
  }, []);

  return {
    update,
    reset,
    getVelocity,
    getSpeed,
    /** Direct access to state (for debugging) */
    state: stateRef,
  };
}

// ============================================
// UTILITY: Convert array position to Vec3
// ============================================

export function arrayToVec3(arr: [number, number, number]): Vec3 {
  return { x: arr[0], y: arr[1], z: arr[2] };
}

export function vec3ToArray(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z];
}
