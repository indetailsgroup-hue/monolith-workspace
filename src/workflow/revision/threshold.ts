// Feature: monolith-workflow-copilot — revision threshold / billable (Req 21.5, 21.15)
import type { RevisionReason } from './classify';

/** เกณฑ์: customer_change ครั้งที่ > 1 ต่อ gate → billable + escalate PM (soft) */
export const FREE_CUSTOMER_CHANGES_PER_GATE = 1;

export interface BillableResult {
  billable: boolean;
  /** escalate PM แบบ soft (ไม่คิดเงิน, ไม่ hard-block) — Req 21.15 */
  escalatePm: boolean;
}

/**
 * Req 21.5/21.15 — นับเฉพาะ customer_change > 1/gate → billable + escalate PM (soft).
 * priorCustomerChanges = จำนวน customer_change ของ gate นี้ก่อนรายการปัจจุบัน.
 * daph_defect / scope_change / pm_judgment ไม่นับ (ไม่ silent absorb, ไม่ hard-block).
 */
export function evaluateBillable(
  reason: RevisionReason,
  priorCustomerChanges: number,
): BillableResult {
  if (reason !== 'customer_change') return { billable: false, escalatePm: false };
  const billable = priorCustomerChanges >= FREE_CUSTOMER_CHANGES_PER_GATE;
  return { billable, escalatePm: billable };
}
