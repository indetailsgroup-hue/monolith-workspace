// Feature: monolith-accounting, Property ACC-8: VAT 7% ; Property ACC-9: Invoice Number Uniqueness
// Validates: Requirements 7.3, 7.4, 12.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  VAT_RATE,
  composeFromNet,
  splitInclusive,
  formatInvoiceNumber,
  allocateBatch,
  hasDuplicates,
  newIssuer,
  issueInvoiceNumber,
  type InvoiceNumberFormat,
} from '../etax';

const arbMoney = fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true });

describe('eTax — Property ACC-8 (VAT 7%)', () => {
  it('composeFromNet: vat = round2(net×7%), gross = net + vat (7.3)', () => {
    fc.assert(
      fc.property(arbMoney, (net) => {
        const b = composeFromNet(net);
        expect(b.vat).toBeCloseTo(Math.round((net * VAT_RATE + Number.EPSILON) * 100) / 100, 6);
        expect(b.gross).toBeCloseTo(b.net + b.vat, 6);
        expect(b.vat).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 400 },
    );
  });

  it('splitInclusive: net + vat === gross (ปิดยอดพอดี) และ vat ≈ gross×7/107 (12.5)', () => {
    fc.assert(
      fc.property(arbMoney, (gross) => {
        const b = splitInclusive(gross);
        expect(b.net + b.vat).toBeCloseTo(b.gross, 6);
        expect(b.vat).toBeCloseTo(Math.round((b.gross * 7 / 107 + Number.EPSILON) * 100) / 100, 6);
        expect(b.net).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 400 },
    );
  });

  it('round-trip: net → gross → split กลับได้ net เดิม (± 0.01)', () => {
    fc.assert(
      fc.property(arbMoney, (net) => {
        const g = composeFromNet(net).gross;
        const back = splitInclusive(g).net;
        expect(Math.abs(back - Math.round((net + Number.EPSILON) * 100) / 100)).toBeLessThanOrEqual(0.01);
      }),
      { numRuns: 300 },
    );
  });

  it('fail-safe: net/gross ติดลบ → throw', () => {
    expect(() => composeFromNet(-1)).toThrow();
    expect(() => splitInclusive(-0.01)).toThrow();
  });
});

const arbFmt: fc.Arbitrary<InvoiceNumberFormat> = fc.record({
  prefix: fc.constantFrom('INV', 'TAX', 'ET'),
  year: fc.integer({ min: 2000, max: 2600 }),
  width: fc.integer({ min: 4, max: 8 }),
});

describe('eTax — Property ACC-9 (invoice number uniqueness)', () => {
  it('allocateBatch: n เลขที่ distinct ทั้งหมด (7.4)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), fc.integer({ min: 0, max: 500 }), arbFmt, (start, n, fmt) => {
        const batch = allocateBatch(start, n, fmt);
        expect(batch.length).toBe(n);
        expect(hasDuplicates(batch)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('issuer: ออกต่อเนื่องกี่ครั้งก็ไม่ซ้ำ (7.4)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 1, max: 300 }), arbFmt, (start, n, fmt) => {
        let st = newIssuer(start);
        const nums: string[] = [];
        for (let i = 0; i < n; i++) {
          const r = issueInvoiceNumber(st, fmt);
          nums.push(r.number);
          st = r.state;
        }
        expect(nums.length).toBe(n);
        expect(hasDuplicates(nums)).toBe(false);
        expect(st.issued.size).toBe(n);
      }),
      { numRuns: 300 },
    );
  });

  it('fail-safe: บังคับออกเลขที่ชนของเดิม → throw', () => {
    const fmt: InvoiceNumberFormat = { prefix: 'INV', year: 2026, width: 6 };
    let st = newIssuer(1);
    const r1 = issueInvoiceNumber(st, fmt);
    // ปลอม state ให้ seq ย้อนกลับไปเลขเดิม → ต้อง throw
    const tampered = { seq: 1, issued: r1.state.issued };
    expect(() => issueInvoiceNumber(tampered, fmt)).toThrow();
  });

  it('formatInvoiceNumber: pad + fail-safe seq<1', () => {
    expect(formatInvoiceNumber(123, { prefix: 'INV', year: 2026, width: 6 })).toBe('INV-2026-000123');
    expect(() => formatInvoiceNumber(0, { prefix: 'INV', year: 2026 })).toThrow();
  });
});
