/**
 * shadowOverrides.ts - Shadow Run Configuration Overrides
 *
 * PURPOSE:
 * - Define override structure for shadow simulation
 * - Allow trial runs with different parameter values
 * - Safely patch configurations without affecting runtime
 *
 * USAGE:
 * const overrides: ShadowOverrides = {
 *   nearPaddingMm: 120, // Reduce from 150
 *   cellSizeMm: 600,    // Increase from 500
 * };
 *
 * const trialConfig = patchConfig(baseConfig, overrides);
 */

// ============================================
// OVERRIDE TYPES
// ============================================

/**
 * Configuration overrides for shadow simulation
 *
 * All fields are optional; only specified fields will override base config.
 */
export interface ShadowOverrides {
  // Spatial / Collision
  /** Near-field padding for broad-phase queries (mm) */
  nearPaddingMm?: number;

  /** Spatial hash cell size (mm) */
  cellSizeMm?: number;

  // Snap
  /** Snap engagement threshold (mm) */
  snapThresholdMm?: number;

  /** Engage threshold for hysteresis (mm) */
  engageThresholdMm?: number;

  /** Disengage threshold for hysteresis (mm) */
  disengageThresholdMm?: number;

  /** Sticky score margin for candidate selection */
  stickyScoreMargin?: number;

  // Predictive
  /** Min predictive lookahead time (ms) */
  lookaheadMinMs?: number;

  /** Max predictive lookahead time (ms) */
  lookaheadMaxMs?: number;

  /** Max predictive lookahead distance (mm) */
  maxLookaheadMm?: number;

  // Fixed-step
  /** Fixed-step update frequency (Hz) */
  fixedStepHz?: number;
}

// ============================================
// HELPER: MERGE OVERRIDES
// ============================================

/**
 * Merge base config with overrides
 *
 * Only non-undefined override values replace base values.
 */
export function mergeOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: Partial<T>
): T {
  const result = { ...base };

  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const value = overrides[key];
    if (value !== undefined) {
      result[key] = value as T[keyof T];
    }
  }

  return result;
}

// ============================================
// HELPER: LIST CHANGED PARAMS
// ============================================

/**
 * List parameters that were changed by overrides
 */
export function listOverrideChanges(
  baseConfig: Record<string, number>,
  overrides: ShadowOverrides
): string[] {
  const changes: string[] = [];

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && key in baseConfig) {
      const baseValue = baseConfig[key];
      changes.push(`${key}: ${baseValue} → ${value}`);
    }
  }

  return changes;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate override values are within reasonable bounds
 */
export function validateOverrides(overrides: ShadowOverrides): string[] {
  const errors: string[] = [];

  if (overrides.nearPaddingMm !== undefined) {
    if (overrides.nearPaddingMm < 20 || overrides.nearPaddingMm > 500) {
      errors.push(`nearPaddingMm ${overrides.nearPaddingMm} out of range [20, 500]`);
    }
  }

  if (overrides.cellSizeMm !== undefined) {
    if (overrides.cellSizeMm < 100 || overrides.cellSizeMm > 2000) {
      errors.push(`cellSizeMm ${overrides.cellSizeMm} out of range [100, 2000]`);
    }
  }

  if (overrides.snapThresholdMm !== undefined) {
    if (overrides.snapThresholdMm < 20 || overrides.snapThresholdMm > 500) {
      errors.push(`snapThresholdMm ${overrides.snapThresholdMm} out of range [20, 500]`);
    }
  }

  if (overrides.stickyScoreMargin !== undefined) {
    if (overrides.stickyScoreMargin < 0 || overrides.stickyScoreMargin > 0.5) {
      errors.push(`stickyScoreMargin ${overrides.stickyScoreMargin} out of range [0, 0.5]`);
    }
  }

  if (overrides.fixedStepHz !== undefined) {
    if (overrides.fixedStepHz < 30 || overrides.fixedStepHz > 240) {
      errors.push(`fixedStepHz ${overrides.fixedStepHz} out of range [30, 240]`);
    }
  }

  if (overrides.lookaheadMaxMs !== undefined) {
    if (overrides.lookaheadMaxMs < 20 || overrides.lookaheadMaxMs > 300) {
      errors.push(`lookaheadMaxMs ${overrides.lookaheadMaxMs} out of range [20, 300]`);
    }
  }

  if (overrides.maxLookaheadMm !== undefined) {
    if (overrides.maxLookaheadMm < 50 || overrides.maxLookaheadMm > 500) {
      errors.push(`maxLookaheadMm ${overrides.maxLookaheadMm} out of range [50, 500]`);
    }
  }

  return errors;
}

// ============================================
// EMPTY CHECK
// ============================================

/**
 * Check if overrides object has any values set
 */
export function hasOverrides(overrides: ShadowOverrides): boolean {
  return Object.values(overrides).some(v => v !== undefined);
}

/**
 * Count number of override parameters
 */
export function countOverrides(overrides: ShadowOverrides): number {
  return Object.values(overrides).filter(v => v !== undefined).length;
}
