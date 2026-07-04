/**
 * file-mover.ts — FileMover ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 7.1)
 * Requirements: 10.1, 10.4, 10.5
 *
 * คัดลอก (ไม่ย้าย/ไม่แก้ต้นฉบับ) ไฟล์ทุกไฟล์จาก Inventory เข้าไปยังตำแหน่ง
 * `vaultRelativePath` ภายใน Vault แบบ non-destructive แล้วบันทึก move log
 * ทุกรายการ (ตำแหน่งเดิม → ตำแหน่งใหม่) เพื่อให้คงไฟล์ทุกไฟล์ไว้อย่างน้อยหนึ่ง
 * สำเนาใน Vault และตรวจสอบย้อนได้ (Req 10.3, 10.4, 10.5)
 *
 * การคัดลอกเป็น idempotent: คัดลอกทับไฟล์ปลายทางเดิมด้วยเนื้อหาต้นฉบับเสมอ
 */

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ensureDir, writeUtf8 } from './fs-utils.js';
import { VAULT_MOVE_LOG, VAULT_OUTPUT } from './paths.js';
import type { Inventory, InventoryEntry } from './types.js';

/** เหตุผลของการวางไฟล์แต่ละรายการ (Req 10.5) */
export type MoveReason =
  | 'active-placement'
  | 'junk'
  | 'draft-archived'
  | 'revise-archived'
  | 'project'
  | 'resource'
  | 'hardware';

/** บันทึกการคัดลอก/วางไฟล์หนึ่งรายการ */
export interface MoveRecord {
  original: string;
  destination: string;
  reason: MoveReason;
  copied: boolean;
}

/** จัดประเภทเหตุผลการวางจาก entry */
function reasonFor(entry: InventoryEntry): MoveReason {
  if (entry.isJunk) return 'junk';
  if (entry.domain === 'Hardware') return 'hardware';
  if (entry.duplicateOf !== null) {
    return entry.statusTag === 'revise' ? 'revise-archived' : 'draft-archived';
  }
  if (entry.documentType === 'Project Doc') return 'project';
  if (entry.group === null) return 'resource';
  return 'active-placement';
}

/**
 * คัดลอกไฟล์ทั้งหมดใน Inventory เข้าสู่ Vault และเขียน `_move-log.md`
 *
 * @param inv       Inventory ที่จัดประเภท+กำหนดตำแหน่งแล้ว
 * @param vaultRoot รากของ Vault ปลายทาง (ดีฟอลต์ = VAULT_OUTPUT)
 * @returns รายการ MoveRecord ทั้งหมด
 */
export function placeFiles(inv: Inventory, vaultRoot: string = VAULT_OUTPUT): MoveRecord[] {
  const records: MoveRecord[] = [];

  for (const entry of inv.entries) {
    const reason = reasonFor(entry);
    const destAbs = join(vaultRoot, entry.vaultRelativePath);
    let copied = false;

    try {
      if (existsSync(entry.absolutePath)) {
        ensureDir(dirname(destAbs));
        // copy = non-destructive ต่อไฟล์ต้นฉบับ; ทับปลายทางเพื่อ idempotency
        copyFileSync(entry.absolutePath, destAbs);
        copied = true;
      } else {
        console.warn(`[file-mover] ไม่พบไฟล์ต้นฉบับ ข้าม: "${entry.absolutePath}"`);
      }
    } catch (err) {
      console.warn(
        `[file-mover] คัดลอกไม่สำเร็จ "${entry.originalName}": ${(err as Error).message}`,
      );
    }

    records.push({
      original: entry.absolutePath,
      destination: entry.vaultRelativePath,
      reason,
      copied,
    });
  }

  writeMoveLog(records, vaultRoot);
  return records;
}

/** เขียน `_move-log.md` ที่รากของ Vault (Req 10.4) */
export function writeMoveLog(records: MoveRecord[], vaultRoot: string = VAULT_OUTPUT): void {
  const lines: string[] = [
    '# Move Log — Vault_Builder',
    '',
    `สร้างเมื่อ: ${new Date().toISOString()}`,
    `จำนวนรายการ: ${records.length} (คัดลอกสำเร็จ ${records.filter((r) => r.copied).length})`,
    '',
    '| # | ไฟล์ต้นฉบับ | ปลายทางใน Vault | เหตุผล | คัดลอก |',
    '|---|------------|-----------------|--------|--------|',
  ];

  records.forEach((r, i) => {
    const orig = r.original.replace(/\|/g, '\\|');
    const dest = r.destination.replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${orig} | ${dest} | ${r.reason} | ${r.copied ? '✓' : '✗'} |`);
  });

  lines.push('');
  writeUtf8(VAULT_MOVE_LOG.replace(VAULT_OUTPUT, vaultRoot), `${lines.join('\n')}\n`);
}
