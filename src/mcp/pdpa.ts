// Feature: monolith-mcp-layer — PDPA consent + cross-border control (Req 10.1, 10.2, 10.3, 10.5)
// Pure; Consent_Record + มาตรการ cross-border มาจากแหล่งเดิมของแพลตฟอร์ม (Req 10.5 — caller resolve).
// OQ-MCP-1: location ของ External_LLM ไม่ทราบ → treat as cross-border (fail-safe).

export interface PdpaInput {
  /** output มี PII หรือไม่ */
  hasPii: boolean;
  /** มี Consent_Record ครอบคลุมวัตถุประสงค์หรือไม่ (Req 10.1) */
  hasConsent: boolean;
  /** ทราบ location ของ External_LLM หรือไม่ (ถ้าไม่ทราบ → fail-safe cross-border) */
  llmLocationKnown: boolean;
  /** เป็น cross-border หรือไม่ (มีผลเมื่อ llmLocationKnown = true) */
  isCrossBorder: boolean;
  /** มีมาตรการคุ้มครอง cross-border ที่เพียงพอตาม config หรือไม่ (Req 10.3) */
  hasAdequateSafeguards: boolean;
}

export type PdpaDecision =
  | { action: 'allow'; crossBorder: boolean; mustRedact: boolean }
  | { action: 'suppress_no_consent' } // Req 10.1
  | { action: 'suppress_cross_border' }; // Req 10.3 fail-safe

/**
 * Req 10 — ประเมิน PDPA gate ก่อนส่ง output ที่อาจมี PII ออกไป External_LLM:
 *   - ไม่มี PII → allow (ไม่ต้อง redact PDPA)
 *   - มี PII + ไม่มี consent → suppress_no_consent (Req 10.1)
 *   - cross-border (รวมเคส location ไม่ทราบ = fail-safe) + ไม่มีมาตรการพอ → suppress_cross_border (Req 10.3)
 *   - cross-border + มีมาตรการพอ → allow แต่ mustRedact = true (Req 10.2 ลดทอน PII ก่อนส่ง)
 *   - in-country + มี consent → allow
 */
export function evaluatePdpa(input: PdpaInput): PdpaDecision {
  if (!input.hasPii) return { action: 'allow', crossBorder: false, mustRedact: false };

  if (!input.hasConsent) return { action: 'suppress_no_consent' };

  // OQ-MCP-1: location ไม่ทราบ → fail-safe ถือเป็น cross-border
  const crossBorder = input.llmLocationKnown ? input.isCrossBorder : true;

  if (crossBorder && !input.hasAdequateSafeguards) {
    return { action: 'suppress_cross_border' };
  }

  // cross-border ที่มีมาตรการพอ → ต้อง redact ก่อนส่ง (Req 10.2)
  return { action: 'allow', crossBorder, mustRedact: crossBorder };
}
