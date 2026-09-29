/**
 * buildCutListXlsx.ts
 *
 * Generates a 3-tab Excel workbook from a FactoryPacket cut list.
 *
 * Tab 1 – "Cut List"    : all rows; curved rows (kerfCount ≠ undefined) teal fill;
 *                         DEV_LENGTH / KERF_COUNT header cells purple.
 * Tab 2 – "Summary"     : totals + by-material breakdown table.
 * Tab 3 – "Curved Panels": only rows where kerfCount ≠ undefined; teal header.
 *
 * Returns Promise<ArrayBuffer> so callers can Blob-download or write to disk.
 *
 * @module buildCutListXlsx
 */

import { Workbook } from 'exceljs';
import type { PacketCutList, PacketCutListRow } from '../../../../factory/packet/types';

// ============================================
// COLORS
// ============================================

const TEAL_ARGB   = 'FF0d9488';
const PURPLE_ARGB = 'FF7c3aed';
const DARK_ARGB   = 'FF1e293b';
const EVEN_ARGB   = 'FF0f172a';
const ODD_ARGB    = 'FF0d1117';
const WHITE_ARGB  = 'FFFFFFFF';
const TEXT_LIGHT  = 'FFcbd5e1';

// ============================================
// COLUMN DEFINITIONS
// ============================================

interface ColDef {
  header: string;
  key: string;
  width: number;
  purpleHeader?: boolean;
}

const CUT_LIST_COLS: ColDef[] = [
  { header: '#',           key: 'rowNo',           width: 5  },
  { header: 'Part ID',     key: 'partId',          width: 18 },
  { header: 'Cabinet',     key: 'cabinetId',       width: 14 },
  { header: 'Material',    key: 'materialId',      width: 16 },
  { header: 'Qty',         key: 'qty',             width: 6  },
  { header: 'Finish W',    key: 'finishW',         width: 9  },
  { header: 'Finish H',    key: 'finishH',         width: 9  },
  { header: 'Edge L',      key: 'eb_L',            width: 7  },
  { header: 'Edge R',      key: 'eb_R',            width: 7  },
  { header: 'Edge T',      key: 'eb_T',            width: 7  },
  { header: 'Edge B',      key: 'eb_B',            width: 7  },
  { header: 'Premill L',   key: 'pm_L',            width: 8  },
  { header: 'Premill R',   key: 'pm_R',            width: 8  },
  { header: 'Premill T',   key: 'pm_T',            width: 8  },
  { header: 'Premill B',   key: 'pm_B',            width: 8  },
  { header: 'Cut W',       key: 'cutW',            width: 9  },
  { header: 'Cut H',       key: 'cutH',            width: 9  },
  { header: 'Grain',       key: 'grain',           width: 10 },
  { header: 'Dev Length',  key: 'developedLength', width: 11, purpleHeader: true },
  { header: 'Kerf Count',  key: 'kerfCount',       width: 10, purpleHeader: true },
  { header: 'Proj Depth',  key: 'projectedDepth',  width: 11 },
  { header: 'Curved Edge', key: 'curvedEdge',      width: 11 },
  { header: 'Note',        key: 'note',            width: 20 },
];

// ============================================
// HELPERS
// ============================================

/** Flatten a PacketCutListRow into a plain object keyed by ColDef keys. */
function flattenRow(row: PacketCutListRow): Record<string, unknown> {
  return {
    rowNo:           row.rowNo,
    partId:          row.partId,
    cabinetId:       row.cabinetId,
    materialId:      row.materialId,
    qty:             row.qty,
    finishW:         row.finishW,
    finishH:         row.finishH,
    eb_L:            row.edgeBanding[0],
    eb_R:            row.edgeBanding[1],
    eb_T:            row.edgeBanding[2],
    eb_B:            row.edgeBanding[3],
    pm_L:            row.premill[0],
    pm_R:            row.premill[1],
    pm_T:            row.premill[2],
    pm_B:            row.premill[3],
    cutW:            row.cutW,
    cutH:            row.cutH,
    grain:           row.grain,
    developedLength: row.developedLength ?? null,
    kerfCount:       row.kerfCount       ?? null,
    projectedDepth:  row.projectedDepth  ?? null,
    curvedEdge:      row.curvedEdge      ?? null,
    note:            row.note            ?? null,
  };
}

type WsType = import('exceljs').Worksheet;

/** Apply header styling to row 1 of a worksheet. */
function styleHeaderRow(ws: WsType, cols: ColDef[], defaultFill = DARK_ARGB): void {
  const headerRow = ws.getRow(1);
  cols.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    const fillArgb = col.purpleHeader ? PURPLE_ARGB : defaultFill;
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.font   = { bold: true, color: { argb: WHITE_ARGB }, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: '334155' } } };
  });
  headerRow.height = 18;
  headerRow.commit();
}

/** Apply data-row styling (teal for curved, dark alternating for flat). */
function styleDataRow(ws: WsType, rowNumber: number, isCurved: boolean, colCount: number): void {
  const row = ws.getRow(rowNumber);
  const fillArgb = isCurved
    ? TEAL_ARGB
    : rowNumber % 2 === 0 ? EVEN_ARGB : ODD_ARGB;
  const fontArgb = isCurved ? WHITE_ARGB : TEXT_LIGHT;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.font      = { size: 9, color: { argb: fontArgb } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  }
  row.height = 15;
  row.commit();
}

// ============================================
// MAIN EXPORT
// ============================================

export async function buildCutListXlsx(params: {
  cutList: PacketCutList;
  jobId?: string;
}): Promise<ArrayBuffer> {
  const { cutList, jobId } = params;

  const wb = new Workbook();
  wb.creator = 'MONOLITH Cabinet Design System';
  wb.created = new Date();
  wb.title   = `Cut List${jobId ? ` — ${jobId}` : ''}`;

  // ──────────────────────────────────────────────────────────────
  // Tab 1: Cut List
  // ──────────────────────────────────────────────────────────────
  const wsCut = wb.addWorksheet('Cut List');
  wsCut.columns = CUT_LIST_COLS.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width,
  }));
  styleHeaderRow(wsCut, CUT_LIST_COLS, DARK_ARGB);

  cutList.rows.forEach((row) => {
    const isCurved = row.kerfCount !== undefined;
    const addedRow = wsCut.addRow(flattenRow(row));
    addedRow.commit();
    styleDataRow(wsCut, addedRow.number, isCurved, CUT_LIST_COLS.length);
  });

  // ──────────────────────────────────────────────────────────────
  // Tab 2: Summary
  // ──────────────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet('Summary');
  wsSummary.getColumn(1).width = 24;
  wsSummary.getColumn(2).width = 16;

  const addSummaryRow = (label: string, value: string | number, bold = false) => {
    const r = wsSummary.addRow([label, value]);
    [1, 2].forEach((c) => {
      const cell = r.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_ARGB } };
      cell.font = { bold, color: { argb: c === 2 ? WHITE_ARGB : TEXT_LIGHT }, size: 9 };
    });
    r.commit();
  };

  addSummaryRow('Job ID',        jobId ?? '—',               true);
  addSummaryRow('Total Rows',    cutList.summary.totalRows,   true);
  addSummaryRow('Total Parts',   cutList.summary.totalParts,  true);

  wsSummary.addRow([]).commit(); // blank separator

  // By-material table header
  const matHeader = wsSummary.addRow(['Material', 'Rows', 'Parts']);
  matHeader.eachCell((cell) => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_ARGB } };
    cell.font      = { bold: true, color: { argb: WHITE_ARGB }, size: 9 };
    cell.alignment = { horizontal: 'center' };
  });
  matHeader.commit();

  Object.entries(cutList.summary.byMaterial).forEach(([matId, stats]) => {
    const r = wsSummary.addRow([matId, stats.rows, stats.parts]);
    r.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ODD_ARGB } };
      cell.font = { color: { argb: TEXT_LIGHT }, size: 9 };
    });
    r.commit();
  });

  // ──────────────────────────────────────────────────────────────
  // Tab 3: Curved Panels
  // ──────────────────────────────────────────────────────────────
  const wsCurved = wb.addWorksheet('Curved Panels');
  wsCurved.columns = CUT_LIST_COLS.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width,
  }));
  // Teal header for this tab
  styleHeaderRow(wsCurved, CUT_LIST_COLS, TEAL_ARGB);

  const curvedRows = cutList.rows.filter((r) => r.kerfCount !== undefined);
  curvedRows.forEach((row) => {
    const addedRow = wsCurved.addRow(flattenRow(row));
    addedRow.commit();
    styleDataRow(wsCurved, addedRow.number, true, CUT_LIST_COLS.length);
  });

  // Return as ArrayBuffer
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
