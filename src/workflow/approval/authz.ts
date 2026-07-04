// Feature: monolith-workflow-copilot — anti-impersonation + decision effect (Req 4.3, 4.4, 4.8–4.11)
import type { WorkItemStatus } from '../domain/types';
import type { Decision } from './quorum';

export interface ApprovalAuthzInput {
  /** ผู้ตัดสินที่ resolve ผ่าน resolve_actor() — ไม่เชื่อ client id (Req 4.3) */
  resolvedActorId: string;
  /** รายชื่อ Approver ที่ได้รับอนุญาตของ request นี้ */
  authorizedApproverIds: readonly string[];
  /** การตรวจ authz อื่น (บทบาท/สิทธิ์) ผ่านหรือไม่ (Req 4.9) */
  otherAuthzPasses: boolean;
}

export type ApprovalAuthzResult =
  | { authorized: true }
  | { authorized: false; keepBlocked: true; reason: 'not_approver' | 'authz_failed' };

/**
 * Req 4.3/4.4/4.9 — กันการปลอมตัว:
 *   ผู้กด ∉ authorizedApprovers → reject + คง BLOCKED
 *   id ตรงแต่ authz อื่นไม่ผ่าน → reject + คง BLOCKED
 */
export function checkApprovalAuthz(input: ApprovalAuthzInput): ApprovalAuthzResult {
  if (!input.authorizedApproverIds.includes(input.resolvedActorId)) {
    return { authorized: false, keepBlocked: true, reason: 'not_approver' };
  }
  if (!input.otherAuthzPasses) {
    return { authorized: false, keepBlocked: true, reason: 'authz_failed' };
  }
  return { authorized: true };
}

/**
 * Req 4.8/4.10/4.11 — ผลของการตัดสินที่ authorized ต่อ Work_Item:
 *   approved → unblock/continue (blocked/awaiting_approval → in_progress)
 *   rejected → rework
 * ถ้ายังไม่ authorized ห้ามเรียกฟังก์ชันนี้ (state ต้องคง blocked).
 */
export function applyDecisionEffect(
  decision: Decision,
  current: WorkItemStatus,
): WorkItemStatus {
  if (decision === 'rejected') return 'rework';
  // approved
  if (current === 'blocked' || current === 'awaiting_approval') return 'in_progress';
  return current;
}
