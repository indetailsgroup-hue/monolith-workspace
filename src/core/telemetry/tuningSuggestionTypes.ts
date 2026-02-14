/**
 * tuningSuggestionTypes.ts - Tuning Suggestion Event Types
 *
 * PURPOSE:
 * - Define structured suggestion events
 * - Map alerts to actionable parameter changes
 * - Provide confidence levels and rationale
 *
 * SUGGESTION CODES:
 * - ADJUST_NEAR_PADDING: Reduce nearPaddingMm to cut SAT workload
 * - ADJUST_CELL_SIZE: Increase cellSizeMm for coarser hashing
 * - ADJUST_SNAP_THRESHOLD: Reduce snapThresholdMm to limit candidates
 * - ADJUST_LOOKAHEAD: Tune predictive lookahead for stability
 * - REDUCE_ANCHORS: Reduce anchor count (if custom anchors)
 * - INCREASE_STICKY_MARGIN: Prevent candidate flip-flop
 * - ADJUST_HYSTERESIS: Tune engage/disengage thresholds
 * - FIXED_STEP_TUNE: Adjust fixed-step update rate
 */

import type { TelemetryEventBase } from './telemetryTypes';
import type { AlertCode } from './alertTypes';

// ============================================
// SUGGESTION CODES
// ============================================

export type SuggestionCode =
  | 'ADJUST_NEAR_PADDING'
  | 'ADJUST_CELL_SIZE'
  | 'ADJUST_SNAP_THRESHOLD'
  | 'ADJUST_LOOKAHEAD'
  | 'REDUCE_ANCHORS'
  | 'INCREASE_STICKY_MARGIN'
  | 'ADJUST_HYSTERESIS'
  | 'FIXED_STEP_TUNE';

// ============================================
// PROPOSED CHANGE
// ============================================

export interface ProposedChange {
  /** Current value */
  from: number;

  /** Suggested new value */
  to: number;

  /** Unit for display (e.g., 'mm', 'ms', 'Hz') */
  unit?: string;

  /** Change direction */
  direction: 'increase' | 'decrease';

  /** Percentage change */
  percentChange: number;
}

// ============================================
// SUGGESTION EVENT
// ============================================

export interface TuningSuggestionEvent extends TelemetryEventBase {
  kind: 'SUGGESTION';

  /** Alert that triggered this suggestion */
  fromAlert: AlertCode;

  /** Suggestion code */
  code: SuggestionCode;

  /** Human-readable title */
  title: string;

  /** Detailed rationale explaining why this change helps */
  rationale: string;

  /** Proposed parameter changes */
  proposed: Record<string, ProposedChange>;

  /** Confidence level (0-1) */
  confidence: number;

  /** Running count for this suggestion code */
  count: number;

  /** Priority (higher = more important) */
  priority: number;

  /** Expected impact description */
  expectedImpact?: string;
}

// ============================================
// SUGGESTION METADATA
// ============================================

export interface SuggestionMetadata {
  code: SuggestionCode;
  title: string;
  description: string;
  icon: string;
  color: string;
  targetParameter: string;
}

export const SUGGESTION_METADATA: Record<SuggestionCode, SuggestionMetadata> = {
  ADJUST_NEAR_PADDING: {
    code: 'ADJUST_NEAR_PADDING',
    title: 'Adjust Near Padding',
    description: 'Reduce nearPaddingMm to limit broad-phase candidates',
    icon: '📏',
    color: '#f97316',
    targetParameter: 'nearPaddingMm',
  },
  ADJUST_CELL_SIZE: {
    code: 'ADJUST_CELL_SIZE',
    title: 'Adjust Cell Size',
    description: 'Increase cellSizeMm for coarser spatial hashing',
    icon: '🔲',
    color: '#8b5cf6',
    targetParameter: 'cellSizeMm',
  },
  ADJUST_SNAP_THRESHOLD: {
    code: 'ADJUST_SNAP_THRESHOLD',
    title: 'Adjust Snap Threshold',
    description: 'Reduce snapThresholdMm to limit candidate count',
    icon: '🎯',
    color: '#3b82f6',
    targetParameter: 'snapThresholdMm',
  },
  ADJUST_LOOKAHEAD: {
    code: 'ADJUST_LOOKAHEAD',
    title: 'Adjust Lookahead',
    description: 'Tune predictive lookahead for stability',
    icon: '⏩',
    color: '#10b981',
    targetParameter: 'lookaheadMaxMs',
  },
  REDUCE_ANCHORS: {
    code: 'REDUCE_ANCHORS',
    title: 'Reduce Anchors',
    description: 'Reduce custom anchor count per cabinet',
    icon: '⚓',
    color: '#6366f1',
    targetParameter: 'anchorCount',
  },
  INCREASE_STICKY_MARGIN: {
    code: 'INCREASE_STICKY_MARGIN',
    title: 'Increase Sticky Margin',
    description: 'Prevent rapid candidate switching',
    icon: '🧲',
    color: '#ec4899',
    targetParameter: 'stickyScoreMargin',
  },
  ADJUST_HYSTERESIS: {
    code: 'ADJUST_HYSTERESIS',
    title: 'Adjust Hysteresis',
    description: 'Tune engage/disengage thresholds',
    icon: '🔄',
    color: '#a855f7',
    targetParameter: 'hysteresisGap',
  },
  FIXED_STEP_TUNE: {
    code: 'FIXED_STEP_TUNE',
    title: 'Tune Fixed Step',
    description: 'Adjust fixed-step update rate',
    icon: '⚡',
    color: '#f59e0b',
    targetParameter: 'fixedStepHz',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get suggestion metadata
 */
export function getSuggestionMetadata(code: SuggestionCode): SuggestionMetadata {
  return SUGGESTION_METADATA[code];
}

/**
 * Get suggestion icon
 */
export function getSuggestionIcon(code: SuggestionCode): string {
  return SUGGESTION_METADATA[code]?.icon ?? '💡';
}

/**
 * Get suggestion color
 */
export function getSuggestionColor(code: SuggestionCode): string {
  return SUGGESTION_METADATA[code]?.color ?? '#94a3b8';
}

/**
 * Create proposed change object
 */
export function createProposedChange(
  from: number,
  to: number,
  unit?: string
): ProposedChange {
  const direction = to > from ? 'increase' : 'decrease';
  const percentChange = from !== 0 ? Math.abs((to - from) / from) * 100 : 0;

  return {
    from,
    to,
    unit,
    direction,
    percentChange,
  };
}

/**
 * Format proposed change for display
 */
export function formatProposedChange(param: string, change: ProposedChange): string {
  const arrow = change.direction === 'increase' ? '↑' : '↓';
  const unit = change.unit ?? '';
  return `${arrow} ${param}: ${change.from}${unit} → ${change.to}${unit} (${change.percentChange.toFixed(0)}%)`;
}
