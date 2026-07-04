// Feature: monolith-accounting — Overdue Receivables predicate (ACC-12)
// Pure: หนี้ค้างชำระ = ครบกำหนดก่อนวันปัจจุบัน AND ยังไม่ได้รับชำระเต็ม (soundness + completeness).

export interface Receivable {
  id: string;
  dueDate: string; // ISO yyyy-mm-dd
  amount: number;  // ยอดที่ต้องรับ
  paid: number;    // ยอดที่รับแล้ว
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** predicate: ค้างชำระ ⟺ dueDate < asOf AND paid < amount (ยังไม่เต็ม) */
export function isOverdue(r: Receivable, asOf: string): boolean {
  return r.dueDate < asOf && round2(r.paid) < round2(r.amount);
}

/** Req 9.3 — คืน "ทั้งหมดและเฉพาะ" ลูกหนี้ที่เข้าเงื่อนไขค้างชำระ */
export function findOverdue(list: readonly Receivable[], asOf: string): Receivable[] {
  return list.filter((r) => isOverdue(r, asOf));
}
