// Feature: monolith-mcp-layer — Rate_Limit_Policy + Cost_Budget eval (Req 15.1, 15.2, 15.3, 15.5, 15.6, 15.8)
// Pure decision; การนับจริงเป็น atomic upsert ใน rpc_mcp_check_rate_limit (Req 15.7). policy จาก config (Req 15.5).

import type { ScopeKind } from './domain/types';

/** สถานะปัจจุบันของ scope หนึ่งในหน้าต่างเวลา + เพดานที่ resolve แล้ว (specific หรือ default) */
export interface ScopeState {
  scopeKind: ScopeKind;
  scopeKey: string;
  /** จำนวน invocation ที่นับไว้แล้วในหน้าต่างนี้ */
  currentCount: number;
  /** ต้นทุนสะสมในหน้าต่างนี้ */
  accruedCost: number;
  /** เพดานจำนวน (Rate_Limit_Policy) — resolved (Req 15.6 default fail-safe, ไม่มี = unlimited ห้ามเกิดขึ้น) */
  maxCount: number;
  /** เพดานต้นทุน (Cost_Budget) — resolved */
  maxCost: number;
}

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'rate_limit_exceeded' | 'cost_budget_exceeded';
      scopeKind: ScopeKind;
      scopeKey: string;
    };

/**
 * Req 15.1 — ประเมินทุก scope ที่เกี่ยวข้อง (Principal, MCP_Client, Tool_Class); scope ใด ๆ ละเมิด → reject.
 *   count: currentCount + 1 > maxCount → exceed (Req 15.2, strictly exceed)
 *   cost : accruedCost + estCost >= maxCost → reach-or-exceed (Req 15.3)
 * ตรวจตามลำดับที่ส่งมา; คืน scope แรกที่ละเมิด (deterministic).
 */
export function evaluateRateLimit(
  scopes: readonly ScopeState[],
  estCost: number,
): RateLimitResult {
  for (const s of scopes) {
    if (s.currentCount + 1 > s.maxCount) {
      return { ok: false, reason: 'rate_limit_exceeded', scopeKind: s.scopeKind, scopeKey: s.scopeKey };
    }
    if (s.accruedCost + estCost >= s.maxCost) {
      return { ok: false, reason: 'cost_budget_exceeded', scopeKind: s.scopeKind, scopeKey: s.scopeKey };
    }
  }
  return { ok: true };
}
