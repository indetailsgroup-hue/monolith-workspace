// Feature: monolith-mcp-layer — Invocation_Expiry compute + decision-wins-race (Req 16.1, 16.6, 16.7)
// Pure; เวลาเป็น epoch ms (UTC). Cleanup จริงเป็น sweep ใน rpc_mcp_expire_pending (Req 16.4).

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * ONE_HOUR_MS;
export const DEFAULT_TIMEOUT_MS = 72 * ONE_HOUR_MS; // ค่าตั้งต้น 72 ชั่วโมง (Req 16.1)

/**
 * Req 16.1 — คำนวณ Invocation_Expiry = createdAt + timeout (clamp ช่วง 1h–30d; default 72h เมื่อไม่ระบุ).
 */
export function computeExpiry(createdAtMs: number, timeoutMs?: number): number {
  const t = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const clamped = Math.min(Math.max(t, ONE_HOUR_MS), THIRTY_DAYS_MS);
  return createdAtMs + clamped;
}

export type ExpiryResolution =
  | 'decision_wins' // decision บันทึกภายใน expiry → ชนะ race (Req 16.7)
  | 'expired' // พ้น expiry, ไม่มี decision (Req 16.2)
  | 'pending'; // ยังไม่ถึง expiry, ยังไม่มี decision

/**
 * Req 16.7 — decision-wins-race deterministic:
 *   - decisionAtMs != null และ decisionAtMs <= expiryMs → decision_wins (เหนือ expiry)
 *   - มิฉะนั้น nowMs >= expiryMs → expired
 *   - มิฉะนั้น → pending
 * (decision ที่บันทึกตรง expiry พอดี = ภายใน expiry → ชนะ)
 */
export function resolveExpiry(
  nowMs: number,
  expiryMs: number,
  decisionAtMs: number | null,
): ExpiryResolution {
  if (decisionAtMs !== null && decisionAtMs <= expiryMs) return 'decision_wins';
  if (nowMs >= expiryMs) return 'expired';
  return 'pending';
}

/**
 * Req 16.6 — พยายามบันทึก Approval_Decision ให้ pending ที่ "expired ไปแล้ว" → ปฏิเสธ.
 * คืน true ถ้าอนุญาตให้บันทึก decision (ยังไม่ expired), false ถ้าต้อง reject 'expired'.
 */
export function canRecordDecision(
  currentStatus: 'pending' | 'expired' | 'executed' | 'rejected',
): boolean {
  return currentStatus === 'pending';
}
