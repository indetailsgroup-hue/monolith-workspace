/**
 * constraintConfig.ts - Configuration for Snap Constraints
 *
 * FEATURES:
 * - Hysteresis thresholds (engage/disengage)
 * - Sticky candidate margin
 * - Anti-jitter settings
 *
 * HYSTERESIS:
 * - Engage when distance < engageMm
 * - Disengage when distance > disengageMm
 * - Prevents rapid on/off switching
 */

// ============================================
// CONSTRAINT CONFIGURATION
// ============================================

export const CONSTRAINT_CONFIG = {
  /**
   * Distance to engage snap lock (mm)
   * When best candidate is closer than this, lock is engaged
   */
  engageMm: 50,

  /**
   * Distance to disengage snap lock (mm)
   * Must be > engageMm for hysteresis
   */
  disengageMm: 60,

  /**
   * Score margin required to auto-switch candidates
   * Current candidate won't be replaced unless new one is better by this margin
   */
  stickyScoreMargin: 0.08,

  /**
   * Minimum time (ms) between candidate switches
   * Prevents rapid switching
   */
  minSwitchIntervalMs: 100,

  /**
   * Enable axis locking when engaged
   */
  enableAxisLock: true,

  /**
   * Enable sticky candidate selection
   */
  enableStickyCandidate: true,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type ConstraintConfig = typeof CONSTRAINT_CONFIG;

/**
 * Create custom constraint config
 */
export function createConstraintConfig(
  overrides: Partial<ConstraintConfig>
): ConstraintConfig {
  return {
    ...CONSTRAINT_CONFIG,
    ...overrides,
  } as ConstraintConfig;
}
