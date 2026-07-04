// Feature: capture-spine — human Verify_Gate + fail-safe no-guess (Req 4.1, 4.2, 4.3, 6.1)
// Pure; mirror rpc_capture_verify/promote. บังคับ human confirm เมื่อ critical/confidence ต่ำ/suspicious;
// no-guess: สกัดไม่ได้ → ไม่เติม placeholder (ส่งให้คนกรอก).

export interface GateInput {
  /** มี critical field ที่ยังไม่ได้ยืนยัน/ขาดค่า (Req 4.2) */
  hasCriticalFieldPending: boolean;
  /** confidence ต่ำสุดของ field ใด ๆ */
  minConfidence: number;
  /** threshold ที่ตั้งค่าได้ */
  confidenceThreshold: number;
  /** ถูก flag fraud (Req 10.2) */
  isSuspicious: boolean;
}

export interface GateResult {
  mustConfirm: boolean;
  reasons: readonly string[];
}

/**
 * Req 4.2/10.2 — บังคับ human confirm ก่อน emit เมื่อ (อย่างใดอย่างหนึ่ง):
 *   critical field ค้าง / confidence < threshold / is_suspicious.
 */
export function evaluateGate(input: GateInput): GateResult {
  const reasons: string[] = [];
  if (input.hasCriticalFieldPending) reasons.push('critical_field');
  if (input.minConfidence < input.confidenceThreshold) reasons.push('low_confidence');
  if (input.isSuspicious) reasons.push('suspicious');
  return { mustConfirm: reasons.length > 0, reasons };
}

/**
 * Req 5.1/Property 2 — emit ได้เมื่อ status=approved และ (ไม่ต้อง confirm หรือ confirm แล้ว).
 */
export function canEmit(args: {
  status: 'proposed' | 'approved' | 'rejected' | 'emitted' | 'superseded';
  gate: GateResult;
  humanConfirmed: boolean;
}): boolean {
  if (args.status !== 'approved') return false;
  return !args.gate.mustConfirm || args.humanConfirmed;
}

/** sentinel ที่ "ห้าม" ปรากฏใน extracted fields (กัน placeholder ปลอม — Req 6.1) */
const GUESS_SENTINELS = ['N/A', 'unknown', 'TBD', '-', 'null', 'undefined'];

/**
 * Req 6.1 fail-safe no-guess — field ที่สกัดไม่ได้ต้องเป็น null (ไม่ใช่ placeholder เดา).
 * คืน true ถ้า "ปลอดภัย" (ไม่มี placeholder ปลอม); false = พบค่าที่ส่อว่าเป็นการเดา.
 */
export function isNoGuess(fields: Record<string, unknown>): boolean {
  for (const v of Object.values(fields)) {
    if (typeof v === 'string' && GUESS_SENTINELS.includes(v.trim())) return false;
  }
  return true;
}
