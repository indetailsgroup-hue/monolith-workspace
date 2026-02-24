/**
 * configProvider.ts - Central Configuration Provider
 *
 * PURPOSE:
 * - Central point for all config reads (solvers must use this)
 * - Applies runtime tuning overrides automatically
 * - Returns merged config: base + runtime overrides
 *
 * ARCHITECTURE:
 * - Base configs from snapClearanceConfig.ts (static)
 * - Runtime overrides from RUNTIME_TUNING store
 * - Solvers call getRuntimeConfigs() instead of importing constants
 *
 * SAFETY:
 * - Runtime overrides are non-persistent (reset on refresh)
 * - Always returns valid numeric values
 * - Falls back to base config if override is undefined
 *
 * USAGE:
 * import { getRuntimeConfigs, snapshotCurrentConfigNumbers } from './configProvider';
 *
 * // Get current effective config
 * const config = getRuntimeConfigs();
 * const nearPadding = config.nearPaddingMm; // May be overridden
 *
 * // Get snapshot for audit/shadow
 * const snapshot = snapshotCurrentConfigNumbers();
 */

import { SNAP_CONSTANTS, SPATIAL_CONFIG } from './snapClearanceConfig';
import { RUNTIME_TUNING } from './runtimeTuningStore';
import type { TuningKey } from './runtimeTuningTypes';

// ============================================
// RUNTIME CONFIG TYPE
// ============================================

/**
 * Complete runtime configuration with all tunable parameters
 */
export interface RuntimeConfig {
  // Spatial hash
  nearPaddingMm: number;
  cellSizeMm: number;

  // Snap thresholds
  snapThresholdMm: number;
  engageThresholdMm: number;
  disengageThresholdMm: number;

  // Sticky candidate
  stickyScoreMargin: number;

  // Predictive lookahead
  lookaheadMinMs: number;
  lookaheadMaxMs: number;
  maxLookaheadMm: number;

  // Fixed-step
  fixedStepHz: number;
}

// ============================================
// BASE CONFIG VALUES
// ============================================

/**
 * Base configuration values (static defaults)
 *
 * These come from various config files and represent
 * the default values before any runtime overrides.
 */
const BASE_CONFIG: RuntimeConfig = {
  // From SPATIAL_CONFIG
  nearPaddingMm: SPATIAL_CONFIG.nearPaddingMm,
  cellSizeMm: SPATIAL_CONFIG.cellSizeMm,

  // From SNAP_CONSTANTS + defaults
  snapThresholdMm: SNAP_CONSTANTS.snapThresholdMm,

  // Engage/disengage thresholds (hysteresis)
  engageThresholdMm: 25,
  disengageThresholdMm: 35,

  // Sticky candidate margin
  stickyScoreMargin: 0.15,

  // Predictive lookahead
  lookaheadMinMs: 8,
  lookaheadMaxMs: 40,
  maxLookaheadMm: 8,

  // Fixed-step simulation
  fixedStepHz: 90,
};

// ============================================
// GET RUNTIME CONFIG
// ============================================

/**
 * Get current effective runtime configuration
 *
 * Merges base config with any active runtime overrides.
 * This is the ONLY function solvers should use to read config.
 *
 * @returns Complete config with overrides applied
 */
export function getRuntimeConfigs(): RuntimeConfig {
  const config = { ...BASE_CONFIG };

  // Apply runtime overrides if tuning is active
  if (RUNTIME_TUNING.isActive()) {
    const patch = RUNTIME_TUNING.getPatch();
    if (patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (key in config && typeof value.to === 'number') {
          (config as any)[key] = value.to;
        }
      }
    }
  }

  return config;
}

/**
 * Get a single config value (convenience method)
 */
export function getConfigValue<K extends keyof RuntimeConfig>(
  key: K
): RuntimeConfig[K] {
  return getRuntimeConfigs()[key];
}

// ============================================
// CONFIG SNAPSHOT
// ============================================

/**
 * Snapshot current config as flat number record
 *
 * Used for:
 * - Audit logging (config at time of action)
 * - Shadow simulation input
 * - Rollback restoration
 *
 * @returns Record of all config keys to current values
 */
export function snapshotCurrentConfigNumbers(): Record<TuningKey, number> {
  const config = getRuntimeConfigs();

  return {
    nearPaddingMm: config.nearPaddingMm,
    cellSizeMm: config.cellSizeMm,
    snapThresholdMm: config.snapThresholdMm,
    engageThresholdMm: config.engageThresholdMm,
    disengageThresholdMm: config.disengageThresholdMm,
    stickyScoreMargin: config.stickyScoreMargin,
    lookaheadMinMs: config.lookaheadMinMs,
    lookaheadMaxMs: config.lookaheadMaxMs,
    maxLookaheadMm: config.maxLookaheadMm,
    fixedStepHz: config.fixedStepHz,
  };
}

/**
 * Get base config (without overrides)
 *
 * Useful for showing "original" values in UI
 */
export function getBaseConfig(): RuntimeConfig {
  return { ...BASE_CONFIG };
}

// ============================================
// CONFIG DIFF HELPERS
// ============================================

/**
 * Compare current config against base config
 *
 * @returns Array of changes in format "key: base -> current"
 */
export function getConfigDiff(): string[] {
  const base = BASE_CONFIG;
  const current = getRuntimeConfigs();
  const diffs: string[] = [];

  for (const key of Object.keys(base) as (keyof RuntimeConfig)[]) {
    if (base[key] !== current[key]) {
      diffs.push(`${key}: ${base[key]} -> ${current[key]}`);
    }
  }

  return diffs;
}

/**
 * Check if any config values are overridden
 */
export function hasActiveOverrides(): boolean {
  return RUNTIME_TUNING.isActive();
}

/**
 * Get list of overridden keys
 */
export function getOverriddenKeys(): TuningKey[] {
  if (!RUNTIME_TUNING.isActive()) return [];

  const patch = RUNTIME_TUNING.getPatch();
  if (!patch) return [];

  return Object.keys(patch) as TuningKey[];
}

// ============================================
// CONFIG VALIDATION
// ============================================

/**
 * Validate that config values are within safe ranges
 */
export function validateConfig(config: RuntimeConfig): string[] {
  const errors: string[] = [];

  // nearPaddingMm: 50-500mm
  if (config.nearPaddingMm < 50 || config.nearPaddingMm > 500) {
    errors.push(`nearPaddingMm ${config.nearPaddingMm} outside safe range [50-500]`);
  }

  // cellSizeMm: 200-2000mm
  if (config.cellSizeMm < 200 || config.cellSizeMm > 2000) {
    errors.push(`cellSizeMm ${config.cellSizeMm} outside safe range [200-2000]`);
  }

  // snapThresholdMm: 10-200mm
  if (config.snapThresholdMm < 10 || config.snapThresholdMm > 200) {
    errors.push(`snapThresholdMm ${config.snapThresholdMm} outside safe range [10-200]`);
  }

  // fixedStepHz: 30-240Hz
  if (config.fixedStepHz < 30 || config.fixedStepHz > 240) {
    errors.push(`fixedStepHz ${config.fixedStepHz} outside safe range [30-240]`);
  }

  // Hysteresis: engage < disengage
  if (config.engageThresholdMm >= config.disengageThresholdMm) {
    errors.push(`engageThresholdMm (${config.engageThresholdMm}) must be < disengageThresholdMm (${config.disengageThresholdMm})`);
  }

  // lookahead: min <= max
  if (config.lookaheadMinMs > config.lookaheadMaxMs) {
    errors.push(`lookaheadMinMs (${config.lookaheadMinMs}) must be <= lookaheadMaxMs (${config.lookaheadMaxMs})`);
  }

  return errors;
}

// ============================================
// FORMAT HELPERS
// ============================================

/**
 * Format config for display (with units)
 */
export function formatConfig(config: RuntimeConfig): string[] {
  return [
    `nearPaddingMm: ${config.nearPaddingMm}mm`,
    `cellSizeMm: ${config.cellSizeMm}mm`,
    `snapThresholdMm: ${config.snapThresholdMm}mm`,
    `engageThresholdMm: ${config.engageThresholdMm}mm`,
    `disengageThresholdMm: ${config.disengageThresholdMm}mm`,
    `stickyScoreMargin: ${config.stickyScoreMargin}`,
    `lookaheadMinMs: ${config.lookaheadMinMs}ms`,
    `lookaheadMaxMs: ${config.lookaheadMaxMs}ms`,
    `maxLookaheadMm: ${config.maxLookaheadMm}mm`,
    `fixedStepHz: ${config.fixedStepHz}Hz`,
  ];
}

/**
 * Get unit for a config key
 */
export function getConfigUnit(key: TuningKey): string {
  switch (key) {
    case 'nearPaddingMm':
    case 'cellSizeMm':
    case 'snapThresholdMm':
    case 'engageThresholdMm':
    case 'disengageThresholdMm':
    case 'maxLookaheadMm':
      return 'mm';
    case 'lookaheadMinMs':
    case 'lookaheadMaxMs':
      return 'ms';
    case 'fixedStepHz':
      return 'Hz';
    case 'stickyScoreMargin':
      return '';
    default:
      return '';
  }
}
