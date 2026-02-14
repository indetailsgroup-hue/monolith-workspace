/**
 * autoSuggestTuning.ts - Automatic Parameter Tuning Suggestions
 *
 * PURPOSE:
 * - Analyze alerts and suggest configuration changes
 * - Provide actionable recommendations to optimize performance
 * - Calculate expected impact of changes
 *
 * SUGGESTIONS:
 * - NEAR_ITEMS_HIGH → reduce nearPaddingMm or increase cellSizeMm
 * - SAT_SLOW → reduce nearPaddingMm or optimize collision pairs
 * - CANDIDATES_HIGH → reduce snapThreshold or increase cellSizeMm
 * - ENGAGE_FLIPFLOP → increase hysteresis gap
 * - DT_SPIKE → reduce scene complexity or optimize rendering
 */

import type { AlertCode, TelemetryAlertEvent } from './alertTypes';
import { TELEMETRY } from './telemetrySingleton';

// ============================================
// SUGGESTION TYPES
// ============================================

export interface TuningSuggestion {
  /** Target parameter to adjust */
  parameter: string;

  /** Current value (if known) */
  currentValue?: number;

  /** Suggested new value */
  suggestedValue: number;

  /** Change direction */
  direction: 'increase' | 'decrease';

  /** Change percentage */
  changePercent: number;

  /** Expected impact description */
  expectedImpact: string;

  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';

  /** Rationale */
  rationale: string;

  /** Priority (higher = more important) */
  priority: number;
}

export interface TuningReport {
  /** Alert code that triggered analysis */
  alertCode: AlertCode;

  /** Generated suggestions */
  suggestions: TuningSuggestion[];

  /** Timestamp */
  ts: number;

  /** Alert metrics that informed suggestions */
  metrics: Record<string, number>;
}

// ============================================
// CURRENT CONFIG (for reference)
// ============================================

export interface CurrentConfig {
  // Collision
  nearPaddingMm: number;
  cellSizeMm: number;

  // Snap
  snapThresholdMm: number;
  engageThresholdMm: number;
  disengageThresholdMm: number;
  stickyMargin: number;

  // Predictive
  maxLookaheadMm: number;
  minLookaheadMs: number;
  maxLookaheadMs: number;
}

export const DEFAULT_CURRENT_CONFIG: CurrentConfig = {
  nearPaddingMm: 150,
  cellSizeMm: 500,
  snapThresholdMm: 300,
  engageThresholdMm: 50,
  disengageThresholdMm: 60,
  stickyMargin: 0.08,
  maxLookaheadMm: 140,
  minLookaheadMs: 50,
  maxLookaheadMs: 100,
};

// ============================================
// SUGGESTION GENERATORS
// ============================================

/**
 * Generate suggestions for NEAR_ITEMS_HIGH alert
 */
function suggestForNearItemsHigh(
  metrics: Record<string, number>,
  config: CurrentConfig
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = [];
  const nearItems = metrics.nearItems ?? 0;

  // Suggestion 1: Reduce nearPaddingMm
  const newPadding = Math.max(50, config.nearPaddingMm - 30);
  suggestions.push({
    parameter: 'nearPaddingMm',
    currentValue: config.nearPaddingMm,
    suggestedValue: newPadding,
    direction: 'decrease',
    changePercent: ((config.nearPaddingMm - newPadding) / config.nearPaddingMm) * 100,
    expectedImpact: `Reduce spatial query results by ~${Math.round(20)}%`,
    confidence: 'high',
    rationale: `nearItems=${nearItems} is high; reducing padding will reduce query scope`,
    priority: 8,
  });

  // Suggestion 2: Increase cellSizeMm
  const newCellSize = Math.min(800, config.cellSizeMm + 150);
  suggestions.push({
    parameter: 'cellSizeMm',
    currentValue: config.cellSizeMm,
    suggestedValue: newCellSize,
    direction: 'increase',
    changePercent: ((newCellSize - config.cellSizeMm) / config.cellSizeMm) * 100,
    expectedImpact: `Reduce hash cell overlap, fewer items per query`,
    confidence: 'medium',
    rationale: `Larger cells reduce the number of cells to check`,
    priority: 5,
  });

  return suggestions;
}

/**
 * Generate suggestions for SAT_SLOW alert
 */
function suggestForSatSlow(
  metrics: Record<string, number>,
  config: CurrentConfig
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = [];
  const satMs = metrics.ms ?? 0;
  const satPairs = metrics.satPairsTried ?? 0;

  // If many pairs, reduce nearPaddingMm
  if (satPairs > 20) {
    const newPadding = Math.max(50, config.nearPaddingMm - 40);
    suggestions.push({
      parameter: 'nearPaddingMm',
      currentValue: config.nearPaddingMm,
      suggestedValue: newPadding,
      direction: 'decrease',
      changePercent: ((config.nearPaddingMm - newPadding) / config.nearPaddingMm) * 100,
      expectedImpact: `Reduce SAT pairs from ${satPairs} to ~${Math.round(satPairs * 0.6)}`,
      confidence: 'high',
      rationale: `${satPairs} SAT pairs checked; reducing padding will reduce pairs`,
      priority: 9,
    });
  }

  // General: increase cellSize
  const newCellSize = Math.min(900, config.cellSizeMm + 200);
  suggestions.push({
    parameter: 'cellSizeMm',
    currentValue: config.cellSizeMm,
    suggestedValue: newCellSize,
    direction: 'increase',
    changePercent: ((newCellSize - config.cellSizeMm) / config.cellSizeMm) * 100,
    expectedImpact: `Faster spatial queries, fewer overlapping cells`,
    confidence: 'medium',
    rationale: `SAT took ${satMs.toFixed(1)}ms; larger cells can help`,
    priority: 6,
  });

  return suggestions;
}

/**
 * Generate suggestions for CANDIDATES_HIGH alert
 */
function suggestForCandidatesHigh(
  metrics: Record<string, number>,
  config: CurrentConfig
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = [];
  const candidates = metrics.candidateCount ?? 0;

  // Reduce snapThreshold
  const newThreshold = Math.max(100, config.snapThresholdMm - 50);
  suggestions.push({
    parameter: 'snapThresholdMm',
    currentValue: config.snapThresholdMm,
    suggestedValue: newThreshold,
    direction: 'decrease',
    changePercent: ((config.snapThresholdMm - newThreshold) / config.snapThresholdMm) * 100,
    expectedImpact: `Reduce candidates from ${candidates} to ~${Math.round(candidates * 0.7)}`,
    confidence: 'high',
    rationale: `${candidates} candidates is high; narrower threshold will reduce count`,
    priority: 7,
  });

  return suggestions;
}

/**
 * Generate suggestions for ENGAGE_FLIPFLOP alert
 */
function suggestForEngageFlipFlop(
  metrics: Record<string, number>,
  config: CurrentConfig
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = [];

  // Increase hysteresis gap
  const currentGap = config.disengageThresholdMm - config.engageThresholdMm;
  const newGap = currentGap + 15;

  suggestions.push({
    parameter: 'disengageThresholdMm',
    currentValue: config.disengageThresholdMm,
    suggestedValue: config.engageThresholdMm + newGap,
    direction: 'increase',
    changePercent: ((newGap - currentGap) / currentGap) * 100,
    expectedImpact: `Reduce flip-flop by increasing hysteresis gap from ${currentGap}mm to ${newGap}mm`,
    confidence: 'high',
    rationale: `Rapid engage/disengage indicates hysteresis gap is too small`,
    priority: 8,
  });

  // Increase stickyMargin
  const newMargin = Math.min(0.15, config.stickyMargin + 0.03);
  suggestions.push({
    parameter: 'stickyMargin',
    currentValue: config.stickyMargin,
    suggestedValue: newMargin,
    direction: 'increase',
    changePercent: ((newMargin - config.stickyMargin) / config.stickyMargin) * 100,
    expectedImpact: `Reduce candidate switching; more "sticky" selection`,
    confidence: 'medium',
    rationale: `Higher margin prevents candidate changes from small score differences`,
    priority: 5,
  });

  return suggestions;
}

/**
 * Generate suggestions for PREDICTIVE_CLAMP alert
 */
function suggestForPredictiveClamp(
  metrics: Record<string, number>,
  config: CurrentConfig
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = [];

  // Increase maxLookaheadMm
  const newMax = Math.min(200, config.maxLookaheadMm + 40);
  suggestions.push({
    parameter: 'maxLookaheadMm',
    currentValue: config.maxLookaheadMm,
    suggestedValue: newMax,
    direction: 'increase',
    changePercent: ((newMax - config.maxLookaheadMm) / config.maxLookaheadMm) * 100,
    expectedImpact: `Allow larger predictive deltas for fast drags`,
    confidence: 'medium',
    rationale: `Frequent clamping indicates users are dragging faster than prediction allows`,
    priority: 4,
  });

  return suggestions;
}

// ============================================
// MAIN SUGGESTION FUNCTION
// ============================================

/**
 * Generate tuning suggestions based on alert
 */
export function generateSuggestions(
  alert: TelemetryAlertEvent,
  config: CurrentConfig = DEFAULT_CURRENT_CONFIG
): TuningReport {
  let suggestions: TuningSuggestion[] = [];

  switch (alert.code) {
    case 'NEAR_ITEMS_HIGH':
      suggestions = suggestForNearItemsHigh(alert.metrics, config);
      break;
    case 'SAT_SLOW':
      suggestions = suggestForSatSlow(alert.metrics, config);
      break;
    case 'CANDIDATES_HIGH':
      suggestions = suggestForCandidatesHigh(alert.metrics, config);
      break;
    case 'ENGAGE_FLIPFLOP':
      suggestions = suggestForEngageFlipFlop(alert.metrics, config);
      break;
    case 'PREDICTIVE_CLAMP':
      suggestions = suggestForPredictiveClamp(alert.metrics, config);
      break;
  }

  // Sort by priority (highest first)
  suggestions.sort((a, b) => b.priority - a.priority);

  return {
    alertCode: alert.code,
    suggestions,
    ts: alert.ts,
    metrics: alert.metrics,
  };
}

/**
 * Get suggestions from recent alerts
 */
export function getSuggestionsFromRecentAlerts(
  config: CurrentConfig = DEFAULT_CURRENT_CONFIG,
  limit: number = 5
): TuningReport[] {
  const events = TELEMETRY.snapshot(200);
  const alerts = events.filter(e => e.kind === 'ALERT').slice(0, limit) as TelemetryAlertEvent[];

  return alerts.map(alert => generateSuggestions(alert, config));
}

/**
 * Get top suggestion across all recent alerts
 */
export function getTopSuggestion(
  config: CurrentConfig = DEFAULT_CURRENT_CONFIG
): TuningSuggestion | null {
  const reports = getSuggestionsFromRecentAlerts(config, 10);

  let topSuggestion: TuningSuggestion | null = null;
  let topPriority = -1;

  for (const report of reports) {
    for (const suggestion of report.suggestions) {
      if (suggestion.priority > topPriority) {
        topPriority = suggestion.priority;
        topSuggestion = suggestion;
      }
    }
  }

  return topSuggestion;
}

// ============================================
// APPLY SUGGESTION (just returns new config)
// ============================================

/**
 * Apply suggestion to config (returns new config, doesn't mutate)
 */
export function applySuggestion(
  config: CurrentConfig,
  suggestion: TuningSuggestion
): CurrentConfig {
  return {
    ...config,
    [suggestion.parameter]: suggestion.suggestedValue,
  };
}

/**
 * Format suggestion as human-readable string
 */
export function formatSuggestion(suggestion: TuningSuggestion): string {
  const arrow = suggestion.direction === 'increase' ? '↑' : '↓';
  const current = suggestion.currentValue?.toFixed(1) ?? '?';
  const suggested = suggestion.suggestedValue.toFixed(1);

  return `${arrow} ${suggestion.parameter}: ${current} → ${suggested} (${suggestion.changePercent.toFixed(0)}%)\n  └ ${suggestion.expectedImpact}`;
}
