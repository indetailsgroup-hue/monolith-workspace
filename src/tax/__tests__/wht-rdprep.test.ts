// Feature: monolith-accounting — WHT RD Prep serializer (task 10.3, Req 8.1)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildRdPrepFile, buildRdPrepBoth, RD_INCOME_CODE, type WhtRecordFull } from '../wht-rdprep';
import { DEFAULT_WHT_RATES, buildWhtExport, type PayeeType, type WhtIncomeType } from '../wht';

const INCOME = Object.keys(DEFAULT_WHT_RATES) as WhtIncomeType[];
const arbRec: fc.Arbitrary<WhtRecordFull> = fc.record({
  payeeType: fc.constantFrom<PayeeType>('individual', 'juristic'),
  payeeTaxId: fc.string({ maxLength: 13 }),
  payeeName: fc.string({ maxLength: 20 }),
  incomeType: fc.constantFrom(...INCOME),
  payDate: fc.constantFrom('2026-06-30', '2026-05-31'),
  baseAmount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
});

describe('WHT RD Prep serializer', () => {
  it('detail line count = จำนวน record ของฟอร์มนั้น + totals ตรงกับ buildWhtExport เป๊ะ (F1: ไม่ divergence)', () => {
    fc.assert(
      fc.property(fc.array(arbRec, { maxLength: 40 }), (records) => {
        const { pnd3, pnd53 } = buildRdPrepBoth(records);
        const exp = buildWhtExport(records.map((r) => ({ payeeType: r.payeeType, incomeType: r.incomeType, baseAmount: r.baseAmount })));
        // partition ครบ
        expect(pnd3.detailCount + pnd53.detailCount).toBe(records.length);
        // RD Prep totals === buildWhtExport totals (canonical เดียวกัน, กัน F1)
        expect(pnd3.totalWithheld).toBeCloseTo(exp.pnd3.totalWithheld, 2);
        expect(pnd53.totalWithheld).toBeCloseTo(exp.pnd53.totalWithheld, 2);
        expect(pnd3.totalPaid).toBeCloseTo(exp.pnd3.totalPaid, 2);
        expect(pnd53.totalPaid).toBeCloseTo(exp.pnd53.totalPaid, 2);
        // จำนวนบรรทัด text = header + detail + footer
        for (const f of [pnd3, pnd53]) expect(f.text.split('\n').length).toBe(f.detailCount + 2);
      }),
      { numRuns: 300 },
    );
  });

  it('field ที่มี | หรือ newline ถูก sanitize (ไม่ทำ delimiter พัง)', () => {
    const rec: WhtRecordFull = {
      payeeType: 'juristic', payeeTaxId: '010|55\n01', payeeName: 'บ.เอ|บี\nซี', incomeType: 'rental', payDate: '2026-06-30', baseAmount: 1000,
    };
    const f = buildRdPrepFile('PND53', [rec]);
    const detail = f.text.split('\n')[1];
    expect(detail.split('|').length).toBe(8); // 8 คอลัมน์เป๊ะ (ไม่มี | หลุดจาก field)
    expect(detail).not.toContain('\n');
  });

  it('income code map ครบทุกประเภท', () => {
    for (const t of INCOME) expect(RD_INCOME_CODE[t]).toBeDefined();
  });
});
