// Feature: monolith-accounting, Property ACC-4 (BOM), ACC-5 (Job Cost), ACC-6 (Inventory)
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createBOM,
  explodeBOM,
  closeJob,
  issueMaterial,
  InsufficientStockError,
  type BomLine,
} from '../manufacturing';

const arbLine: fc.Arbitrary<BomLine> = fc.record({
  materialId: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
  qtyPerUnit: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
});

describe('Manufacturing — Property ACC-4 (BOM Explosion)', () => {
  it('qty ทุกบรรทัด = qtyPerUnit × units + BOM อ่านกลับครบ (4.1/4.2)', () => {
    fc.assert(
      fc.property(
        fc.array(arbLine, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 100_000 }),
        (lines, units) => {
          const bom = createBOM('PROD-1', lines);
          // อ่านกลับครบ
          expect(bom.lines.length).toBe(lines.length);
          const req = explodeBOM(bom, units);
          expect(req.length).toBe(lines.length);
          req.forEach((r, i) => {
            expect(r.materialId).toBe(lines[i].materialId);
            expect(r.qty).toBeCloseTo(Math.round((lines[i].qtyPerUnit * units + Number.EPSILON) * 100) / 100, 4);
          });
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('Manufacturing — Property ACC-5 (Job Cost Summation)', () => {
  it('total = material + labor + overhead (4.3)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (material, labor, overhead) => {
          const jc = closeJob({ material, labor, overhead });
          expect(jc.total).toBeCloseTo(Math.round((jc.material + jc.labor + jc.overhead + Number.EPSILON) * 100) / 100, 4);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('Manufacturing — Property ACC-6 (Inventory Reduction)', () => {
  it('qty ≤ stock → stockAfter = stock − qty พอดี (4.4)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (stock, frac) => {
          const qty = Math.max(0.01, Math.round((stock * frac + Number.EPSILON) * 100) / 100);
          if (qty > stock) return; // เฉพาะกรณี qty <= stock
          const res = issueMaterial('M1', stock, qty);
          expect(res.stockAfter).toBeCloseTo(Math.round((stock - qty + Number.EPSILON) * 100) / 100, 4);
          expect(res.stockAfter).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('qty > stock → InsufficientStockError (stock ไม่เปลี่ยน) (4.5)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 1_000, noNaN: true, noDefaultInfinity: true }),
        (stock, extra) => {
          const qty = stock + extra; // > stock เสมอ
          expect(() => issueMaterial('M1', stock, qty)).toThrow(InsufficientStockError);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('fail-safe: qty <= 0 → throw', () => {
    expect(() => issueMaterial('M1', 100, 0)).toThrow();
    expect(() => issueMaterial('M1', 100, -5)).toThrow();
  });
});

import { postJobToLedger, sumSides } from '../manufacturing';

describe('Manufacturing — postJobToLedger (Req 4.6, ACC-1 balanced)', () => {
  const acc = { finishedGoods: '1030', material: '1030', labor: '5020', overhead: '5090' };

  it('Σdebit === Σcredit === total (debit=credit)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (material, labor, overhead) => {
          const jc = closeJob({ material, labor, overhead });
          fc.pre(jc.total > 0); // ต้องมีต้นทุน
          const lines = postJobToLedger(jc, acc);
          const s = sumSides(lines);
          expect(s.debit).toBeCloseTo(s.credit, 4);
          expect(s.debit).toBeCloseTo(jc.total, 4);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('fail-safe: total = 0 → throw', () => {
    expect(() => postJobToLedger(closeJob({ material: 0, labor: 0, overhead: 0 }), acc)).toThrow();
  });
});
