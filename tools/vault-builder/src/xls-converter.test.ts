/**
 * xls-converter.test.ts — unit tests สำหรับลำดับ fallback ของ XlsConverter
 *
 * Feature: daph-obsidian-second-brain (Task 6.2)
 * Validates: Requirements 7.1, 7.3
 *
 * ทดสอบกลยุทธ์แบบลำดับชั้นของ `convertXls`:
 *   (a) SheetJS สำเร็จบนเวิร์กบุ๊กจริง → ok=true, method='sheetjs', text มีเนื้อหา
 *   (b) ไฟล์หาย → ok=false, method='attach-only', มี reason
 *   (c) SheetJS แปลงไม่ได้ + ไม่มี LibreOffice → attach-only พร้อม reason
 *
 * หมายเหตุ: เรา mock `node:child_process.spawnSync` ให้คืนค่าเสมือนว่า
 * "ไม่พบ LibreOffice ในเครื่อง" เพื่อให้เทสต์ deterministic ทุกเครื่อง
 * โดยไม่ต้องติดตั้ง LibreOffice จริง (สาขา SheetJS ยังทำงานจริงทั้งหมด)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

// สถานะร่วมสำหรับสลับให้ SheetJS (XLSX.readFile) ล้มเหลวเฉพาะบางเทสต์
const xlsxState = vi.hoisted(() => ({ failReadFile: false }));

// จำลองว่า LibreOffice ไม่มีในเครื่อง: spawnSync(--version) ล้มเหลว (ENOENT)
// findLibreOffice() จะคืน null → สาขา attach-only (ชั้นที่ 3)
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({
    error: new Error('spawnSync ENOENT (mocked: LibreOffice not installed)'),
    status: null,
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
  })),
}));

// ห่อ XLSX.readFile ด้วยของจริง แต่สามารถบังคับให้โยน error ได้ผ่าน flag
// (utils/writeFile ยังเป็นของจริงทั้งหมด ใช้สร้างเวิร์กบุ๊กในเทสต์ success)
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      if (xlsxState.failReadFile) {
        throw new Error('Unsupported file (mocked: SheetJS cannot parse)');
      }
      return actual.readFile(...args);
    },
  };
});

import { convertXls } from './xls-converter.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'daph-xls-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('convertXls — tiered fallback (Req 7.1, 7.3)', () => {
  it('(a) แปลงด้วย SheetJS สำเร็จบนเวิร์กบุ๊กจริง → ok, method=sheetjs, text มีเนื้อหา', async () => {
    // สร้างเวิร์กบุ๊กเล็ก ๆ ด้วยไลบรารี xlsx แล้วเขียนลงไฟล์ชั่วคราว
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['ชื่อสินค้า', 'จำนวน'],
      ['ตู้ไม้ HPL', 3],
      ['บานพับ', 12],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const xlsxPath = join(workDir, 'sample.xlsx');
    XLSX.writeFile(wb, xlsxPath);

    const result = await convertXls(xlsxPath);

    expect(result.ok).toBe(true);
    expect(result.method).toBe('sheetjs');
    expect(result.text).toBeTypeOf('string');
    expect(result.text && result.text.length).toBeGreaterThan(0);
    // คงบริบทรายชีต (หัวข้อ # <ชื่อชีต>) + เนื้อหาภาษาไทยแบบ round-trip
    expect(result.text).toContain('# Inventory');
    expect(result.text).toContain('ตู้ไม้ HPL');
    expect(result.reason).toBeUndefined();
  });

  it('(a2) เวิร์กบุ๊กหลายชีต → รวมข้อความครบทุกชีตด้วย method=sheetjs', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['A1'], ['v1']]),
      'SheetOne',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['B1'], ['v2']]),
      'SheetTwo',
    );
    const xlsxPath = join(workDir, 'multi.xlsx');
    XLSX.writeFile(wb, xlsxPath);

    const result = await convertXls(xlsxPath);

    expect(result.ok).toBe(true);
    expect(result.method).toBe('sheetjs');
    expect(result.text).toContain('# SheetOne');
    expect(result.text).toContain('# SheetTwo');
  });

  it('(b) ไฟล์ต้นฉบับหาย → ok=false, method=attach-only, มี reason', async () => {
    const missingPath = join(workDir, 'does-not-exist.xls');

    const result = await convertXls(missingPath);

    expect(result.ok).toBe(false);
    expect(result.method).toBe('attach-only');
    expect(result.text).toBeNull();
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain(missingPath);
  });

  it('(c) SheetJS แปลงไม่ได้ + ไม่มี LibreOffice → attach-only พร้อม reason', async () => {
    // ไฟล์มีอยู่จริง (ผ่านด่าน existsSync) แต่จำลองว่า SheetJS อ่านไม่ได้
    // ผ่าน flag ที่ทำให้ XLSX.readFile โยน error เหมือนเจอ BIFF ที่เสียรูปแบบ
    const unreadablePath = join(workDir, 'unreadable.xls');
    writeFileSync(unreadablePath, Buffer.from('not a real spreadsheet'));

    xlsxState.failReadFile = true;
    try {
      const result = await convertXls(unreadablePath);

      expect(result.ok).toBe(false);
      expect(result.method).toBe('attach-only');
      expect(result.text).toBeNull();
      expect(result.reason).toBeTruthy();
      // เหตุผลต้องสะท้อนว่าไม่พบ LibreOffice (ชั้นที่ 3)
      expect(result.reason).toContain('LibreOffice');
    } finally {
      xlsxState.failReadFile = false;
    }
  });
});
