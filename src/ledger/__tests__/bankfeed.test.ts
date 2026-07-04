// Feature: monolith-accounting, Property ACC-3: Bank Feed Storage & Match ; SPINE-3 Idempotent
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { store, autoMatch, findTxn, type BankTxn, type LedgerRecord } from '../bankfeed';

const arbTxn: fc.Arbitrary<BankTxn> = fc.record({
  bankTxnId: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
  date: fc.constantFrom('2026-01-01', '2026-06-30', '2026-12-31'),
  amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  description: fc.string({ maxLength: 20 }),
});
const arbTxns = fc.uniqueArray(arbTxn, { maxLength: 20, selector: (t) => t.bankTxnId });

describe('BankFeed — Property ACC-3 / SPINE-3 (storage + idempotent)', () => {
  it('store idempotent: ส่งซ้ำ bankTxnId เดิม → จำนวนไม่เพิ่ม + อ่านกลับครบ (3.1/3.4)', () => {
    fc.assert(
      fc.property(arbTxns, (txns) => {
        const once = store([], txns);
        const twice = store(once, txns); // ส่งซ้ำทั้งชุด
        expect(twice.length).toBe(once.length);
        expect(once.length).toBe(new Set(txns.map((t) => t.bankTxnId)).size);
        // อ่านกลับครบทุก field
        for (const t of txns) {
          const got = findTxn(twice, t.bankTxnId);
          expect(got).toBeDefined();
          expect(got!.date).toBe(t.date);
          expect(got!.description).toBe(t.description);
          expect(got!.amount).toBeCloseTo(Math.round((t.amount + Number.EPSILON) * 100) / 100, 4);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('BankFeed — Property ACC-3 (autoMatch)', () => {
  it('จับคู่ ⟺ มีรายการบัญชี date+amount ตรง; ไม่พบ → pending_reconcile (3.2/3.3)', () => {
    fc.assert(
      fc.property(arbTxn, fc.uniqueArray(fc.record({
        entryId: fc.string({ minLength: 1, maxLength: 6 }),
        date: fc.constantFrom('2026-01-01', '2026-06-30', '2026-12-31'),
        amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
      }), { maxLength: 15, selector: (r) => r.entryId }), (txn, ledger) => {
        const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
        const res = autoMatch(txn, ledger as LedgerRecord[]);
        const exists = ledger.some((l) => l.date === txn.date && r2(l.amount) === r2(txn.amount));
        if (exists) {
          expect(res.status).toBe('matched');
          if (res.status === 'matched') {
            const m = ledger.find((l) => l.entryId === res.entryId)!;
            expect(m.date).toBe(txn.date);
            expect(r2(m.amount)).toBe(r2(txn.amount));
          }
        } else {
          expect(res.status).toBe('pending_reconcile');
        }
      }),
      { numRuns: 400 },
    );
  });
});
