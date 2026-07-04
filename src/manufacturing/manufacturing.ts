// Feature: monolith-accounting — Manufacturing_Module core (ACC-4 BOM, ACC-5 Job Cost, ACC-6 Inventory)
// Pure logic: createBOM/explodeBOM (qtyPerUnit×units), closeJob (total=material+labor+overhead),
//   issueMaterial (ลด inventory; ไม่พอ → InsufficientStockError). fail-safe: จำนวนติดลบ → throw.

export interface BomLine {
  materialId: string;
  qtyPerUnit: number;
}

export interface BOM {
  productId: string;
  lines: readonly BomLine[];
}

export interface MaterialRequirement {
  materialId: string;
  qty: number;
}

export interface JobCostInput {
  material: number;
  labor: number;
  overhead: number;
}

export interface JobCost extends JobCostInput {
  total: number;
}

/** ข้อผิดพลาดเบิกเกินยอดคงเหลือ */
export class InsufficientStockError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(`InsufficientStock: ขอเบิก ${requested} แต่คงเหลือ ${available}`);
    this.name = 'InsufficientStockError';
  }
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** สร้าง BOM (อ่านกลับได้ครบ — Req 4.1) */
export function createBOM(productId: string, lines: readonly BomLine[]): BOM {
  if (!productId) throw new Error('BOM: productId ว่าง');
  for (const l of lines) {
    if (!l.materialId) throw new Error('BOM: materialId ว่าง');
    if (!Number.isFinite(l.qtyPerUnit) || l.qtyPerUnit < 0) {
      throw new Error(`BOM: qtyPerUnit ต้อง >= 0 (${l.materialId})`);
    }
  }
  return { productId, lines: [...lines] };
}

/** ACC-4 — ระเบิด BOM: qty ของแต่ละบรรทัด = qtyPerUnit × units */
export function explodeBOM(bom: BOM, units: number): MaterialRequirement[] {
  if (!Number.isInteger(units) || units < 0) {
    throw new Error(`BOM: units ต้องเป็นจำนวนเต็ม >= 0 (ได้ ${units})`);
  }
  return bom.lines.map((l) => ({ materialId: l.materialId, qty: round2(l.qtyPerUnit * units) }));
}

/** ACC-5 — ปิดงาน: total = material + labor + overhead. normalize เป็น 2 ทศนิยม (money=สตางค์) */
export function closeJob(cost: JobCostInput): JobCost {
  for (const [k, v] of Object.entries(cost)) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Job: ${k} ต้อง >= 0 (ได้ ${v})`);
  }
  const material = round2(cost.material);
  const labor = round2(cost.labor);
  const overhead = round2(cost.overhead);
  return { material, labor, overhead, total: round2(material + labor + overhead) };
}

export interface IssueResult {
  materialId: string;
  issued: number;
  stockBefore: number;
  stockAfter: number;
}

/**
 * ACC-6 — เบิกวัตถุดิบ: qty ≤ stock → stockAfter = stock − qty (พอดี); qty > stock → InsufficientStockError.
 * fail-safe: qty <= 0 → throw (ต้องเบิกจำนวนบวก).
 */
export function issueMaterial(materialId: string, stock: number, qty: number): IssueResult {
  if (!Number.isFinite(stock) || stock < 0) throw new Error(`Inventory: stock ต้อง >= 0 (ได้ ${stock})`);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Inventory: qty เบิกต้อง > 0 (ได้ ${qty})`);
  if (qty > stock) throw new InsufficientStockError(stock, qty);
  return {
    materialId,
    issued: qty,
    stockBefore: stock,
    stockAfter: round2(stock - qty),
  };
}

// ---------------------------------------------------------------------------
// postJobToLedger (Req 4.6) — สร้าง journal lines จาก JobCost (debit=credit)
//   Dr Finished Goods (total)  Cr Material + Cr Labor + Cr Overhead
//   → ส่งเข้า rpc_post_journal_entry (SQL 0066) ได้โดยตรง (บังคับ Σdebit=Σcredit อีกชั้น).
// ---------------------------------------------------------------------------
export interface JobLedgerAccounts {
  finishedGoods: string; // Dr — สินค้าสำเร็จรูป/งานระหว่างทำ (เช่น 1030)
  material: string;      // Cr — วัตถุดิบ/เคลียริ่ง (เช่น 1030 หรือ clearing)
  labor: string;         // Cr — ค่าแรงเคลียริ่ง (เช่น 5020)
  overhead: string;      // Cr — โสหุ้ยเคลียริ่ง (เช่น 5090)
}

export interface JournalLineDraft {
  account_code: string;
  debit: number;
  credit: number;
}

/** Req 4.6 — job cost → journal lines (balanced). ข้าม credit ที่เป็น 0; total ต้อง > 0 */
export function postJobToLedger(job: JobCost, acc: JobLedgerAccounts): JournalLineDraft[] {
  if (!(job.total > 0)) {
    throw new Error(`postJobToLedger: total ต้อง > 0 (ได้ ${job.total})`);
  }
  const lines: JournalLineDraft[] = [
    { account_code: acc.finishedGoods, debit: round2(job.total), credit: 0 },
  ];
  if (job.material > 0) lines.push({ account_code: acc.material, debit: 0, credit: round2(job.material) });
  if (job.labor > 0) lines.push({ account_code: acc.labor, debit: 0, credit: round2(job.labor) });
  if (job.overhead > 0) lines.push({ account_code: acc.overhead, debit: 0, credit: round2(job.overhead) });
  return lines;
}

/** ผลรวม debit / credit ของชุด lines (helper ตรวจสมดุล) */
export function sumSides(lines: readonly JournalLineDraft[]): { debit: number; credit: number } {
  return {
    debit: round2(lines.reduce((s, l) => s + l.debit, 0)),
    credit: round2(lines.reduce((s, l) => s + l.credit, 0)),
  };
}
