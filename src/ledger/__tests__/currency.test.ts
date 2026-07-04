// Feature: monolith-accounting, Property ACC-2: Currency Conversion (เก็บสองค่า + ปัด 2 ตำแหน่ง)
// Validates: Requirements 2.1, 2.2, 2.3, 2.4
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  listSupportedCurrencies,
  isSupported,
  getRate,
  convert,
  SUPPORTED_CURRENCIES,
  type RateTable,
} from '../currency';

describe('Currency — Req 2.1 (รองรับ ≥160 สกุล)', () => {
  it('รายการสกุลที่รองรับ ≥ 160 และไม่ซ้ำ', () => {
    const list = listSupportedCurrencies();
    expect(list.length).toBeGreaterThanOrEqual(160);
    expect(new Set(list).size).toBe(list.length);
    expect(isSupported('THB')).toBe(true);
    expect(isSupported('USD')).toBe(true);
    expect(isSupported('ZZZ')).toBe(false);
  });
});

const arbCode = fc.constantFrom(...SUPPORTED_CURRENCIES);
const arbAmount = fc.double({ min: 0, max: 100_000_000, noNaN: true, noDefaultInfinity: true });
const arbRate = fc.double({ min: 0.0001, max: 100_000, noNaN: true, noDefaultInfinity: true });

describe('Currency — Property ACC-2 (convert)', () => {
  it('base = ปัดเศษ(amount × rate, 2) เสมอ + เก็บสองค่าครบ (2.2/2.3)', () => {
    fc.assert(
      fc.property(arbCode, arbAmount, arbRate, (from, amount, rate) => {
        const to = from === 'THB' ? 'USD' : 'THB';
        const rates: RateTable = { [`${from}>${to}@2026-06-30`]: rate };
        const cm = convert({ amount, currency: from }, to, '2026-06-30', rates);
        // base = round2(amount*rate)
        expect(cm.base.amount).toBeCloseTo(Math.round((amount * rate + Number.EPSILON) * 100) / 100, 4);
        // เก็บสองค่า: original สกุลต้นทาง + base สกุลปลายทาง
        expect(cm.original.currency).toBe(from);
        expect(cm.base.currency).toBe(to);
        expect(cm.original.amount).toBeCloseTo(Math.round((amount + Number.EPSILON) * 100) / 100, 4);
        expect(cm.rate).toBe(rate);
      }),
      { numRuns: 500 },
    );
  });

  it('from==to → rate 1, base==original (identity)', () => {
    fc.assert(
      fc.property(arbCode, arbAmount, (code, amount) => {
        const cm = convert({ amount, currency: code }, code, '2026-06-30', {});
        expect(cm.rate).toBe(1);
        expect(cm.base.amount).toBeCloseTo(cm.original.amount, 6);
      }),
      { numRuns: 300 },
    );
  });
});

describe('Currency — Req 2.4 (fail-safe)', () => {
  it('ไม่พบอัตรา → throw (ไม่แปลง/ไม่เดา)', () => {
    expect(() => getRate('USD', 'THB', '2026-06-30', {})).toThrow();
    expect(() => convert({ amount: 100, currency: 'USD' }, 'THB', '2026-06-30', {})).toThrow();
  });

  it('สกุลไม่รองรับ → throw', () => {
    expect(() => getRate('ZZZ', 'THB', '2026-06-30', { 'ZZZ>THB@2026-06-30': 5 })).toThrow();
  });

  it('amount ติดลบ → throw', () => {
    expect(() => convert({ amount: -1, currency: 'USD' }, 'THB', '2026-06-30', { 'USD>THB@2026-06-30': 36 })).toThrow();
  });
});
