/**
 * deterministicDragController.ts - Integrated Deterministic Drag Controller
 *
 * PURPOSE:
 * - Combines all drag subsystems into single controller
 * - FPS-invariant velocity estimation
 * - Fixed-step sampling for consistent updates
 * - Edge case guards
 * - Telemetry integration
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    Drag Controller                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
 * │  │  Velocity   │  │ Fixed-step  │  │      Guards         │ │
 * │  │  Estimator  │→ │  Sampler    │→ │  (reset/teleport)   │ │
 * │  └─────────────┘  └─────────────┘  └─────────────────────┘ │
 * │           ↓                ↓                  ↓             │
 * │  ┌─────────────────────────────────────────────────────────┐│
 * │  │              Snap Session V5                            ││
 * │  │  (intent + predictive + local axis lock + hysteresis)  ││
 * │  └─────────────────────────────────────────────────────────┘│
 * │           ↓                                                 │
 * │  ┌─────────────────────────────────────────────────────────┐│
 * │  │              Telemetry                                  ││
 * │  │  (FPS, velocity, snap state, collision, alerts)        ││
 * │  └─────────────────────────────────────────────────────────┘│
 * └─────────────────────────────────────────────────────────────┘
 *
 * USAGE:
 * const controller = createDragController();
 *
 * // On drag start
 * controller.start();
 *
 * // Each frame
 * const result = controller.tick(pointerWorldPos, dtSec);
 * for (const step of result.steps) {
 *   applyDelta(step.delta);
 *   updateSnapSession(step.velocity);
 * }
 *
 * // On drag end
 * controller.end();
 */

import type { Vec3 } from '../types/SnapTypes';

// Velocity Estimator
import {
  VelocityState,
  VelocityConfig,
  VELOCITY_CONFIG,
  createVelocityState,
  updateVelocity,
  getSpeed,
  getVelocity,
} from './velocityEstimator';

// Fixed-step Sampler
import {
  FixedStepState,
  FixedStepConfig,
  FIXED_STEP_CONFIG,
  createFixedStepState,
  fixedStepSample,
  fixedStepFlush,
} from './fixedStepSampler';

// Guards
import {
  DragGuardConfig,
  DEFAULT_DRAG_GUARDS,
  StallState,
  createStallState,
  updateStallState,
  runDragGuards,
  clampVelocity,
} from './dragGuards';

// Telemetry
import { TELEMETRY } from '../telemetry/telemetrySingleton';
import { nowMs } from '../telemetry/timer';
import { FpsState, createFpsState, updateFps, getFps } from '../telemetry/fpsEstimator';
import {
  AlertState,
  createAlertState,
  checkAllThresholds,
} from '../telemetry/thresholdAlerts';
import type { TelemetrySampleDrag } from '../telemetry/telemetryTypes';

// Math
import { len } from '../math/vec3Utils';

// ============================================
// CONTROLLER STATE
// ============================================

export interface DragControllerState {
  /** Is currently dragging */
  isDragging: boolean;

  /** Velocity estimator state */
  velocity: VelocityState;

  /** Fixed-step sampler state */
  fixedStep: FixedStepState;

  /** Stall detection state */
  stall: StallState;

  /** FPS estimation state */
  fps: FpsState;

  /** Alert state */
  alerts: AlertState;

  /** Drag start time (ms) */
  startTimeMs: number;

  /** Total frames since drag start */
  frameCount: number;

  /** Last pointer position */
  lastPointerPos: Vec3 | null;
}

export interface DragControllerConfig {
  velocity: VelocityConfig;
  fixedStep: FixedStepConfig;
  guards: DragGuardConfig;
}

export const DEFAULT_DRAG_CONTROLLER_CONFIG: DragControllerConfig = {
  velocity: VELOCITY_CONFIG,
  fixedStep: FIXED_STEP_CONFIG,
  guards: DEFAULT_DRAG_GUARDS,
};

// ============================================
// TICK RESULT
// ============================================

export interface DragStep {
  /** Delta to apply this step (mm) */
  delta: Vec3;

  /** Velocity at this step (mm/s) */
  velocity: Vec3;

  /** Speed at this step (mm/s) */
  speed: number;
}

export interface DragTickResult {
  /** Steps to process this frame (0 to maxSubSteps) */
  steps: DragStep[];

  /** Current FPS estimate */
  fps: number;

  /** Current smoothed velocity (mm/s) */
  velocity: Vec3;

  /** Current speed (mm/s) */
  speed: number;

  /** Was frame skipped (guard triggered) */
  skipped: boolean;

  /** Skip reason (if skipped) */
  skipReason: string | null;

  /** Was state reset (large gap) */
  wasReset: boolean;

  /** Is stalled (no movement) */
  isStalled: boolean;

  /** Updated controller state */
  state: DragControllerState;
}

// ============================================
// CONTROLLER FUNCTIONS
// ============================================

/**
 * Create initial drag controller state
 */
export function createDragControllerState(): DragControllerState {
  return {
    isDragging: false,
    velocity: createVelocityState(),
    fixedStep: createFixedStepState(),
    stall: createStallState(),
    fps: createFpsState(),
    alerts: createAlertState(),
    startTimeMs: 0,
    frameCount: 0,
    lastPointerPos: null,
  };
}

/**
 * Start drag session
 */
export function startDrag(state: DragControllerState): DragControllerState {
  return {
    ...createDragControllerState(),
    isDragging: true,
    startTimeMs: nowMs(),
  };
}

/**
 * End drag session
 */
export function endDrag(state: DragControllerState): {
  state: DragControllerState;
  finalDelta: Vec3;
} {
  const { state: flushedState, finalDelta } = fixedStepFlush(state.fixedStep);

  return {
    state: {
      ...state,
      isDragging: false,
      fixedStep: flushedState,
    },
    finalDelta,
  };
}

/**
 * Process drag tick
 *
 * Main update function. Call each frame during drag.
 */
export function tickDrag(
  state: DragControllerState,
  pointerWorldPos: Vec3,
  dtSec: number,
  cfg: DragControllerConfig = DEFAULT_DRAG_CONTROLLER_CONFIG
): DragTickResult {
  if (!state.isDragging) {
    return {
      steps: [],
      fps: 0,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      skipped: true,
      skipReason: 'not dragging',
      wasReset: false,
      isStalled: false,
      state,
    };
  }

  // Update FPS
  const newFps = updateFps(state.fps, dtSec);
  const fps = getFps(newFps);

  // Update stall detection
  const newStall = updateStallState(state.stall, pointerWorldPos, dtSec, cfg.guards);

  // Run guards
  const guardResult = runDragGuards({
    dtSec,
    prevPos: state.lastPointerPos,
    currentPos: pointerWorldPos,
    velocity: state.velocity.v,
    stallState: newStall,
    cfg: cfg.guards,
  });

  // Handle reset
  if (guardResult.shouldReset) {
    const resetState: DragControllerState = {
      ...state,
      velocity: createVelocityState(),
      fixedStep: createFixedStepState(),
      stall: createStallState(),
      fps: newFps,
      alerts: state.alerts,
      frameCount: state.frameCount + 1,
      lastPointerPos: pointerWorldPos,
    };

    logDragTick(resetState, dtSec, fps, [], 0, true);

    return {
      steps: [],
      fps,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      skipped: true,
      skipReason: guardResult.reason,
      wasReset: true,
      isStalled: false,
      state: resetState,
    };
  }

  // Handle skip (teleport, overspeed)
  if (guardResult.shouldSkip) {
    const skipState: DragControllerState = {
      ...state,
      fps: newFps,
      stall: newStall,
      frameCount: state.frameCount + 1,
      lastPointerPos: pointerWorldPos,
    };

    return {
      steps: [],
      fps,
      velocity: state.velocity.v,
      speed: getSpeed(state.velocity),
      skipped: true,
      skipReason: guardResult.reason,
      wasReset: false,
      isStalled: guardResult.isStalled,
      state: skipState,
    };
  }

  // Update velocity (FPS-invariant)
  const newVelocity = updateVelocity(state.velocity, pointerWorldPos, dtSec, cfg.velocity);
  const clampedVelocity = clampVelocity(newVelocity.v, cfg.guards);

  // Fixed-step sampling
  const sampleResult = fixedStepSample({
    st: state.fixedStep,
    pointerPos: pointerWorldPos,
    dtSec,
    cfg: cfg.fixedStep,
  });

  // Create steps
  const steps: DragStep[] = sampleResult.deltas.map(delta => ({
    delta,
    velocity: clampedVelocity,
    speed: len(clampedVelocity),
  }));

  // Update alerts
  const newAlerts = checkAllThresholds(state.alerts, {
    fps,
    candidateCount: 0, // Will be updated by snap session
  });

  // Build new state
  const newState: DragControllerState = {
    ...state,
    velocity: { ...newVelocity, v: clampedVelocity },
    fixedStep: sampleResult.state,
    stall: newStall,
    fps: newFps,
    alerts: newAlerts,
    frameCount: state.frameCount + 1,
    lastPointerPos: pointerWorldPos,
  };

  // Log telemetry
  logDragTick(newState, dtSec, fps, steps, sampleResult.stepsEmitted, false);

  return {
    steps,
    fps,
    velocity: clampedVelocity,
    speed: len(clampedVelocity),
    skipped: false,
    skipReason: null,
    wasReset: false,
    isStalled: newStall.isStalled,
    state: newState,
  };
}

// ============================================
// TELEMETRY LOGGING
// ============================================

function logDragTick(
  state: DragControllerState,
  dtSec: number,
  fps: number,
  steps: DragStep[],
  subSteps: number,
  wasReset: boolean
): void {
  if (!TELEMETRY.isEnabled()) return;

  const velocity = state.velocity.v;
  const speed = len(velocity);

  const event: TelemetrySampleDrag = {
    ts: nowMs(),
    level: 'INFO',
    kind: 'DRAG_TICK',
    dtSec,
    fps,
    pointerWorld: state.lastPointerPos ?? undefined,
    velocity,
    speed,
    rawSpeed: len(state.velocity.rawV),
    subSteps,
    totalSteps: state.fixedStep.totalSteps,
    // Snap fields will be added by snap session integration
  };

  TELEMETRY.push(event);
  TELEMETRY.inc('drag_ticks');
  TELEMETRY.inc('drag_steps', subSteps);
}

// ============================================
// CONVENIENCE CLASS WRAPPER
// ============================================

/**
 * Class wrapper for easier usage
 */
export class DragController {
  private state: DragControllerState;
  private config: DragControllerConfig;

  constructor(config: Partial<DragControllerConfig> = {}) {
    this.state = createDragControllerState();
    this.config = { ...DEFAULT_DRAG_CONTROLLER_CONFIG, ...config };
  }

  get isDragging(): boolean {
    return this.state.isDragging;
  }

  get velocity(): Vec3 {
    return this.state.velocity.v;
  }

  get speed(): number {
    return getSpeed(this.state.velocity);
  }

  get fps(): number {
    return getFps(this.state.fps);
  }

  start(): void {
    this.state = startDrag(this.state);
  }

  end(): Vec3 {
    const { state, finalDelta } = endDrag(this.state);
    this.state = state;
    return finalDelta;
  }

  tick(pointerWorldPos: Vec3, dtSec: number): DragTickResult {
    const result = tickDrag(this.state, pointerWorldPos, dtSec, this.config);
    this.state = result.state;
    return result;
  }

  reset(): void {
    this.state = createDragControllerState();
  }

  getState(): DragControllerState {
    return this.state;
  }
}

/**
 * Create drag controller instance
 */
export function createDragController(
  config: Partial<DragControllerConfig> = {}
): DragController {
  return new DragController(config);
}
