/**
 * collisionToIssues.ts - Map CollisionReport to GateIssues
 *
 * ARCHITECTURE:
 * - Converts CollisionPairs to GateIssues for gate system
 * - Creates symmetric issues (A→B and B→A) for comprehensive tracking
 * - Adds metrics for factory traceability
 */

import type { CollisionReport, CollisionPair } from '../collision/collisionReport';
import type { GateIssue } from './gateBundleTypes';
import {
  COLLISION_ISSUE,
  formatOverlapMessage,
  formatMinGapMessage,
} from './collisionIssueCodes';

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Convert CollisionReport to GateIssues
 *
 * @param args.report - CollisionReport from selection collision check
 * @param args.minGapMm - Required minimum gap (for message formatting)
 * @param args.symmetric - Create issues for both A and B (default: true)
 * @returns Array of GateIssues
 */
export function collisionReportToGateIssues(args: {
  report: CollisionReport | null;
  minGapMm: number;
  symmetric?: boolean;
}): GateIssue[] {
  if (!args.report) return [];

  const { report, minGapMm, symmetric = true } = args;
  const issues: GateIssue[] = [];

  for (const pair of report.pairs) {
    const pairIssues = collisionPairToGateIssues({
      pair,
      minGapMm,
      symmetric,
    });
    issues.push(...pairIssues);
  }

  return issues;
}

/**
 * Convert single CollisionPair to GateIssues
 */
export function collisionPairToGateIssues(args: {
  pair: CollisionPair;
  minGapMm: number;
  symmetric: boolean;
}): GateIssue[] {
  const { pair, minGapMm, symmetric } = args;
  const issues: GateIssue[] = [];

  // Determine code based on reason
  const code = pair.reason === 'OVERLAP'
    ? COLLISION_ISSUE.OVERLAP
    : COLLISION_ISSUE.MIN_GAP;

  // Generate message
  const message = pair.reason === 'OVERLAP'
    ? formatOverlapMessage({
        aId: pair.aId,
        bId: pair.bId,
        penetrationMm: pair.penetrationMm,
      })
    : formatMinGapMessage({
        aId: pair.aId,
        bId: pair.bId,
        gapMm: pair.gapMm,
        requiredMm: minGapMm,
      });

  // Create issue for A
  issues.push({
    severity: pair.severity,
    code,
    message,
    subjectId: pair.aId,
    relatedId: pair.bId,
    metrics: {
      penetrationMm: Number(pair.penetrationMm.toFixed(3)),
      gapMm: Number(pair.gapMm.toFixed(3)),
      source: pair.source,
    },
  });

  // Create symmetric issue for B
  if (symmetric) {
    const messageB = pair.reason === 'OVERLAP'
      ? formatOverlapMessage({
          aId: pair.bId,
          bId: pair.aId,
          penetrationMm: pair.penetrationMm,
        })
      : formatMinGapMessage({
          aId: pair.bId,
          bId: pair.aId,
          gapMm: pair.gapMm,
          requiredMm: minGapMm,
        });

    issues.push({
      severity: pair.severity,
      code,
      message: messageB,
      subjectId: pair.bId,
      relatedId: pair.aId,
      metrics: {
        penetrationMm: Number(pair.penetrationMm.toFixed(3)),
        gapMm: Number(pair.gapMm.toFixed(3)),
        source: pair.source,
      },
    });
  }

  return issues;
}

/**
 * Index collision issues by subject ID
 */
export function indexIssuesBySubject(
  issues: GateIssue[]
): Map<string, GateIssue[]> {
  const byId = new Map<string, GateIssue[]>();

  for (const issue of issues) {
    const id = issue.subjectId ?? '__GLOBAL__';
    const arr = byId.get(id) ?? [];
    arr.push(issue);
    byId.set(id, arr);
  }

  return byId;
}

/**
 * Get global issues (not tied to specific cabinet)
 */
export function getGlobalIssues(issues: GateIssue[]): GateIssue[] {
  return issues.filter(i => !i.subjectId);
}

/**
 * Filter issues by severity
 */
export function filterBySeverity(
  issues: GateIssue[],
  severity: 'ERROR' | 'WARNING'
): GateIssue[] {
  return issues.filter(i => i.severity === severity);
}

/**
 * Check if issues block commit
 */
export function hasBlockingIssues(issues: GateIssue[]): boolean {
  return issues.some(i => i.severity === 'ERROR');
}
