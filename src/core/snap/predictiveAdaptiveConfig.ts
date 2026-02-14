/**
 * predictiveAdaptiveConfig.ts - Adaptive Lookahead Configuration
 *
 * ARCHITECTURE:
 * - Lookahead time scales with drag speed
 * - Slow drag: 50ms (less prediction, more responsive)
 * - Fast drag: 100ms (more prediction, less overshoot)
 *
 * TUNING:
 * - speedMin: Below this speed, use minLookaheadMs
 * - speedMax: Above this speed, use maxLookaheadMs
 * - Between: Linear interpolation
 */

// ============================================
// ADAPTIVE CONFIGURATION
// ============================================

export const PREDICTIVE_ADAPTIVE = {
  /**
   * Minimum lookahead time (ms)
   * Used when dragging slowly
   */
  minLookaheadMs: 50,

  /**
   * Maximum lookahead time (ms)
   * Used when dragging fast
   */
  maxLookaheadMs: 100,

  /**
   * Speed threshold for minimum lookahead (mm/s)
   * Below this: use minLookaheadMs
   */
  speedMin: 50,

  /**
   * Speed threshold for maximum lookahead (mm/s)
   * Above this: use maxLookaheadMs
   */
  speedMax: 800,

  /**
   * Maximum predictive delta per axis (mm)
   * Clamps prediction to prevent wild jumps
   */
  maxLookaheadMm: 140,

  /**
   * Use prediction for engagement only
   * If true: snap delta uses real position
   * If false: snap delta uses predicted position
   */
  useForEngagementOnly: true,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type PredictiveAdaptiveConfig = typeof PREDICTIVE_ADAPTIVE;

/**
 * Create custom adaptive config
 */
export function createPredictiveAdaptiveConfig(
  overrides: Partial<PredictiveAdaptiveConfig>
): PredictiveAdaptiveConfig {
  return {
    ...PREDICTIVE_ADAPTIVE,
    ...overrides,
  } as PredictiveAdaptiveConfig;
}
