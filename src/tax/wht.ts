// Feature: monolith-accounting — WHT_Export_Service core (ภาษีหัก ณ ที่จ่าย ภ.ง.ด.3 / ภ.ง.ด.53)
// Pure logic (ACC-10): classify payee → form, คำนวณยอดหัก = ฐาน × อัตราตามประเภทเงินได้, รวมยอด.
// fail-safe no-guess: ประเภทเงินได้ที่ไม่รู้จัก / ฐานติดลบ → throw (ไม่เดา).
// DISCLAIMER: อัตรา WHT เป็น reference ทั่วไป — ต้องผ่านผู้ทำบัญชี/ผู้สอบบัญชีก่อน production (กฎกรมสรรพากรเปลี่ยนได้).

/** ผู้ถูกหัก: บุคคลธรรมดา → ภ.ง.ด.3 ; นิติบุคคล → ภ.ง.ด.53 */
export type PayeeType = 'individual' | 'juristic';
export type WhtForm = 'PND3' | 'PND53';

/** ประเภทเงินได้ (income type) → อัตราหัก (config-driven, ไม่ hardcode ในสูตร) */
export type WhtIncomeType =
  | 'service_fee'      // ค่าจ้างทำของ/ค่าบริการ
  | 'professional_fee' // ค่าวิชาชีพอิสระ
  | 'rental'           // ค่าเช่า
  | 'transport'        // ค่าขนส่ง
  | 'advertising'      // ค่าโฆษณา
  | 'commission'       // ค่านายหน้า/คอมมิชชั่น
  | 'interest'         // ดอกเบี้ย
  | 'dividend';        // เงินปันผล

export type WhtRateTable = Readonly<Record<string, number>>;

/** อัตรา reference (decimal). config-driven — ส่ง table เองได้เพื่อ override */
export const DEFAULT_WHT_RATES: WhtRateTable = Object.freeze({
  service_fee: 0.03,
  professional_fee: 0.03,
  rental: 0.05,
  transport: 0.01,
  advertising: 0.02,
  commission: 0.03,
  interest: 0.01,
  dividend: 0.1,
});

export interface WhtRecord {
  payeeType: PayeeType;
  incomeType: WhtIncomeType | string;
  baseAmount: number; // ฐานเงินได้ (ยอดจ่าย)
}

export interface WhtLine extends WhtRecord {
  form: WhtForm;
  rate: number;
  withheld: number;
}

export interface WhtFormTotals {
  form: WhtForm;
  count: number;
  totalPaid: number;
  totalWithheld: number;
}

export interface WhtExport {
  lines: readonly WhtLine[];
  pnd3: WhtFormTotals;
  pnd53: WhtFormTotals;
  grandTotalPaid: number;
  grandTotalWithheld: number;
}

/** ปัด 2 ตำแหน่ง (สตางค์) — half-up กันปัญหา floating */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** 8.2 — บุคคลธรรมดา → ภ.ง.ด.3 ; นิติบุคคล → ภ.ง.ด.53 */
export function classifyForm(payeeType: PayeeType): WhtForm {
  return payeeType === 'individual' ? 'PND3' : 'PND53';
}

/** อัตราตามประเภทเงินได้ (fail-safe: ไม่รู้จัก → throw, ไม่เดา) */
export function whtRate(incomeType: string, rates: WhtRateTable = DEFAULT_WHT_RATES): number {
  const rate = rates[incomeType];
  if (rate === undefined) {
    throw new Error(`WHT: ประเภทเงินได้ "${incomeType}" ไม่มีในตารางอัตรา (fail-safe no-guess)`);
  }
  return rate;
}

/** 8.3 — ยอดหัก = ฐาน × อัตรา (ปัด 2 ตำแหน่ง). ฐานติดลบ → throw */
export function computeWithholding(
  baseAmount: number,
  incomeType: string,
  rates: WhtRateTable = DEFAULT_WHT_RATES,
): number {
  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new Error(`WHT: ฐานเงินได้ต้อง >= 0 (ได้ ${baseAmount})`);
  }
  return round2(baseAmount * whtRate(incomeType, rates));
}

/** แปลง record → line (form + rate + withheld). normalize baseAmount เป็น 2 ทศนิยม (money = สตางค์) */
export function toLine(rec: WhtRecord, rates: WhtRateTable = DEFAULT_WHT_RATES): WhtLine {
  const base = round2(rec.baseAmount); // เงินเป็น 2 ทศนิยมเสมอ → totals coherent (กัน double-rounding drift)
  return {
    ...rec,
    baseAmount: base,
    form: classifyForm(rec.payeeType),
    rate: whtRate(rec.incomeType, rates),
    withheld: computeWithholding(base, rec.incomeType, rates),
  };
}

function totalsFor(form: WhtForm, lines: readonly WhtLine[]): WhtFormTotals {
  const scoped = lines.filter((l) => l.form === form);
  return {
    form,
    count: scoped.length,
    totalPaid: round2(scoped.reduce((s, l) => s + l.baseAmount, 0)),
    totalWithheld: round2(scoped.reduce((s, l) => s + l.withheld, 0)),
  };
}

/**
 * 8.2–8.5 — สร้าง WHT export: แยก ภ.ง.ด.3/53, คำนวณยอดหักต่อบรรทัด, รวมยอดจ่าย+ยอดหัก.
 * fail-safe: record ใด incomeType ไม่รู้จัก / ฐานติดลบ → throw (ทั้งชุด, ไม่ออก export บางส่วน).
 */
export function buildWhtExport(
  records: readonly WhtRecord[],
  rates: WhtRateTable = DEFAULT_WHT_RATES,
): WhtExport {
  const lines = records.map((r) => toLine(r, rates));
  const pnd3 = totalsFor('PND3', lines);
  const pnd53 = totalsFor('PND53', lines);
  return {
    lines,
    pnd3,
    pnd53,
    grandTotalPaid: round2(pnd3.totalPaid + pnd53.totalPaid),
    grandTotalWithheld: round2(pnd3.totalWithheld + pnd53.totalWithheld),
  };
}
