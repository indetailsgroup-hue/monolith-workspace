/**
 * adaptiveLookahead.ts - Compute Adaptive Lookahead Time
 *
 * ALGORITHM:
 * - Map speed to lookahead time
 * - Linear interpolation between min/max thresholds
 * - Clamp to min/max bounds
 *
 * RATIONALE:
 * - Slow drag: Less prediction needed, more responsive feel
 * - Fast drag: More prediction prevents overshoot
 */

import { PREDICTIVE_ADAPTIVE, type PredictiveAdaptiveConfig } from './predictiveAdaptiveConfig';

// ============================================
// MATH UTILITIES
// ============================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================
// ADAPTIVE LOOKAHEAD
// ============================================

/**
 * Compute adaptive lookahead time based on speed
 *
 * @param speedMmPerSec - Current drag speed (mm/s)
 * @param config - Optional config override
 * @returns Lookahead time in milliseconds
 */
export function computeAdaptiveLookaheadMs(
  speedMmPerSec: number,
  config: PredictiveAdaptiveConfig = PREDICTIVE_ADAPTIVE
): number {
  const { speedMin, speedMax, minLookaheadMs, maxLookaheadMs } = config;

  // Normalize speed to 0-1 range
  const t = clamp((speedMmPerSec - speedMin) / (speedMax - speedMin), 0, 1);

  // Interpolate between min and max lookahead
  return lerp(minLookaheadMs, maxLookaheadMs, t);
}

/**
 * Compute adaptive lookahead time in seconds
 */
export function computeAdaptiveLookaheadSec(
  speedMmPerSec: number,
  config: PredictiveAdaptiveConfig = PREDICTIVE_ADAPTIVE
): number {
  return computeAdaptiveLookaheadMs(speedMmPerSec, config) / 1000;
}

// ============================================
// SPEED CLASSIFICATION
// ============================================

export type SpeedClass = 'slow' | 'medium' | 'fast';

/**
 * Classify drag speed
 */
export function classifySpeed(
  speedMmPerSec: number,
  config: PredictiveAdaptiveConfig = PREDICTIVE_ADAPTIVE
): SpeedClass {
  if (speedMmPerSec < config.speedMin) return 'slow';
  if (speedMmPerSec > config.speedMax) return 'fast';
  return 'medium';
}

/**
 * Get lookahead info for debugging
 */
export function getLookaheadInfo(
  speedMmPerSec: number,
  config: PredictiveAdaptiveConfig = PREDICTIVE_ADAPTIVE
): {
  speedClass: SpeedClass;
  lookaheadMs: number;
  interpolationT: number;
} {
  const { speedMin, speedMax } = config;
  const t = clamp((speedMmPerSec - speedMin) / (speedMax - speedMin), 0, 1);

  return {
    speedClass: classifySpeed(speedMmPerSec, config),
    lookaheadMs: computeAdaptiveLookaheadMs(speedMmPerSec, config),
    interpolationT: t,
  };
}
