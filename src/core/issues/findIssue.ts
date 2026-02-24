/**
 * findIssue.ts - Issue Finder Helpers
 *
 * Utilities for finding issues within packs.
 */

import type { IssuePack, IssueItem } from './issueTypes';

// ============================================
// FIND BY ID
// ============================================

/**
 * Find an issue by ID within a list of packs
 *
 * @param packs - Issue packs to search
 * @param issueId - Issue ID to find
 * @returns Issue item or null if not found
 */
export function findIssueInPacks(
  packs: IssuePack[],
  issueId: string
): IssueItem | null {
  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      if (item.id === issueId) {
        return item;
      }
    }
  }
  return null;
}

/**
 * Find issue with pack context
 */
export function findIssueWithPack(
  packs: IssuePack[],
  issueId: string
): { pack: IssuePack; issue: IssueItem } | null {
  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      if (item.id === issueId) {
        return { pack, issue: item };
      }
    }
  }
  return null;
}

// ============================================
// FIND BY CRITERIA
// ============================================

/**
 * Find all issues matching criteria
 */
export function findIssues(
  packs: IssuePack[],
  criteria: {
    status?: IssueItem['status'] | IssueItem['status'][];
    severity?: IssueItem['severity'] | IssueItem['severity'][];
    domain?: string | string[];
    code?: string | string[];
  }
): IssueItem[] {
  const results: IssueItem[] = [];

  const matchArray = <T>(value: T, filter: T | T[] | undefined): boolean => {
    if (filter === undefined) return true;
    if (Array.isArray(filter)) return filter.includes(value);
    return value === filter;
  };

  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      if (!matchArray(item.status, criteria.status)) continue;
      if (!matchArray(item.severity, criteria.severity)) continue;
      if (!matchArray(item.source.domain, criteria.domain)) continue;
      if (!matchArray(item.source.code, criteria.code)) continue;

      results.push(item);
    }
  }

  return results;
}

// ============================================
// COUNTING HELPERS
// ============================================

/**
 * Count issues by status across all packs
 */
export function countByStatus(
  packs: IssuePack[]
): Record<IssueItem['status'], number> {
  const counts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    WAIVED: 0,
  };

  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      counts[item.status]++;
    }
  }

  return counts;
}

/**
 * Count issues by severity across all packs
 */
export function countBySeverity(
  packs: IssuePack[]
): Record<IssueItem['severity'], number> {
  const counts = {
    ERROR: 0,
    WARNING: 0,
    INFO: 0,
  };

  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      counts[item.severity]++;
    }
  }

  return counts;
}

/**
 * Count issues by domain across all packs
 */
export function countByDomain(
  packs: IssuePack[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const pack of packs) {
    for (const item of pack.items ?? []) {
      const domain = item.source.domain;
      counts[domain] = (counts[domain] || 0) + 1;
    }
  }

  return counts;
}
