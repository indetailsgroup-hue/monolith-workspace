// Feature: monolith-accounting — OCR Extraction → Draft Entry (ACC-15)
// Pure: ฟิลด์ที่สกัดได้ (date/amount/vat/wht) → draft entry สะท้อนค่าครบถ้วน.
// fail-safe no-guess: ฟิลด์ที่สกัดไม่ได้ (undefined) → ไม่เดา (ไม่ใส่ในร่าง); amount ที่มีต้อง >= 0.

export interface ExtractedFields {
  date?: string;
  amount?: number;
  vat?: number;
  wht?: number;
}

export interface DraftEntry {
  date: string | null;
  amount: number | null;
  vat: number | null;
  wht: number | null;
  status: 'draft';
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function normNum(v: number | undefined, label: string): number | null {
  if (v === undefined) return null; // ไม่สกัดได้ → ไม่เดา
  if (!Number.isFinite(v) || v < 0) throw new Error(`ocr-draft: ${label} ต้อง >= 0 (ได้ ${v})`);
  return round2(v);
}

/** Req 10.2 — สร้าง draft entry ที่สะท้อนฟิลด์ที่สกัดได้ครบถ้วน (ไม่เติม placeholder) */
export function buildDraftFromExtraction(f: ExtractedFields): DraftEntry {
  return {
    date: f.date ?? null,
    amount: normNum(f.amount, 'amount'),
    vat: normNum(f.vat, 'vat'),
    wht: normNum(f.wht, 'wht'),
    status: 'draft',
  };
}
