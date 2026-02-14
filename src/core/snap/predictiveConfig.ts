/**
 * predictiveConfig.ts - Configuration for Predictive Snapping
 *
 * ARCHITECTURE:
 * - Look ahead 50-100ms to predict where cabinet will be
 * - Engage snap lock earlier to reduce overshoot
 * - Clamp prediction to prevent wild jumps
 *
 * USE CASES:
 * - Fast dragging: engage snap before cursor reaches threshold
 * - Reduce overshoot when user overshoots snap point
 * - Smoother engagement at higher drag speeds
 */

// ============================================
// PREDICTIVE CONFIGURATION
// ============================================

export const PREDICTIVE_CONFIG = {
  /**
   * Lookahead time in milliseconds
   * How far ahead to predict position
   */
  lookaheadMs: 75,

  /**
   * Maximum lookahead distance (mm)
   * Clamps prediction to prevent wild jumps
   */
  maxLookaheadMm: 120,

  /**
   * Use prediction for engagement/selection only
   * If true: delta calculation uses current state, not predicted
   * If false: both engagement and delta use predicted state
   *
   * Recommended: true (safer, more stable)
   */
  useForEngagementOnly: true,

  /**
   * Minimum speed to use prediction (mm/s)
   * Below this, prediction has no effect
   */
  minSpeedForPrediction: 50,

  /**
   * Adaptive lookahead: scale with speed
   * If true: faster = longer lookahead (up to max)
   */
  adaptiveLookahead: true,

  /**
   * Speed at which max lookahead is reached (mm/s)
   */
  maxSpeedForLookahead: 500,

  /**
   * Minimum lookahead when adaptive (ms)
   */
  minLookaheadMs: 40,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type PredictiveConfig = typeof PREDICTIVE_CONFIG;

/**
 * Create custom predictive config
 */
export function createPredictiveConfig(
  overrides: Partial<PredictiveConfig>
): PredictiveConfig {
  return {
    ...PREDICTIVE_CONFIG,
    ...overrides,
  } as PredictiveConfig;
}
