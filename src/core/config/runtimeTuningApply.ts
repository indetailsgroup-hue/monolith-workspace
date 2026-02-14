/**
 * runtimeTuningApply.ts - Apply/Rollback API
 *
 * PURPOSE:
 * - Main entry point for applying tuning suggestions
 * - Policy-gated: only apply when safe
 * - Full audit logging for every action
 * - Rollback capability
 *
 * FLOW:
 * 1. User triggers "Apply" from Shadow Report
 * 2. evaluateAndApply() checks policy
 * 3. If passed, patch is applied to RUNTIME_TUNING
 * 4. Audit event pushed (APPLY or REJECT)
 * 5. Config provider automatically returns new values
 *
 * ROLLBACK:
 * 1. User triggers "Rollback"
 * 2. rollbackTuning() restores previous config
 * 3. Audit event pushed (ROLLBACK)
 *
 * USAGE:
 * import { evaluateAndApply, rollbackTuning } from './runtimeTuningApply';
 *
 * // Apply from shadow report
 * const result = evaluateAndApply({
 *   report: shadowReport,
 *   suggestions: activeSuggestions,
 * });
 *
 * if (result.success) {
 *   console.log(`Applied tuning (session: ${result.sessionId})`);
 * } else {
 *   console.log('Rejected:', result.reasons);
 * }
 *
 * // Rollback
 * const rollback = rollbackTuning();
 * if (rollback.success) {
 *   console.log('Rolled back to:', rollback.restored);
 * }
 */

import type { ShadowReport } from '../telemetry/shadowMetrics';
import type { TuningSuggestionEvent } from '../telemetry/tuningSuggestionTypes';
import type {
  RuntimeTuningPatch,
  ApplyResult,
  RollbackResult,
  TuningPatchValue,
} from './runtimeTuningTypes';

import { RUNTIME_TUNING } from './runtimeTuningStore';
import { evaluateApplyPolicy } from './applyPolicy';
import { snapshotCurrentConfigNumbers, getConfigUnit } from './configProvider';
import { pushTuningAudit } from '../telemetry/auditTelemetry';
import { nowMs } from '../telemetry/timer';

// ============================================
// EVALUATE AND APPLY
// ============================================

export interface EvaluateAndApplyArgs {
  /** Shadow simulation report */
  report: ShadowReport;

  /** Suggestions that generated the trial config */
  suggestions: TuningSuggestionEvent[];
}

/**
 * Evaluate policy and apply tuning if allowed
 *
 * This is the main entry point for applying tuning suggestions.
 * It checks all policy rules and only applies if everything passes.
 *
 * @returns ApplyResult with success status and session ID or rejection reasons
 */
export function evaluateAndApply(args: EvaluateAndApplyArgs): ApplyResult {
  const { report, suggestions } = args;
  const policy = RUNTIME_TUNING.getPolicy();

  // Calculate average confidence from suggestions
  const avgConfidence =
    suggestions.length > 0
      ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
      : 0;

  // Evaluate policy
  const decision = evaluateApplyPolicy({
    report,
    avgConfidence,
    minConfidence: policy.minConfidence,
    maxWorsenPct: policy.maxWorsenPct,
  });

  // If rejected, log audit and return
  if (!decision.ok) {
    pushTuningAudit({
      action: 'REJECT',
      sessionId: null,
      reportId: report.id,
      reasons: decision.reasons,
      warnings: decision.warnings,
    });

    return {
      success: false,
      sessionId: null,
      reasons: decision.reasons,
    };
  }

  // Build patch from suggestions
  const patch = buildPatchFromSuggestions(suggestions);

  // Snapshot current config for rollback
  const previousConfig = snapshotCurrentConfigNumbers();

  // Apply to store
  const sessionId = RUNTIME_TUNING.applyPatch(patch, previousConfig, report.id);

  // Snapshot config after apply for audit
  const configSnapshot = snapshotCurrentConfigNumbers();

  // Log audit event
  pushTuningAudit({
    action: 'APPLY',
    sessionId,
    reportId: report.id,
    patch,
    warnings: decision.warnings,
    configSnapshot,
  });

  return {
    success: true,
    sessionId,
    reasons: [],
  };
}

// ============================================
// ROLLBACK
// ============================================

export interface RollbackArgs {
  /** Optional reason for rollback (for audit) */
  reason?: string;
}

/**
 * Rollback current tuning to previous configuration
 *
 * @returns RollbackResult with success status and restored values
 */
export function rollbackTuning(args: RollbackArgs = {}): RollbackResult {
  const state = RUNTIME_TUNING.getState();

  // Nothing to rollback
  if (!state.active) {
    return {
      success: false,
      restored: null,
    };
  }

  // Calculate how long tuning was active
  const activeDurationMs = state.appliedAtTs ? nowMs() - state.appliedAtTs : undefined;
  const sessionId = state.sessionId;
  const reportId = state.lastShadowReportId;

  // Perform rollback
  const restored = RUNTIME_TUNING.rollback();

  // Snapshot config after rollback for audit
  const configSnapshot = restored ?? snapshotCurrentConfigNumbers();

  // Log audit event
  pushTuningAudit({
    action: 'ROLLBACK',
    sessionId,
    reportId,
    activeDurationMs,
    configSnapshot,
    reasons: args.reason ? [args.reason] : undefined,
  });

  return {
    success: true,
    restored,
  };
}

// ============================================
// BUILD PATCH FROM SUGGESTIONS
// ============================================

/**
 * Build RuntimeTuningPatch from suggestion events
 *
 * Extracts proposed changes and formats them for the store.
 */
function buildPatchFromSuggestions(
  suggestions: TuningSuggestionEvent[]
): RuntimeTuningPatch {
  const patch: RuntimeTuningPatch = {};

  // Sort by priority (highest first)
  const sorted = [...suggestions].sort((a, b) => b.priority - a.priority);

  for (const suggestion of sorted) {
    const proposed = suggestion.proposed ?? {};

    for (const [paramName, change] of Object.entries(proposed)) {
      // Skip if already set (higher priority wins)
      if (patch[paramName]) continue;

      // Validate change format
      if (
        typeof change === 'object' &&
        change !== null &&
        'from' in change &&
        'to' in change &&
        typeof change.from === 'number' &&
        typeof change.to === 'number'
      ) {
        const patchValue: TuningPatchValue = {
          from: change.from,
          to: change.to,
          unit: getConfigUnit(paramName as any) || undefined,
        };
        patch[paramName] = patchValue;
      }
    }
  }

  return patch;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if apply is currently possible (quick check)
 */
export function canApply(report: ShadowReport): boolean {
  // Quick check: verdict must be IMPROVES
  if (report.verdict !== 'IMPROVES') return false;

  // Already have active tuning? Can't apply another
  if (RUNTIME_TUNING.isActive()) return false;

  return true;
}

/**
 * Check if rollback is currently possible
 */
export function canRollback(): boolean {
  return RUNTIME_TUNING.isActive();
}

/**
 * Get current tuning status
 */
export function getTuningStatus(): {
  active: boolean;
  sessionId: string | null;
  appliedAtTs: number | null;
  patchedParams: string[];
} {
  const state = RUNTIME_TUNING.getState();
  return {
    active: state.active,
    sessionId: state.sessionId,
    appliedAtTs: state.appliedAtTs,
    patchedParams: state.patch ? Object.keys(state.patch) : [],
  };
}

/**
 * Get time since tuning was applied (ms)
 */
export function getTuningActiveDuration(): number | null {
  const state = RUNTIME_TUNING.getState();
  if (!state.active || !state.appliedAtTs) return null;
  return nowMs() - state.appliedAtTs;
}

// ============================================
// FORMAT HELPERS
// ============================================

/**
 * Format apply result for display
 */
export function formatApplyResult(result: ApplyResult): string {
  if (result.success) {
    return `Applied tuning successfully (session: ${result.sessionId})`;
  } else {
    return `Apply rejected:\n${result.reasons.map(r => `  - ${r}`).join('\n')}`;
  }
}

/**
 * Format rollback result for display
 */
export function formatRollbackResult(result: RollbackResult): string {
  if (result.success) {
    const params = result.restored ? Object.keys(result.restored) : [];
    return `Rolled back ${params.length} parameters`;
  } else {
    return 'Nothing to rollback';
  }
}
