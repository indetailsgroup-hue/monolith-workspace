/**
 * runGateBundle.ts - Gate Bundle Runner
 *
 * Runs gate validation across all selected cabinets.
 * Gate checking verifies manufacturing constraints before allowing commit.
 *
 * @version 1.0.0
 */

import type { GateBundleResult, GateIssue, GateResultPerCabinet } from './gateBundleTypes';
import type { CabinetInstanceMinimal } from '../collision/collisionAdapter';
import type { CollisionReport } from '../collision/collisionReport';

/**
 * Gate runner callback type
 *
 * Provided by the consumer to evaluate each cabinet.
 */
export type RunGatePerCabinetFn = (
  cabinets: CabinetInstanceMinimal[],
  selectionIds: string[]
) => GateBundleResult;

/**
 * Gate bundle runner configuration
 */
interface RunGateBundleConfig {
  /** Selected cabinets */
  selection: CabinetInstanceMinimal[];
  /** Collision report */
  collisionReport: CollisionReport | null;
  /** Minimum gap setting (mm) */
  minGapMm: number;
  /** Per-cabinet gate runner */
  runGatePerCabinet: RunGatePerCabinetFn;
}

/**
 * Run gate bundle validation
 *
 * 1. Runs per-cabinet gate checks via callback
 * 2. Adds global collision-based issues if needed
 * 3. Aggregates results
 */
export function runGateBundle(config: RunGateBundleConfig): GateBundleResult {
  const { selection, collisionReport, minGapMm, runGatePerCabinet } = config;

  // Run per-cabinet gate checks
  const selectionIds = selection.map((c) => c.id);
  const perCabinetResult = runGatePerCabinet(selection, selectionIds);

  // Add collision-based global issues
  const globalIssues: GateIssue[] = [...perCabinetResult.globalIssues];

  if (collisionReport?.blocked) {
    globalIssues.push({
      code: 'COLLISION_BLOCKED',
      message: `Collision detected: ${collisionReport.pairs.length} collision pairs`,
      severity: 'error',
    });
  }

  // Check minimum gap
  if (collisionReport && collisionReport.worstGapMm !== undefined) {
    if (collisionReport.worstGapMm < minGapMm && collisionReport.worstGapMm > 0) {
      globalIssues.push({
        code: 'MIN_GAP_VIOLATION',
        message: `Minimum gap ${minGapMm}mm violated: worst gap is ${collisionReport.worstGapMm}mm`,
        severity: 'warning',
      });
    }
  }

  // Recalculate totals
  const errorCount =
    perCabinetResult.errorCount +
    globalIssues.filter((i) => i.severity === 'error').length -
    perCabinetResult.globalIssues.filter((i) => i.severity === 'error').length;

  const warningCount =
    perCabinetResult.warningCount +
    globalIssues.filter((i) => i.severity === 'warning').length -
    perCabinetResult.globalIssues.filter((i) => i.severity === 'warning').length;

  const totalIssues = errorCount + warningCount;

  return {
    ok: errorCount === 0,
    perCabinet: perCabinetResult.perCabinet,
    globalIssues,
    totalIssues,
    errorCount,
    warningCount,
  };
}
