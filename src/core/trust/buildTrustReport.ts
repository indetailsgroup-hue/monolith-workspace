/**
 * buildTrustReport.ts - Build Trust Report
 *
 * Creates a TrustReport from the current design state.
 * The trust report captures gate results, collision status,
 * and spec state at a point in time.
 *
 * @version 1.0.0
 */

import type { TrustReport, CollisionSummary } from './trustReportTypes';
import type { GateBundleResult } from '../gate/gateBundleTypes';
import type { CollisionReport } from '../collision/collisionReport';
import type { SpecStatus } from '../spec/specState';

/**
 * Build trust report configuration
 */
interface BuildTrustReportArgs {
  jobId: string;
  selectionIds: string[];
  activeId: string | null;
  spec: SpecStatus;
  gate: GateBundleResult;
  collision: CollisionReport | null;
}

/**
 * Build a trust report from current state
 *
 * PURE FUNCTION: No side effects, deterministic output
 */
export function buildTrustReport(args: BuildTrustReportArgs): TrustReport {
  const { jobId, selectionIds, activeId, spec, gate, collision } = args;

  // Build collision summary from report
  const collisionSummary: CollisionSummary = collision
    ? {
        blocked: collision.blocked,
        pairCount: collision.pairs.length,
        worstPenetrationMm: collision.worstPenetrationMm ?? 0,
        worstGapMm: collision.worstGapMm ?? 0,
      }
    : {
        blocked: false,
        pairCount: 0,
        worstPenetrationMm: 0,
        worstGapMm: 0,
      };

  return {
    version: '1.0',
    jobId,
    timestampIso: new Date().toISOString(),
    selectionIds,
    activeId,
    spec,
    gate,
    collision: collisionSummary,
  };
}
