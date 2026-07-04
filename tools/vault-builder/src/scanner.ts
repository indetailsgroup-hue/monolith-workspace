/**
 * scanner.ts — Scanner ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 2.1)
 * Requirements: 1.1, 1.5
 *
 * หน้าที่:
 *  1. `scan(hardwareRoots, processRoots)` — อ่านไฟล์ recursive จากทั้ง
 *     Hardware_Source (`furniture-hardware-vault/`, `New folder (2)/`) และ
 *     Process_Source (`New folder/`) แล้วคืน `SourceFile[]` พร้อม
 *     `domainHint`, `ext`, `sizeBytes`, `originalName`, `absolutePath`
 *     ไฟล์/โฟลเดอร์ที่อ่านไม่ได้จะถูกบันทึกเป็น warning แล้วข้าม (fail-soft, ไม่ throw)
 *  2. `readExtractIndex(indexPath?)` — อ่าน `_daph_extract/_INDEX.json` คืนรูป
 *     `ExtractIndex` พร้อม fallback (โครงสร้างว่างมาตรฐาน) เมื่อไฟล์ไม่พบหรือ parse ไม่ได้
 *
 * ใช้ `node:fs`/`node:path` แบบ synchronous เพื่อให้ตรงกับ signature ในดีไซน์
 * (`scan(...): SourceFile[]`) และเขียน/อ่าน UTF-8 รักษาอักขระไทย (Req 9.5)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { EXTRACT_INDEX } from './paths.js';
import type { ExtractIndex, SourceFile } from './types.js';

/** โครงสร้าง ExtractIndex ว่างมาตรฐาน — ใช้เป็น fallback (Req 1.5, 4.4) */
function emptyExtractIndex(): ExtractIndex {
  return { xlsx: [], xls_unsupported: [] };
}

/**
 * อ่านไฟล์ recursive จากรากเดียว แล้ว push ผลเข้า `out`
 * fail-soft: โฟลเดอร์/ไฟล์ที่อ่านไม่ได้ → warning + ข้าม (ไม่ throw) — Req 1.1
 */
function scanRoot(root: string, domainHint: SourceFile['domainHint'], out: SourceFile[]): void {
  // รากที่ไม่มีอยู่จริง (เช่น `New folder (2)/` ไม่มีในบางเครื่อง) ข้ามได้เงียบ ๆ พร้อม warning
  if (!existsSync(root)) {
    console.warn(`[scanner] ข้ามราก: ไม่พบโฟลเดอร์ "${root}"`);
    return;
  }

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    console.warn(`[scanner] อ่านโฟลเดอร์ไม่ได้ ข้าม "${root}": ${(err as Error).message}`);
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);

    try {
      if (entry.isDirectory()) {
        // recurse ลงโฟลเดอร์ย่อย (Req 1.1 — รวมโฟลเดอร์ย่อย)
        scanRoot(absolutePath, domainHint, out);
        continue;
      }

      // เฉพาะไฟล์ปกติเท่านั้น (ข้าม symlink/อุปกรณ์พิเศษ)
      if (!entry.isFile()) {
        continue;
      }

      const stats = statSync(absolutePath);
      out.push({
        originalName: entry.name,
        absolutePath,
        domainHint,
        ext: extname(entry.name).toLowerCase(),
        sizeBytes: stats.size,
      });
    } catch (err) {
      // ไฟล์อ่าน metadata ไม่ได้ (สิทธิ์/หาย) — บันทึก warning แล้วข้าม (fail-soft)
      console.warn(`[scanner] อ่านไฟล์ไม่ได้ ข้าม "${absolutePath}": ${(err as Error).message}`);
    }
  }
}

/**
 * สแกนไฟล์ทั้งหมดจากทั้งสองโดเมน (Hardware + Process) แบบ recursive
 *
 * @param hardwareRoots รากต้นทางฝั่ง Hardware (เช่น `HARDWARE_ROOTS`)
 * @param processRoots  รากต้นทางฝั่ง Process (เช่น `PROCESS_ROOTS`)
 * @returns รายการ `SourceFile` ของทุกไฟล์ที่อ่าน metadata ได้
 *
 * ไม่ throw เมื่อพบราก/โฟลเดอร์/ไฟล์ที่อ่านไม่ได้ — บันทึกเป็น warning แล้วดำเนินการต่อ (Req 1.1)
 */
export function scan(hardwareRoots: string[], processRoots: string[]): SourceFile[] {
  const out: SourceFile[] = [];

  for (const root of hardwareRoots) {
    scanRoot(root, 'Hardware', out);
  }
  for (const root of processRoots) {
    scanRoot(root, 'Process', out);
  }

  return out;
}

/**
 * ตรวจว่า object ที่ parse ได้มีรูปร่างตรงกับ `ExtractIndex` หรือไม่
 * (มี `xlsx` เป็น array และ `xls_unsupported` เป็น array ของ string)
 */
function isExtractIndexShape(value: unknown): value is ExtractIndex {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.xlsx) && Array.isArray(obj.xls_unsupported);
}

/**
 * อ่านไฟล์ดัชนี `_daph_extract/_INDEX.json` ของ Extract_Folder (Req 1.5)
 *
 * คืนรูป `ExtractIndex` ที่ระบุว่าไฟล์ใดแตกข้อความสำเร็จ (`xlsx`) และไฟล์ `.xls`
 * ใดอยู่ในรายการ `xls_unsupported`
 *
 * fallback: เมื่อไฟล์ไม่พบ, อ่านไม่ได้, parse JSON ไม่ได้ หรือรูปร่างไม่ถูกต้อง
 * → คืนโครงสร้างว่างมาตรฐาน `{ xlsx: [], xls_unsupported: [] }` พร้อม warning
 * (ถือว่าไม่มี extract — Classifier ถอยไปใช้กฎจากชื่อไฟล์) — design §Error Handling (Req 1.5, 4.4)
 *
 * @param indexPath path ของ `_INDEX.json` (ดีฟอลต์ = `EXTRACT_INDEX` จาก paths.ts)
 */
export function readExtractIndex(indexPath: string = EXTRACT_INDEX): ExtractIndex {
  const resolved = resolve(indexPath);

  if (!existsSync(resolved)) {
    console.warn(`[scanner] ไม่พบ _INDEX.json ที่ "${resolved}" — ใช้ค่าเริ่มต้น (ไม่มี extract)`);
    return emptyExtractIndex();
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    console.warn(`[scanner] อ่าน _INDEX.json ไม่ได้ "${resolved}": ${(err as Error).message} — ใช้ค่าเริ่มต้น`);
    return emptyExtractIndex();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[scanner] parse _INDEX.json ไม่ได้ "${resolved}": ${(err as Error).message} — ใช้ค่าเริ่มต้น`);
    return emptyExtractIndex();
  }

  if (!isExtractIndexShape(parsed)) {
    console.warn(`[scanner] รูปแบบ _INDEX.json ไม่ถูกต้องที่ "${resolved}" — ใช้ค่าเริ่มต้น`);
    return emptyExtractIndex();
  }

  // normalize: เก็บเฉพาะ entry ที่เป็น string ใน xls_unsupported
  return {
    xlsx: parsed.xlsx,
    xls_unsupported: parsed.xls_unsupported.filter((x): x is string => typeof x === 'string'),
  };
}
