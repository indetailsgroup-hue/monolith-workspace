// Feature: capture-spine — Fraud_Signal eval (Req 10.1, 10.3, 10.4, Property 10)
// Pure; flag is_suspicious โดย "ไม่ auto-reject" (กัน false positive) → ส่ง human review.

export interface SignalEval {
  signalKey: string;
  triggered: boolean;
}

export interface SuspicionResult {
  isSuspicious: boolean;
  triggeredKeys: readonly string[];
}

/**
 * Req 10.1 — รวมผล Fraud_Signal (config-driven): มี signal ใด triggered → is_suspicious.
 * ไม่ auto-reject — แค่ flag เพื่อ human review (Req 10.2 / Property 10).
 */
export function evaluateSuspicion(signals: readonly SignalEval[]): SuspicionResult {
  const triggeredKeys = signals.filter((s) => s.triggered).map((s) => s.signalKey);
  return { isSuspicious: triggeredKeys.length > 0, triggeredKeys };
}

/**
 * concrete signal: VAT mismatch — vat ควร ≈ total * 7/107 (อัตรา 7%).
 * triggered = ผิดเกิน tolerance (สัดส่วนต่อ total). กัน VAT ปลอม/แต่งยอด (R-FRAUD-1).
 */
export function vatMismatch(total: number, vat: number, tolerancePct = 0.02): boolean {
  if (total <= 0) return true; // total ไม่สมเหตุผล → น่าสงสัย
  const expected = (total * 7) / 107;
  return Math.abs(vat - expected) > tolerancePct * total;
}

/**
 * Req 10.3 — false-positive feedback: มนุษย์ยืนยันว่าไม่ใช่ fraud →
 * คืนสถานะที่ควรบันทึก (ไม่ลงโทษผู้ส่ง; ใช้ปรับ signal). pure mapping เพื่อ audit.
 */
export function classifyFeedback(isFalsePositive: boolean): 'false_positive_recorded' | 'confirmed_suspicious' {
  return isFalsePositive ? 'false_positive_recorded' : 'confirmed_suspicious';
}
