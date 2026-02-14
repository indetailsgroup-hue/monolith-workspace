/**
 * issueValidation.ts - Issue Status Change Validation
 *
 * WAIVE STRICT POLICY:
 * - WAIVED status requires waivedBy + waivedReason
 * - Service layer enforces this (defense-in-depth)
 * - UI provides modal for strict confirmation
 *
 * This ensures audit trail for all waivers.
 */

import type { IssueItem, IssueStatus } from './issueTypes';

// ============================================
// VALIDATION RESULT
// ============================================

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

// ============================================
// STATUS CHANGE VALIDATION
// ============================================

/**
 * Minimum length for waive reason
 */
export const WAIVE_REASON_MIN_LENGTH = 8;

/**
 * Minimum length for unwaive reason
 */
export const UNWAIVE_REASON_MIN_LENGTH = 8;

/**
 * Validate issue status change
 *
 * Enforces strict rules for WAIVED status:
 * - waivedBy is required (who approved the waiver)
 * - waivedReason is required (why it's acceptable)
 *
 * @param args.current - Current issue state
 * @param args.nextStatus - Proposed new status
 * @param args.patch - Proposed changes
 * @returns Validation result
 */
export function validateIssueStatusChange(args: {
  current: IssueItem;
  nextStatus: IssueStatus;
  patch: Partial<Pick<IssueItem, 'waivedBy' | 'waivedReason'>>;
}): ValidationResult {
  // Only WAIVED requires special validation
  if (args.nextStatus !== 'WAIVED') {
    return { ok: true };
  }

  // WAIVED requires waivedBy
  const by = (args.patch.waivedBy ?? '').trim();
  if (!by) {
    return { ok: false, reason: 'WAIVE requires waivedBy (who approved)' };
  }

  // WAIVED requires waivedReason with minimum length
  const reason = (args.patch.waivedReason ?? '').trim();
  if (!reason) {
    return { ok: false, reason: 'WAIVE requires waivedReason (why acceptable)' };
  }

  if (reason.length < WAIVE_REASON_MIN_LENGTH) {
    return {
      ok: false,
      reason: `WAIVE reason must be at least ${WAIVE_REASON_MIN_LENGTH} characters`,
    };
  }

  return { ok: true };
}

// ============================================
// UNWAIVE VALIDATION
// ============================================

/**
 * Validate UNWAIVE operation
 *
 * UNWAIVE STRICT POLICY:
 * - Can only unwaive issues that are currently WAIVED
 * - unwaivedBy is required (who reopened)
 * - unwaivedReason is required (why reopening)
 *
 * @param args.current - Current issue state
 * @param args.nextStatus - Target status after unwaive
 * @param args.unwaivedBy - Who is unwaiving
 * @param args.unwaivedReason - Why unwaiving
 * @returns Validation result
 */
export function validateUnwaive(args: {
  current: IssueItem;
  nextStatus: Exclude<IssueStatus, 'WAIVED'>;
  unwaivedBy?: string;
  unwaivedReason?: string;
}): ValidationResult {
  // Must be currently WAIVED to unwaive
  if (args.current.status !== 'WAIVED') {
    return { ok: false, reason: 'UNWAIVE requires current status to be WAIVED' };
  }

  // unwaivedBy is required
  const by = (args.unwaivedBy ?? '').trim();
  if (!by) {
    return { ok: false, reason: 'UNWAIVE requires unwaivedBy (who is reopening)' };
  }

  // unwaivedReason is required with minimum length
  const reason = (args.unwaivedReason ?? '').trim();
  if (!reason) {
    return { ok: false, reason: 'UNWAIVE requires unwaivedReason (why reopening)' };
  }

  if (reason.length < UNWAIVE_REASON_MIN_LENGTH) {
    return {
      ok: false,
      reason: `UNWAIVE reason must be at least ${UNWAIVE_REASON_MIN_LENGTH} characters`,
    };
  }

  // NOTE: Target status cannot be WAIVED - enforced by type system
  // Exclude<IssueStatus, 'WAIVED'> guarantees nextStatus is OPEN | IN_PROGRESS | RESOLVED

  return { ok: true };
}

// ============================================
// PATCH VALIDATION
// ============================================

/**
 * Validate patch fields
 */
export function validateIssuePatch(patch: Partial<IssueItem>): ValidationResult {
  // owner should be non-empty string if provided
  if ('owner' in patch && patch.owner !== undefined) {
    if (typeof patch.owner !== 'string') {
      return { ok: false, reason: 'owner must be a string' };
    }
  }

  // note should be string if provided
  if ('note' in patch && patch.note !== undefined) {
    if (typeof patch.note !== 'string') {
      return { ok: false, reason: 'note must be a string' };
    }
  }

  // status must be valid
  if ('status' in patch && patch.status !== undefined) {
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'WAIVED'];
    if (!validStatuses.includes(patch.status)) {
      return { ok: false, reason: `Invalid status: ${patch.status}` };
    }
  }

  return { ok: true };
}

// ============================================
// TRANSITION RULES
// ============================================

/**
 * Allowed status transitions
 *
 * Note: All transitions are allowed for flexibility,
 * but WAIVED has strict requirements (waivedBy, waivedReason).
 */
export function isValidStatusTransition(
  from: IssueStatus,
  to: IssueStatus
): boolean {
  // All transitions are technically allowed
  // The validation for WAIVED happens in validateIssueStatusChange
  return true;
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: IssueStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
    case 'WAIVED':
      return 'Waived (Strict)';
    default:
      return status;
  }
}
