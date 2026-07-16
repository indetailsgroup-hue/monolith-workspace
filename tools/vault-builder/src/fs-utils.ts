/**
 * fs-utils.ts — ยูทิลิตี้ระบบไฟล์ UTF-8-safe และการสร้างโครงสร้าง PARA
 *
 * Feature: daph-obsidian-second-brain (Task 5.1)
 * Requirements: 3.1, 3.2, 3.3, 3.7, 9.5
 *
 * หน้าที่:
 *  1. `writeUtf8`/`readUtf8` — เขียน/อ่านไฟล์เป็น UTF-8 รักษาอักขระไทยไม่ให้เพี้ยน
 *     การเขียนทำผ่านไฟล์ชั่วคราวแล้ว rename ทับ (atomic) เพื่อให้รันซ้ำได้ผลเดิม
 *     (idempotent) และไม่ทิ้งไฟล์ปลายทางในสภาพเขียนค้างครึ่ง ๆ กลาง ๆ (Req 9.5)
 *  2. สร้างโครงสร้างโฟลเดอร์ PARA ระดับบนสุดของ Vault
 *     (`01-Projects`, `02-Areas`, `03-Resources`, `04-Archives`) — Req 3.1, 3.7
 *  3. สร้างโฟลเดอร์ Process สามกลุ่มพร้อมโฟลเดอร์ย่อยตามหน่วย และคงตำแหน่ง
 *     โครงสร้าง Hardware ใต้ `02-Areas/Hardware/` (สร้างโฟลเดอร์เท่านั้น —
 *     การคัดลอกเนื้อหา Hardware เป็นงานของ FileMover ในขั้นถัดไป) — Req 3.2, 3.3
 *
 * ใช้ `node:fs`/`node:path` แบบ synchronous เพื่อให้ตรงกับสไตล์ของ scanner.ts
 * ทุกฟังก์ชันสร้างโฟลเดอร์เป็นแบบ idempotent (ใช้ `mkdir { recursive: true }`
 * จึงไม่ error เมื่อโฟลเดอร์มีอยู่แล้ว)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { CANONICAL_GROUPS, CANONICAL_UNITS_BY_GROUP } from './constants.js';
import { VAULT_OUTPUT } from './paths.js';
import type { SubProcessGroup } from './types.js';

// ---------------------------------------------------------------------------
// ชื่อโฟลเดอร์มาตรฐานภายใน Vault
// ---------------------------------------------------------------------------

/** ชื่อโฟลเดอร์ระดับบนสุดตามระบบ PARA (Req 3.1) */
export const PARA_FOLDER_NAMES = {
  projects: '01-Projects',
  areas: '02-Areas',
  resources: '03-Resources',
  archives: '04-Archives',
} as const;

/** ชื่อโฟลเดอร์โดเมน Process ใต้ `02-Areas` (Req 3.3) */
export const PROCESS_AREA_FOLDER = 'Process';

/** ชื่อโฟลเดอร์โดเมน Hardware ใต้ `02-Areas` (Req 3.2) */
export const HARDWARE_AREA_FOLDER = 'Hardware';

// ---------------------------------------------------------------------------
// UTF-8-safe file I/O (Req 9.5)
// ---------------------------------------------------------------------------

/**
 * สร้างโฟลเดอร์แบบ recursive (idempotent)
 * ไม่ error เมื่อโฟลเดอร์มีอยู่แล้ว — ใช้เป็นพื้นฐานของทุกฟังก์ชันสร้างโครงสร้าง
 */
export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

/** Synchronous sleep for the retry backoff (this module is sync by design). */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Windows can transiently fail a rename-over-existing (MoveFileEx) with these
 * codes when an antivirus scanner or the search indexer briefly holds the
 * destination or the just-written temp file. On POSIX these do not occur here.
 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * `renameSync` with a few short retries on transient Windows errors. A handful
 * of backoffs clears the antivirus/indexer hold while keeping the write atomic
 * (single rename, no unlink-then-rename window). `rename`/`sleep` are injectable
 * so the retry behaviour can be tested deterministically; production uses the
 * real sync fs calls. (Fixes the intermittent EPERM flake in writeUtf8.)
 */
export function renameWithRetry(
  from: string,
  to: string,
  rename: (f: string, t: string) => void = renameSync,
  sleep: (ms: number) => void = sleepSync,
  maxAttempts = 10,
): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (!code || !TRANSIENT_RENAME_CODES.has(code) || attempt >= maxAttempts) {
        throw err;
      }
      sleep(Math.min(100, 10 * attempt));
    }
  }
}

/**
 * เขียนไฟล์เป็น UTF-8 แบบ atomic + idempotent (Req 9.5)
 *
 * ขั้นตอน: สร้างโฟลเดอร์ปลายทางถ้ายังไม่มี → เขียนเนื้อหาลงไฟล์ชั่วคราวในโฟลเดอร์
 * เดียวกัน → `rename` ทับไฟล์ปลายทาง (atomic บนไฟล์ระบบเดียวกัน) ทำให้ผู้อ่าน
 * เห็นไฟล์เก่าทั้งไฟล์หรือไฟล์ใหม่ทั้งไฟล์เสมอ ไม่มีสภาพเขียนค้างครึ่ง ๆ กลาง ๆ
 * และการรันซ้ำด้วยเนื้อหาเดิมให้ผลไฟล์เหมือนเดิม (idempotent)
 *
 * encoding ถูกตรึงเป็น `utf-8` เพื่อให้ชื่อ/เนื้อหาภาษาไทย round-trip ได้ครบทุกอักขระ
 *
 * @param filePath path ปลายทางของไฟล์
 * @param content  เนื้อหาที่จะเขียน (string)
 */
export function writeUtf8(filePath: string, content: string): void {
  const dir = dirname(filePath);
  ensureDir(dir);

  // ไฟล์ชั่วคราวอยู่ในโฟลเดอร์เดียวกับปลายทางเพื่อให้ rename เป็น atomic
  // (rename ข้ามไฟล์ระบบจะไม่ atomic) ชื่อไม่ซ้ำกันด้วย pid + เวลา + สุ่ม
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  try {
    writeFileSync(tempPath, content, { encoding: 'utf-8' });
    renameWithRetry(tempPath, filePath);
  } catch (err) {
    // ล้างไฟล์ชั่วคราวที่ค้างเมื่อเขียน/rename ล้มเหลว แล้วโยน error ต่อ (fail-fast บนดิสก์)
    try {
      if (existsSync(tempPath)) {
        rmSync(tempPath, { force: true });
      }
    } catch {
      /* เพิกเฉยข้อผิดพลาดระหว่างล้างไฟล์ชั่วคราว */
    }
    throw err;
  }
}

/**
 * อ่านไฟล์เป็น UTF-8 (Req 9.5)
 *
 * คู่กับ `writeUtf8` เพื่อให้การเขียนแล้วอ่านกลับเป็น identity ของอักขระไทย
 *
 * @param filePath path ของไฟล์ที่จะอ่าน
 * @returns เนื้อหาไฟล์เป็น string (UTF-8)
 */
export function readUtf8(filePath: string): string {
  return readFileSync(filePath, { encoding: 'utf-8' });
}

// ---------------------------------------------------------------------------
// PARA folder structure (Req 3.1, 3.7)
// ---------------------------------------------------------------------------

/**
 * สร้างโฟลเดอร์ PARA ระดับบนสุดภายใน Vault (idempotent — Req 3.1, 3.7)
 * `01-Projects`, `02-Areas`, `03-Resources`, `04-Archives`
 *
 * @param vaultRoot รากของ Vault ปลายทาง (ดีฟอลต์ = `VAULT_OUTPUT`)
 */
export function createParaStructure(vaultRoot: string = VAULT_OUTPUT): void {
  ensureDir(vaultRoot);
  for (const name of Object.values(PARA_FOLDER_NAMES)) {
    ensureDir(join(vaultRoot, name));
  }
}

// ---------------------------------------------------------------------------
// Process folders ภายใต้ 02-Areas/Process/<Group>/<Unit> (Req 3.3)
// ---------------------------------------------------------------------------

/** path ของโฟลเดอร์โดเมน Process (`02-Areas/Process`) */
export function processAreaDir(vaultRoot: string = VAULT_OUTPUT): string {
  return join(vaultRoot, PARA_FOLDER_NAMES.areas, PROCESS_AREA_FOLDER);
}

/** path ของโฟลเดอร์กลุ่มกระบวนการหนึ่งกลุ่ม (`02-Areas/Process/<Group>`) */
export function processGroupDir(
  group: SubProcessGroup,
  vaultRoot: string = VAULT_OUTPUT,
): string {
  return join(processAreaDir(vaultRoot), group);
}

/** path ของโฟลเดอร์หน่วยกระบวนการหนึ่งหน่วย (`02-Areas/Process/<Group>/<Unit>`) */
export function processUnitDir(
  group: SubProcessGroup,
  unit: string,
  vaultRoot: string = VAULT_OUTPUT,
): string {
  return join(processGroupDir(group, vaultRoot), unit);
}

/**
 * สร้างโฟลเดอร์ Process สามกลุ่มพร้อมโฟลเดอร์ย่อยตามหน่วย canonical (Req 3.3)
 * Office (5 แผนก), Factory (6 สถานี), Installation (16 ขั้นตอน) — idempotent
 *
 * หน่วยภาษาไทยของกลุ่ม Installation ถูกใช้เป็นชื่อโฟลเดอร์ตรง ๆ ผ่าน UTF-8 (Req 9.5)
 *
 * @param vaultRoot รากของ Vault ปลายทาง (ดีฟอลต์ = `VAULT_OUTPUT`)
 */
export function createProcessStructure(vaultRoot: string = VAULT_OUTPUT): void {
  for (const group of CANONICAL_GROUPS) {
    ensureDir(processGroupDir(group, vaultRoot));
    for (const unit of CANONICAL_UNITS_BY_GROUP[group]) {
      ensureDir(processUnitDir(group, unit, vaultRoot));
    }
  }
}

// ---------------------------------------------------------------------------
// Hardware folder target ภายใต้ 02-Areas/Hardware (Req 3.2)
// ---------------------------------------------------------------------------

/** path ของโฟลเดอร์ปลายทางโดเมน Hardware (`02-Areas/Hardware`) */
export function hardwareAreaDir(vaultRoot: string = VAULT_OUTPUT): string {
  return join(vaultRoot, PARA_FOLDER_NAMES.areas, HARDWARE_AREA_FOLDER);
}

/**
 * สร้าง (เตรียม) โฟลเดอร์ปลายทางของโดเมน Hardware ใต้ `02-Areas/Hardware/` (Req 3.2)
 *
 * ฟังก์ชันนี้ "สร้างโฟลเดอร์เท่านั้น" เพื่อสงวนตำแหน่งให้คงโครงสร้างเดิมของ
 * `furniture-hardware-vault` ส่วนการคัดลอกเนื้อหา Hardware จริงเป็นหน้าที่ของ
 * FileMover ในขั้นถัดไป (ไม่อยู่ในขอบเขตงาน 5.1) — idempotent
 *
 * @param vaultRoot รากของ Vault ปลายทาง (ดีฟอลต์ = `VAULT_OUTPUT`)
 */
export function createHardwareStructure(vaultRoot: string = VAULT_OUTPUT): void {
  ensureDir(hardwareAreaDir(vaultRoot));
}

// ---------------------------------------------------------------------------
// Convenience — สร้างโครงสร้าง Vault ทั้งหมดในครั้งเดียว
// ---------------------------------------------------------------------------

/**
 * สร้างโครงสร้างพื้นฐานทั้งหมดของ Vault ในครั้งเดียว (idempotent):
 * PARA ระดับบนสุด → โฟลเดอร์ Hardware → โฟลเดอร์ Process สามกลุ่ม/หน่วย
 *
 * @param vaultRoot รากของ Vault ปลายทาง (ดีฟอลต์ = `VAULT_OUTPUT`)
 */
export function createVaultStructure(vaultRoot: string = VAULT_OUTPUT): void {
  createParaStructure(vaultRoot);
  createHardwareStructure(vaultRoot);
  createProcessStructure(vaultRoot);
}
