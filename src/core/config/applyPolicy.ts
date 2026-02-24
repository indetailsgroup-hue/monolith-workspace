/**
 * applyPolicy.ts - Apply Policy Evaluator
 *
 * PURPOSE:
 * - Evaluate whether a tuning patch should be applied
 * - Check shadow report verdict
 * - Validate confidence threshold
 * - Ensure no metric worsens beyond threshold
 *
 * POLICY RULES:
 * 1. Shadow verdict must be IMPROVES
 * 2. Average suggestion confidence >= minConfidence
 * 3. No metric can worsen by more than maxWorsenPct
 * 4. Shadow simulation must have been run (if required)
 *
 * USAGE:
 * const decision = evaluateApplyPolicy({
 *   report: shadowReport,
 *   avgConfidence: 0.75,
 *   minConfidence: 0.65,
 *   maxWorsenPct: 5,
 * });
 *
 * if (decision.ok) {
 *   // Safe to apply
 * } else {
 *   console.log('Rejected:', decision.reasons);
 * }
 */

import type { ShadowReport, ShadowVerdict } from '../telemetry/shadowMetrics';
import type { ApplyDecision, TuningApplyPolicy } from './runtimeTuningTypes';

// ============================================
// EVALUATE APPLY POLICY
// ============================================

export interface EvaluateApplyArgs {
  /** Shadow simulation report */
  report: ShadowReport;

  /** Average confidence from suggestions used */
  avgConfidence: number;

  /** Minimum required confidence */
  minConfidence: number;

  /** Maximum allowed worsening on any metric (%) */
  maxWorsenPct: number;
}

/**
 * Evaluate whether applying a tuning patch is allowed
 *
 * @returns Decision with ok/reasons/warnings
 */
export function evaluateApplyPolicy(args: EvaluateApplyArgs): ApplyDecision {
  const { report, avgConfidence, minConfidence, maxWorsenPct } = args;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Rule 1: Verdict must be IMPROVES
  if (report.verdict !== 'IMPROVES') {
    reasons.push(`Verdict must be IMPROVES (got ${report.verdict})`);
  }

  // Rule 2: Confidence check
  if (avgConfidence < minConfidence) {
    reasons.push(
      `Confidence ${(avgConfidence * 100).toFixed(0)}% is below minimum ${(minConfidence * 100).toFixed(0)}%`
    );
  }

  // Rule 3: Check for metric worsening
  const delta = report.delta;
  const metricChecks: Array<[string, number]> = [
    ['collision time (avg)', delta.collisionMsAvgPct],
    ['collision time (max)', delta.collisionMsMaxPct],
    ['SAT pairs', delta.satPairsAvgPct],
    ['near items', delta.nearItemsAvgPct],
    ['candidates (avg)', delta.candidateAvgPct],
    ['candidates (max)', delta.candidateMaxPct],
    ['flip-flop rate', delta.flipFlopPct],
  ];

  for (const [name, pct] of metricChecks) {
    if (pct > maxWorsenPct) {
      reasons.push(
        `Metric "${name}" worsened by +${pct.toFixed(1)}% (max allowed: +${maxWorsenPct}%)`
      );
    } else if (pct > 0 && pct <= maxWorsenPct) {
      // Minor worsening is a warning
      warnings.push(
        `Metric "${name}" slightly worse (+${pct.toFixed(1)}%) but within threshold`
      );
    }
  }

  // Rule 4: Sample count check (warning only)
  if (report.base.samples < 20 || report.trial.samples < 20) {
    warnings.push(
      `Low sample count (base: ${report.base.samples}, trial: ${report.trial.samples})`
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
  };
}

// ============================================
// QUICK CHECK HELPERS
// ============================================

/**
 * Quick check if verdict allows apply
 */
export function isVerdictApprovable(verdict: ShadowVerdict): boolean {
  return verdict === 'IMPROVES';
}

/**
 * Check if any metric worsened significantly
 */
export function hasSignificantWorsening(
  report: ShadowReport,
  threshold: number
): boolean {
  const d = report.delta;
  return (
    d.collisionMsAvgPct > threshold ||
    d.collisionMsMaxPct > threshold ||
    d.satPairsAvgPct > threshold ||
    d.nearItemsAvgPct > threshold ||
    d.candidateAvgPct > threshold ||
    d.candidateMaxPct > threshold ||
    d.flipFlopPct > threshold
  );
}

/**
 * Calculate overall improvement score
 *
 * Negative = improvement, positive = worsening
 */
export function calculateImprovementScore(report: ShadowReport): number {
  const d = report.delta;

  // Weighted average of key metrics (negative = better)
  const weights = {
    collision: 0.3,
    candidates: 0.25,
    satPairs: 0.2,
    nearItems: 0.15,
    flipFlop: 0.1,
  };

  return (
    d.collisionMsAvgPct * weights.collision +
    d.candidateAvgPct * weights.candidates +
    d.satPairsAvgPct * weights.satPairs +
    d.nearItemsAvgPct * weights.nearItems +
    d.flipFlopPct * weights.flipFlop
  );
}

// ============================================
// POLICY VALIDATION
// ============================================

/**
 * Validate policy values are reasonable
 */
export function validatePolicy(policy: TuningApplyPolicy): string[] {
  const errors: string[] = [];

  if (policy.minConfidence < 0 || policy.minConfidence > 1) {
    errors.push('minConfidence must be between 0 and 1');
  }

  if (policy.maxWorsenPct < 0 || policy.maxWorsenPct > 50) {
    errors.push('maxWorsenPct must be between 0 and 50');
  }

  if (policy.requireVerdict !== 'IMPROVES') {
    errors.push('requireVerdict must be IMPROVES');
  }

  return errors;
}

// ============================================
// FORMAT HELPERS
// ============================================

/**
 * Format apply decision for display
 */
export function formatApplyDecision(decision: ApplyDecision): string {
  const lines: string[] = [];

  lines.push(`Apply Allowed: ${decision.ok ? 'YES' : 'NO'}`);

  if (decision.reasons.length > 0) {
    lines.push('');
    lines.push('Rejection Reasons:');
    for (const reason of decision.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  if (decision.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of decision.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}
