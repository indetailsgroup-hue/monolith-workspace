// Feature: monolith-accounting — BIM_Connector core (ACC-14 BIM → BOQ → Quotation)
// Pure: importRevit → BOQ (ครบชนิด+ปริมาณ); priceBoq (line=qty×unitPrice; ไม่มีราคา→ตีตรา "ไม่มีราคา");
//   createQuotation (total=Σ lines; VAT 7%). fail-safe no-guess: ไม่มีราคา → ห้ามสร้างใบเสนอราคา.

export const VAT_RATE = 0.07;

export interface RevitQuantity {
  materialType: string;
  qty: number;
}
export interface BoqLine {
  materialType: string;
  qty: number;
}
export interface PricedLine extends BoqLine {
  unitPrice: number | null; // null = ไม่มีราคา
  lineTotal: number | null;
  priced: boolean;
}
export interface Quotation {
  lines: readonly PricedLine[];
  subtotal: number;
  vat: number;
  total: number;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Req 12.1 — Revit quantities → BOQ (รวม qty ต่อ materialType, ครบทุกชนิด) */
export function importRevit(quantities: readonly RevitQuantity[]): BoqLine[] {
  const byType = new Map<string, number>();
  for (const q of quantities) {
    if (!q.materialType) throw new Error('bim: materialType ว่าง');
    if (!Number.isFinite(q.qty) || q.qty < 0) throw new Error(`bim: qty ต้อง >= 0 (${q.materialType})`);
    byType.set(q.materialType, (byType.get(q.materialType) ?? 0) + q.qty); // สะสม raw
  }
  // ปัดครั้งเดียวตอน build (กัน double-rounding drift จากการปัดสะสมทีละขั้น)
  return [...byType.entries()].map(([materialType, qty]) => ({ materialType, qty: round2(qty) }));
}

/** Req 12.2/12.4 — ตั้งราคา BOQ: line=qty×unitPrice; ไม่มีราคา → priced=false (ตีตรา "ไม่มีราคา") */
export function priceBoq(boq: readonly BoqLine[], priceOf: (materialType: string) => number | undefined): PricedLine[] {
  return boq.map((l) => {
    const up = priceOf(l.materialType);
    if (up === undefined || !(up >= 0)) {
      return { ...l, unitPrice: null, lineTotal: null, priced: false };
    }
    return { ...l, unitPrice: round2(up), lineTotal: round2(l.qty * up), priced: true };
  });
}

/**
 * Req 12.3/12.5 — สร้างใบเสนอราคา: total = Σ lineTotal (VAT 7%).
 * fail-safe: มีบรรทัดที่ไม่มีราคา → throw (no-guess, ห้ามสร้างจนกว่ากำหนดราคาครบ).
 */
export function createQuotation(lines: readonly PricedLine[]): Quotation {
  const unpriced = lines.filter((l) => !l.priced);
  if (unpriced.length > 0) {
    throw new Error(`bim: มี ${unpriced.length} รายการยังไม่มีราคา — ห้ามสร้างใบเสนอราคา (no-guess)`);
  }
  const subtotal = round2(lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
  const vat = round2(subtotal * VAT_RATE);
  return { lines: [...lines], subtotal, vat, total: round2(subtotal + vat) };
}
