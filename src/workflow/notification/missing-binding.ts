// Feature: monolith-workflow-copilot — escalation when no active binding (Req 1.4)

export interface MissingBindingInput {
  /** ผู้รับเป้าหมายมี binding active หรือไม่ */
  hasActiveBinding: boolean;
  /** หัวหน้าแผนกที่มี binding (ผู้รับการยกระดับ) */
  deptHeadWithBinding?: string | null;
}

export type AuditEvent = 'binding_missing_failure' | 'binding_missing_escalation';

export type MissingBindingResult =
  | { action: 'deliver_direct' } // มี binding → ส่งตรงตามปกติ
  | { action: 'escalate'; escalateTo: string; audits: AuditEvent[] }
  | { action: 'escalate_unresolved'; audits: AuditEvent[] }; // ไม่มีหัวหน้าที่มี binding

/**
 * Req 1.4 — ไม่มี binding active ขณะต้องส่ง → ยกระดับหัวหน้าแผนกที่มี binding ทันที
 * + audit คู่ (original failure + escalation); ไม่ block/queue รอ setup binding.
 */
export function resolveMissingBinding(input: MissingBindingInput): MissingBindingResult {
  if (input.hasActiveBinding) return { action: 'deliver_direct' };
  const audits: AuditEvent[] = ['binding_missing_failure', 'binding_missing_escalation'];
  if (input.deptHeadWithBinding) {
    return { action: 'escalate', escalateTo: input.deptHeadWithBinding, audits };
  }
  // ไม่มีหัวหน้าที่มี binding → ยังคง audit คู่ ไม่ block
  return { action: 'escalate_unresolved', audits };
}
