/**
 * syncTuningContext.ts - Sync Runtime Config to SUGGEST Engine
 *
 * PURPOSE:
 * - Read current configuration from various config sources
 * - Update SUGGEST engine context with actual runtime values
 * - Ensure suggestions are based on real configuration
 *
 * USAGE:
 * import { syncTuningContextFromConfig, syncAllTuningContext } from './syncTuningContext';
 *
 * // Sync specific config
 * syncTuningContextFromConfig({
 *   nearPaddingMm: 150,
 *   cellSizeMm: 500,
 * });
 *
 * // Full sync from all config sources
 * syncAllTuningContext();
 *
 * CONFIG SOURCES:
 * - spatialHashConfig: cellSizeMm
 * - nearFieldConfig: nearPaddingMm
 * - snapConfig: snapThresholdMm, engage/disengage thresholds
 * - predictiveConfig: lookahead settings
 * - fixedStepConfig: fixedStepHz
 */

import { SUGGEST } from './telemetryPipeline';
import type { TuningContextSnapshot } from './tuningSuggestionEngine';
import { getRuntimeConfigs } from '../config/configProvider';
import { SPATIAL_CONFIG, SNAP_CONSTANTS } from '../config/snapClearanceConfig';
import { PREDICTIVE_CONFIG } from '../snap/predictiveConfig';
import { CONSTRAINT_CONFIG } from '../snap/constraintConfig';
import { FIXED_STEP_CONFIG } from '../drag/fixedStepSampler';

// ============================================
// SYNC FROM PARTIAL CONFIG
// ============================================

/**
 * Sync partial config to SUGGEST engine
 *
 * Call this whenever you change a tunable parameter at runtime.
 *
 * @example
 * // After changing nearPaddingMm
 * syncTuningContextFromConfig({ nearPaddingMm: 120 });
 */
export function syncTuningContextFromConfig(
  partial: Partial<TuningContextSnapshot>
): void {
  SUGGEST.setContext(partial);
}

// ============================================
// CONFIG READERS (adapt to your config system)
// ============================================

/**
 * Read spatial hash config
 * Reads from runtime configs with fallback to base SPATIAL_CONFIG
 */
function readSpatialHashConfig(): Partial<TuningContextSnapshot> {
  const runtime = getRuntimeConfigs();
  return {
    cellSizeMm: runtime.cellSizeMm ?? SPATIAL_CONFIG.cellSizeMm,
  };
}

/**
 * Read near-field collision config
 * Reads from runtime configs with fallback to base SPATIAL_CONFIG
 */
function readNearFieldConfig(): Partial<TuningContextSnapshot> {
  const runtime = getRuntimeConfigs();
  return {
    nearPaddingMm: runtime.nearPaddingMm ?? SPATIAL_CONFIG.nearPaddingMm,
  };
}

/**
 * Read snap config
 * Reads from runtime configs with fallbacks to base SNAP_CONSTANTS and CONSTRAINT_CONFIG
 */
function readSnapConfig(): Partial<TuningContextSnapshot> {
  const runtime = getRuntimeConfigs();
  return {
    snapThresholdMm: runtime.snapThresholdMm ?? SNAP_CONSTANTS.snapThresholdMm,
    engageThresholdMm: runtime.engageThresholdMm ?? CONSTRAINT_CONFIG.engageMm,
    disengageThresholdMm: runtime.disengageThresholdMm ?? CONSTRAINT_CONFIG.disengageMm,
    stickyScoreMargin: runtime.stickyScoreMargin ?? CONSTRAINT_CONFIG.stickyScoreMargin,
  };
}

/**
 * Read predictive config
 * Reads from runtime configs with fallbacks to base PREDICTIVE_CONFIG
 */
function readPredictiveConfig(): Partial<TuningContextSnapshot> {
  const runtime = getRuntimeConfigs();
  return {
    lookaheadMinMs: runtime.lookaheadMinMs ?? PREDICTIVE_CONFIG.minLookaheadMs,
    lookaheadMaxMs: runtime.lookaheadMaxMs ?? PREDICTIVE_CONFIG.lookaheadMs,
    maxLookaheadMm: runtime.maxLookaheadMm ?? PREDICTIVE_CONFIG.maxLookaheadMm,
  };
}

/**
 * Read fixed-step sampler config
 * Reads from runtime configs with fallback to base FIXED_STEP_CONFIG
 */
function readFixedStepConfig(): Partial<TuningContextSnapshot> {
  const runtime = getRuntimeConfigs();
  return {
    fixedStepHz: runtime.fixedStepHz ?? FIXED_STEP_CONFIG.stepHz,
  };
}

// ============================================
// FULL SYNC
// ============================================

/**
 * Sync all tuning context from all config sources
 *
 * Call this at app init or when configs are hot-reloaded.
 *
 * @example
 * // In app init
 * syncAllTuningContext();
 */
export function syncAllTuningContext(): void {
  // Collect from all sources
  const spatialHash = readSpatialHashConfig();
  const nearField = readNearFieldConfig();
  const snap = readSnapConfig();
  const predictive = readPredictiveConfig();
  const fixedStep = readFixedStepConfig();

  // Merge and sync
  SUGGEST.setContext({
    ...spatialHash,
    ...nearField,
    ...snap,
    ...predictive,
    ...fixedStep,
  });
}

// ============================================
// SPECIALIZED SYNC FUNCTIONS
// ============================================

/**
 * Sync collision-related config
 */
export function syncCollisionTuningContext(config: {
  nearPaddingMm?: number;
  cellSizeMm?: number;
}): void {
  SUGGEST.setContext(config);
}

/**
 * Sync snap-related config
 */
export function syncSnapTuningContext(config: {
  snapThresholdMm?: number;
  engageThresholdMm?: number;
  disengageThresholdMm?: number;
  stickyScoreMargin?: number;
}): void {
  SUGGEST.setContext(config);
}

/**
 * Sync predictive-related config
 */
export function syncPredictiveTuningContext(config: {
  lookaheadMinMs?: number;
  lookaheadMaxMs?: number;
  maxLookaheadMm?: number;
}): void {
  SUGGEST.setContext(config);
}

/**
 * Sync fixed-step config
 */
export function syncFixedStepTuningContext(config: {
  fixedStepHz?: number;
}): void {
  SUGGEST.setContext(config);
}

// ============================================
// QUERY CURRENT CONTEXT
// ============================================

/**
 * Get current tuning context from SUGGEST engine
 *
 * Useful for debugging or displaying current config in UI.
 */
export function getTuningContext(): TuningContextSnapshot {
  return SUGGEST.getContext();
}

/**
 * Log current tuning context to console
 */
export function logTuningContext(): void {
  const ctx = getTuningContext();
  console.log('[TuningContext]', ctx);
}

// ============================================
// INTEGRATION HOOKS
// ============================================

/**
 * Create a sync function bound to a specific config source
 *
 * @example
 * const syncSpatial = createSyncHook('cellSizeMm');
 * // Later, when config changes:
 * syncSpatial(600);
 */
export function createSyncHook<K extends keyof TuningContextSnapshot>(
  key: K
): (value: TuningContextSnapshot[K]) => void {
  return (value) => {
    SUGGEST.setContext({ [key]: value } as Partial<TuningContextSnapshot>);
  };
}

/**
 * Install auto-sync on config change
 *
 * This is a utility for reactive config systems (e.g., Zustand, MobX).
 *
 * @example
 * // With Zustand store subscription
 * useConfigStore.subscribe(
 *   (state) => state.nearPaddingMm,
 *   (nearPaddingMm) => syncTuningContextFromConfig({ nearPaddingMm })
 * );
 */
export function installConfigAutoSync<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  extract: (value: T) => Partial<TuningContextSnapshot>
): () => void {
  return subscribe((value) => {
    const partial = extract(value);
    if (Object.keys(partial).length > 0) {
      SUGGEST.setContext(partial);
    }
  });
}
