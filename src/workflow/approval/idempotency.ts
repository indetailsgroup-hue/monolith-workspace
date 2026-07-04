// Feature: monolith-workflow-copilot — idempotency of approval decisions (Req 4.7, 16.5)

export interface IdempotentOutcome<R> {
  result: R;
  /** true ถ้าเป็นการเล่นซ้ำ (คืนผลเดิม ไม่ apply ใหม่) */
  replayed: boolean;
}

/**
 * Req 4.7/16.5 — idempotency ตาม webhook_event_id:
 *   - event_id ซ้ำ → คืนผลเดิม ไม่ double-apply
 *   - event_id ใหม่ → compute() แล้วจำผล
 * `seen` เป็น store (mutable Map) — caller ใช้ ON CONFLICT DO NOTHING ใน DB เป็น source of truth จริง.
 */
export function applyIdempotent<R>(
  seen: Map<string, R>,
  eventId: string,
  compute: () => R,
): IdempotentOutcome<R> {
  if (seen.has(eventId)) {
    return { result: seen.get(eventId) as R, replayed: true };
  }
  const result = compute();
  seen.set(eventId, result);
  return { result, replayed: false };
}

/**
 * Req 16.5 — retry หลังความล้มเหลว: ถ้าครั้งก่อน throw (ไม่ได้บันทึกผล) ครั้งใหม่ที่มี
 * event_id เดิมต้อง compute ได้สำเร็จอย่างอิสระ (ไม่ถูกล็อกด้วยผลที่ไม่เคยสำเร็จ).
 */
export function applyIdempotentSafe<R>(
  seen: Map<string, R>,
  eventId: string,
  compute: () => R,
): IdempotentOutcome<R> {
  if (seen.has(eventId)) return { result: seen.get(eventId) as R, replayed: true };
  const result = compute(); // ถ้า throw → ไม่บันทึก seen → retry ครั้งหน้าได้
  seen.set(eventId, result);
  return { result, replayed: false };
}
