// Feature: monolith-mcp-layer — Redaction_Policy + data minimization ที่ boundary (Req 9.1, 9.2, 9.3, 9.5)
// Pure; policy มาจาก config (Req 9.5 ไม่ hard-code). redact ล้มเหลว/ไม่มี policy → block fail-safe (Req 9.4).

import type { JsonValue } from './schema';

export interface RedactionPolicy {
  /** field (top-level key) ที่เป็น PII → ต้อง redact (configurable) */
  piiFields: readonly string[];
  /** allow-list ของ field ที่อนุญาตให้ส่งออก (data minimization); undefined = ไม่จำกัด */
  allowedFields?: readonly string[];
  /** placeholder ที่ใส่แทนค่า PII */
  mask?: string;
}

export type RedactionResult =
  | { ok: true; output: Record<string, JsonValue>; redactedFields: readonly string[] }
  | { ok: false; reason: 'no_policy' | 'redaction_failed' };

const DEFAULT_MASK = '[REDACTED]';

/**
 * Req 9 — บังคับ Redaction_Policy + data minimization กับ output object ก่อนออก boundary.
 *   - policy == null → block (fail-safe; ไม่มี policy = การันตี redact ไม่ได้) (Req 9.4)
 *   - data minimization: เก็บเฉพาะ allowedFields (ถ้าระบุ) (Req 9.2)
 *   - PII fields → แทนด้วย mask (Req 9.1/9.3)
 *   - ถ้า output ไม่ใช่ object → block (redaction_failed; ป้องกันส่งค่าที่ redact ไม่ได้)
 */
export function applyRedaction(
  output: JsonValue,
  policy: RedactionPolicy | null,
): RedactionResult {
  if (policy === null) return { ok: false, reason: 'no_policy' };
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return { ok: false, reason: 'redaction_failed' };
  }

  const src = output as Record<string, JsonValue>;
  const mask = policy.mask ?? DEFAULT_MASK;

  // data minimization: allow-list ก่อน (Req 9.2)
  const minimized: Record<string, JsonValue> =
    policy.allowedFields === undefined
      ? { ...src }
      : Object.fromEntries(
          Object.entries(src).filter(([k]) => policy.allowedFields!.includes(k)),
        );

  // redact PII (เฉพาะที่ยังเหลืออยู่หลัง minimization) (Req 9.1/9.3)
  const redactedFields: string[] = [];
  for (const f of policy.piiFields) {
    if (f in minimized) {
      minimized[f] = mask;
      redactedFields.push(f);
    }
  }

  return { ok: true, output: minimized, redactedFields };
}
