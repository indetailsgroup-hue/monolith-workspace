// Feature: monolith-accounting, Property ACC-7: Multi-Book Isolation
// Validates: Requirements 5.1, 5.2, 5.3
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { emptyLedger, post, entriesOf, statement, books, type BookEntry } from '../multibook';

const arbEntry: fc.Arbitrary<BookEntry> = fc.record({
  entryId: fc.string({ minLength: 1, maxLength: 8 }),
  bookId: fc.constantFrom('internal', 'external', 'tax'),
  lines: fc.array(
    fc.record({
      account_code: fc.constantFrom('1010', '2010', '5010'),
      debit: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
      credit: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
});

describe('MultiBook — Property ACC-7 (isolation)', () => {
  it('entry อยู่เฉพาะ book ที่ post (ไม่ปรากฏใน book อื่น) (5.2/5.3)', () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 30 }), (entries) => {
        // unique entryId เพื่อเช็ก membership แม่นยำ
        const uniq = entries.map((e, i) => ({ ...e, entryId: `${e.entryId}-${i}` }));
        let ledger = emptyLedger();
        for (const e of uniq) ledger = post(ledger, e);

        for (const e of uniq) {
          // อยู่ใน book ตัวเอง
          expect(entriesOf(ledger, e.bookId).some((x) => x.entryId === e.entryId)).toBe(true);
          // ไม่อยู่ใน book อื่น
          for (const b of books(ledger)) {
            if (b !== e.bookId) {
              expect(entriesOf(ledger, b).some((x) => x.entryId === e.entryId)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('งบของ book รวมจาก entry ของ book นั้นเท่านั้น (5.3 no cross-bleed)', () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 30 }), (entries) => {
        const uniq = entries.map((e, i) => ({ ...e, entryId: `${e.entryId}-${i}` }));
        let ledger = emptyLedger();
        for (const e of uniq) ledger = post(ledger, e);

        const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
        for (const b of books(ledger)) {
          const st = statement(ledger, b);
          const own = uniq.filter((e) => e.bookId === b);
          expect(st.entryCount).toBe(own.length);
          const d = own.reduce((s, e) => s + e.lines.reduce((ss, l) => ss + l.debit, 0), 0);
          expect(st.totalDebit).toBeCloseTo(r2(d), 3);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('post เข้า book เดียว ไม่กระทบ book อื่น (5.1/5.2)', () => {
    let l = emptyLedger();
    l = post(l, { entryId: 'e1', bookId: 'internal', lines: [{ account_code: '1010', debit: 100, credit: 0 }] });
    l = post(l, { entryId: 'e2', bookId: 'external', lines: [{ account_code: '1010', debit: 50, credit: 0 }] });
    expect(entriesOf(l, 'internal').length).toBe(1);
    expect(entriesOf(l, 'external').length).toBe(1);
    expect(statement(l, 'internal').totalDebit).toBe(100);
    expect(statement(l, 'external').totalDebit).toBe(50);
  });
});

import { statutoryStatement, type CoaTypeMap } from '../multibook';

// COA type map (mirror ledger_account 0066)
const COA: CoaTypeMap = {
  '1010': 'asset', '1030': 'asset', '2010': 'liability', '3010': 'equity',
  '4010': 'revenue', '5010': 'expense',
};

describe('MultiBook — statutoryStatement (Req 5.4/5.5)', () => {
  it('งบ balanced: assets === liabilities + equity + netProfit (จาก entry ที่สมดุล)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            entryId: fc.string({ minLength: 1, maxLength: 6 }),
            amount: fc.double({ min: 1, max: 100_000, noNaN: true, noDefaultInfinity: true }),
            kind: fc.constantFrom('buy_asset_cash', 'sale_cash', 'expense_cash'),
          }),
          { maxLength: 20 },
        ),
        (txns) => {
          // สร้าง balanced entries เข้า book 'internal'
          let ledger = emptyLedger();
          txns.forEach((t, i) => {
            const a = Math.round((t.amount + Number.EPSILON) * 100) / 100;
            let lines;
            if (t.kind === 'buy_asset_cash') lines = [{ account_code: '1030', debit: a, credit: 0 }, { account_code: '1010', debit: 0, credit: a }];
            else if (t.kind === 'sale_cash') lines = [{ account_code: '1010', debit: a, credit: 0 }, { account_code: '4010', debit: 0, credit: a }];
            else lines = [{ account_code: '5010', debit: a, credit: 0 }, { account_code: '1010', debit: 0, credit: a }];
            ledger = post(ledger, { entryId: `${t.entryId}-${i}`, bookId: 'internal', lines });
          });
          const st = statutoryStatement(ledger, 'internal', 'DBD2554', COA);
          expect(st.balanced).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('รองรับ DBD2554 และ IFRS_Format3; รูปแบบอื่น → throw', () => {
    const l = post(emptyLedger(), { entryId: 'e1', bookId: 'internal', lines: [
      { account_code: '1010', debit: 100, credit: 0 }, { account_code: '4010', debit: 0, credit: 100 },
    ] });
    expect(statutoryStatement(l, 'internal', 'DBD2554', COA).revenue).toBe(100);
    expect(statutoryStatement(l, 'internal', 'IFRS_Format3', COA).format).toBe('IFRS_Format3');
    // @ts-expect-error รูปแบบไม่รองรับ
    expect(() => statutoryStatement(l, 'internal', 'BAD', COA)).toThrow();
  });

  it('งบคำนวณจาก book นั้นเท่านั้น (isolation — ACC-7)', () => {
    let l = emptyLedger();
    l = post(l, { entryId: 'a', bookId: 'internal', lines: [{ account_code: '1010', debit: 100, credit: 0 }, { account_code: '4010', debit: 0, credit: 100 }] });
    l = post(l, { entryId: 'b', bookId: 'external', lines: [{ account_code: '1010', debit: 999, credit: 0 }, { account_code: '4010', debit: 0, credit: 999 }] });
    expect(statutoryStatement(l, 'internal', 'DBD2554', COA).revenue).toBe(100);
    expect(statutoryStatement(l, 'external', 'DBD2554', COA).revenue).toBe(999);
  });
});
