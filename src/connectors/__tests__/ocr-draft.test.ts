// Feature: monolith-accounting, Property ACC-15: OCR Extraction → Draft Entry
// Validates: Requirements 10.2
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildDraftFromExtraction, type ExtractedFields } from '../ocr-draft';

const arbMoney = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

const arbFields: fc.Arbitrary<ExtractedFields> = fc.record(
  {
    date: fc.constantFrom('2026-01-01', '2026-06-30'),
    amount: arbMoney,
    vat: arbMoney,
    wht: arbMoney,
  },
  { requiredKeys: [] }, // ทุก field เป็น optional (สกัดไม่ได้ = undefined)
);

describe('OCR→Draft — Property ACC-15', () => {
  it('draft สะท้อนฟิลด์ที่สกัดได้ครบ (10.2); สกัดไม่ได้ → null (ไม่เดา)', () => {
    fc.assert(
      fc.property(arbFields, (f) => {
        const d = buildDraftFromExtraction(f);
        const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
        expect(d.date).toBe(f.date ?? null);
        expect(d.amount).toBe(f.amount === undefined ? null : r2(f.amount));
        expect(d.vat).toBe(f.vat === undefined ? null : r2(f.vat));
        expect(d.wht).toBe(f.wht === undefined ? null : r2(f.wht));
        expect(d.status).toBe('draft');
      }),
      { numRuns: 400 },
    );
  });

  it('fail-safe: amount ติดลบ → throw', () => {
    expect(() => buildDraftFromExtraction({ amount: -1 })).toThrow();
  });

  it('ฟิลด์ว่างทั้งหมด → draft ทุกค่า null (no-guess)', () => {
    expect(buildDraftFromExtraction({})).toEqual({ date: null, amount: null, vat: null, wht: null, status: 'draft' });
  });
});
