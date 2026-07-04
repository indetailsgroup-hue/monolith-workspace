// Feature: monolith-accounting — Currency_Service core (ACC-2 Currency Conversion)
// Pure logic: รองรับ ≥160 สกุล, getRate (ไม่พบ → throw NotFoundError), convert (เก็บสองค่า + ปัด 2 ตำแหน่ง).
// fail-safe no-guess: ไม่มีอัตรา/สกุลไม่รองรับ/จำนวนติดลบ → throw (ไม่เดา, ไม่บันทึก).

export type CurrencyCode = string; // ISO 4217

/** ISO 4217 active codes (>= 160) — reference; ปรับผ่าน config ได้ */
export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = Object.freeze([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF',
  'BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC',
  'CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS',
  'GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK',
  'JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD',
  'LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN',
  'NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON',
  'RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC',
  'SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS',
  'VES','VND','VUV','WST','XAF','XCD','XOF','XPF','YER','ZAR','ZMW','ZWL','BOV','CLF','COU','CHE',
  'CHW','MXV','USN','UYI','KID','TVD',
]);

const SUPPORTED_SET = new Set(SUPPORTED_CURRENCIES);

/** สกุลหลัก (base/functional currency) — MVP: THB */
export const BASE_CURRENCY: CurrencyCode = 'THB';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/** เก็บสองค่า (Req 2.3): จำนวนสกุลต้นทาง + จำนวนที่แปลงเป็นสกุลหลัก + อัตรา + วันที่ */
export interface ConvertedMoney {
  original: Money;   // สกุลต้นทาง
  base: Money;       // แปลงเป็น to (สกุลหลัก)
  rate: number;
  date: string;      // ISO yyyy-mm-dd
}

export type RateTable = Readonly<Record<string, number>>;

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function isoDate(date: Date | string): string {
  const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`currency: date รูปแบบไม่ถูกต้อง (${d})`);
  return d;
}

function rateKey(from: CurrencyCode, to: CurrencyCode, date: string): string {
  return `${from}>${to}@${date}`;
}

/** Req 2.1 — รายการสกุลที่รองรับ (≥160) */
export function listSupportedCurrencies(): readonly CurrencyCode[] {
  return SUPPORTED_CURRENCIES;
}

export function isSupported(code: CurrencyCode): boolean {
  return SUPPORTED_SET.has(code);
}

/**
 * Req 2.2/2.4 — อัตราแลกเปลี่ยน ณ วันที่. from==to → 1 (identity).
 * ไม่พบ → throw (NotFoundError, fail-safe no-guess).
 */
export function getRate(
  from: CurrencyCode,
  to: CurrencyCode,
  date: Date | string,
  rates: RateTable,
): number {
  if (!isSupported(from) || !isSupported(to)) {
    throw new Error(`currency: สกุลไม่รองรับ (${from}/${to})`);
  }
  const d = isoDate(date);
  if (from === to) return 1;
  const r = rates[rateKey(from, to, d)];
  if (r === undefined || !(r > 0)) {
    throw new Error(`currency: ไม่พบอัตรา ${from}->${to} @ ${d} (fail-safe no-guess)`);
  }
  return r;
}

/**
 * Req 2.2/2.3 — แปลงสกุล: เก็บสองค่า (original + base) โดย base = ปัดเศษ(amount × rate, 2 ตำแหน่ง) เสมอ.
 * จำนวนติดลบ / สกุลไม่รองรับ / ไม่มีอัตรา → throw.
 */
export function convert(
  money: Money,
  to: CurrencyCode,
  date: Date | string,
  rates: RateTable,
): ConvertedMoney {
  if (!Number.isFinite(money.amount) || money.amount < 0) {
    throw new Error(`currency: amount ต้อง >= 0 (ได้ ${money.amount})`);
  }
  const d = isoDate(date);
  const rate = getRate(money.currency, to, d, rates);
  return {
    original: { amount: round2(money.amount), currency: money.currency },
    base: { amount: round2(money.amount * rate), currency: to },
    rate,
    date: d,
  };
}
