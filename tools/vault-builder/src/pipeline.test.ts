/**
 * pipeline.test.ts — Smoke + idempotency test (รัน pipeline กับข้อมูล DAPH จริง)
 *
 * Feature: daph-obsidian-second-brain (Tasks 16.1, 14.2)
 * Requirements: 1.1, 1.5, 3.1, 3.2, 3.7, 7.1, 10.4
 *
 * รัน runPipeline() กับแหล่งข้อมูลจริงใน determined-williams/ แล้วยืนยันว่า:
 *  - สแกนไฟล์ได้ > 0
 *  - โครงสร้าง PARA ครบ
 *  - Home.md / Glossary / _inventory.json / _move-log.md ถูกสร้าง
 *  - มี Index_Note อย่างน้อยหนึ่งใบ
 *  - รันซ้ำได้ (idempotent) โดยจำนวน scan คงที่
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runPipeline } from './pipeline.js';
import { VAULT_OUTPUT } from './paths.js';

describe('pipeline — smoke + idempotency (Tasks 16.1, 14.2)', () => {
  it('รัน pipeline กับข้อมูลจริง สร้าง Vault ครบโครงสร้าง', async () => {
    const result = await runPipeline();

    // 1) สแกนเจอไฟล์จริง
    expect(result.scanned).toBeGreaterThan(0);
    // 2) สร้าง Index_Note อย่างน้อยหนึ่งใบ
    expect(result.notes).toBeGreaterThan(0);
    // 3) MOC + static assets ถูกสร้าง
    expect(result.mocs).toBeGreaterThan(0);
    expect(result.staticAssets).toBe(5);

    // 3b) Knowledge_Export emit สำเร็จ (fail-soft path คืน ok) + ไฟล์ออกจริง
    expect(result.knowledgeExport.ok).toBe(true);
    expect(result.knowledgeExport.rows).toBeGreaterThan(0);
    expect(existsSync(join(VAULT_OUTPUT, '_knowledge-export.json'))).toBe(true);

    // 4) โครงสร้าง PARA ครบ
    for (const para of ['01-Projects', '02-Areas', '03-Resources', '04-Archives']) {
      expect(existsSync(join(VAULT_OUTPUT, para))).toBe(true);
    }

    // 5) ไฟล์หลักถูกสร้าง
    expect(existsSync(join(VAULT_OUTPUT, 'Home.md'))).toBe(true);
    expect(existsSync(join(VAULT_OUTPUT, '03-Resources', 'Glossary.md'))).toBe(true);
    expect(existsSync(join(VAULT_OUTPUT, '_inventory.json'))).toBe(true);
    expect(existsSync(join(VAULT_OUTPUT, '_move-log.md'))).toBe(true);
  }, 120_000);

  it('รันซ้ำได้ (idempotent) — จำนวน scan คงที่', async () => {
    const a = await runPipeline();
    const b = await runPipeline();
    expect(b.scanned).toBe(a.scanned);
    expect(b.notes).toBe(a.notes);
  }, 180_000);
});
