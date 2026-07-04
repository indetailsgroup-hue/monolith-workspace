// Feature: monolith-mcp-layer — Write_Tool idempotency (Req 17.2, 17.4, 17.7, 17.8)
// Pure decision ตามคู่ (Idempotency_Key, Principal); การ insert จริง (≤1 ต่อคู่) บังคับด้วย PK ใน DB (Req 17.9).

export const IDEMPOTENCY_KEY_MIN = 1;
export const IDEMPOTENCY_KEY_MAX = 255;

/** record ที่เคยบันทึกไว้สำหรับคู่ (key, principal) */
export interface IdempotencyRecord {
  inputHash: string;
  /** true ถ้า pending ยังรอ decision (Req 17.3) */
  pending: boolean;
}

export type IdempotencyDecision =
  | { action: 'proceed' } // ไม่มี key หรือไม่มี record เดิม → ประมวลผลปกติ (Req 17.4)
  | { action: 'replay' } // key+input เดิม, executed → คืนผลเดิม (Req 17.2)
  | { action: 'return_pending' } // key เดิม, ยัง pending → คืนสถานะรอ (Req 17.3)
  | { action: 'reject_invalid_key' } // key ว่าง/ยาวเกิน (Req 17.7)
  | { action: 'reject_conflict' }; // key เดิม แต่ input ต่าง (Req 17.8)

/** Req 17.7 — key ต้องยาว 1–255; ว่าง/เกิน → invalid */
export function isValidKey(key: string): boolean {
  return key.length >= IDEMPOTENCY_KEY_MIN && key.length <= IDEMPOTENCY_KEY_MAX;
}

/**
 * Req 17 — ตัดสินการ idempotent สำหรับ Write_Tool:
 *   - key === undefined → proceed (ไม่อ้าง record) (Req 17.4)
 *   - key ไม่ valid → reject_invalid_key (Req 17.7, no side effects)
 *   - ไม่มี record เดิม → proceed (สร้างใหม่)
 *   - record เดิม + input ต่าง → reject_conflict (คง record เดิม) (Req 17.8)
 *   - record เดิม + input เดิม + pending → return_pending (Req 17.3)
 *   - record เดิม + input เดิม + executed → replay (Req 17.2)
 */
export function decideIdempotency(
  key: string | undefined,
  inputHash: string,
  existing: IdempotencyRecord | undefined,
): IdempotencyDecision {
  if (key === undefined) return { action: 'proceed' };
  if (!isValidKey(key)) return { action: 'reject_invalid_key' };
  if (existing === undefined) return { action: 'proceed' };
  if (existing.inputHash !== inputHash) return { action: 'reject_conflict' };
  return existing.pending ? { action: 'return_pending' } : { action: 'replay' };
}
