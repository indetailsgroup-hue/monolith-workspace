// Feature: monolith-workflow-copilot — approval quorum aggregation (Req 15.2–15.8)
import type { ApprovalQuorum } from '../domain/types';

export type Decision = 'approved' | 'rejected';

export interface ApproverDecision {
  approverId: string;
  decision: Decision;
}

/** ผลรวม quorum: approved → unblock/continue; rejected → rework path; pending → ยังไม่ครบ */
export type QuorumOutcome = 'approved' | 'rejected' | 'pending';

/** dedupe ตาม approverId โดยยึดการตัดสินครั้งแรกตามลำดับเวลา */
function firstPerApprover(decisions: readonly ApproverDecision[]): ApproverDecision[] {
  const seen = new Set<string>();
  const out: ApproverDecision[] = [];
  for (const d of decisions) {
    if (!seen.has(d.approverId)) {
      seen.add(d.approverId);
      out.push(d);
    }
  }
  return out;
}

/**
 * Req 15.2–15.8 — รวมผลตาม quorum:
 *   unanimous     : reject ใดก็ตาม → rejected (fail-fast); ครบทุกคน approve → approved; ไม่งั้น pending
 *   majority       : approve > ครึ่ง → approved; reject มากจน approve เป็นไปไม่ได้ → rejected; ไม่งั้น pending
 *   first_response: การตัดสินแรกชี้ขาด (approved หรือ rejected)
 * ผล rejected = เส้นทาง rework (Req 15.6–15.8).
 */
export function aggregateQuorum(
  quorum: ApprovalQuorum,
  totalApprovers: number,
  rawDecisions: readonly ApproverDecision[],
): QuorumOutcome {
  if (totalApprovers <= 0) return 'pending';
  const decisions = firstPerApprover(rawDecisions).slice(0, totalApprovers);
  const approvals = decisions.filter((d) => d.decision === 'approved').length;
  const rejections = decisions.filter((d) => d.decision === 'rejected').length;

  switch (quorum) {
    case 'unanimous': {
      if (rejections > 0) return 'rejected'; // fail-fast
      if (approvals >= totalApprovers) return 'approved';
      return 'pending';
    }
    case 'majority': {
      const needed = Math.floor(totalApprovers / 2) + 1; // > ครึ่ง
      if (approvals >= needed) return 'approved';
      const remaining = totalApprovers - decisions.length;
      // ถ้าแม้ผู้ที่เหลือ approve หมดก็ยังไม่ถึง needed → rejected
      if (approvals + remaining < needed) return 'rejected';
      return 'pending';
    }
    case 'first_response': {
      if (decisions.length === 0) return 'pending';
      return decisions[0].decision; // 'approved' | 'rejected'
    }
  }
}
