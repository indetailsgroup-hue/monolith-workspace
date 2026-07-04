// Feature: monolith-workflow-copilot — approver resolution from RACI + C12 (Req 3.1–3.6)

export interface ApproverCandidate {
  id: string;
  /** เป็น Accountable ใน RACI_Map ของ Process_Step หรือไม่ (Req 3.1) */
  isAccountable: boolean;
  /** มี C12_Role เพียงพอ (has_any_app_role) หรือไม่ (Req 3.2) */
  hasAppRole: boolean;
}

export type ResolveApproverResult =
  | { ok: true; approverIds: string[]; requiresQuorum: boolean }
  | { ok: false; failSafe: true; escalateTo: 'executive_owner'; audit: 'no_eligible_approver' };

/**
 * Req 3.1–3.4 — Approver = (Accountable ∩ has_any_app_role):
 *   หลายคน → ครบทุกคน + ผูก quorum (requiresQuorum = true)
 *   ว่าง → fail-safe block + escalate executive_owner + audit
 * caller ต้องส่ง candidates จาก RACI ฉบับล่าสุด (Req 3.6).
 */
export function resolveApprovers(
  candidates: readonly ApproverCandidate[],
): ResolveApproverResult {
  const eligible = candidates.filter((c) => c.isAccountable && c.hasAppRole);
  if (eligible.length === 0) {
    return {
      ok: false,
      failSafe: true,
      escalateTo: 'executive_owner',
      audit: 'no_eligible_approver',
    };
  }
  return {
    ok: true,
    approverIds: eligible.map((c) => c.id),
    requiresQuorum: eligible.length > 1,
  };
}
