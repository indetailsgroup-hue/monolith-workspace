/**
 * findIssue.ts - Find Issue in Packs
 *
 * Searches all issue packs for an issue by ID.
 *
 * @version 1.0.0
 */

import type { IssuePack, IssueItem } from './issueTypes';

/**
 * Find an issue by ID across all issue packs
 *
 * @returns The issue item, or null if not found
 */
export function findIssueInPacks(packs: IssuePack[], issueId: string): IssueItem | null {
  for (const pack of packs) {
    const found = pack.items.find((item) => item.id === issueId);
    if (found) return found;
  }
  return null;
}
