/**
 * deterministicDragSampling.ts - Cross-FPS Stable Drag Sampling
 *
 * PROBLEM:
 * - 60Hz monitor: dragDelta per frame = large
 * - 120Hz monitor: dragDelta per frame = small
 * - Same physical mouse movement → different velocities!
 *
 * SOLUTION:
 * - Fixed time bucket sampling (e.g., every 16ms)
 * - Accumulate samples within bucket
 * - Compute velocity from bucket average
 *
 * ALGORITHM:
 * 1. Each frame: accumulate position delta and increment sample count
 * 2. When bucket time elapsed: compute average velocity
 * 3. Emit velocity event at fixed rate
 *
 * RESULT:
 * - 60Hz: ~1 sample per bucket (16ms)
 * - 120Hz: ~2 samples per bucket (16ms)
 * - Same physical movement → same velocity
 */

import type { Vec3 } from '../types/SnapTypes';
import { add, scale, len } from '../math/vec3Utils';

// ============================================
// CONFIGURATION
// ============================================

export interface DragSamplingConfig {
  /** Time bucket size (ms) - fixed sampling interval */
  bucketMs: number;

  /** Minimum samples to emit velocity (prevents noise from single sample) */
  minSamplesPerBucket: number;

  /** Maximum time between samples before reset (ms) */
  maxSampleGapMs: number;

  /** Velocity smoothing factor (0-1, higher = more smoothing) */
  smoothingAlpha: number;
}

export const DEFAULT_DRAG_SAMPLING: DragSamplingConfig = {
  bucketMs: 16, // ~60Hz equivalent
  minSamplesPerBucket: 1,
  maxSampleGapMs: 100, // Reset if no sample for 100ms
  smoothingAlpha: 0.3, // EMA smoothing
};

// ============================================
// SAMPLER STATE
// ============================================

export interface DragSamplerState {
  /** Accumulated delta within current bucket */
  accumulatedDelta: Vec3;

  /** Number of samples in current bucket */
  sampleCount: number;

  /** Bucket start time (ms) */
  bucketStartMs: number;

  /** Last sample time (ms) */
  lastSampleMs: number;

  /** Smoothed velocity (EMA) */
  smoothedVelocity: Vec3;

  /** Last emitted velocity */
  lastEmittedVelocity: Vec3;

  /** Total samples since drag start */
  totalSamples: number;
}

// ============================================
// SAMPLER LIFECYCLE
// ============================================

/**
 * Create new drag sampler state
 */
export function createDragSampler(nowMs: number = Date.now()): DragSamplerState {
  return {
    accumulatedDelta: { x: 0, y: 0, z: 0 },
    sampleCount: 0,
    bucketStartMs: nowMs,
    lastSampleMs: nowMs,
    smoothedVelocity: { x: 0, y: 0, z: 0 },
    lastEmittedVelocity: { x: 0, y: 0, z: 0 },
    totalSamples: 0,
  };
}

/**
 * Reset sampler (on drag start)
 */
export function resetDragSampler(
  sampler: DragSamplerState,
  nowMs: number = Date.now()
): DragSamplerState {
  return createDragSampler(nowMs);
}

// ============================================
// SAMPLE RESULT
// ============================================

export interface DragSampleResult {
  /** Updated sampler state */
  sampler: DragSamplerState;

  /** Whether a velocity event was emitted this frame */
  emitted: boolean;

  /** Velocity (mm/s) - only valid if emitted */
  velocity: Vec3;

  /** Speed magnitude (mm/s) */
  speed: number;

  /** Time since last bucket (ms) */
  bucketElapsedMs: number;
}

// ============================================
// MAIN SAMPLE FUNCTION
// ============================================

/**
 * Add drag sample and potentially emit velocity
 *
 * Call this every frame during drag with the frame's delta.
 *
 * @param sampler - Current sampler state
 * @param deltaWorld - Position delta this frame (mm)
 * @param nowMs - Current timestamp (ms)
 * @param config - Sampling configuration
 * @returns Sample result with updated state and potential velocity
 */
export function addDragSample(
  sampler: DragSamplerState,
  deltaWorld: Vec3,
  nowMs: number = Date.now(),
  config: DragSamplingConfig = DEFAULT_DRAG_SAMPLING
): DragSampleResult {
  const { bucketMs, minSamplesPerBucket, maxSampleGapMs, smoothingAlpha } = config;

  // Check for gap reset
  const gapMs = nowMs - sampler.lastSampleMs;
  if (gapMs > maxSampleGapMs) {
    // Too long since last sample - reset
    const freshSampler = createDragSampler(nowMs);
    return {
      sampler: {
        ...freshSampler,
        accumulatedDelta: deltaWorld,
        sampleCount: 1,
        totalSamples: 1,
      },
      emitted: false,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      bucketElapsedMs: 0,
    };
  }

  // Accumulate delta
  const newAccumulated = add(sampler.accumulatedDelta, deltaWorld);
  const newSampleCount = sampler.sampleCount + 1;
  const newTotalSamples = sampler.totalSamples + 1;

  // Check if bucket is complete
  const bucketElapsedMs = nowMs - sampler.bucketStartMs;

  if (bucketElapsedMs >= bucketMs && newSampleCount >= minSamplesPerBucket) {
    // Bucket complete - emit velocity

    // Average delta per sample
    const avgDelta = scale(newAccumulated, 1 / newSampleCount);

    // Convert to velocity (mm/s)
    // Use actual elapsed time for accuracy
    const dtSec = bucketElapsedMs / 1000;
    const rawVelocity: Vec3 = dtSec > 0
      ? scale(newAccumulated, 1 / dtSec)
      : { x: 0, y: 0, z: 0 };

    // Apply EMA smoothing
    const smoothedVelocity = emaVec3(
      sampler.smoothedVelocity,
      rawVelocity,
      smoothingAlpha
    );

    const speed = len(smoothedVelocity);

    // Reset bucket
    const newSampler: DragSamplerState = {
      accumulatedDelta: { x: 0, y: 0, z: 0 },
      sampleCount: 0,
      bucketStartMs: nowMs,
      lastSampleMs: nowMs,
      smoothedVelocity,
      lastEmittedVelocity: smoothedVelocity,
      totalSamples: newTotalSamples,
    };

    return {
      sampler: newSampler,
      emitted: true,
      velocity: smoothedVelocity,
      speed,
      bucketElapsedMs,
    };
  }

  // Bucket not complete - accumulate
  const updatedSampler: DragSamplerState = {
    ...sampler,
    accumulatedDelta: newAccumulated,
    sampleCount: newSampleCount,
    lastSampleMs: nowMs,
    totalSamples: newTotalSamples,
  };

  return {
    sampler: updatedSampler,
    emitted: false,
    velocity: sampler.lastEmittedVelocity,
    speed: len(sampler.lastEmittedVelocity),
    bucketElapsedMs,
  };
}

// ============================================
// EMA SMOOTHING
// ============================================

/**
 * Exponential Moving Average for Vec3
 */
function emaVec3(prev: Vec3, current: Vec3, alpha: number): Vec3 {
  return {
    x: prev.x + alpha * (current.x - prev.x),
    y: prev.y + alpha * (current.y - prev.y),
    z: prev.z + alpha * (current.z - prev.z),
  };
}

// ============================================
// FORCE EMIT (for drag end)
// ============================================

/**
 * Force emit current bucket (call on drag end)
 *
 * Returns final velocity from accumulated samples.
 */
export function forceEmitDragSample(
  sampler: DragSamplerState,
  nowMs: number = Date.now(),
  config: DragSamplingConfig = DEFAULT_DRAG_SAMPLING
): DragSampleResult {
  if (sampler.sampleCount === 0) {
    return {
      sampler,
      emitted: false,
      velocity: sampler.lastEmittedVelocity,
      speed: len(sampler.lastEmittedVelocity),
      bucketElapsedMs: nowMs - sampler.bucketStartMs,
    };
  }

  const bucketElapsedMs = nowMs - sampler.bucketStartMs;
  const dtSec = bucketElapsedMs / 1000;

  const rawVelocity: Vec3 = dtSec > 0
    ? scale(sampler.accumulatedDelta, 1 / dtSec)
    : { x: 0, y: 0, z: 0 };

  const smoothedVelocity = emaVec3(
    sampler.smoothedVelocity,
    rawVelocity,
    config.smoothingAlpha
  );

  const speed = len(smoothedVelocity);

  const newSampler: DragSamplerState = {
    accumulatedDelta: { x: 0, y: 0, z: 0 },
    sampleCount: 0,
    bucketStartMs: nowMs,
    lastSampleMs: nowMs,
    smoothedVelocity,
    lastEmittedVelocity: smoothedVelocity,
    totalSamples: sampler.totalSamples,
  };

  return {
    sampler: newSampler,
    emitted: true,
    velocity: smoothedVelocity,
    speed,
    bucketElapsedMs,
  };
}

// ============================================
// DEBUG INFO
// ============================================

export interface DragSamplerDebugInfo {
  sampleCount: number;
  totalSamples: number;
  bucketElapsedMs: number;
  smoothedVelocity: Vec3;
  smoothedSpeed: number;
  accumulatedDelta: Vec3;
}

/**
 * Get debug info for UI overlay
 */
export function getDragSamplerDebugInfo(
  sampler: DragSamplerState,
  nowMs: number = Date.now()
): DragSamplerDebugInfo {
  return {
    sampleCount: sampler.sampleCount,
    totalSamples: sampler.totalSamples,
    bucketElapsedMs: nowMs - sampler.bucketStartMs,
    smoothedVelocity: sampler.smoothedVelocity,
    smoothedSpeed: len(sampler.smoothedVelocity),
    accumulatedDelta: sampler.accumulatedDelta,
  };
}

// ============================================
// EXAMPLE INTEGRATION
// ============================================

/**
 * Example: How to use drag sampler with snap session
 *
 * ```typescript
 * const [sampler, setSampler] = useState(() => createDragSampler());
 * const [session, setSession] = useState(createSnapSessionV5);
 *
 * function onDragMove(event: PointerEvent) {
 *   const delta = computeDelta(event); // Your delta computation
 *   const nowMs = performance.now();
 *
 *   // Sample drag
 *   const result = addDragSample(sampler, delta, nowMs);
 *   setSampler(result.sampler);
 *
 *   // Only update snap session when velocity is emitted
 *   // This ensures consistent behavior across frame rates
 *   if (result.emitted) {
 *     const newSession = updateOnDragV5({
 *       session,
 *       velocityWorld: result.velocity,
 *       // ... other args
 *     });
 *     setSession(newSession);
 *   }
 *
 *   // Always apply filtered delta to cabinet
 *   const filteredDelta = getDragDeltaV5(session, delta, axesB);
 *   updatePosition(filteredDelta);
 * }
 *
 * function onDragEnd() {
 *   // Force emit final velocity
 *   const result = forceEmitDragSample(sampler);
 *   // ... handle drag end
 * }
 * ```
 */

// ============================================
// ALTERNATIVE: FIXED TIMESTEP
// ============================================

/**
 * Fixed timestep accumulator for physics-style updates
 *
 * Alternative to bucket sampling for even more determinism.
 * Accumulates time and runs fixed-step updates.
 */
export interface FixedTimestepState {
  /** Accumulated time (ms) */
  accumulator: number;

  /** Fixed step size (ms) */
  stepMs: number;

  /** Last update time (ms) */
  lastUpdateMs: number;

  /** Pending delta to process */
  pendingDelta: Vec3;
}

/**
 * Create fixed timestep state
 */
export function createFixedTimestep(
  stepMs: number = 16,
  nowMs: number = Date.now()
): FixedTimestepState {
  return {
    accumulator: 0,
    stepMs,
    lastUpdateMs: nowMs,
    pendingDelta: { x: 0, y: 0, z: 0 },
  };
}

export interface FixedTimestepResult {
  state: FixedTimestepState;
  stepsToRun: number;
  deltaPerStep: Vec3;
}

/**
 * Update fixed timestep and get steps to run
 */
export function updateFixedTimestep(
  state: FixedTimestepState,
  deltaWorld: Vec3,
  nowMs: number = Date.now()
): FixedTimestepResult {
  const elapsed = nowMs - state.lastUpdateMs;
  const newAccumulator = state.accumulator + elapsed;

  const stepsToRun = Math.floor(newAccumulator / state.stepMs);
  const remainingAccumulator = newAccumulator % state.stepMs;

  // Accumulate delta
  const totalDelta = add(state.pendingDelta, deltaWorld);

  if (stepsToRun > 0) {
    // Divide delta evenly across steps
    const deltaPerStep = scale(totalDelta, 1 / stepsToRun);

    return {
      state: {
        ...state,
        accumulator: remainingAccumulator,
        lastUpdateMs: nowMs,
        pendingDelta: { x: 0, y: 0, z: 0 },
      },
      stepsToRun,
      deltaPerStep,
    };
  }

  // No steps yet - accumulate
  return {
    state: {
      ...state,
      accumulator: newAccumulator,
      lastUpdateMs: nowMs,
      pendingDelta: totalDelta,
    },
    stepsToRun: 0,
    deltaPerStep: { x: 0, y: 0, z: 0 },
  };
}
