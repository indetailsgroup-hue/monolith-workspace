/**
 * runtimeTuningTypes.ts - Runtime Tuning Configuration Types
 *
 * PURPOSE:
 * - Define types for runtime configuration overrides
 * - Support apply/rollback of tuning suggestions
 * - Maintain audit trail for all changes
 *
 * POLICY:
 * - Apply only when Shadow verdict = IMPROVES
 * - Confidence must meet minimum threshold
 * - No metric can worsen beyond maxWorsenPct
 *
 * SAFETY:
 * - Changes are runtime-only (not persisted to files)
 * - Full rollback capability
 * - Complete audit logging
 */

// ============================================
// TUNING KEYS
// ============================================

/**
 * Parameters that can be tuned at runtime
 */
export type TuningKey =
  | 'nearPaddingMm'
  | 'cellSizeMm'
  | 'snapThresholdMm'
  | 'engageThresholdMm'
  | 'disengageThresholdMm'
  | 'lookaheadMinMs'
  | 'lookaheadMaxMs'
  | 'maxLookaheadMm'
  | 'stickyScoreMargin'
  | 'fixedStepHz';

// ============================================
// PATCH TYPES
// ============================================

/**
 * Single parameter change
 */
export interface TuningPatchValue {
  /** Value before change */
  from: number;

  /** Value after change */
  to: number;

  /** Unit for display (mm, ms, Hz, etc.) */
  unit?: string;
}

/**
 * Collection of parameter changes
 */
export interface RuntimeTuningPatch {
  [key: string]: TuningPatchValue;
}

// ============================================
// POLICY TYPES
// ============================================

/**
 * Policy for when to allow applying tuning suggestions
 */
export interface TuningApplyPolicy {
  /** Minimum average confidence from suggestions */
  minConfidence: number;

  /** Required verdict from shadow simulation */
  requireVerdict: 'IMPROVES';

  /** Maximum allowed worsening on any metric (%) */
  maxWorsenPct: number;

  /** Require shadow simulation before apply */
  requireSimulation: boolean;
}

/**
 * Default apply policy
 */
export const DEFAULT_APPLY_POLICY: TuningApplyPolicy = {
  minConfidence: 0.65,
  requireVerdict: 'IMPROVES',
  maxWorsenPct: 5,
  requireSimulation: true,
};

// ============================================
// STATE TYPES
// ============================================

/**
 * Runtime tuning state
 */
export interface RuntimeTuningState {
  /** Whether runtime tuning is currently active */
  active: boolean;

  /** Current applied patch (null if not active) */
  patch: RuntimeTuningPatch | null;

  /** Timestamp when patch was applied */
  appliedAtTs: number | null;

  /** Previous config values for rollback */
  previous: Record<string, number> | null;

  /** Current apply policy */
  policy: TuningApplyPolicy;

  /** ID of shadow report that led to this patch */
  lastShadowReportId: string | null;

  /** Session ID for audit trail */
  sessionId: string | null;
}

/**
 * Initial runtime tuning state
 */
export const INITIAL_TUNING_STATE: RuntimeTuningState = {
  active: false,
  patch: null,
  appliedAtTs: null,
  previous: null,
  policy: DEFAULT_APPLY_POLICY,
  lastShadowReportId: null,
  sessionId: null,
};

// ============================================
// APPLY RESULT TYPES
// ============================================

/**
 * Result of apply decision evaluation
 */
export interface ApplyDecision {
  /** Whether apply is allowed */
  ok: boolean;

  /** Reasons for rejection (if not ok) */
  reasons: string[];

  /** Warnings (even if ok) */
  warnings: string[];
}

/**
 * Result of apply operation
 */
export interface ApplyResult {
  /** Whether apply succeeded */
  success: boolean;

  /** Session ID for this tuning session */
  sessionId: string | null;

  /** Rejection reasons (if not successful) */
  reasons: string[];
}

/**
 * Result of rollback operation
 */
export interface RollbackResult {
  /** Whether rollback succeeded */
  success: boolean;

  /** Values restored */
  restored: Record<string, number> | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `tuning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if a patch has any values
 */
export function hasPatchValues(patch: RuntimeTuningPatch | null): boolean {
  if (!patch) return false;
  return Object.keys(patch).length > 0;
}

/**
 * Get list of changed parameters from patch
 */
export function getPatchedParams(patch: RuntimeTuningPatch): string[] {
  return Object.keys(patch);
}

/**
 * Format patch for display
 */
export function formatPatch(patch: RuntimeTuningPatch): string[] {
  return Object.entries(patch).map(([key, value]) => {
    const unit = value.unit ?? '';
    return `${key}: ${value.from}${unit} → ${value.to}${unit}`;
  });
}
