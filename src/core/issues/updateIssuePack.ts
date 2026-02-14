/**
 * updateIssuePack.ts - Update Issue in Packs
 *
 * Immutably updates an issue within its pack.
 * Returns new array of packs with the updated issue.
 *
 * @version 1.0.0
 */

import type { IssuePack, IssueItem, IssueStatus } from './issueTypes';

/**
 * Partial update for an issue item
 */
export interface IssuePatch {
  status?: IssueStatus;
  owner?: string;
  note?: string;
  resolvedIso?: string;
  waivedBy?: string;
  waivedReason?: string;
  waivedAtIso?: string;
  unwaivedAtIso?: string;
  unwaivedBy?: string;
  unwaivedReason?: string;
}

/**
 * Update an issue within its packs (immutable)
 *
 * @returns New array of packs with the updated issue
 */
export function updateIssueInPacks(args: {
  packs: IssuePack[];
  issueId: string;
  patch: IssuePatch;
  nowIso: string;
}): IssuePack[] {
  const { packs, issueId, patch, nowIso } = args;

  return packs.map((pack) => ({
    ...pack,
    items: pack.items.map((item) => {
      if (item.id !== issueId) return item;

      const updated: IssueItem = { ...item };

      if (patch.status !== undefined) updated.status = patch.status;
      if (patch.owner !== undefined) updated.owner = patch.owner;
      if (patch.note !== undefined) updated.note = patch.note;

      // Resolve
      if (patch.status === 'RESOLVED') {
        updated.resolvedIso = patch.resolvedIso ?? nowIso;
      }

      // Waive
      if (patch.status === 'WAIVED') {
        updated.waivedAtIso = patch.waivedAtIso ?? nowIso;
        if (patch.waivedBy) updated.waivedBy = patch.waivedBy;
        if (patch.waivedReason) updated.waivedReason = patch.waivedReason;
      }

      // Unwaive
      if (patch.unwaivedBy) {
        updated.unwaivedAtIso = patch.unwaivedAtIso ?? nowIso;
        updated.unwaivedBy = patch.unwaivedBy;
        if (patch.unwaivedReason) updated.unwaivedReason = patch.unwaivedReason;
      }

      return updated;
    }),
  }));
}
