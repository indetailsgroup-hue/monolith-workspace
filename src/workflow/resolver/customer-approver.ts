// Feature: monolith-workflow-copilot — customer approver set resolution (Req 20.1, 20.2, 8.4)
import type { ApprovalQuorum, ProcessStep } from '../domain/types';
import { CUSTOMER_APPROVAL_STEPS } from '../domain/constants';

/** ขั้นที่มีลูกค้าร่วมอนุมัติ (Req 20.2) */
export function isCustomerApprovalStep(step: ProcessStep): boolean {
  return (CUSTOMER_APPROVAL_STEPS as readonly string[]).includes(step);
}

export interface CustomerApproverInput {
  step: ProcessStep;
  /** internal Designer lead (RACI Accountable) */
  internalLeadIds: readonly string[];
  /** primary_customer_id (project-scoped, 1 คน/โครงการ) — null ถ้าไม่มี */
  primaryCustomerId: string | null;
}

export interface CustomerApproverResult {
  approverIds: string[];
  quorum: ApprovalQuorum;
  includesCustomer: boolean;
}

/**
 * Req 20.1/20.2 + §3 — สำหรับ design step:
 *   set = { internal lead (RACI), Customer_Approver } quorum=unanimous
 *   Req 8.4 (Designer lead ไม่ escalate) ไม่ override การเพิ่ม customer
 *   primary_customer_id NULL → internal เดี่ยว (degrade single)
 * non-design step → internal ตามปกติ.
 */
export function resolveCustomerApproverSet(
  input: CustomerApproverInput,
  nonCustomerQuorum: ApprovalQuorum,
): CustomerApproverResult {
  const withCustomer = isCustomerApprovalStep(input.step) && input.primaryCustomerId !== null;
  const ids = [...input.internalLeadIds];
  if (withCustomer) ids.push(input.primaryCustomerId as string);
  return {
    approverIds: ids,
    quorum: withCustomer ? 'unanimous' : nonCustomerQuorum,
    includesCustomer: withCustomer,
  };
}
