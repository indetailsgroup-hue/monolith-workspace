/**
 * velocityEstimator.ts - FPS-Invariant Velocity Estimator
 *
 * PROBLEM:
 * - Different monitors have different refresh rates (60Hz, 120Hz, 144Hz)
 * - Raw velocity = delta / dt varies with frame rate
 * - This causes intent/predictive/axis-lock to behave differently
 *
 * SOLUTION:
 * - Clamp dt to prevent spikes (tab switches, frame hitches)
 * - Exponential smoothing with FPS-invariant alpha = 1 - exp(-dt/tau)
 * - Produces stable velocity regardless of frame rate
 *
 * ALGORITHM:
 * 1. Clamp dt to [dtMin, dtMax]
 * 2. Compute raw velocity = (pos - lastPos) / dt
 * 3. Compute alpha = 1 - exp(-dt/tau) (FPS-invariant)
 * 4. Apply EMA: v = v * (1 - alpha) + raw * alpha
 *
 * RESULT:
 * - 60Hz and 120Hz produce same velocity for same physical movement
 * - Smooth velocity without jitter
 * - Robust to frame hitches
 */

import type { Vec3 } from '../types/SnapTypes';
import { sub, add, scale, len } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * Velocity estimator state
 */
export interface VelocityState {
  /** Smoothed velocity (mm/s) */
  v: Vec3;

  /** Last pointer world position */
  lastPos: Vec3 | null;

  /** Last dt used (for debugging) */
  lastDt: number;

  /** Raw velocity before smoothing (for debugging) */
  rawV: Vec3;

  /** Sample count since reset */
  sampleCount: number;
}

/**
 * Velocity estimator configuration
 */
export interface VelocityConfig {
  /** Minimum dt clamp (seconds) - prevents huge velocities */
  dtMin: number;

  /** Maximum dt clamp (seconds) - prevents stale velocities */
  dtMax: number;

  /** Smoothing time constant (seconds) - higher = more smoothing */
  tau: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

/**
 * Default velocity config (tuned for cabinet dragging)
 *
 * - dtMin: 1/240 = ~4.17ms (max 240Hz input rate)
 * - dtMax: 1/20 = 50ms (min 20Hz input rate)
 * - tau: 0.05 = 50ms (smooth over ~3 frames at 60Hz)
 */
export const VELOCITY_CONFIG: VelocityConfig = {
  dtMin: 1 / 240,
  dtMax: 1 / 20,
  tau: 0.05,
} as const;

// ============================================
// LIFECYCLE
// ============================================

/**
 * Create new velocity state
 */
export function createVelocityState(): VelocityState {
  return {
    v: { x: 0, y: 0, z: 0 },
    lastPos: null,
    lastDt: 0,
    rawV: { x: 0, y: 0, z: 0 },
    sampleCount: 0,
  };
}

/**
 * Reset velocity state (on drag start)
 */
export function resetVelocityState(): VelocityState {
  return createVelocityState();
}

// ============================================
// MAIN UPDATE
// ============================================

/**
 * Clamp value to range
 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Update velocity with new position sample
 *
 * DETERMINISTIC: Same inputs → Same outputs
 *
 * @param st - Current velocity state
 * @param pointerWorldPos - Current pointer position in world space (mm)
 * @param dtSec - Time since last update (seconds)
 * @param cfg - Velocity configuration
 * @returns Updated velocity state
 */
export function updateVelocity(
  st: VelocityState,
  pointerWorldPos: Vec3,
  dtSec: number,
  cfg: VelocityConfig = VELOCITY_CONFIG
): VelocityState {
  // Clamp dt to prevent extreme velocities
  const dt = clamp(dtSec, cfg.dtMin, cfg.dtMax);

  // First sample: just store position
  if (!st.lastPos) {
    return {
      ...st,
      lastPos: pointerWorldPos,
      lastDt: dt,
      sampleCount: 1,
    };
  }

  // Compute raw velocity
  const dp = sub(pointerWorldPos, st.lastPos);
  const rawV: Vec3 = {
    x: dp.x / dt,
    y: dp.y / dt,
    z: dp.z / dt,
  };

  // FPS-invariant exponential smoothing
  // alpha = 1 - exp(-dt/tau)
  // At 60Hz (dt=16.67ms) with tau=50ms: alpha ≈ 0.28
  // At 120Hz (dt=8.33ms) with tau=50ms: alpha ≈ 0.15
  // Result: same velocity after smoothing converges
  const alpha = 1 - Math.exp(-dt / Math.max(1e-6, cfg.tau));

  // EMA: v = v * (1 - alpha) + raw * alpha
  const v: Vec3 = {
    x: st.v.x * (1 - alpha) + rawV.x * alpha,
    y: st.v.y * (1 - alpha) + rawV.y * alpha,
    z: st.v.z * (1 - alpha) + rawV.z * alpha,
  };

  return {
    v,
    lastPos: pointerWorldPos,
    lastDt: dt,
    rawV,
    sampleCount: st.sampleCount + 1,
  };
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get current speed magnitude (mm/s)
 */
export function getSpeed(st: VelocityState): number {
  return len(st.v);
}

/**
 * Get velocity vector (mm/s)
 */
export function getVelocity(st: VelocityState): Vec3 {
  return st.v;
}

/**
 * Check if velocity is initialized (has samples)
 */
export function isInitialized(st: VelocityState): boolean {
  return st.sampleCount > 0;
}

/**
 * Check if velocity is stable (enough samples)
 */
export function isStable(st: VelocityState, minSamples: number = 3): boolean {
  return st.sampleCount >= minSamples;
}

// ============================================
// DEBUG INFO
// ============================================

export interface VelocityDebugInfo {
  velocity: Vec3;
  speed: number;
  rawVelocity: Vec3;
  rawSpeed: number;
  lastDt: number;
  sampleCount: number;
  isStable: boolean;
}

/**
 * Get debug info for UI overlay
 */
export function getVelocityDebugInfo(st: VelocityState): VelocityDebugInfo {
  return {
    velocity: st.v,
    speed: len(st.v),
    rawVelocity: st.rawV,
    rawSpeed: len(st.rawV),
    lastDt: st.lastDt,
    sampleCount: st.sampleCount,
    isStable: isStable(st),
  };
}

// ============================================
// ALTERNATIVE: DIRECT DELTA VELOCITY
// ============================================

/**
 * Alternative: Compute velocity directly from delta (no position tracking)
 *
 * Use this when you have delta instead of absolute position.
 */
export function updateVelocityFromDelta(
  st: VelocityState,
  deltaWorld: Vec3,
  dtSec: number,
  cfg: VelocityConfig = VELOCITY_CONFIG
): VelocityState {
  const dt = clamp(dtSec, cfg.dtMin, cfg.dtMax);

  // Raw velocity from delta
  const rawV: Vec3 = {
    x: deltaWorld.x / dt,
    y: deltaWorld.y / dt,
    z: deltaWorld.z / dt,
  };

  // FPS-invariant smoothing
  const alpha = 1 - Math.exp(-dt / Math.max(1e-6, cfg.tau));

  const v: Vec3 = {
    x: st.v.x * (1 - alpha) + rawV.x * alpha,
    y: st.v.y * (1 - alpha) + rawV.y * alpha,
    z: st.v.z * (1 - alpha) + rawV.z * alpha,
  };

  return {
    v,
    lastPos: st.lastPos, // Not updated in delta mode
    lastDt: dt,
    rawV,
    sampleCount: st.sampleCount + 1,
  };
}
