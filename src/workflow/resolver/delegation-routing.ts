// Feature: monolith-workflow-copilot — delegation time-window routing (Req 14.4)

export interface Delegation {
  approverId: string;
  actingApproverId: string;
  /** ช่วงเวลาที่มอบหมายมีผล (epoch ms) */
  startMs: number;
  endMs: number;
}

/**
 * Req 14.4 — ถ้าเวลาปัจจุบัน ∈ [start, end] ของ delegation ที่ valid → route ไป Acting_Approver
 * มิฉะนั้นกลับ Approver เดิม.
 */
export function routeApprover(
  originalApproverId: string,
  delegations: readonly Delegation[],
  nowMs: number,
): string {
  const active = delegations.find(
    (d) =>
      d.approverId === originalApproverId &&
      nowMs >= d.startMs &&
      nowMs <= d.endMs,
  );
  return active ? active.actingApproverId : originalApproverId;
}
