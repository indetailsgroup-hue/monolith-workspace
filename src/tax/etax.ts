// Feature: monolith-accounting — eTax_Generator core (VAT 7% + invoice number uniqueness)
// Pure logic (ACC-8 VAT 7%, ACC-9 Invoice Number Uniqueness). PDF/A-3 + XML + ลายเซ็นดิจิทัล = integration (task 9.5).
// fail-safe no-guess: net/gross ติดลบ → throw; ออกเลขซ้ำ → throw.
// DISCLAIMER: อัตรา VAT 7% ตามกฎหมายปัจจุบัน; โครงสร้าง e-Tax ต้องผ่านผู้ทำบัญชี/สรรพากรก่อน production.

/** อัตรา VAT ตามกฎหมาย (override ได้เพื่อรองรับการเปลี่ยนอัตรา) */
export const VAT_RATE = 0.07;

/** ปัด 2 ตำแหน่ง (สตางค์) — half-up กัน floating */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export interface VatBreakdown {
  net: number;   // ฐานก่อน VAT
  vat: number;   // ภาษีมูลค่าเพิ่ม
  gross: number; // รวม VAT
}

/** ACC-8 — จากยอดก่อน VAT: vat = round2(net × rate); gross = net + vat */
export function composeFromNet(net: number, rate: number = VAT_RATE): VatBreakdown {
  if (!Number.isFinite(net) || net < 0) {
    throw new Error(`eTax: net ต้อง >= 0 (ได้ ${net})`);
  }
  const vat = round2(net * rate);
  return { net: round2(net), vat, gross: round2(net + vat) };
}

/**
 * ACC-8 — จากยอดรวม VAT (VAT-inclusive): vat = round2(gross × rate/(1+rate)); net = gross − vat (plug).
 * ใช้ net เป็นตัวปิดยอด → net + vat === gross ถึงสตางค์เสมอ.
 */
export function splitInclusive(gross: number, rate: number = VAT_RATE): VatBreakdown {
  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error(`eTax: gross ต้อง >= 0 (ได้ ${gross})`);
  }
  const g = round2(gross);
  const vat = round2((g * rate) / (1 + rate));
  return { net: round2(g - vat), vat, gross: g };
}

// ---------------------------------------------------------------------------
// ACC-9 — Invoice Number Uniqueness
// ---------------------------------------------------------------------------

export interface InvoiceNumberFormat {
  prefix: string; // เช่น 'INV'
  year: number;   // ปี (ค.ศ. หรือ พ.ศ. ตามนโยบาย)
  width?: number; // ความกว้าง running (pad ศูนย์), default 6
}

/** format เลขที่: `${prefix}-${year}-${pad(seq,width)}` (deterministic ต่อ seq) */
export function formatInvoiceNumber(seq: number, fmt: InvoiceNumberFormat): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`eTax: running ต้องเป็นจำนวนเต็ม >= 1 (ได้ ${seq})`);
  }
  const width = fmt.width ?? 6;
  return `${fmt.prefix}-${fmt.year}-${String(seq).padStart(width, '0')}`;
}

/** จองเลขที่ต่อเนื่อง count ตัวจาก startSeq (strictly increasing → ไม่ซ้ำโดยโครงสร้าง) */
export function allocateBatch(startSeq: number, count: number, fmt: InvoiceNumberFormat): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`eTax: count ต้องเป็นจำนวนเต็ม >= 0 (ได้ ${count})`);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(formatInvoiceNumber(startSeq + i, fmt));
  return out;
}

/** true ถ้ามีเลขซ้ำในชุด */
export function hasDuplicates(numbers: readonly string[]): boolean {
  return new Set(numbers).size !== numbers.length;
}

/**
 * ตัวออกเลขที่ (stateful แต่ immutable state): กันเลขซ้ำ (ACC-9 fail-safe).
 * seq = running ถัดไป; issued = เซ็ตเลขที่ออกแล้ว.
 */
export interface InvoiceIssuerState {
  seq: number;
  issued: ReadonlySet<string>;
}

export function newIssuer(startSeq: number = 1): InvoiceIssuerState {
  return { seq: startSeq, issued: new Set() };
}

export interface IssueResult {
  number: string;
  state: InvoiceIssuerState;
}

/** ออกเลขที่ถัดไป (unique เสมอ); ถ้าชนกับที่ออกไปแล้ว (ไม่ควรเกิด) → throw fail-safe */
export function issueInvoiceNumber(state: InvoiceIssuerState, fmt: InvoiceNumberFormat): IssueResult {
  const number = formatInvoiceNumber(state.seq, fmt);
  if (state.issued.has(number)) {
    throw new Error(`eTax: เลขที่ ${number} ออกซ้ำ (fail-safe ACC-9)`);
  }
  const issued = new Set(state.issued);
  issued.add(number);
  return { number, state: { seq: state.seq + 1, issued } };
}
