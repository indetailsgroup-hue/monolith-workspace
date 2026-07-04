// Feature: monolith-accounting — WHT RD Prep .txt serializer (task 10.3, Req 8.1)
// Pure: serialize WHT records → ไฟล์ข้อความสำหรับนำเข้าโปรแกรม RD Prep (ภ.ง.ด.3 / ภ.ง.ด.53).
// DISCLAIMER: layout เป็น reference (pipe-delimited) — ต้อง validate กับสเปคนำเข้า RD Prep จริงก่อน production.

import {
  classifyForm,
  toLine,
  DEFAULT_WHT_RATES,
  type WhtRateTable,
  type PayeeType,
  type WhtForm,
} from './wht';

/** RD income-type code (reference) ต่อประเภทเงินได้ */
export const RD_INCOME_CODE: Readonly<Record<string, string>> = Object.freeze({
  service_fee: '3',
  professional_fee: '2',
  rental: '5',
  transport: '4',
  advertising: '4',
  commission: '3',
  interest: '4A',
  dividend: '4B',
});

export interface WhtRecordFull {
  payeeType: PayeeType;
  payeeTaxId: string;
  payeeName: string;
  incomeType: string;
  payDate: string; // ISO
  baseAmount: number;
}

export interface RdPrepFile {
  form: WhtForm;
  text: string;
  detailCount: number;
  totalPaid: number;
  totalWithheld: number;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
/** sanitize field: ตัด | และ newline (delimiter safety) */
function field(s: string): string {
  return String(s).replace(/[|\r\n]/g, ' ');
}

/**
 * Req 8.1 — สร้างไฟล์ RD Prep ต่อ 1 ฟอร์ม (คัดเฉพาะ record ของฟอร์มนั้น).
 * บรรทัด: seq|payeeTaxId|payeeName|incomeCode|payDate|base|ratePct|withheld ; footer: TOTAL|count|paid|withheld
 */
export function buildRdPrepFile(
  form: WhtForm,
  records: readonly WhtRecordFull[],
  rates: WhtRateTable = DEFAULT_WHT_RATES,
): RdPrepFile {
  const scoped = records.filter((r) => classifyForm(r.payeeType) === form);
  let totalPaid = 0;
  let totalWithheld = 0;
  const lines = scoped.map((r, i) => {
    // reuse canonical toLine (normalize base + คำนวณ withheld แบบเดียวกับ buildWhtExport) — กัน F1 divergence
    const ln = toLine({ payeeType: r.payeeType, incomeType: r.incomeType, baseAmount: r.baseAmount }, rates);
    totalPaid += ln.baseAmount;
    totalWithheld += ln.withheld;
    const code = RD_INCOME_CODE[r.incomeType] ?? '99';
    return [i + 1, field(r.payeeTaxId), field(r.payeeName), code, field(r.payDate), ln.baseAmount, round2(ln.rate * 100), ln.withheld].join('|');
  });
  totalPaid = round2(totalPaid);
  totalWithheld = round2(totalWithheld);
  const footer = ['TOTAL', scoped.length, totalPaid, totalWithheld].join('|');
  const header = `#${form}|seq|payeeTaxId|payeeName|incomeCode|payDate|base|ratePct|withheld`;
  return {
    form,
    text: [header, ...lines, footer].join('\n'),
    detailCount: scoped.length,
    totalPaid,
    totalWithheld,
  };
}

/** สร้างทั้ง ภ.ง.ด.3 และ ภ.ง.ด.53 จากชุดเดียว (แยกอัตโนมัติตาม payeeType) */
export function buildRdPrepBoth(records: readonly WhtRecordFull[], rates: WhtRateTable = DEFAULT_WHT_RATES) {
  return {
    pnd3: buildRdPrepFile('PND3', records, rates),
    pnd53: buildRdPrepFile('PND53', records, rates),
  };
}
