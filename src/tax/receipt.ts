// Feature: S18 l4-finance-tax Slice 3 — VAT breakdown สำหรับใบเสร็จ/พรีวิวหน้าเงิน
// caller แรกของ composeFromNet (etax.ts — ACC-8): แยกฐาน/VAT/รวม จากยอดฐานก่อน VAT
// DISCLAIMER: สมมติฐาน "ยอดงวด = ฐานก่อน VAT" ต้องผ่านผู้ทำบัญชียืนยันก่อนใช้เป็นเอกสารภาษี
//   (ถ้ายอดสัญญารวม VAT อยู่แล้ว → สลับไป splitInclusive ใน etax.ts จุดเดียว)
// Review fix R1 (S18): สมมติฐานนี้ทำให้ยอดรวม VAT "ไม่ตรง" กับใบแจ้งงวดที่ลูกค้าเห็น
//   (0137 rpc_doc_view_resolve แจ้งยอดงวดตรง ๆ ไม่มีบรรทัด VAT) → breakdown พก caveat
//   สำหรับแสดงบนจอคู่กับตัวเลขเสมอ จนกว่าบัญชีเซ็นยืนยันวิธีคิด

import { composeFromNet, VAT_RATE, type VatBreakdown } from './etax';

export interface ReceiptVatBreakdown extends VatBreakdown {
  /** อัตราที่ใช้คำนวณ (default VAT_RATE = 0.07) */
  rate: number;
  /** ข้อความ 3 บรรทัดสำหรับแปะในใบเสร็จ: ฐานก่อน VAT / VAT n% / รวมทั้งสิ้น */
  text: string;
  /** ป้ายเตือนบนจอ (review R1) — ต้องแสดงคู่กับ text เสมอ: พรีวิว + สมมติฐานรอบัญชียืนยัน + ยอดรวมไม่ตรงใบแจ้งงวด */
  caveat: string;
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
  // Review fix R1: ใบแจ้งงวด (0137) แจ้งลูกค้า ${net} บาทตรง ๆ — ยอดรวม VAT บนจอจึงไม่ตรงกับใบแจ้ง
  const caveat =
    `⚠️ พรีวิวเท่านั้น — สมมติว่ายอดงวดตามใบแจ้งงวด (${formatThb2(b.net)} บาท) คือฐานก่อน VAT ` +
    `ยอดรวม ${formatThb2(b.gross)} บาท จึงไม่ตรงกับใบแจ้งงวดที่ลูกค้าเห็น · ` +
    `กด "บันทึกรับ" = บันทึกยอดงวดเดิม ${formatThb2(b.net)} บาท · ` +
    `รอบัญชียืนยันวิธีคิด (composeFromNet ↔ splitInclusive) ก่อนใช้เป็นเอกสารภาษี`;
  return { ...b, rate, text, caveat };
}
