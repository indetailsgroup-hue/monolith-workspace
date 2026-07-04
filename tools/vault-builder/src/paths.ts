/**
 * paths.ts — ค่าคงที่ของแหล่งข้อมูลต้นทางและปลายทางสำหรับ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 1.1)
 * Requirements: 1.1
 *
 * เครื่องมือนี้อยู่แบบ self-contained ใต้ `determined-williams/tools/vault-builder/`
 * แหล่งข้อมูลและ Vault ปลายทางทั้งหมดอยู่ภายใต้รากโปรเจกต์ `determined-williams/`
 * เพื่อให้รันซ้ำได้ผลเดิม (idempotent) และไม่แตะไฟล์ต้นฉบับ (non-destructive)
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** โฟลเดอร์ของไฟล์นี้: <project>/tools/vault-builder/src */
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * รากของโปรเจกต์ `determined-williams/`
 * (จาก .../tools/vault-builder/src ขึ้นไป 3 ระดับ)
 */
export const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

/**
 * Process_Source — โฟลเดอร์เอกสาร QMS ฝั่งกระบวนการ (ไฟล์ Excel)
 * `determined-williams/New folder`
 */
export const PROCESS_SOURCE = resolve(PROJECT_ROOT, 'New folder');

/**
 * Hardware_Source — Vault ฮาร์ดแวร์เฟอร์นิเจอร์ที่มีอยู่แล้ว
 * `determined-williams/furniture-hardware-vault`
 */
export const HARDWARE_SOURCE = resolve(PROJECT_ROOT, 'furniture-hardware-vault');

/**
 * โฟลเดอร์ PDF แค็ตตาล็อกต้นฉบับฝั่งฮาร์ดแวร์ (อาจไม่มีในบางเครื่อง)
 * `determined-williams/New folder (2)`
 */
export const HARDWARE_PDF_SOURCE = resolve(PROJECT_ROOT, 'New folder (2)');

/** รากต้นทางฝั่งฮาร์ดแวร์ทั้งหมด (Vault + PDF แค็ตตาล็อก) */
export const HARDWARE_ROOTS = [HARDWARE_SOURCE, HARDWARE_PDF_SOURCE];

/** รากต้นทางฝั่งกระบวนการทั้งหมด */
export const PROCESS_ROOTS = [PROCESS_SOURCE];

/**
 * Extract_Folder — เนื้อหา Excel ที่แตกเป็นข้อความแล้ว + ไฟล์ดัชนี `_INDEX.json`
 * `determined-williams/_daph_extract`
 */
export const EXTRACT_FOLDER = resolve(PROJECT_ROOT, '_daph_extract');

/** ไฟล์ดัชนีของ Extract_Folder ที่ระบุไฟล์ที่แตกข้อความแล้วและ `xls_unsupported` */
export const EXTRACT_INDEX = resolve(EXTRACT_FOLDER, '_INDEX.json');

/**
 * Obsidian_Vault ปลายทาง — สร้างไว้ใต้รากโปรเจกต์เพื่อให้ self-contained
 * `determined-williams/daph-second-brain`
 */
export const VAULT_OUTPUT = resolve(PROJECT_ROOT, 'daph-second-brain');

/** โฟลเดอร์ระดับบนสุดตามระบบ PARA ภายใน Vault ปลายทาง */
export const VAULT_PARA = {
  projects: resolve(VAULT_OUTPUT, '01-Projects'),
  areas: resolve(VAULT_OUTPUT, '02-Areas'),
  resources: resolve(VAULT_OUTPUT, '03-Resources'),
  archives: resolve(VAULT_OUTPUT, '04-Archives'),
} as const;

/** ไฟล์ inventory / move-log ที่ Vault_Builder เขียนออกมา */
export const VAULT_INVENTORY = resolve(VAULT_OUTPUT, '_inventory.json');
export const VAULT_MOVE_LOG = resolve(VAULT_OUTPUT, '_move-log.md');

/** Knowledge_Export (machine-readable) ที่ปล่อยให้ monolith-workflow-copilot บริโภค (ADR-009) */
export const KNOWLEDGE_EXPORT_OUTPUT = resolve(VAULT_OUTPUT, '_knowledge-export.json');
