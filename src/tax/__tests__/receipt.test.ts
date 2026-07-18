// Feature: S18 l4-finance-tax Slice 3 — VAT breakdown สำหรับใบเสร็จ (caller แรกของ composeFromNet)
// เทสตามสัญญา ACC-8: vat = round2(net × rate); gross = net + vat — และข้อความใบเสร็จแยก VAT ถูกต้อง
import { describe, expect, it } from 'vitest';

import { buildReceiptVatBreakdown, formatThb2 } from '../receipt';

describe('buildReceiptVatBreakdown (composeFromNet caller)', () => {
  it('แยก VAT 7% จากฐานก่อน VAT ถูกต้อง (net 100,000 → vat 7,000 → gross 107,000)', () => {
    const b = buildReceiptVatBreakdown(100000);
    expect(b.net).toBe(100000);
    expect(b.vat).toBe(7000);
    expect(b.gross).toBe(107000);
    expect(b.rate).toBe(0.07);
  });

  it('ปัดสตางค์แบบ half-up ตาม composeFromNet (net 99.99 → vat 7.00 → gross 106.99)', () => {
    const b = buildReceiptVatBreakdown(99.99);
    expect(b.vat).toBe(7);
    expect(b.gross).toBe(106.99);
  });

  it('ข้อความใบเสร็จมี 3 บรรทัด: ฐานก่อน VAT / VAT 7% / รวมทั้งสิ้น (format ไทย 2 ตำแหน่ง)', () => {
    const b = buildReceiptVatBreakdown(100000);
    expect(b.text).toContain('ฐานก่อน VAT: 100,000.00 บาท');
    expect(b.text).toContain('VAT 7%: 7,000.00 บาท');
    expect(b.text).toContain('รวมทั้งสิ้น: 107,000.00 บาท');
  });

  it('อัตรา override ได้ (รองรับการเปลี่ยนอัตราตามกฎหมาย) — ป้าย % ตามอัตราจริง', () => {
    const b = buildReceiptVatBreakdown(1000, 0.1);
    expect(b.vat).toBe(100);
    expect(b.gross).toBe(1100);
    expect(b.text).toContain('VAT 10%');
  });

  it('fail-safe no-guess: ฐานติดลบ → throw (สืบทอดจาก composeFromNet)', () => {
    expect(() => buildReceiptVatBreakdown(-1)).toThrow();
  });
});

describe('formatThb2', () => {
  it('format เงินบาท 2 ตำแหน่งเสมอ (สตางค์)', () => {
    expect(formatThb2(7000)).toBe('7,000.00');
    expect(formatThb2(106.9)).toBe('106.90');
  });
});
