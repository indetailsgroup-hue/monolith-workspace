/**
 * issueRules.ts - Issue Pack Blocking Rules
 *
 * POLICY:
 * - ERROR severity issues with OPEN or IN_PROGRESS status block release
 * - RESOLVED and WAIVED issues do not block
 * - WARNING and INFO issues do not block
 *
 * This implements "nothing reaches factory without passing the Gate".
 */

import type { IssuePack, IssueItem } from './issueTypes';

// ============================================
// BLOCKING RESULT
// ============================================

export interface BlockingResult {
  /** True if release is blocked */
  blocked: boolean;

  /** Number of blocking issues */
  count: number;

  /** List of blocking issue IDs (for reference) */
  issueIds: string[];

  /** Human-readable summary */
  summary: string;
}

// ============================================
// EXTRACT ISSUES
// ============================================

/**
 * Get all issues from issue packs
 */
export function getAllIssuesFromPacks(packs: IssuePack[]): IssueItem[] {
  return packs.flatMap((p) => p.items ?? []);
}

// ============================================
// BLOCKING LOGIC
// ============================================

/**
 * Check if an issue is blocking
 */
export function isBlockingIssue(issue: IssueItem): boolean {
  return (
    issue.severity === 'ERROR' &&
    (issue.status === 'OPEN' || issue.status === 'IN_PROGRESS')
  );
}

/**
 * Get blocking issues from packs
 */
export function getBlockingIssues(packs: IssuePack[]): IssueItem[] {
  return getAllIssuesFromPacks(packs).filter(isBlockingIssue);
}

/**
 * Check if issue packs have blocking issues
 *
 * Use this before allowing release/export.
 */
export function hasBlockingIssues(packs: IssuePack[]): BlockingResult {
  const blocking = getBlockingIssues(packs);

  if (blocking.length === 0) {
    return {
      blocked: false,
      count: 0,
      issueIds: [],
      summary: 'No blocking issues',
    };
  }

  return {
    blocked: true,
    count: blocking.length,
    issueIds: blocking.map((i) => i.id),
    summary: `Blocked by ${blocking.length} issue(s): ${blocking
      .slice(0, 3)
      .map((i) => i.source.code)
      .join(', ')}${blocking.length > 3 ? '...' : ''}`,
  };
}

// ============================================
// MANIFEST INTEGRATION
// ============================================

/**
 * Interface for manifest with optional issuePacks
 * (matches SignedJobManifest structure)
 */
export interface ManifestWithIssuePacks {
  issuePacks?: IssuePack[];
}

/**
 * Check if manifest head has blocking issues
 *
 * @param head - Manifest head (may have issuePacks)
 * @returns Blocking result
 */
export function checkManifestBlocking(
  head: ManifestWithIssuePacks
): BlockingResult {
  const packs = head.issuePacks ?? [];

  if (packs.length === 0) {
    return {
      blocked: false,
      count: 0,
      issueIds: [],
      summary: 'No issue packs',
    };
  }

  return hasBlockingIssues(packs);
}

// ============================================
// SUMMARY HELPERS
// ============================================

/**
 * Get summary of all issues in packs
 */
export function summarizeIssues(packs: IssuePack[]): {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  blocking: number;
} {
  const all = getAllIssuesFromPacks(packs);

  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let blocking = 0;

  for (const issue of all) {
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;

    if (isBlockingIssue(issue)) {
      blocking++;
    }
  }

  return {
    total: all.length,
    byStatus,
    bySeverity,
    blocking,
  };
}

/**
 * Format blocking status for UI display
 */
export function formatBlockingStatus(result: BlockingResult): string {
  if (!result.blocked) {
    return 'CLEAR - Ready for release';
  }

  return `BLOCKED - ${result.count} issue(s) must be resolved or waived`;
}
