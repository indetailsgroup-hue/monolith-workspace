/**
 * snapSessionV4.ts - Complete Snap Session with Intent + Constraints + Prediction
 *
 * FEATURES:
 * 1. Intent Resolution - Velocity-biased candidate selection
 * 2. Local Axis Intent - Uses cabinet B's rotation for accurate intent
 * 3. Sticky Selection - Prevents rapid candidate switching
 * 4. Hysteresis - Engage/disengage thresholds prevent jitter
 * 5. Axis Lock - Constrains movement when engaged
 * 6. Predictive Snapping - Look ahead to reduce overshoot
 *
 * INTEGRATION:
 * - Replaces snap preview logic
 * - Call updateOnDragV4 each frame during drag
 * - Use session.axisLock to filter drag delta
 * - Tab cycles candidates (onTabCycleV4)
 *
 * DETERMINISTIC: Same inputs → Same outputs (no random, no time-based unless provided)
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

// Constraints
import type { AxisLock, CabinetAxes } from './axisLock';
import {
  StickySnapState,
  createStickySnapState,
  updateStickyEngagement,
  chooseStickyCandidate,
  cycleCandidate,
  getActiveCandidate,
} from './stickySnapState';

// Prediction
import { PREDICTIVE_CONFIG } from './predictiveConfig';
import {
  computeAdaptivePredictiveDelta,
  createPredictedCabinet,
} from './predictiveDelta';

// Math
import { len } from '../math/vec3Utils';

// ============================================
// SESSION STATE
// ============================================

/**
 * Complete snap session state
 */
export interface SnapSessionV4 {
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

  /** Current axis lock */
  axisLock: AxisLock;

  /** User-forced index (from Tab) - consumed on next update */
  userForcedIndex: number | null;

  /** Last intent result (for debugging) */
  lastIntent: SnapIntentResult | null;

  /** Last predictive delta (for debugging) */
  predictedDelta: Vec3 | null;

  /** Frame counter (for throttling) */
  frameCount: number;
}

// ============================================
// SESSION LIFECYCLE
// ============================================

/**
 * Create new snap session
 */
export function createSnapSessionV4(): SnapSessionV4 {
  return {
    enabled: true,
    candidates: [],
    activeIndex: 0,
    preview: null,
    sticky: createStickySnapState(),
    axisLock: 'NONE',
    userForcedIndex: null,
    lastIntent: null,
    predictedDelta: null,
    frameCount: 0,
  };
}

/**
 * Enable/disable snapping
 */
export function setEnabledV4(session: SnapSessionV4, enabled: boolean): SnapSessionV4 {
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
      predictedDelta: null,
    };
  }

  return { ...session, enabled: true };
}

/**
 * Cycle candidate via Tab
 */
export function onTabCycleV4(session: SnapSessionV4, direction: 1 | -1): SnapSessionV4 {
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
   * Filter candidates by collision
   */
  filterByCollision?(
    candidates: SnapCandidate[],
    bodyShape: CabinetCollisionShape,
    collisionContext: unknown
  ): SnapCandidate[];
}

// ============================================
// MAIN UPDATE FUNCTION
// ============================================

export interface UpdateV4Args {
  /** Current session state */
  session: SnapSessionV4;

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

  /** Candidate generator */
  generator: CandidateGenerator;

  /** Current timestamp (ms) - for hysteresis */
  nowMs?: number;
}

/**
 * Update snap session during drag
 *
 * Call this each frame while dragging.
 * Returns new session state.
 */
export function updateOnDragV4(args: UpdateV4Args): SnapSessionV4 {
  const {
    session,
    cabinetA,
    cabinetB,
    axesB,
    constants,
    alignment,
    velocityWorld,
    intentWeights = DEFAULT_INTENT_WEIGHTS,
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
      predictedDelta: null,
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
  // 2. COMPUTE PREDICTIVE DELTA
  // ============================================
  const predictedDelta = computeAdaptivePredictiveDelta(
    velocityWorld,
    speed,
    PREDICTIVE_CONFIG
  );

  // Create predicted cabinet B (for engagement decision)
  const predictedB = createPredictedCabinet(cabinetB, predictedDelta);

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
      predictedDelta,
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
  // 9. DETERMINE AXIS LOCK
  // ============================================
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
    predictedDelta,
    frameCount: session.frameCount + 1,
  };
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get current active candidate
 */
export function getActiveCandidateV4(session: SnapSessionV4): ScoredCandidate | null {
  if (!session.candidates.length) return null;
  return session.candidates[session.activeIndex] ?? null;
}

/**
 * Check if snap is engaged
 */
export function isEngagedV4(session: SnapSessionV4): boolean {
  return session.sticky.engaged;
}

/**
 * Get axis lock for drag filtering
 */
export function getAxisLockV4(session: SnapSessionV4): AxisLock {
  return session.axisLock;
}

/**
 * Get debug info for UI overlay
 */
export function getDebugInfoV4(session: SnapSessionV4): {
  engaged: boolean;
  axisLock: AxisLock;
  candidateCount: number;
  activeIndex: number;
  intentConfidence: number;
  intentAxis: string;
  predictedDelta: Vec3 | null;
} {
  return {
    engaged: session.sticky.engaged,
    axisLock: session.axisLock,
    candidateCount: session.candidates.length,
    activeIndex: session.activeIndex,
    intentConfidence: session.lastIntent?.confidence ?? 0,
    intentAxis: session.lastIntent?.axisHint ?? 'NONE',
    predictedDelta: session.predictedDelta,
  };
}
