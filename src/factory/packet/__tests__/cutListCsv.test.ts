/**
 * cutListCsv tests — S15-3
 * CSV ต้องมาจากแหล่งความจริงเดียวกับ factory packet (buildCutListData)
 */

import { describe, it, expect } from 'vitest';
import { packetCutListToCsv } from '../cutListCsv';
import type { PacketCutList, PacketCutListRow } from '../types';

function makeRow(overrides: Partial<PacketCutListRow> = {}): PacketCutListRow {
  return {
    rowNo: 1,
    partId: 'p1',
    cabinetId: 'cab1',
    materialId: 'PB16',
    qty: 1,
    finishW: 600,
    finishH: 720,
    edgeBanding: [1, 1, 0, 0],
    premill: [0.5, 0.5, 0, 0],
    cutW: 599,
    cutH: 720,
    grain: 'VERTICAL',
    note: 'side',
    ...overrides,
  };
}

function makeCutList(rows: PacketCutListRow[]): PacketCutList {
  return {
    version: 'cutlist.v1',
    rows,
    summary: {
      totalRows: rows.length,
      totalParts: rows.reduce((s, r) => s + r.qty, 0),
      byMaterial: {},
    },
  };
}

describe('packetCutListToCsv', () => {
  it('emits header + one line per row with CRLF', () => {
    const csv = packetCutListToCsv(makeCutList([makeRow(), makeRow({ rowNo: 2, partId: 'p2' })]));
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('row_no,part_id,cabinet_id,material_id,qty')).toBe(true);
  });

  it('serializes dimensions and edge banding in order L,R,T,B', () => {
    const csv = packetCutListToCsv(makeCutList([makeRow()]));
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe('1,p1,cab1,PB16,1,600,720,599,720,1,1,0,0,0.5,0.5,0,0,VERTICAL,side');
  });

  it('escapes commas and quotes in note field (RFC 4180)', () => {
    const csv = packetCutListToCsv(
      makeCutList([makeRow({ note: 'shelf, "adjustable"' })])
    );
    expect(csv).toContain('"shelf, ""adjustable"""');
  });

  it('handles empty cut list', () => {
    const csv = packetCutListToCsv(makeCutList([]));
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
  });
});
