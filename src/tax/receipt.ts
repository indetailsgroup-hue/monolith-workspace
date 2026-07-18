// Feature: S18 l4-finance-tax Slice 3 — VAT breakdown สำหรับใบเสร็จ/พรีวิวหน้าเงิน
// caller แรกของ composeFromNet (etax.ts — ACC-8): แยกฐาน/VAT/รวม จากยอดฐานก่อน VAT
// DISCLAIMER: สมมติฐาน "ยอดงวด = ฐานก่อน VAT" ต้องผ่านผู้ทำบัญชียืนยันก่อนใช้เป็นเอกสารภาษี
//   (ถ้ายอดสัญญารวม VAT อยู่แล้ว → สลับไป splitInclusive ใน etax.ts จุดเดียว)

import { composeFromNet, VAT_RATE, type VatBreakdown } from './etax';

export interface ReceiptVatBreakdown extends VatBreakdown {
  /** อัตราที่ใช้คำนวณ (default VAT_RATE = 0.07) */
  rate: number;
  /** ข้อความ 3 บรรทัดสำหรับแปะในใบเสร็จ: ฐานก่อน VAT / VAT n% / รวมทั้งสิ้น */
  text: string;
}

/** format เงินบาท 2 ตำแหน่งเสมอ (สตางค์) — locale ไทย */
export function formatThb2(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ป้ายเปอร์เซ็นต์จากอัตรา (กัน floating: 0.07 × 100 → 7 ไม่ใช่ 7.000000000000001) */
function ratePercentLabel(rate: number): string {
  return String(Math.round(rate * 10000) / 100);
}

/** ACC-8 caller — แยก VAT จากฐานก่อน VAT + ข้อความใบเสร็จ (fail-safe สืบทอดจาก composeFromNet) */
export function buildReceiptVatBreakdown(net: number, rate: number = VAT_RATE): ReceiptVatBreakdown {
  const b = composeFromNet(net, rate);
  const text =
    `ฐานก่อน VAT: ${formatThb2(b.net)} บาท\n` +
    `VAT ${ratePercentLabel(rate)}%: ${formatThb2(b.vat)} บาท\n` +
    `รวมทั้งสิ้น: ${formatThb2(b.gross)} บาท`;
  return { ...b, rate, text };
}
