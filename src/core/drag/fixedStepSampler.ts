/**
 * fixedStepSampler.ts - Fixed-step Drag Sampler
 *
 * PROBLEM:
 * - mousemove events come at irregular intervals
 * - Different browsers/OS have different event rates
 * - Snap updates called at different rates → different behavior
 *
 * SOLUTION:
 * - Normalize input deltas to fixed time steps (e.g., 120Hz)
 * - Accumulate time and emit steps at fixed intervals
 * - Same physical movement → same number of snap updates
 *
 * ALGORITHM:
 * 1. Accumulate time since last step
 * 2. When accumulated >= stepTime, emit step(s)
 * 3. Distribute delta proportionally across steps
 * 4. Carry remainder for next tick
 *
 * RESULT:
 * - Predictable snap update rate (e.g., exactly 120Hz)
 * - Consistent behavior across devices
 * - Deterministic number of steps per drag
 */

import type { Vec3 } from '../types/SnapTypes';
import { sub, add, scale } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * Fixed-step sampler state
 */
export interface FixedStepState {
  /** Accumulated time (seconds) */
  accumulator: number;

  /** Last pointer position seen */
  lastPos: Vec3 | null;

  /** Carried delta from previous tick (for sub-step precision) */
  carry: Vec3;

  /** Total steps emitted since reset */
  totalSteps: number;

  /** Last dt used (for debugging) */
  lastDt: number;
}

/**
 * Fixed-step sampler configuration
 */
export interface FixedStepConfig {
  /** Target step rate (Hz) - e.g., 120 */
  stepHz: number;

  /** Maximum sub-steps per tick (prevents spiral of death) */
  maxSubSteps: number;
}

/**
 * Result of fixed-step sampling
 */
export interface FixedStepResult {
  /** Updated sampler state */
  state: FixedStepState;

  /** Array of deltas to process (0 to maxSubSteps) */
  deltas: Vec3[];

  /** Number of steps emitted this tick */
  stepsEmitted: number;

  /** Remaining accumulator time (for debugging) */
  remainingAccumulator: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

/**
 * Default fixed-step config
 *
 * - stepHz: 120 = 8.33ms per step (smooth, but not too expensive)
 * - maxSubSteps: 5 (prevents spiral if dt is large)
 */
export const FIXED_STEP_CONFIG: FixedStepConfig = {
  stepHz: 120,
  maxSubSteps: 5,
} as const;

/**
 * Alternative: 60Hz config (less CPU, still smooth)
 */
export const FIXED_STEP_60HZ: FixedStepConfig = {
  stepHz: 60,
  maxSubSteps: 4,
} as const;

// ============================================
// LIFECYCLE
// ============================================

/**
 * Create new fixed-step state
 */
export function createFixedStepState(): FixedStepState {
  return {
    accumulator: 0,
    lastPos: null,
    carry: { x: 0, y: 0, z: 0 },
    totalSteps: 0,
    lastDt: 0,
  };
}

/**
 * Reset fixed-step state (on drag start)
 */
export function resetFixedStepState(): FixedStepState {
  return createFixedStepState();
}

// ============================================
// MAIN SAMPLE FUNCTION (Position-based)
// ============================================

/**
 * Sample drag with fixed time steps (position-based)
 *
 * Call this every frame with current pointer position.
 * Returns array of deltas to process (0 or more).
 *
 * @param st - Current sampler state
 * @param pointerPos - Current pointer position in world space (mm)
 * @param dtSec - Time since last update (seconds)
 * @param cfg - Sampler configuration
 * @returns Result with updated state and deltas to process
 */
export function fixedStepSample(args: {
  st: FixedStepState;
  pointerPos: Vec3;
  dtSec: number;
  cfg?: FixedStepConfig;
}): FixedStepResult {
  const { st, pointerPos, dtSec, cfg = FIXED_STEP_CONFIG } = args;

  // First sample: just store position
  if (!st.lastPos) {
    return {
      state: { ...st, lastPos: pointerPos, lastDt: dtSec },
      deltas: [],
      stepsEmitted: 0,
      remainingAccumulator: 0,
    };
  }

  const step = 1 / cfg.stepHz;

  // Total delta since last call (including carry from previous tick)
  const frameDelta = sub(pointerPos, st.lastPos);
  const totalDelta = add(st.carry, frameDelta);

  // Accumulate time
  let acc = st.accumulator + dtSec;

  const deltas: Vec3[] = [];
  let subSteps = 0;

  // Emit steps while we have enough accumulated time
  while (acc >= step && subSteps < cfg.maxSubSteps) {
    // Distribute delta proportionally to step size
    // deltaPerStep = totalDelta * (step / dtSec)
    const dtSafe = Math.max(1e-6, dtSec);
    const deltaPerStep = scale(totalDelta, step / dtSafe);

    deltas.push(deltaPerStep);

    acc -= step;
    subSteps++;
  }

  // Carry remainder delta for next tick
  // remainder = totalDelta - sum(deltas)
  let usedDelta: Vec3 = { x: 0, y: 0, z: 0 };
  for (const d of deltas) {
    usedDelta = add(usedDelta, d);
  }
  const carry = sub(totalDelta, usedDelta);

  return {
    state: {
      accumulator: acc,
      lastPos: pointerPos,
      carry,
      totalSteps: st.totalSteps + subSteps,
      lastDt: dtSec,
    },
    deltas,
    stepsEmitted: subSteps,
    remainingAccumulator: acc,
  };
}

// ============================================
// MAIN SAMPLE FUNCTION (Delta-based)
// ============================================

/**
 * Sample drag with fixed time steps (delta-based)
 *
 * Use this when you receive deltas instead of absolute positions.
 *
 * @param st - Current sampler state
 * @param deltaWorld - Frame delta in world space (mm)
 * @param dtSec - Time since last update (seconds)
 * @param cfg - Sampler configuration
 * @returns Result with updated state and deltas to process
 */
export function fixedStepSampleDelta(args: {
  st: FixedStepState;
  deltaWorld: Vec3;
  dtSec: number;
  cfg?: FixedStepConfig;
}): FixedStepResult {
  const { st, deltaWorld, dtSec, cfg = FIXED_STEP_CONFIG } = args;

  const step = 1 / cfg.stepHz;

  // Total delta (including carry from previous tick)
  const totalDelta = add(st.carry, deltaWorld);

  // Accumulate time
  let acc = st.accumulator + dtSec;

  const deltas: Vec3[] = [];
  let subSteps = 0;

  // Emit steps while we have enough accumulated time
  while (acc >= step && subSteps < cfg.maxSubSteps) {
    const dtSafe = Math.max(1e-6, dtSec);
    const deltaPerStep = scale(totalDelta, step / dtSafe);

    deltas.push(deltaPerStep);

    acc -= step;
    subSteps++;
  }

  // Carry remainder
  let usedDelta: Vec3 = { x: 0, y: 0, z: 0 };
  for (const d of deltas) {
    usedDelta = add(usedDelta, d);
  }
  const carry = sub(totalDelta, usedDelta);

  return {
    state: {
      accumulator: acc,
      lastPos: st.lastPos, // Not updated in delta mode
      carry,
      totalSteps: st.totalSteps + subSteps,
      lastDt: dtSec,
    },
    deltas,
    stepsEmitted: subSteps,
    remainingAccumulator: acc,
  };
}

// ============================================
// FORCE FLUSH (for drag end)
// ============================================

/**
 * Force flush remaining carry (call on drag end)
 *
 * Returns final delta from accumulated carry.
 */
export function fixedStepFlush(st: FixedStepState): {
  state: FixedStepState;
  finalDelta: Vec3;
} {
  const finalDelta = st.carry;

  return {
    state: {
      ...st,
      carry: { x: 0, y: 0, z: 0 },
      accumulator: 0,
    },
    finalDelta,
  };
}

// ============================================
// DEBUG INFO
// ============================================

export interface FixedStepDebugInfo {
  accumulator: number;
  carry: Vec3;
  totalSteps: number;
  lastDt: number;
  stepHz: number;
}

/**
 * Get debug info for UI overlay
 */
export function getFixedStepDebugInfo(
  st: FixedStepState,
  cfg: FixedStepConfig = FIXED_STEP_CONFIG
): FixedStepDebugInfo {
  return {
    accumulator: st.accumulator,
    carry: st.carry,
    totalSteps: st.totalSteps,
    lastDt: st.lastDt,
    stepHz: cfg.stepHz,
  };
}

// ============================================
// UTILITY: STEP TIME
// ============================================

/**
 * Get step time in milliseconds
 */
export function getStepTimeMs(cfg: FixedStepConfig = FIXED_STEP_CONFIG): number {
  return 1000 / cfg.stepHz;
}

/**
 * Get step time in seconds
 */
export function getStepTimeSec(cfg: FixedStepConfig = FIXED_STEP_CONFIG): number {
  return 1 / cfg.stepHz;
}
