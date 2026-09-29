/**
 * buildCutListXlsx.test.ts
 *
 * Unit tests for the 3-tab XLSX cut-list builder.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Workbook } from 'exceljs';
import { buildCutListXlsx } from '../buildCutListXlsx';
import type { PacketCutList } from '../../../../../factory/packet/types';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const FLAT_ROW = {
  rowNo:       1,
  partId:      'FLAT_001',
  cabinetId:   'CAB_01',
  materialId:  'MAT_MDF',
  qty:          2,
  cutW:         600,
  cutH:         800,
  finishW:      595,
  finishH:      795,
  thickness:    18,
  grain:        'NONE' as const,
  edgeBanding:  [1, 1, 0, 0] as [number, number, number, number],
  premill:      [0, 0, 0, 0] as [number, number, number, number],
};

const CURVED_ROW = {
  rowNo:           2,
  partId:          'FRONT_CURVED',
  cabinetId:       'CAB_02',
  materialId:      'MAT_FLEX',
  qty:             1,
  cutW:            450,
  cutH:            700,
  finishW:         445,
  finishH:         695,
  thickness:       12,
  grain:           'NONE' as const,
  edgeBanding:     [1, 0, 1, 0] as [number, number, number, number],
  premill:         [0, 0, 0, 0] as [number, number, number, number],
  developedLength: 510.5,
  kerfCount:       8,
};

const CUT_LIST: PacketCutList = {
  version: 'cutlist.v1',
  rows: [FLAT_ROW, CURVED_ROW],
  summary: {
    totalRows:  2,
    totalParts: 3,
    byMaterial: {
      MAT_MDF:  { rows: 1, parts: 2 },
      MAT_FLEX: { rows: 1, parts: 1 },
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadWorkbook(buf: ArrayBuffer): Promise<Workbook> {
  const wb = new Workbook();
  // exceljs xlsx.load() needs a Node Buffer; suppress incompatible generic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(new Uint8Array(buf) as any);
  return wb;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildCutListXlsx', () => {
  let buffer: ArrayBuffer;
  let wb: Workbook;

  beforeAll(async () => {
    buffer = await buildCutListXlsx({ cutList: CUT_LIST, jobId: 'JOB-TEST-001' });
    wb = await loadWorkbook(buffer);
  });

  // ── Basic structure ──────────────────────────────────────────────────────

  it('returns a non-empty ArrayBuffer', () => {
    // exceljs writeBuffer() returns a Node Buffer (Uint8Array subclass),
    // which is NOT instanceof ArrayBuffer — check byteLength instead.
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('produces exactly 3 worksheets', () => {
    expect(wb.worksheets).toHaveLength(3);
  });

  it('names sheets correctly: "Cut List", "Summary", "Curved Panels"', () => {
    const names = wb.worksheets.map(s => s.name);
    expect(names).toEqual(['Cut List', 'Summary', 'Curved Panels']);
  });

  // ── Tab 1: Cut List ──────────────────────────────────────────────────────

  it('Cut List sheet has a header row (row 1) with PART_ID cell', () => {
    const ws = wb.getWorksheet('Cut List')!;
    const header = ws.getRow(1);
    // values is 1-indexed; index 0 is undefined
    const values = (header.values as (string | undefined)[]).slice(1);
    // headers include 'Part ID'
    expect(values.map(v => String(v ?? ''))).toContain('Part ID');
  });

  it('Cut List sheet has 2 data rows (one flat + one curved)', () => {
    const ws = wb.getWorksheet('Cut List')!;
    // Row 1 = header, rows 2..3 = data
    const row2 = ws.getRow(2).getCell(1).value;
    const row3 = ws.getRow(3).getCell(1).value;
    expect(row2).toBeTruthy();
    expect(row3).toBeTruthy();
  });

  it('curved row fill argb contains "0d9488" (teal)', () => {
    const ws = wb.getWorksheet('Cut List')!;
    // CURVED_ROW is the 2nd data row → row 3
    const cell = ws.getRow(3).getCell(1);
    const argb: string = (cell.fill as { fgColor?: { argb?: string } })?.fgColor?.argb ?? '';
    expect(argb.toLowerCase()).toContain('0d9488');
  });

  // ── Tab 2: Summary ───────────────────────────────────────────────────────

  it('Summary sheet row 2 contains totalRows=2', () => {
    const ws = wb.getWorksheet('Summary')!;
    const row2Values = (ws.getRow(2).values as unknown[]).slice(1);
    expect(row2Values).toContain(2);
  });

  it('Summary sheet row 3 contains totalParts=3', () => {
    const ws = wb.getWorksheet('Summary')!;
    const row3Values = (ws.getRow(3).values as unknown[]).slice(1);
    expect(row3Values).toContain(3);
  });

  // ── Tab 3: Curved Panels ─────────────────────────────────────────────────

  it('Curved Panels sheet has exactly 1 data row', () => {
    const ws = wb.getWorksheet('Curved Panels')!;
    // row 1 = header, row 2 = FRONT_CURVED, row 3 should be empty
    expect(ws.getRow(2).getCell(1).value).toBeTruthy();
    expect(ws.getRow(3).getCell(1).value).toBeFalsy();
  });

  it('Curved Panels row 2 first cell is row number 2 (rowNo)', () => {
    const ws = wb.getWorksheet('Curved Panels')!;
    // The first column is '#' (rowNo) — CURVED_ROW.rowNo = 2
    expect(ws.getRow(2).getCell(1).value).toBe(2);
  });

  it('Curved Panels row 2 second cell is FRONT_CURVED (partId)', () => {
    const ws = wb.getWorksheet('Curved Panels')!;
    // column 2 = 'Part ID' → partId
    expect(ws.getRow(2).getCell(2).value).toBe('FRONT_CURVED');
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('works with empty cut list (no rows)', async () => {
    const emptyCutList: PacketCutList = {
      version: 'cutlist.v1',
      rows: [],
      summary: { totalRows: 0, totalParts: 0, byMaterial: {} },
    };
    const buf2 = await buildCutListXlsx({ cutList: emptyCutList });
    expect(buf2.byteLength).toBeGreaterThan(500);
    const wb2 = await loadWorkbook(buf2);
    expect(wb2.worksheets).toHaveLength(3);
  });
});
