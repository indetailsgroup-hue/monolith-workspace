/**
 * issueValidation.ts - Issue Status Change Validation
 *
 * Validates that issue status transitions are allowed.
 *
 * VALID TRANSITIONS:
 * - OPEN → IN_PROGRESS, RESOLVED, WAIVED
 * - IN_PROGRESS → OPEN, RESOLVED, WAIVED
 * - RESOLVED → OPEN (re-open)
 * - WAIVED → OPEN, IN_PROGRESS, RESOLVED (unwaive)
 *
 * @version 1.0.0
 */

import type { IssueItem, IssueStatus } from './issueTypes';

/** Valid transitions map */
const VALID_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'WAIVED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'WAIVED'],
  RESOLVED: ['OPEN'],
  WAIVED: ['OPEN', 'IN_PROGRESS', 'RESOLVED'],
};

/**
 * Validate an issue status change
 *
 * Checks:
 * 1. Transition is allowed
 * 2. WAIVE requires waivedBy and waivedReason (min 8 chars)
 */
export function validateIssueStatusChange(args: {
  current: IssueItem;
  nextStatus: IssueStatus;
  patch: { waivedBy?: string; waivedReason?: string };
}): { ok: true } | { ok: false; reason: string } {
  const { current, nextStatus, patch } = args;

  // Check transition is valid
  const allowed = VALID_TRANSITIONS[current.status];
  if (!allowed || !allowed.includes(nextStatus)) {
    return {
      ok: false,
      reason: `Cannot transition from ${current.status} to ${nextStatus}`,
    };
  }

  // WAIVE requires audit info
  if (nextStatus === 'WAIVED') {
    if (!patch.waivedBy || patch.waivedBy.trim().length === 0) {
      return { ok: false, reason: 'WAIVE requires waivedBy' };
    }
    if (!patch.waivedReason || patch.waivedReason.trim().length < 8) {
      return { ok: false, reason: 'WAIVE requires waivedReason (min 8 characters)' };
    }
  }

  return { ok: true };
}

/**
 * Validate unwaive operation
 *
 * Checks:
 * 1. Current status is WAIVED
 * 2. unwaivedBy is provided
 * 3. unwaivedReason is provided (min 8 chars)
 */
export function validateUnwaive(args: {
  current: IssueItem;
  nextStatus: Exclude<IssueStatus, 'WAIVED'>;
  unwaivedBy: string;
  unwaivedReason: string;
}): { ok: true } | { ok: false; reason: string } {
  const { current, nextStatus, unwaivedBy, unwaivedReason } = args;

  if (current.status !== 'WAIVED') {
    return { ok: false, reason: `Cannot unwaive: current status is ${current.status}, not WAIVED` };
  }

  if (!unwaivedBy || unwaivedBy.trim().length === 0) {
    return { ok: false, reason: 'Unwaive requires unwaivedBy' };
  }

  if (!unwaivedReason || unwaivedReason.trim().length < 8) {
    return { ok: false, reason: 'Unwaive requires unwaivedReason (min 8 characters)' };
  }

  // Check that target status is valid from WAIVED
  const allowed = VALID_TRANSITIONS['WAIVED'];
  if (!allowed.includes(nextStatus)) {
    return { ok: false, reason: `Cannot transition from WAIVED to ${nextStatus}` };
  }

  return { ok: true };
}
