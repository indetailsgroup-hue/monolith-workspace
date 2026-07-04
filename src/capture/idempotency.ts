// Feature: capture-spine — ingest idempotency (Req 1.2, Property 3) + J2 scope fix
// Pure; key = scope(capture_type, principal) + content-hash → dedup ถูก scope (เอกสารเดียวกันต่าง capture_type ไม่ชน).
// content-hash จริง (sha256) คำนวณที่ Edge; ที่นี่ประกอบ composite key เชิงตรรกะ.

/**
 * J2 — idempotency_key แบบ scoped: รวม capture_type + principal + content-hash.
 * แก้เคส global-unique ชนกันเมื่อเอกสารเดียวถูก capture หลาย capture_type / หลายคน.
 */
export function buildIdempotencyKey(
  captureType: string,
  principal: string,
  contentHash: string,
): string {
  return `${captureType}:${principal}:${contentHash}`;
}

export type IngestDecision =
  | { action: 'create' }
  | { action: 'return_existing'; id: string };

/**
 * Req 1.2 — ingest ซ้ำด้วย key เดิม → คืน artifact เดิม (ไม่สร้างใหม่).
 * existing = artifact ที่มี idempotency_key ตรง (lookup โดย caller) หรือ undefined.
 */
export function decideIngest(existing: { id: string } | undefined): IngestDecision {
  return existing === undefined ? { action: 'create' } : { action: 'return_existing', id: existing.id };
}
