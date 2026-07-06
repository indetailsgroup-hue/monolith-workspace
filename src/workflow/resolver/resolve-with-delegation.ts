// Feature: monolith-workflow-copilot — resolve approvers THEN route each through
// active delegations (Req 3 + 14.4). This is the composition that
// rpc_resolve_approver (migration 0082) mirrors: after the RACI Accountable set is
// resolved, every resolved approver identity is routed through any active
// delegation before an Approval_Request is created, so a valid Acting_Approver
// receives the request in place of the delegating approver.
//
// Identity note (แก้ตาม scrutiny F6, 2026-07-06): approver identities here are the
// SAME opaque strings that `approval_request.resolved_approver` holds — which per
// ADR-018 are **approver refs (app-role refs)** from raciMap approvers[].ref /
// accountable (0031 authorizes the button press via has_any_app_role([ref])) —
// NOT emails and NOT employee uuids. The old delegation table was keyed by
// employee uuid, which is why routing could never be wired before 0082.

import { routeApprover } from './delegation-routing';

/** Delegation as stored, in the actor-identity space (mirrors public.delegation after 0082). */
export interface StoredDelegation {
  approverActor: string;
  actingActor: string;
  processStep: string;
  /** null = ทุก site */
  siteCode: string | null;
  startMs: number;
  endMs: number;
  isRevoked: boolean;
}

export interface RouteContext {
  processStep: string;
  /** site ของ work_item; delegation ที่ siteCode = นี้ หรือ null (global) เท่านั้นที่นับ */
  siteCode: string | null;
  nowMs: number;
}

/**
 * Filter delegations ให้เหลือเฉพาะที่มีผลกับ (step, site) แล้ว map เป็นรูปแบบที่ routeApprover ใช้.
 * เงื่อนไข: ไม่ revoked · process_step ตรง · site ตรงหรือ null (global).
 * เวลา ([start,end]) ปล่อยให้ routeApprover ตัดสิน (เพื่อ reuse logic ที่ test แล้ว).
 */
function applicableDelegations(delegations: readonly StoredDelegation[], ctx: RouteContext) {
  return delegations
    .filter(
      (d) =>
        !d.isRevoked &&
        d.processStep === ctx.processStep &&
        (d.siteCode === null || d.siteCode === ctx.siteCode),
    )
    .map((d) => ({
      approverId: d.approverActor,
      actingApproverId: d.actingActor,
      startMs: d.startMs,
      endMs: d.endMs,
    }));
}

/**
 * Route ผู้อนุมัติหนึ่งรายผ่าน delegation ที่มีผล → คืน acting actor ถ้ามี delegation active
 * (now ∈ [start,end]) มิฉะนั้นคืนตัวเดิม.
 */
export function routeResolvedApprover(
  approverActor: string,
  delegations: readonly StoredDelegation[],
  ctx: RouteContext,
): string {
  return routeApprover(approverActor, applicableDelegations(delegations, ctx), ctx.nowMs);
}

export interface RoutedApprover {
  /** identity ที่ resolve จาก RACI เดิม */
  original: string;
  /** identity ที่จะได้รับ Approval_Request จริง (acting ถ้าถูก route) */
  effective: string;
  /** ถูก route ไป acting หรือไม่ (ใช้เขียน audit) */
  delegated: boolean;
}

/**
 * Req 3 + 14.4 — input = identity ของ Accountable/approvers ที่ eligible แล้ว;
 * output = ผู้รับจริงต่อราย พร้อมธง delegated.
 * mirror ลำดับใน rpc_resolve_approver (0082 v3, วางบน 0031): resolve → route ต่อราย →
 * insert approval_request(effective). ใน SQL การ dedup effective ซ้ำทำโดย partial-unique
 * index (work_item, gate_order, resolved_approver, attempt) + ON CONFLICT DO NOTHING;
 * ที่นี่จำลองด้วย seenEffective เพื่อให้ผลลัพธ์ตรวจสอบได้ (1 request ต่อ effective).
 */
export function resolveApproversWithDelegation(
  eligibleApproverActors: readonly string[],
  delegations: readonly StoredDelegation[],
  ctx: RouteContext,
): RoutedApprover[] {
  const seenEffective = new Set<string>();
  const out: RoutedApprover[] = [];
  for (const original of eligibleApproverActors) {
    const effective = routeResolvedApprover(original, delegations, ctx);
    if (seenEffective.has(effective)) continue; // กัน request ซ้ำถึงคนเดียวกัน
    seenEffective.add(effective);
    out.push({ original, effective, delegated: effective !== original });
  }
  return out;
}
