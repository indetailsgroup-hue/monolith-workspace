/**
 * snapSessionV5.ts - Complete Snap Session with Adaptive Lookahead + Local Axis Lock
 *
 * FEATURES (V5):
 * 1. Adaptive Lookahead - 50ms (slow) → 100ms (fast) based on speed
 * 2. Local Axis Lock - Lock along cabinet B's axes (not world)
 * 3. Intent Resolution - Velocity-biased candidate selection (from V4)
 * 4. Sticky Selection - Prevents rapid candidate switching (from V4)
 * 5. Hysteresis - Engage/disengage thresholds prevent jitter (from V4)
 * 6. Predictive Snapping - Look ahead to reduce overshoot (from V4)
 *
 * NEW IN V5:
 * - applyAxisLockLocal: Locks to cabinet's own X/Y/Z axes
 * - computePredictiveDeltaAdaptive: Speed-scaled lookahead time
 * - getDragDeltaV5: Applies local axis lock to drag delta
 *
 * INTEGRATION:
 * - Call updateOnDragV5 each frame during drag
 * - Use getDragDeltaV5(session, rawDelta, axesB) to filter drag
 * - Tab cycles candidates (onTabCycleV5)
 *
 * DETERMINISTIC: Same inputs → Same outputs
 */

import type { Vec3 } from '../types/SnapTypes';
import type {
  SnapCabinetInstance,
  SnapCandidate,
  SnapResult,
  SnapConstants,
  SnapAlignment,
} from '../types/SnapTypes';
import type { CabinetCollisionShape } from '../collision/obbTypes';

// Intent
import type { IntentWeights, SnapIntentResult } from './intentTypes';
import { DEFAULT_INTENT_WEIGHTS } from './intentTypes';
import { resolveSnapIntentLocal } from './localVelocity';
import { applyIntentBiasToCandidates, type ScoredCandidate } from './applyIntentBias';

// Constraints (V5: Local Axis Lock)
import type { AxisLock, CabinetAxes } from './axisLockLocal';
import { applyAxisLockLocal, getCabinetAxesFromRotation, WORLD_AXES } from './axisLockLocal';

import {
  StickySnapState,
  createStickySnapState,
  updateStickyEngagement,
  chooseStickyCandidate,
} from './stickySnapState';

// Prediction (V5: Adaptive)
import type { PredictiveAdaptiveConfig } from './predictiveAdaptiveConfig';
import { PREDICTIVE_ADAPTIVE } from './predictiveAdaptiveConfig';
import {
  computePredictiveDeltaAdaptive,
  createPredictedCabinetAdaptive,
  zeroPredictiveResult,
  type PredictiveDeltaResult,
} from './predictiveDeltaAdaptive';

// Math
import { len } from '../math/vec3Utils';

// ============================================
// SESSION STATE
// ============================================

/**
 * Complete snap session state (V5)
 */
export interface SnapSessionV5 {
  /** Whether snapping is enabled */
  enabled: boolean;

  /** Current candidates (sorted by score) */
  candidates: ScoredCandidate[];

  /** Active candidate index */
  activeIndex: number;

  /** Current snap preview result */
  preview: SnapResult | null;

  /** Sticky/hysteresis state */
  sticky: StickySnapState;

  /** Current axis lock (local to cabinet B) */
  axisLock: AxisLock;

  /** User-forced index (from Tab) - consumed on next update */
  userForcedIndex: number | null;

  /** Last intent result (for debugging) */
  lastIntent: SnapIntentResult | null;

  /** Last predictive result (for debugging) */
  predictiveResult: PredictiveDeltaResult | null;

  /** Current speed (mm/s) - for debugging */
  currentSpeed: number;

  /** Frame counter (for throttling) */
  frameCount: number;
}

// ============================================
// SESSION LIFECYCLE
// ============================================

/**
 * Create new snap session
 */
export function createSnapSessionV5(): SnapSessionV5 {
  return {
    enabled: true,
    candidates: [],
    activeIndex: 0,
    preview: null,
    sticky: createStickySnapState(),
    axisLock: 'NONE',
    userForcedIndex: null,
    lastIntent: null,
    predictiveResult: null,
    currentSpeed: 0,
    frameCount: 0,
  };
}

/**
 * Enable/disable snapping
 */
export function setEnabledV5(session: SnapSessionV5, enabled: boolean): SnapSessionV5 {
  if (!enabled) {
    return {
      ...session,
      enabled: false,
      candidates: [],
      activeIndex: 0,
      preview: null,
      sticky: createStickySnapState(),
      axisLock: 'NONE',
      userForcedIndex: null,
      lastIntent: null,
      predictiveResult: null,
      currentSpeed: 0,
    };
  }

  return { ...session, enabled: true };
}

/**
 * Cycle candidate via Tab
 */
export function onTabCycleV5(session: SnapSessionV5, direction: 1 | -1): SnapSessionV5 {
  if (!session.candidates.length) return session;

  const n = session.candidates.length;
  const next = ((session.activeIndex + direction) % n + n) % n;

  return {
    ...session,
    activeIndex: next,
    userForcedIndex: next,
  };
}

// ============================================
// CANDIDATE GENERATION INTERFACE
// ============================================

/**
 * Interface for external candidate generator
 * (Pluggable - implement based on your snap engine)
 */
export interface CandidateGenerator {
  /**
   * Generate candidates for cabinet pair
   */
  generateCandidates(
    a: SnapCabinetInstance,
    b: SnapCabinetInstance,
    constants: SnapConstants
  ): SnapCandidate[];

  /**
   * Solve preview result for a candidate
   */
  solvePreview(
    a: SnapCabinetInstance,
    b: SnapCabinetInstance,
    candidate: SnapCandidate,
    alignment: SnapAlignment,
    constants: SnapConstants
  ): SnapResult | null;

  /**
   * Filter candidates by collision (optional)
   */
  filterByCollision?(
    candidates: SnapCandidate[],
    bodyShape: CabinetCollisionShape,
    collisionContext: unknown
  ): SnapCandidate[];
}

// ============================================
// MAIN UPDATE FUNCTION (V5)
// ============================================

export interface UpdateV5Args {
  /** Current session state */
  session: SnapSessionV5;

  /** Stationary cabinet (snap target) */
  cabinetA: SnapCabinetInstance;

  /** Moving cabinet */
  cabinetB: SnapCabinetInstance;

  /** Cabinet B's axes (from quaternion) */
  axesB: CabinetAxes;

  /** Snap constants */
  constants: SnapConstants;

  /** Alignment options */
  alignment: SnapAlignment;

  /** Current drag velocity (world space, mm/s) */
  velocityWorld: Vec3;

  /** Intent weights */
  intentWeights?: IntentWeights;

  /** Predictive config */
  predictiveConfig?: PredictiveAdaptiveConfig;

  /** Candidate generator */
  generator: CandidateGenerator;

  /** Current timestamp (ms) - for hysteresis */
  nowMs?: number;
}

/**
 * Update snap session during drag (V5)
 *
 * Key differences from V4:
 * 1. Uses adaptive lookahead (speed-scaled 50-100ms)
 * 2. Returns local axis lock (not world axis)
 *
 * Call this each frame while dragging.
 * Returns new session state.
 */
export function updateOnDragV5(args: UpdateV5Args): SnapSessionV5 {
  const {
    session,
    cabinetA,
    cabinetB,
    axesB,
    constants,
    alignment,
    velocityWorld,
    intentWeights = DEFAULT_INTENT_WEIGHTS,
    predictiveConfig = PREDICTIVE_ADAPTIVE,
    generator,
    nowMs = Date.now(),
  } = args;

  // Disabled: return empty state
  if (!session.enabled) {
    return {
      ...session,
      candidates: [],
      activeIndex: 0,
      preview: null,
      sticky: createStickySnapState(),
      axisLock: 'NONE',
      userForcedIndex: null,
      lastIntent: null,
      predictiveResult: zeroPredictiveResult(),
      currentSpeed: 0,
      frameCount: session.frameCount + 1,
    };
  }

  const speed = len(velocityWorld);

  // ============================================
  // 1. RESOLVE INTENT (Local Axes)
  // ============================================
  const intent = resolveSnapIntentLocal({
    velocityWorld,
    speed,
    axesB,
    weights: intentWeights,
  });

  // ============================================
  // 2. COMPUTE PREDICTIVE DELTA (Adaptive)
  // ============================================
  const predictiveResult = computePredictiveDeltaAdaptive({
    velocityWorld,
    speed,
    config: predictiveConfig,
  });

  // Create predicted cabinet B (for engagement decision)
  const predictedB = createPredictedCabinetAdaptive(cabinetB, predictiveResult);

  // ============================================
  // 3. GENERATE CANDIDATES (Predicted State)
  // ============================================
  // Use predicted B for engagement/selection decisions
  let candidatesPred = generator.generateCandidates(cabinetA, predictedB, constants);

  // Apply intent bias
  const scoredPred = applyIntentBiasToCandidates(candidatesPred, intent, intentWeights);

  // ============================================
  // 4. UPDATE STICKY ENGAGEMENT (Hysteresis)
  // ============================================
  const bestPredDist = scoredPred[0]?.distanceMm ?? 999999;
  let sticky = updateStickyEngagement(session.sticky, bestPredDist, nowMs);

  // ============================================
  // 5. CHOOSE STICKY CANDIDATE
  // ============================================
  const axisHint = intent.axisHint as AxisLock;
  sticky = chooseStickyCandidate(
    sticky,
    scoredPred,
    axisHint,
    session.userForcedIndex ?? undefined
  );

  // ============================================
  // 6. GENERATE CANDIDATES (Real State)
  // ============================================
  // Use real B for actual snap calculation
  let candidatesReal = generator.generateCandidates(cabinetA, cabinetB, constants);

  // Apply intent bias to real candidates too
  const scoredReal = applyIntentBiasToCandidates(candidatesReal, intent, intentWeights);

  // No candidates: reset
  if (!scoredReal.length) {
    return {
      ...session,
      candidates: [],
      activeIndex: 0,
      preview: null,
      sticky: createStickySnapState(),
      axisLock: 'NONE',
      userForcedIndex: null,
      lastIntent: intent,
      predictiveResult,
      currentSpeed: speed,
      frameCount: session.frameCount + 1,
    };
  }

  // ============================================
  // 7. ALIGN ACTIVE INDEX TO STICKY CHOICE
  // ============================================
  let activeIndex = 0;
  if (sticky.activeCandidateId) {
    const foundIdx = scoredReal.findIndex(
      c => `${c.type}:${c.aAnchorId}:${c.bAnchorId}` === sticky.activeCandidateId
    );
    activeIndex = foundIdx >= 0 ? foundIdx : 0;
  }

  // ============================================
  // 8. SOLVE PREVIEW
  // ============================================
  const activeCandidate = scoredReal[activeIndex];
  const preview = generator.solvePreview(
    cabinetA,
    cabinetB,
    activeCandidate,
    alignment,
    constants
  );

  // ============================================
  // 9. DETERMINE AXIS LOCK (Local to Cabinet B)
  // ============================================
  // V5: Axis lock is in cabinet B's local frame
  // Use applyAxisLockLocal when filtering drag delta
  const axisLock: AxisLock = sticky.engaged
    ? (axisHint === 'NONE' ? session.axisLock : axisHint)
    : 'NONE';

  return {
    ...session,
    candidates: scoredReal,
    activeIndex,
    preview,
    sticky,
    axisLock,
    userForcedIndex: null, // Consumed
    lastIntent: intent,
    predictiveResult,
    currentSpeed: speed,
    frameCount: session.frameCount + 1,
  };
}

// ============================================
// DRAG DELTA FILTERING (V5 Local Axis Lock)
// ============================================

/**
 * Apply local axis lock to drag delta
 *
 * V5 KEY FEATURE:
 * When cabinet B is rotated, axis lock follows cabinet's own axes.
 * E.g., if cabinet is 45° rotated and locked to X,
 * movement is constrained to cabinet's "left-right" direction.
 *
 * @param session - Current snap session
 * @param rawDeltaWorld - Raw drag delta in world space
 * @param axesB - Cabinet B's axes (from quaternion)
 * @returns Filtered drag delta in world space
 */
export function getDragDeltaV5(
  session: SnapSessionV5,
  rawDeltaWorld: Vec3,
  axesB: CabinetAxes
): Vec3 {
  // No lock: return raw delta
  if (session.axisLock === 'NONE') {
    return rawDeltaWorld;
  }

  // Apply local axis lock
  return applyAxisLockLocal(rawDeltaWorld, session.axisLock, axesB);
}

/**
 * Get drag delta with world axis lock (fallback)
 * Use this if cabinet B's rotation is not available
 */
export function getDragDeltaV5World(
  session: SnapSessionV5,
  rawDeltaWorld: Vec3
): Vec3 {
  if (session.axisLock === 'NONE') {
    return rawDeltaWorld;
  }

  // Use world axes as fallback
  return applyAxisLockLocal(rawDeltaWorld, session.axisLock, WORLD_AXES);
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get current active candidate
 */
export function getActiveCandidateV5(session: SnapSessionV5): ScoredCandidate | null {
  if (!session.candidates.length) return null;
  return session.candidates[session.activeIndex] ?? null;
}

/**
 * Check if snap is engaged
 */
export function isEngagedV5(session: SnapSessionV5): boolean {
  return session.sticky.engaged;
}

/**
 * Get axis lock for drag filtering
 */
export function getAxisLockV5(session: SnapSessionV5): AxisLock {
  return session.axisLock;
}

/**
 * Get debug info for UI overlay
 */
export function getDebugInfoV5(session: SnapSessionV5): {
  engaged: boolean;
  axisLock: AxisLock;
  candidateCount: number;
  activeIndex: number;
  intentConfidence: number;
  intentAxis: string;
  predictiveLookaheadMs: number;
  predictiveWasClamped: boolean;
  currentSpeed: number;
  frameCount: number;
} {
  return {
    engaged: session.sticky.engaged,
    axisLock: session.axisLock,
    candidateCount: session.candidates.length,
    activeIndex: session.activeIndex,
    intentConfidence: session.lastIntent?.confidence ?? 0,
    intentAxis: session.lastIntent?.axisHint ?? 'NONE',
    predictiveLookaheadMs: session.predictiveResult?.lookaheadMs ?? 0,
    predictiveWasClamped: session.predictiveResult?.wasClamped ?? false,
    currentSpeed: session.currentSpeed,
    frameCount: session.frameCount,
  };
}

// ============================================
// EXAMPLE INTEGRATION
// ============================================

/**
 * Example: How to use V5 in drag handler
 *
 * ```typescript
 * const [session, setSession] = useState(createSnapSessionV5);
 *
 * function onDrag(event: DragEvent) {
 *   const velocityWorld = computeVelocity(event);
 *   const axesB = getCabinetAxesFromRotation(cabinetB.rotation);
 *
 *   // Update session
 *   const newSession = updateOnDragV5({
 *     session,
 *     cabinetA,
 *     cabinetB,
 *     axesB,
 *     constants,
 *     alignment,
 *     velocityWorld,
 *     generator,
 *   });
 *
 *   // Filter drag delta with local axis lock
 *   const rawDelta = { x: event.dx, y: event.dy, z: event.dz };
 *   const filteredDelta = getDragDeltaV5(newSession, rawDelta, axesB);
 *
 *   // Apply filtered delta to cabinet B
 *   updateCabinetPosition(cabinetB.id, filteredDelta);
 *
 *   setSession(newSession);
 * }
 * ```
 */

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

export { getCabinetAxesFromRotation, WORLD_AXES } from './axisLockLocal';
export type { AxisLock, CabinetAxes } from './axisLockLocal';
export type { PredictiveDeltaResult } from './predictiveDeltaAdaptive';
