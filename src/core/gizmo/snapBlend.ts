/**
 * snapBlend.ts - Snap Engagement Blending for Smooth Gizmo-Snap Integration
 *
 * PROBLEM:
 * When snap is "engaged" (near threshold), the free delta from gizmo and
 * snap correction can fight each other, causing jitter/flip-flop.
 *
 * SOLUTION:
 * Reduce free delta sensitivity based on snap engagement strength.
 * When near snap: dampen free movement to let snap "win"
 * When far from snap: full free movement
 *
 * This creates a smooth transition into snap engagement.
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// ENGAGE STRENGTH
// ============================================

/**
 * Calculate snap engagement strength based on distance to best candidate
 *
 * @param bestDistMm - Distance to best snap candidate in mm
 * @param snapThresholdMm - Snap threshold in mm (e.g., 50mm)
 * @returns Strength 0..1 (1 = fully engaged, 0 = not engaged)
 */
export function engageStrength(bestDistMm: number, snapThresholdMm: number): number {
  if (snapThresholdMm <= 1e-6) return 0;

  // Linear interpolation: 0 at threshold, 1 at distance 0
  const t = 1 - (bestDistMm / snapThresholdMm);
  const clamped = Math.max(0, Math.min(1, t));

  // Smoothstep for more natural feel
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Calculate engagement strength with hysteresis
 * Prevents flickering at threshold boundary
 *
 * @param bestDistMm - Distance to best snap candidate in mm
 * @param snapThresholdMm - Snap threshold in mm
 * @param hysteresisMm - Hysteresis band in mm (e.g., 5mm)
 * @param wasEngaged - Was snap engaged in previous frame
 * @returns Strength 0..1
 */
export function engageStrengthWithHysteresis(
  bestDistMm: number,
  snapThresholdMm: number,
  hysteresisMm: number,
  wasEngaged: boolean
): number {
  // Use different thresholds for enter vs exit
  const effectiveThreshold = wasEngaged
    ? snapThresholdMm + hysteresisMm  // Harder to exit
    : snapThresholdMm - hysteresisMm; // Harder to enter

  return engageStrength(bestDistMm, Math.max(1, effectiveThreshold));
}

// ============================================
// DELTA BLENDING
// ============================================

/**
 * Scale a vector
 */
function scaleVec(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Blend (dampen) free delta when near snap
 *
 * When engagement strength is high (near snap), reduce free delta
 * to prevent fighting with snap correction.
 *
 * @param freeDeltaWorld - Raw free delta from gizmo
 * @param strength - Engagement strength 0..1
 * @param minAlpha - Minimum alpha when fully engaged (e.g., 0.35)
 * @returns Damped delta
 */
export function blendFreeDeltaNearSnap(args: {
  freeDeltaWorld: Vec3;
  strength: number;
  minAlpha?: number;
}): Vec3 {
  const { freeDeltaWorld, strength, minAlpha = 0.35 } = args;

  // alpha = 1 when strength = 0 (not engaged, full movement)
  // alpha = minAlpha when strength = 1 (fully engaged, dampened)
  const alpha = minAlpha + (1 - minAlpha) * (1 - strength);

  return scaleVec(freeDeltaWorld, alpha);
}

/**
 * Blend free delta with snap delta
 *
 * Creates a weighted combination of free movement and snap correction.
 *
 * @param freeDelta - Raw free delta from gizmo
 * @param snapDelta - Snap correction delta (null if no snap)
 * @param strength - Engagement strength 0..1
 * @returns Blended delta
 */
export function blendDeltasWithStrength(args: {
  freeDelta: Vec3;
  snapDelta: Vec3 | null;
  strength: number;
}): Vec3 {
  const { freeDelta, snapDelta, strength } = args;

  if (!snapDelta) return freeDelta;

  // Weighted blend: more snap as strength increases
  const freeWeight = 1 - strength;
  const snapWeight = strength;

  return {
    x: freeDelta.x * freeWeight + snapDelta.x * snapWeight,
    y: freeDelta.y * freeWeight + snapDelta.y * snapWeight,
    z: freeDelta.z * freeWeight + snapDelta.z * snapWeight,
  };
}

// ============================================
// JITTER PREVENTION
// ============================================

/**
 * Apply deadzone specifically for snap engagement
 *
 * When very close to snap target, ignore tiny movements
 * to prevent jitter around the snap point.
 *
 * @param delta - Input delta
 * @param strength - Engagement strength 0..1
 * @param baseDeadzoneMm - Base deadzone in mm
 * @returns Filtered delta
 */
export function applyEngagedDeadzone(args: {
  delta: Vec3;
  strength: number;
  baseDeadzoneMm?: number;
}): Vec3 {
  const { delta, strength, baseDeadzoneMm = 0.5 } = args;

  // Increase deadzone when engaged
  const effectiveDeadzone = baseDeadzoneMm * (1 + strength * 4);

  const magnitude = Math.sqrt(delta.x ** 2 + delta.y ** 2 + delta.z ** 2);

  if (magnitude < effectiveDeadzone) {
    return { x: 0, y: 0, z: 0 };
  }

  return delta;
}

/**
 * Smooth delta changes to prevent sudden jumps
 *
 * @param currentDelta - Current frame delta
 * @param previousDelta - Previous frame delta
 * @param smoothingFactor - 0..1 (0 = no smoothing, 1 = fully previous)
 * @returns Smoothed delta
 */
export function smoothDeltaChange(
  currentDelta: Vec3,
  previousDelta: Vec3,
  smoothingFactor: number
): Vec3 {
  const factor = Math.max(0, Math.min(1, smoothingFactor));
  const inv = 1 - factor;

  return {
    x: currentDelta.x * inv + previousDelta.x * factor,
    y: currentDelta.y * inv + previousDelta.y * factor,
    z: currentDelta.z * inv + previousDelta.z * factor,
  };
}

// ============================================
// SNAP STATE HELPERS
// ============================================

/**
 * Determine if snap should be engaged based on candidates
 *
 * @param candidates - List of snap candidates with distances
 * @param thresholdMm - Snap threshold
 * @returns Best distance and engagement info
 */
export function analyzeSnapCandidates(
  candidates: Array<{ distanceMm: number }>,
  thresholdMm: number
): {
  bestDistMm: number;
  strength: number;
  shouldEngage: boolean;
  candidateCount: number;
} {
  if (candidates.length === 0) {
    return {
      bestDistMm: Infinity,
      strength: 0,
      shouldEngage: false,
      candidateCount: 0,
    };
  }

  // Find best (closest) candidate
  const bestDistMm = Math.min(...candidates.map((c) => c.distanceMm));
  const strength = engageStrength(bestDistMm, thresholdMm);

  return {
    bestDistMm,
    strength,
    shouldEngage: strength > 0.1, // Engage when strength is significant
    candidateCount: candidates.length,
  };
}

// ============================================
// PRODUCTION DEFAULTS
// ============================================

export const SNAP_BLEND_DEFAULTS = {
  /** Minimum alpha when fully engaged */
  minAlpha: 0.35,
  /** Strength threshold to start second pass */
  strengthGate: 0.25,
  /** Base deadzone in mm */
  baseDeadzoneMm: 0.5,
  /** Hysteresis band in mm */
  hysteresisMm: 5,
  /** Delta smoothing factor */
  smoothingFactor: 0.15,
} as const;
