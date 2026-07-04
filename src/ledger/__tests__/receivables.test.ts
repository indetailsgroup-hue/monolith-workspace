// Feature: monolith-accounting, Property ACC-12: Overdue Receivables Predicate (soundness + completeness)
// Validates: Requirements 9.3
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { findOverdue, isOverdue, type Receivable } from '../receivables';

const arbRec: fc.Arbitrary<Receivable> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  dueDate: fc.constantFrom('2025-12-01', '2026-06-29', '2026-06-30', '2026-07-01', '2026-12-31'),
  amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  paid: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
});

describe('Receivables — Property ACC-12', () => {
  it('ผลลัพธ์ = "ทั้งหมดและเฉพาะ" ที่ dueDate<asOf AND paid<amount (soundness+completeness) (9.3)', () => {
    fc.assert(
      fc.property(fc.array(arbRec, { maxLength: 40 }), fc.constantFrom('2026-06-30', '2026-01-01'), (list, asOf) => {
        const result = findOverdue(list, asOf);
        const resultIds = new Set(result.map((r) => r.id === '' ? JSON.stringify(r) : r));
        // soundness: ทุกตัวที่คืน เข้าเงื่อนไข
        for (const r of result) expect(isOverdue(r, asOf)).toBe(true);
        // completeness: ทุกตัวที่เข้าเงื่อนไข ถูกคืน
        const expected = list.filter((r) => isOverdue(r, asOf));
        expect(result.length).toBe(expected.length);
        // exact set (อ้างอิง object เดียวกัน)
        expect(new Set(result)).toEqual(new Set(expected));
        void resultIds;
      }),
      { numRuns: 400 },
    );
  });

  it('ครบกำหนดวันนี้พอดี (dueDate == asOf) ไม่นับค้าง (strict <)', () => {
    const r: Receivable = { id: 'a', dueDate: '2026-06-30', amount: 100, paid: 0 };
    expect(isOverdue(r, '2026-06-30')).toBe(false);
    expect(isOverdue(r, '2026-07-01')).toBe(true);
  });

  it('จ่ายเต็มแล้ว ไม่นับค้าง แม้เลยกำหนด', () => {
    expect(isOverdue({ id: 'a', dueDate: '2025-01-01', amount: 100, paid: 100 }, '2026-06-30')).toBe(false);
    expect(isOverdue({ id: 'b', dueDate: '2025-01-01', amount: 100, paid: 99.99 }, '2026-06-30')).toBe(true);
  });
});
