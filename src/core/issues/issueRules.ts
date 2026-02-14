/**
 * issueRules.ts - Issue Blocking Rules
 *
 * Determines if a manifest has blocking issues that prevent release.
 *
 * POLICY:
 * - ERROR + (OPEN | IN_PROGRESS) = blocking
 * - WARNING or INFO = non-blocking
 * - RESOLVED or WAIVED = non-blocking
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { IssuePack, IssueItem } from './issueTypes';

/**
 * Result of blocking check
 */
export interface BlockingResult {
  /** Whether there are blocking issues */
  blocked: boolean;
  /** Number of blocking issues */
  count: number;
  /** Human-readable summary */
  summary: string;
}

/**
 * Get all issues from all issue packs (flat array)
 */
export function getAllIssuesFromPacks(packs: IssuePack[]): IssueItem[] {
  return packs.flatMap((pack) => pack.items);
}

/**
 * Check if a manifest has blocking issues
 *
 * Blocking = ERROR severity + (OPEN or IN_PROGRESS) status
 */
export function checkManifestBlocking(head: SignedJobManifest): BlockingResult {
  const packs = head.issuePacks ?? [];
  const allIssues = getAllIssuesFromPacks(packs);

  const blocking = allIssues.filter(
    (i) => i.severity === 'ERROR' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS')
  );

  return {
    blocked: blocking.length > 0,
    count: blocking.length,
    summary:
      blocking.length === 0
        ? 'No blocking issues'
        : `${blocking.length} blocking issue(s): ${blocking.map((i) => i.title).join(', ')}`,
  };
}
