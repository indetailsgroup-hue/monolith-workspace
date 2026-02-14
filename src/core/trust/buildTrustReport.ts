/**
 * buildTrustReport.ts - Build Trust Report from Validation Results
 *
 * ARCHITECTURE:
 * - Combines gate and collision results into TrustReport
 * - Calculates collision summary from CollisionReport
 * - Includes SpecStatus for state machine enforcement
 * - Used after multi-select commit validation
 */

import type { CollisionReport } from '../collision/collisionReport';
import type { GateBundleResult } from '../gate/gateBundleTypes';
import type { TrustReport, TrustCollisionSummary } from './trustReportTypes';
import type { SpecStatus } from '../spec/specState';

// ============================================
// COLLISION SUMMARY BUILDER
// ============================================

/**
 * Build collision summary from CollisionReport
 */
export function summarizeCollision(
  report: CollisionReport | null
): TrustCollisionSummary {
  if (!report) {
    return { blocked: false, pairCount: 0 };
  }

  // Calculate worst penetration
  let worstPenetration = 0;
  let worstGap = Infinity;
  let internalCount = 0;
  let externalCount = 0;

  for (const pair of report.pairs) {
    worstPenetration = Math.max(worstPenetration, pair.penetrationMm);
    worstGap = Math.min(worstGap, pair.gapMm);

    if (pair.source === 'INTERNAL') internalCount++;
    else if (pair.source === 'EXTERNAL') externalCount++;
  }

  const summary: TrustCollisionSummary = {
    blocked: report.blocked,
    pairCount: report.pairs.length,
  };

  // Only include if there are pairs
  if (report.pairs.length > 0) {
    summary.worstPenetrationMm = Number(worstPenetration.toFixed(3));
    summary.worstGapMm = Number(worstGap.toFixed(3));
    summary.internalCount = internalCount;
    summary.externalCount = externalCount;
  }

  return summary;
}

// ============================================
// TRUST REPORT BUILDER
// ============================================

/**
 * Build TrustReport from validation results
 *
 * @param args.jobId - Job/project identifier
 * @param args.selectionIds - IDs of selected cabinets
 * @param args.activeId - Active cabinet ID (pivot)
 * @param args.spec - Spec status (DRAFT/FROZEN/RELEASED)
 * @param args.gate - Gate bundle result
 * @param args.collision - Collision report
 * @param args.snapshotHashHex - Optional snapshot hash (factory lock)
 * @param args.inputsHash - Optional hash of inputs
 * @param args.sceneHash - Optional hash of scene
 * @returns TrustReport
 */
export function buildTrustReport(args: {
  jobId: string;
  selectionIds: string[];
  activeId: string | null;
  spec?: SpecStatus;
  gate: GateBundleResult;
  collision: CollisionReport | null;
  snapshotHashHex?: string;
  inputsHash?: string;
  sceneHash?: string;
}): TrustReport {
  const report: TrustReport = {
    version: '1.0',
    jobId: args.jobId,
    timestampIso: new Date().toISOString(),
    selectionIds: args.selectionIds,
    activeId: args.activeId,
    spec: args.spec ?? { state: 'DRAFT' },
    gate: args.gate,
    collision: summarizeCollision(args.collision),
  };

  // Include optional hashes
  if (args.snapshotHashHex) report.snapshotHashHex = args.snapshotHashHex;
  if (args.inputsHash) report.inputsHash = args.inputsHash;
  if (args.sceneHash) report.sceneHash = args.sceneHash;

  return report;
}

/**
 * Build minimal trust report (when only collision matters)
 */
export function buildMinimalTrustReport(args: {
  jobId: string;
  selectionIds: string[];
  collision: CollisionReport | null;
  spec?: SpecStatus;
}): TrustReport {
  return buildTrustReport({
    jobId: args.jobId,
    selectionIds: args.selectionIds,
    activeId: null,
    spec: args.spec,
    gate: {
      ok: true,
      perCabinet: [],
      globalIssues: [],
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
    },
    collision: args.collision,
  });
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if trust report allows export
 *
 * POLICY: Export requires RELEASED state + gate OK + no collision
 */
export function canExportWithTrustReport(report: TrustReport): boolean {
  return (
    report.spec.state === 'RELEASED' &&
    report.gate.ok &&
    !report.collision.blocked
  );
}

/**
 * Get blocking reasons from trust report
 */
export function getBlockingReasons(report: TrustReport): string[] {
  const reasons: string[] = [];

  if (report.spec.state !== 'RELEASED') {
    reasons.push(`Spec not released: current state is ${report.spec.state}`);
  }

  if (!report.gate.ok) {
    reasons.push(`Gate blocked: ${report.gate.errorCount} errors`);
  }

  if (report.collision.blocked) {
    reasons.push(`Collision blocked: ${report.collision.pairCount} pairs`);
  }

  return reasons;
}
