/**
 * shadowTelemetry.ts - Shadow Simulation Telemetry
 *
 * PURPOSE:
 * - Define telemetry event for shadow reports
 * - Push shadow reports to telemetry pipeline
 * - Integrate with existing telemetry system
 *
 * USAGE:
 * import { pushShadowReport } from './shadowTelemetry';
 *
 * const report = await runShadowComparison(...);
 * pushShadowReport(report);
 */

import type { TelemetryEventBase } from './telemetryTypes';
import type { ShadowReport, ShadowVerdict } from './shadowMetrics';
import { telemetryPush } from './telemetryPipeline';
import { nowMs } from './timer';
import { TELEMETRY } from './telemetrySingleton';

// ============================================
// SHADOW REPORT EVENT TYPE
// ============================================

/**
 * Telemetry event for shadow simulation reports
 */
export interface TelemetryShadowReport extends TelemetryEventBase {
  kind: 'SHADOW_REPORT';

  /** Full shadow report data */
  report: ShadowReport;

  /** Quick-access verdict */
  verdict: ShadowVerdict;

  /** Quick-access key deltas */
  collisionDeltaPct: number;
  candidateDeltaPct: number;
}

// ============================================
// PUSH SHADOW REPORT
// ============================================

/**
 * Push shadow report to telemetry pipeline
 */
export function pushShadowReport(report: ShadowReport): void {
  if (!TELEMETRY.isEnabled()) return;

  const level = report.verdict === 'IMPROVES'
    ? 'INFO'
    : report.verdict === 'WORSENS'
      ? 'WARN'
      : 'INFO';

  const event: TelemetryShadowReport = {
    ts: nowMs(),
    level,
    kind: 'SHADOW_REPORT',
    report,
    verdict: report.verdict,
    collisionDeltaPct: report.delta.collisionMsAvgPct,
    candidateDeltaPct: report.delta.candidateAvgPct,
  };

  // Push directly to ring buffer (not through pipeline to avoid alert/suggest processing)
  TELEMETRY.push(event as any);

  // Increment counter
  TELEMETRY.inc('shadow.report');
  TELEMETRY.inc(`shadow.${report.verdict.toLowerCase()}`);
}

// ============================================
// QUERY SHADOW REPORTS
// ============================================

/**
 * Get recent shadow reports from telemetry
 */
export function getRecentShadowReports(limit: number = 5): TelemetryShadowReport[] {
  const events = TELEMETRY.snapshot(200);
  return events
    .filter((e): e is TelemetryShadowReport => e.kind === 'SHADOW_REPORT')
    .slice(0, limit);
}

/**
 * Get latest shadow report
 */
export function getLatestShadowReport(): TelemetryShadowReport | null {
  const reports = getRecentShadowReports(1);
  return reports[0] ?? null;
}

// ============================================
// SHADOW STATISTICS
// ============================================

/**
 * Get shadow simulation statistics
 */
export function getShadowStats(): {
  totalRuns: number;
  improves: number;
  worsens: number;
  mixed: number;
  inconclusive: number;
} {
  return {
    totalRuns: TELEMETRY.counters['shadow.report'] ?? 0,
    improves: TELEMETRY.counters['shadow.improves'] ?? 0,
    worsens: TELEMETRY.counters['shadow.worsens'] ?? 0,
    mixed: TELEMETRY.counters['shadow.mixed'] ?? 0,
    inconclusive: TELEMETRY.counters['shadow.inconclusive'] ?? 0,
  };
}

// ============================================
// FORMAT HELPERS
// ============================================

/**
 * Format shadow report for console output
 */
export function formatShadowReport(report: ShadowReport): string {
  const lines: string[] = [
    `Shadow Report: ${report.id}`,
    `Duration: ${report.durationSec.toFixed(1)}s`,
    `Verdict: ${report.verdict}`,
    '',
    'Deltas (negative = better):',
    `  Collision ms:  ${report.delta.collisionMsAvgPct.toFixed(1)}%`,
    `  SAT pairs:     ${report.delta.satPairsAvgPct.toFixed(1)}%`,
    `  Near items:    ${report.delta.nearItemsAvgPct.toFixed(1)}%`,
    `  Candidates:    ${report.delta.candidateAvgPct.toFixed(1)}%`,
    `  Flip-flop:     ${report.delta.flipFlopPct.toFixed(1)}%`,
  ];

  if (report.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of report.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return lines.join('\n');
}

/**
 * Log shadow report to console
 */
export function logShadowReport(report: ShadowReport): void {
  const emoji = report.verdict === 'IMPROVES' ? 'v' :
    report.verdict === 'WORSENS' ? 'x' :
      report.verdict === 'MIXED' ? '~' : '?';

  console.log(`[ShadowRun] ${emoji} ${report.verdict}`);
  console.log(formatShadowReport(report));
}
