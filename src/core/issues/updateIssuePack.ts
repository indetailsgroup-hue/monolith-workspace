/**
 * updateIssuePack.ts - Issue Pack Update Helpers
 *
 * Immutable updates to issue packs.
 * All updates produce new objects (append-only audit trail).
 */

import type { IssuePack, IssueItem, IssueStatus } from './issueTypes';

// ============================================
// ISSUE PATCH TYPE
// ============================================

/**
 * Fields that can be patched on an issue
 */
export type IssuePatch = Partial<
  Pick<
    IssueItem,
    | 'status'
    | 'owner'
    | 'note'
    | 'waivedAtIso'
    | 'waivedBy'
    | 'waivedReason'
    | 'unwaivedAtIso'
    | 'unwaivedBy'
    | 'unwaivedReason'
  >
>;

// ============================================
// UPDATE SINGLE ISSUE
// ============================================

/**
 * Update a single issue within packs (immutable)
 *
 * @param args.packs - Current issue packs
 * @param args.issueId - Issue ID to update
 * @param args.patch - Fields to update
 * @param args.nowIso - Current timestamp
 * @returns New packs array with updated issue
 */
export function updateIssueInPacks(args: {
  packs: IssuePack[];
  issueId: string;
  patch: IssuePatch;
  nowIso: string;
}): IssuePack[] {
  return args.packs.map((pack) => ({
    ...pack,
    items: (pack.items ?? []).map((item) => {
      if (item.id !== args.issueId) {
        return item;
      }

      return {
        ...item,
        ...args.patch,
        updatedAtIso: args.nowIso,
      };
    }),
  }));
}

// ============================================
// BULK UPDATES
// ============================================

/**
 * Update multiple issues at once
 */
export function updateMultipleIssues(args: {
  packs: IssuePack[];
  updates: Array<{ issueId: string; patch: IssuePatch }>;
  nowIso: string;
}): IssuePack[] {
  // Build lookup map for efficiency
  const updateMap = new Map(
    args.updates.map((u) => [u.issueId, u.patch])
  );

  return args.packs.map((pack) => ({
    ...pack,
    items: (pack.items ?? []).map((item) => {
      const patch = updateMap.get(item.id);
      if (!patch) {
        return item;
      }

      return {
        ...item,
        ...patch,
        updatedAtIso: args.nowIso,
      };
    }),
  }));
}

/**
 * Set all issues to a specific status
 * (useful for bulk operations)
 */
export function setAllIssuesToStatus(args: {
  packs: IssuePack[];
  status: IssueStatus;
  nowIso: string;
  waivedBy?: string;
  waivedReason?: string;
}): IssuePack[] {
  const isWaive = args.status === 'WAIVED';

  return args.packs.map((pack) => ({
    ...pack,
    items: (pack.items ?? []).map((item) => ({
      ...item,
      status: args.status,
      updatedAtIso: args.nowIso,
      ...(isWaive
        ? {
            waivedAtIso: args.nowIso,
            waivedBy: args.waivedBy,
            waivedReason: args.waivedReason,
          }
        : {}),
    })),
  }));
}

// ============================================
// FILTER HELPERS
// ============================================

/**
 * Remove resolved/waived issues from packs
 * (for creating "active issues only" view)
 */
export function filterActiveIssues(packs: IssuePack[]): IssuePack[] {
  return packs
    .map((pack) => ({
      ...pack,
      items: pack.items.filter(
        (item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS'
      ),
    }))
    .filter((pack) => pack.items.length > 0);
}

/**
 * Get all issues flattened from packs
 */
export function flattenIssues(packs: IssuePack[]): IssueItem[] {
  return packs.flatMap((pack) => pack.items ?? []);
}
