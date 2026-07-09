/**
 * Cut List CSV — serialize PacketCutList to factory CSV
 *
 * S15-3: ปุ่ม Cut List (CSV) เดิมยิง localhost:3001 (เซิร์ฟเวอร์ที่ไม่เคยมี) —
 * เปลี่ยนมาสร้าง CSV client-side จากแหล่งความจริงเดียวกับ factory packet
 * (buildCutListData) เพื่อให้ตัวเลขตรงกับ cutlist.json ใน packet เสมอ
 *
 * DETERMINISM: row order ตาม PacketCutList.rows (sorted ที่ builder แล้ว)
 */

import type { PacketCutList, PacketCutListRow } from './types';

const HEADER = [
  'row_no',
  'part_id',
  'cabinet_id',
  'material_id',
  'qty',
  'finish_w_mm',
  'finish_h_mm',
  'cut_w_mm',
  'cut_h_mm',
  'edge_l_mm',
  'edge_r_mm',
  'edge_t_mm',
  'edge_b_mm',
  'premill_l_mm',
  'premill_r_mm',
  'premill_t_mm',
  'premill_b_mm',
  'grain',
  'note',
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(row: PacketCutListRow): string {
  const [edgeL, edgeR, edgeT, edgeB] = row.edgeBanding;
  const [premillL, premillR, premillT, premillB] = row.premill;
  const cells: Array<string | number> = [
    row.rowNo,
    row.partId,
    row.cabinetId,
    row.materialId,
    row.qty,
    row.finishW,
    row.finishH,
    row.cutW,
    row.cutH,
    edgeL,
    edgeR,
    edgeT,
    edgeB,
    premillL,
    premillR,
    premillT,
    premillB,
    row.grain,
    row.note ?? '',
  ];
  return cells.map((c) => csvEscape(String(c))).join(',');
}

/**
 * Serialize PacketCutList to CSV text (RFC 4180, CRLF, UTF-8 content).
 */
export function packetCutListToCsv(cutList: PacketCutList): string {
  const lines = [HEADER.join(','), ...cutList.rows.map(rowToCsv)];
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build CSV from cabinets and trigger browser download.
 * ใช้ builder เดียวกับ factory packet — ค่าตรงกับ cutlist.json เสมอ
 */
export function downloadCutListCsv(
  cutList: PacketCutList,
  jobName: string
): void {
  const csv = packetCutListToCsv(cutList);
  // BOM เพื่อให้ Excel ไทยเปิดแล้วไม่เพี้ยน
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${jobName}_cutlist.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
