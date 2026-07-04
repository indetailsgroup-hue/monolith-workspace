/**
 * xls-converter.ts — XlsConverter ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 6.1)
 * Requirements: 7.1, 7.3
 *
 * หน้าที่: แปลงไฟล์ `.xls` (BIFF เก่า) ที่ extractor เดิมอ่านไม่ได้
 * (อยู่ใน `_INDEX.json.xls_unsupported`) ให้เป็นข้อความที่ "ค้นหาได้"
 * เพื่อให้ NoteGenerator นำไปฝัง/สรุปใน Index_Note (Req 7.1, 7.2)
 *
 * กลยุทธ์แบบลำดับชั้น (ตาม design §XlsConverter):
 *   1. SheetJS (`XLSX.readFile` + `sheet_to_csv` ต่อชีต) — pure-JS ข้ามแพลตฟอร์ม
 *      เป็นวิธีหลัก เพราะรองรับ BIFF `.xls` ที่ `exceljs` ทำไม่ได้
 *   2. LibreOffice headless (`soffice --headless --convert-to csv`) — ใช้ก็ต่อเมื่อ
 *      SheetJS ล้มเหลว *และ* ตรวจพบ LibreOffice ในเครื่อง มิฉะนั้นข้ามไป attach-only
 *   3. attach-only (fallback สุดท้าย, Req 7.3) — คืน ok=false พร้อม reason
 *      เพื่อให้ NoteGenerator แนบไฟล์ต้นฉบับ + ใส่หมายเหตุ "เปิดด้วย Excel"
 *
 * สำคัญ: ฟังก์ชันนี้แปลงเนื้อหาเท่านั้น ไม่แตะไฟล์ต้นฉบับ (non-destructive)
 * และไม่ throw — ทุกความล้มเหลวถูกแปลงเป็น XlsConversionResult ที่อธิบายเหตุผล
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import * as XLSX from 'xlsx';

import type { XlsConversionResult } from './types.js';

/** คำสั่งที่เป็นไปได้ของ LibreOffice headless ตามแพลตฟอร์ม */
const LIBREOFFICE_CANDIDATES = ['soffice', 'libreoffice'] as const;

/**
 * แปลง WorkBook ของ SheetJS เป็นข้อความค้นหาได้ โดยต่อ CSV ของทุกชีต
 * พร้อมหัวข้อกำกับชื่อชีต เพื่อคงบริบทรายชีตไว้
 */
function workbookToText(workbook: XLSX.WorkBook): string {
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    parts.push(`# ${sheetName}\n${csv}`.trim());
  }

  return parts.join('\n\n').trim();
}

/**
 * ทดลองแปลงด้วย SheetJS
 * @returns ข้อความที่แปลงได้ (มีเนื้อหา) หรือ null เมื่อล้มเหลว/ว่างเปล่า
 */
function trySheetJs(absolutePath: string): string | null {
  try {
    const workbook = XLSX.readFile(absolutePath);
    const text = workbookToText(workbook);
    // ถือว่าสำเร็จเฉพาะเมื่อได้ข้อความที่มีเนื้อหาจริง
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * ค้นหาคำสั่ง LibreOffice ที่ใช้งานได้ในเครื่อง
 * @returns ชื่อคำสั่งที่เรียกได้ หรือ null เมื่อไม่พบ LibreOffice
 */
function findLibreOffice(): string | null {
  for (const candidate of LIBREOFFICE_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ['--version'], {
        stdio: 'ignore',
        timeout: 15_000,
      });
      // error (เช่น ENOENT) → ไม่พบคำสั่งนี้, ลองตัวถัดไป
      if (!result.error && result.status === 0) {
        return candidate;
      }
    } catch {
      // เผื่อ spawn โยน synchronous error — ถือว่าไม่พบ
    }
  }
  return null;
}

/**
 * ทดลองแปลงด้วย LibreOffice headless → CSV แล้วอ่านผลกลับมาเป็นข้อความ
 * ใช้โฟลเดอร์ชั่วคราวเป็น outdir และลบทิ้งหลังใช้งานเสมอ
 *
 * @returns ข้อความที่แปลงได้ หรือ null เมื่อล้มเหลว/ว่างเปล่า
 */
function tryLibreOffice(absolutePath: string, command: string): string | null {
  let outDir: string | null = null;
  try {
    outDir = mkdtempSync(join(tmpdir(), 'daph-xls-'));

    const result = spawnSync(
      command,
      ['--headless', '--convert-to', 'csv', '--outdir', outDir, absolutePath],
      { stdio: 'ignore', timeout: 60_000 },
    );

    if (result.error || result.status !== 0) {
      return null;
    }

    // LibreOffice ตั้งชื่อไฟล์ผลลัพธ์เป็น <basename>.csv ใน outdir
    const baseNoExt = basename(absolutePath, extname(absolutePath));
    const expected = join(outDir, `${baseNoExt}.csv`);

    let csvPath: string | null = null;
    if (existsSync(expected)) {
      csvPath = expected;
    } else {
      // fallback: หยิบไฟล์ .csv ตัวแรกที่พบใน outdir
      const csvFile = readdirSync(outDir).find((f) => f.toLowerCase().endsWith('.csv'));
      csvPath = csvFile ? join(outDir, csvFile) : null;
    }

    if (!csvPath || !existsSync(csvPath)) {
      return null;
    }

    const text = readFileSync(csvPath, 'utf-8').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    if (outDir) {
      try {
        rmSync(outDir, { recursive: true, force: true });
      } catch {
        // ลบ temp ไม่สำเร็จ — ไม่เป็นไร ปล่อยให้ระบบจัดการ
      }
    }
  }
}

/**
 * แปลงไฟล์ `.xls` หนึ่งไฟล์ให้เป็นข้อความค้นหาได้ ด้วยกลยุทธ์ลำดับชั้น
 * SheetJS → LibreOffice headless → attach-only
 *
 * ไม่ throw เสมอ: ทุกผลลัพธ์ถูกห่อเป็น `XlsConversionResult`
 *
 * @param absolutePath path เต็มของไฟล์ `.xls` ต้นฉบับ
 * @returns ผลการแปลง `{ ok, method, text, reason? }` ตามสัญญาในดีไซน์
 */
export async function convertXls(absolutePath: string): Promise<XlsConversionResult> {
  // ป้องกันกรณีไฟล์หาย — ถอยไป attach-only พร้อมเหตุผลที่ชัดเจน
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      method: 'attach-only',
      text: null,
      reason: `ไม่พบไฟล์ต้นฉบับที่ "${absolutePath}"`,
    };
  }

  // ── ชั้นที่ 1: SheetJS ──────────────────────────────────────────────
  const sheetJsText = trySheetJs(absolutePath);
  if (sheetJsText !== null) {
    return { ok: true, method: 'sheetjs', text: sheetJsText };
  }

  // ── ชั้นที่ 2: LibreOffice headless (เฉพาะเมื่อมีในเครื่อง) ──────────
  const libreOffice = findLibreOffice();
  if (libreOffice) {
    const libreText = tryLibreOffice(absolutePath, libreOffice);
    if (libreText !== null) {
      return { ok: true, method: 'libreoffice', text: libreText };
    }
    // มี LibreOffice แต่แปลงไม่สำเร็จ → attach-only พร้อมเหตุผล
    return {
      ok: false,
      method: 'attach-only',
      text: null,
      reason: 'SheetJS และ LibreOffice แปลงไฟล์ไม่สำเร็จ (ไฟล์อาจเสียรูปแบบ) — เปิดด้วย Excel',
    };
  }

  // ── ชั้นที่ 3: attach-only (ไม่พบ LibreOffice) ──────────────────────
  return {
    ok: false,
    method: 'attach-only',
    text: null,
    reason: 'SheetJS แปลงไฟล์ไม่สำเร็จ และไม่พบ LibreOffice ในเครื่อง — เปิดด้วย Excel',
  };
}
