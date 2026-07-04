// Feature: monolith-accounting, Property ACC-11: e-Tax XML Round-Trip
// Validates: Requirements 7.1
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  serializeSaleXml,
  parseSaleXml,
  normalizeSale,
  escapeXml,
  unescapeXml,
  type SaleInvoice,
} from '../etax-xml';

const arbMoney = fc.double({ min: 0, max: 10_000_000, noNaN: true, noDefaultInfinity: true });
const arbStr = fc.string({ maxLength: 30 }); // รวมอักขระพิเศษ & < > " ' และ unicode

const arbSale: fc.Arbitrary<SaleInvoice> = fc.record({
  invoiceNumber: arbStr,
  sellerTaxId: arbStr,
  buyerTaxId: arbStr,
  date: fc.constantFrom('2026-01-01', '2026-06-30', '2026-12-31'),
  items: fc.array(fc.record({ description: arbStr, qty: arbMoney, unitPrice: arbMoney }), { maxLength: 8 }),
  net: arbMoney,
  vat: arbMoney,
  gross: arbMoney,
});

describe('eTax XML — escape/unescape inverse', () => {
  it('unescape(escape(s)) === s สำหรับทุกสตริง', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        expect(unescapeXml(escapeXml(s))).toBe(s);
      }),
      { numRuns: 500 },
    );
  });
});

describe('eTax XML — Property ACC-11 (round-trip)', () => {
  it('parse(serialize(sale)) === normalize(sale) (7.1)', () => {
    fc.assert(
      fc.property(arbSale, (sale) => {
        const parsed = parseSaleXml(serializeSaleXml(sale));
        expect(parsed).toEqual(normalizeSale(sale));
      }),
      { numRuns: 500 },
    );
  });

  it('อักขระพิเศษใน field ไม่ทำ XML พัง (round-trip ครบ)', () => {
    const sale: SaleInvoice = {
      invoiceNumber: 'INV<001>&"\'',
      sellerTaxId: '0105<&>',
      buyerTaxId: 'ผู้ซื้อ & หุ้นส่วน',
      date: '2026-06-30',
      items: [{ description: '<ตู้> "ไม้" & โลหะ', qty: 2, unitPrice: 1500 }],
      net: 3000,
      vat: 210,
      gross: 3210,
    };
    expect(parseSaleXml(serializeSaleXml(sale))).toEqual(normalizeSale(sale));
  });
});
