// Feature: monolith-accounting, Property ACC-14: BIM → BOQ → Quotation
// Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { importRevit, priceBoq, createQuotation, VAT_RATE, type RevitQuantity } from '../bim';

const arbQty: fc.Arbitrary<RevitQuantity> = fc.record({
  materialType: fc.constantFrom('ไม้อัด', 'อลูมิเนียม', 'กระจก', 'เหล็ก'),
  qty: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
});

describe('BIM — Property ACC-14', () => {
  it('BOQ ครอบคลุมทุกชนิดวัสดุ + รวม qty ครบ (12.1)', () => {
    fc.assert(
      fc.property(fc.array(arbQty, { maxLength: 30 }), (quantities) => {
        const boq = importRevit(quantities);
        const types = new Set(quantities.map((q) => q.materialType));
        expect(boq.length).toBe(types.size);
        const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
        for (const t of types) {
          const expected = r2(quantities.filter((q) => q.materialType === t).reduce((s, q) => s + q.qty, 0));
          expect(boq.find((l) => l.materialType === t)!.qty).toBeCloseTo(expected, 3);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('line = qty × unitPrice ; quotation total = Σ lineTotal + VAT (12.2/12.3)', () => {
    fc.assert(
      fc.property(
        fc.array(arbQty, { minLength: 1, maxLength: 20 }),
        fc.double({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true }),
        (quantities, price) => {
          const boq = importRevit(quantities);
          const priced = priceBoq(boq, () => price);
          const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
          for (const l of priced) {
            expect(l.priced).toBe(true);
            expect(l.lineTotal).toBeCloseTo(r2(l.qty * price), 3);
          }
          const q = createQuotation(priced);
          const sub = r2(priced.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
          expect(q.subtotal).toBeCloseTo(sub, 3);
          expect(q.vat).toBeCloseTo(r2(sub * VAT_RATE), 3);
          expect(q.total).toBeCloseTo(r2(sub + q.vat), 3);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('fail-safe: มีวัสดุไม่มีราคา → ตีตรา priced=false + createQuotation throw (12.4)', () => {
    const boq = importRevit([{ materialType: 'ไม้อัด', qty: 2 }, { materialType: 'กระจก', qty: 1 }]);
    const priced = priceBoq(boq, (t) => (t === 'ไม้อัด' ? 500 : undefined));
    expect(priced.find((l) => l.materialType === 'กระจก')!.priced).toBe(false);
    expect(() => createQuotation(priced)).toThrow();
  });
});
