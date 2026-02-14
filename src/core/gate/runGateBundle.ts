/**
 * runGateBundle.ts - Gate Bundle Runner for Multi-Select
 *
 * ARCHITECTURE:
 * - Runs gate validation for all cabinets in selection
 * - Merges collision issues with per-cabinet gate issues
 * - Returns unified GateBundleResult
 *
 * USAGE:
 * const result = runGateBundle({
 *   selection: previewPositions,
 *   collisionReport,
 *   minGapMm: 1,
 *   runGatePerCabinet,
 * });
 *
 * if (!result.ok) {
 *   // Block commit
 * }
 */

import type { CabinetInstanceMinimal } from '../collision/collisionAdapter';
import type { CollisionReport } from '../collision/collisionReport';
import type { GateBundleResult, GatePerCabinet, GateIssue } from './gateBundleTypes';
import { collisionReportToGateIssues, indexIssuesBySubject } from './collisionToIssues';

// ============================================
// TYPES
// ============================================

/**
 * Per-cabinet gate runner function
 */
export type RunGatePerCabinetFn = (
  cab: CabinetInstanceMinimal
) => { ok: boolean; issues: GateIssue[] };

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Run gate validation for entire selection
 *
 * @param args.selection - Preview positions of selected cabinets
 * @param args.collisionReport - Collision report (may be null)
 * @param args.minGapMm - Minimum gap for collision messages
 * @param args.runGatePerCabinet - Function to run per-cabinet gate checks
 * @returns Combined GateBundleResult
 */
export function runGateBundle(args: {
  selection: CabinetInstanceMinimal[];
  collisionReport: CollisionReport | null;
  minGapMm: number;
  runGatePerCabinet: RunGatePerCabinetFn;
}): GateBundleResult {
  const perCabinet: GatePerCabinet[] = [];

  // Convert collision report to gate issues
  const collisionIssues = collisionReportToGateIssues({
    report: args.collisionReport,
    minGapMm: args.minGapMm,
    symmetric: true,
  });

  // Index collision issues by subject ID
  const collisionBySubject = indexIssuesBySubject(collisionIssues);

  let totalIssues = 0;
  let errorCount = 0;
  let warningCount = 0;

  // Run gate for each cabinet
  for (const cab of args.selection) {
    const baseResult = args.runGatePerCabinet(cab);
    const collisionForCab = collisionBySubject.get(cab.id) ?? [];

    // Merge issues
    const allIssues = [...baseResult.issues, ...collisionForCab];

    // Check if any errors
    const hasError = allIssues.some(i => i.severity === 'ERROR');
    const ok = !hasError;

    // Count issues
    for (const issue of allIssues) {
      totalIssues++;
      if (issue.severity === 'ERROR') errorCount++;
      else warningCount++;
    }

    perCabinet.push({
      id: cab.id,
      ok,
      issues: allIssues,
    });
  }

  // Global issues (collision issues without subject)
  const globalIssues = collisionBySubject.get('__GLOBAL__') ?? [];
  for (const issue of globalIssues) {
    totalIssues++;
    if (issue.severity === 'ERROR') errorCount++;
    else warningCount++;
  }

  const ok = errorCount === 0;

  return {
    ok,
    perCabinet,
    globalIssues,
    totalIssues,
    errorCount,
    warningCount,
  };
}

/**
 * Simple gate runner that only checks collision
 * (Use when you don't have per-cabinet gate checks)
 */
export function runGateBundleCollisionOnly(args: {
  selection: CabinetInstanceMinimal[];
  collisionReport: CollisionReport | null;
  minGapMm: number;
}): GateBundleResult {
  return runGateBundle({
    ...args,
    runGatePerCabinet: () => ({ ok: true, issues: [] }),
  });
}

/**
 * Check if gate bundle blocks commit
 */
export function isGateBundleBlocked(result: GateBundleResult | null): boolean {
  if (!result) return false;
  return !result.ok;
}

/**
 * Get summary string for gate bundle
 */
export function formatGateBundleSummary(result: GateBundleResult): string {
  if (result.ok) {
    return `Gate OK (${result.warningCount} warnings)`;
  }
  return `Gate BLOCKED: ${result.errorCount} errors, ${result.warningCount} warnings`;
}

/**
 * Get formatted issues list
 */
export function formatGateBundleIssues(result: GateBundleResult): string[] {
  const formatted: string[] = [];

  for (const pc of result.perCabinet) {
    for (const issue of pc.issues) {
      formatted.push(`[${issue.severity}] ${issue.message}`);
    }
  }

  for (const issue of result.globalIssues) {
    formatted.push(`[${issue.severity}] ${issue.message}`);
  }

  return formatted;
}
