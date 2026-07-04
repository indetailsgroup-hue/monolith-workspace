// Feature: monolith-accounting, Property ACC-10: WHT Classification, Calculation & Totals
// Validates: Requirements 8.2, 8.3, 8.4, 8.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  classifyForm,
  whtRate,
  computeWithholding,
  buildWhtExport,
  DEFAULT_WHT_RATES,
  type WhtRecord,
  type PayeeType,
  type WhtIncomeType,
} from '../wht';

const INCOME_TYPES = Object.keys(DEFAULT_WHT_RATES) as WhtIncomeType[];

const arbRecord: fc.Arbitrary<WhtRecord> = fc.record({
  payeeType: fc.constantFrom<PayeeType>('individual', 'juristic'),
  incomeType: fc.constantFrom(...INCOME_TYPES),
  baseAmount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
});

describe('WHT — Property ACC-10 (classification)', () => {
  it('individual → PND3 ; juristic → PND53 (8.2)', () => {
    expect(classifyForm('individual')).toBe('PND3');
    expect(classifyForm('juristic')).toBe('PND53');
  });

  it('ทุก record ตกลงฟอร์มเดียว + นับรวมครบ (8.2/8.4)', () => {
    fc.assert(
      fc.property(fc.array(arbRecord, { maxLength: 50 }), (records) => {
        const exp = buildWhtExport(records);
        // ทุกบรรทัดอยู่ฟอร์มตรง payeeType
        for (const l of exp.lines) {
          expect(l.form).toBe(l.payeeType === 'individual' ? 'PND3' : 'PND53');
        }
        // นับรวม 2 ฟอร์ม = จำนวน record ทั้งหมด (partition ไม่ตกหล่น/ไม่ซ้ำ)
        expect(exp.pnd3.count + exp.pnd53.count).toBe(records.length);
      }),
      { numRuns: 300 },
    );
  });
});

describe('WHT — Property ACC-10 (calculation)', () => {
  it('ยอดหัก = ฐาน × อัตรา (ปัด 2) และ 0 ≤ หัก ≤ ฐาน (8.3)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(...INCOME_TYPES),
        (base, incomeType) => {
          const w = computeWithholding(base, incomeType);
          const expected = Math.round((base * DEFAULT_WHT_RATES[incomeType] + Number.EPSILON) * 100) / 100;
          expect(w).toBeCloseTo(expected, 6);
          // อัตรา ∈ (0,1] → 0 ≤ หัก ≤ ฐาน (+ tolerance การปัด)
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(base + 0.01);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('fail-safe: ประเภทเงินได้ไม่รู้จัก → throw (no-guess)', () => {
    expect(() => whtRate('unknown_type')).toThrow();
    expect(() => computeWithholding(100, 'ไม่รู้จัก')).toThrow();
  });

  it('fail-safe: ฐานติดลบ → throw', () => {
    expect(() => computeWithholding(-1, 'service_fee')).toThrow();
  });
});

describe('WHT — Property ACC-10 (totals)', () => {
  it('ยอดรวม = ผลรวมบรรทัด และ split ผลรวมเป็น grand (8.4/8.5)', () => {
    fc.assert(
      fc.property(fc.array(arbRecord, { maxLength: 60 }), (records) => {
        const exp = buildWhtExport(records);
        // ใช้ค่าจาก exp.lines (base normalize เป็นสตางค์แล้ว) — invariant เชิงโครงสร้าง
        const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
        const sumWithheld = exp.lines.reduce((s, l) => s + l.withheld, 0);
        const sumPaid = exp.lines.reduce((s, l) => s + l.baseAmount, 0);
        // grand = ผลรวมทุกบรรทัด (ปัด)
        expect(exp.grandTotalWithheld).toBeCloseTo(r2(sumWithheld), 4);
        expect(exp.grandTotalPaid).toBeCloseTo(r2(sumPaid), 4);
        // split: PND3 + PND53 = grand
        expect(exp.pnd3.totalWithheld + exp.pnd53.totalWithheld).toBeCloseTo(exp.grandTotalWithheld, 4);
        expect(exp.pnd3.totalPaid + exp.pnd53.totalPaid).toBeCloseTo(exp.grandTotalPaid, 4);
      }),
      { numRuns: 500 },
    );
  });
});
