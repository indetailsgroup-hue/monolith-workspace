// Feature: monolith-accounting — Bank_Feed_Connector core (ACC-3 Bank Feed Storage & Match)
// Pure logic: store (idempotent ตาม bankTxnId, ไม่สร้างซ้ำ, อ่านกลับครบ), autoMatch (จับคู่เฉพาะ date+amount ตรง).
// fail-safe: จับคู่ไม่ได้ → 'pending_reconcile' (ไม่เดา).

export interface BankTxn {
  bankTxnId: string;   // key idempotent
  date: string;        // ISO yyyy-mm-dd
  amount: number;
  description: string;
}

/** รายการบันทึกบัญชีที่ใช้กระทบยอด (candidate) */
export interface LedgerRecord {
  entryId: string;
  date: string;
  amount: number;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Req 3.1/3.4 — store idempotent ตาม bankTxnId: มีอยู่แล้ว → ไม่สร้างซ้ำ (คงตัวเดิม).
 * คืน list ใหม่ (immutable). อ่านกลับได้ครบทุก field (Req 3.1 readback).
 */
export function store(existing: readonly BankTxn[], incoming: readonly BankTxn[]): BankTxn[] {
  const byId = new Map<string, BankTxn>();
  for (const t of existing) byId.set(t.bankTxnId, t);
  for (const t of incoming) {
    if (!t.bankTxnId) throw new Error('bankfeed: bankTxnId ว่าง');
    if (!byId.has(t.bankTxnId)) {
      byId.set(t.bankTxnId, { ...t, amount: round2(t.amount) }); // first-write-wins (idempotent)
    }
  }
  return [...byId.values()];
}

export type MatchResult =
  | { status: 'matched'; entryId: string }
  | { status: 'pending_reconcile' };

/**
 * Req 3.2/3.3 — autoMatch: จับคู่เฉพาะรายการบัญชีที่ **วันที่และจำนวนเงินตรงกัน** เท่านั้น.
 * ไม่พบคู่ → 'pending_reconcile' (Req 3.3, fail-safe ไม่เดา).
 */
export function autoMatch(txn: BankTxn, ledger: readonly LedgerRecord[]): MatchResult {
  const amt = round2(txn.amount);
  const hit = ledger.find((r) => r.date === txn.date && round2(r.amount) === amt);
  return hit ? { status: 'matched', entryId: hit.entryId } : { status: 'pending_reconcile' };
}

/** อ่านกลับรายการตาม bankTxnId (Req 3.1) */
export function findTxn(txns: readonly BankTxn[], bankTxnId: string): BankTxn | undefined {
  return txns.find((t) => t.bankTxnId === bankTxnId);
}
