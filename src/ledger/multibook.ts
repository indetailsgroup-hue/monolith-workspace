// Feature: monolith-accounting — Multi_Book_Ledger core (ACC-7 Multi-Book Isolation)
// Pure logic: post(entry, bookId) บันทึกเฉพาะ book ที่ระบุ; งบของ book ใด ๆ คำนวณจาก entry ของ book นั้นเท่านั้น
//   (ไม่ปนข้าม book). fail-safe: bookId/entryId ว่าง → throw.

export interface BookLine {
  account_code: string;
  debit: number;
  credit: number;
}
export interface BookEntry {
  entryId: string;
  bookId: string;
  lines: readonly BookLine[];
}

/** สถานะ ledger หลาย book (immutable) */
export type MultiBookLedger = Readonly<Record<string, readonly BookEntry[]>>;

export const DEFAULT_BOOKS = Object.freeze(['internal', 'external']);

export function emptyLedger(): MultiBookLedger {
  return {};
}

/** รายชื่อ book ที่มี entry อยู่ (อย่างน้อย internal/external ตาม policy) */
export function books(ledger: MultiBookLedger): string[] {
  return Object.keys(ledger);
}

/** Req 5.2 — post เข้า book ที่ระบุเท่านั้น (immutable append) */
export function post(ledger: MultiBookLedger, entry: BookEntry): MultiBookLedger {
  if (!entry.bookId) throw new Error('multibook: bookId ว่าง');
  if (!entry.entryId) throw new Error('multibook: entryId ว่าง');
  const current = ledger[entry.bookId] ?? [];
  return { ...ledger, [entry.bookId]: [...current, { ...entry, lines: [...entry.lines] }] };
}

/** entry ของ book ที่ระบุเท่านั้น (Req 5.3 isolation) */
export function entriesOf(ledger: MultiBookLedger, bookId: string): readonly BookEntry[] {
  return ledger[bookId] ?? [];
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export interface BookStatement {
  bookId: string;
  entryCount: number;
  totalDebit: number;
  totalCredit: number;
}

/** Req 5.3 — งบของ book: รวมจาก entry ของ book นั้นเท่านั้น (ไม่ปนข้าม) */
export function statement(ledger: MultiBookLedger, bookId: string): BookStatement {
  const entries = entriesOf(ledger, bookId);
  let d = 0;
  let c = 0;
  for (const e of entries) for (const l of e.lines) {
    d += l.debit;
    c += l.credit;
  }
  return { bookId, entryCount: entries.length, totalDebit: round2(d), totalCredit: round2(c) };
}

// ---------------------------------------------------------------------------
// statutoryStatement (Req 5.4/5.5) — งบการเงินตามรูปแบบ DBD2554 / IFRS_Format3
//   จาก entry ของ book เดียว (isolation ACC-7). ต้องมี COA type map (account_code → type).
// DISCLAIMER: layout เป็น reference — ต้อง validate กับแบบ DBD/IFRS จริงก่อนยื่น.
// ---------------------------------------------------------------------------
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type CoaTypeMap = Readonly<Record<string, AccountType>>;
export type StatementFormat = 'DBD2554' | 'IFRS_Format3';

export interface StatutoryStatement {
  bookId: string;
  format: StatementFormat;
  entityType: string;
  assets: number;
  liabilities: number;
  equity: number;
  revenue: number;
  expense: number;
  netProfit: number;         // revenue − expense
  balanced: boolean;         // assets === liabilities + equity + netProfit (±0.01)
}

/** net ต่อ type: asset/expense = debit−credit ; liability/equity/revenue = credit−debit */
function netByType(ledger: MultiBookLedger, bookId: string, coa: CoaTypeMap): Record<AccountType, number> {
  const acc: Record<AccountType, number> = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 };
  for (const e of entriesOf(ledger, bookId)) {
    for (const l of e.lines) {
      const t = coa[l.account_code];
      if (!t) throw new Error(`statement: ไม่พบ type ของบัญชี ${l.account_code} (fail-safe)`);
      const signed = t === 'asset' || t === 'expense' ? l.debit - l.credit : l.credit - l.debit;
      acc[t] += signed;
    }
  }
  return acc;
}

/** Req 5.4/5.5 — งบตามรูปแบบที่ระบุ (DBD2554 / IFRS_Format3) จาก book เดียว */
export function statutoryStatement(
  ledger: MultiBookLedger,
  bookId: string,
  format: StatementFormat,
  coa: CoaTypeMap,
  entityType = 'company',
): StatutoryStatement {
  if (format !== 'DBD2554' && format !== 'IFRS_Format3') {
    throw new Error(`statement: รูปแบบไม่รองรับ ${format}`);
  }
  const n = netByType(ledger, bookId, coa);
  const netProfit = round2(n.revenue - n.expense);
  const assets = round2(n.asset);
  const liabilities = round2(n.liability);
  const equity = round2(n.equity);
  return {
    bookId,
    format,
    entityType,
    assets,
    liabilities,
    equity,
    revenue: round2(n.revenue),
    expense: round2(n.expense),
    netProfit,
    balanced: Math.abs(assets - (liabilities + equity + netProfit)) <= 0.01,
  };
}
