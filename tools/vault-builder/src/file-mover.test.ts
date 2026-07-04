/**
 * file-mover.test.ts — Property 4 (no file loss) + move log
 * Feature: daph-obsidian-second-brain, Task 7.2 / Req 10.3, 10.4, 10.5
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { placeFiles } from './file-mover.js';
import { buildInventory } from './inventory.js';
import type { ExtractIndex, SourceFile } from './types.js';

const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };

describe('file-mover — Task 7.2: no file loss + move log', () => {
  let srcDir: string;
  let vaultDir: string;
  let files: SourceFile[];

  beforeAll(() => {
    srcDir = mkdtempSync(join(tmpdir(), 'daph-src-'));
    vaultDir = mkdtempSync(join(tmpdir(), 'daph-vault-'));

    const names = ['DAPH PFMEA, Sale.xlsx', '1.SOS DAPH.xlsx', '~$1.SOS DAPH Draft.xlsx', 'สำหรับคุณชุ.xlsx'];
    files = names.map((n) => {
      const abs = join(srcDir, n);
      writeFileSync(abs, `content of ${n}`, 'utf-8');
      return { originalName: n, absolutePath: abs, domainHint: 'Process', ext: '.xlsx', sizeBytes: 10 };
    });
  });

  afterAll(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it('ทุกไฟล์มี MoveRecord และไฟล์ถูกคัดลอกเข้า Vault (ไม่สูญหาย)', () => {
    const inv = buildInventory(files, EMPTY_INDEX);
    const records = placeFiles(inv, vaultDir);

    // หนึ่ง MoveRecord ต่อหนึ่ง entry (no file loss)
    expect(records.length).toBe(inv.entries.length);
    // ทุกไฟล์ถูกคัดลอกสำเร็จและมีอยู่จริงในปลายทาง
    for (const e of inv.entries) {
      const dest = join(vaultDir, e.vaultRelativePath);
      expect(existsSync(dest)).toBe(true);
    }
    // ไฟล์ต้นฉบับยังอยู่ (non-destructive)
    for (const f of files) {
      expect(existsSync(f.absolutePath)).toBe(true);
    }
  });

  it('เขียน _move-log.md พร้อมระบุตำแหน่งเดิม→ใหม่', () => {
    const inv = buildInventory(files, EMPTY_INDEX);
    placeFiles(inv, vaultDir);
    const logPath = join(vaultDir, '_move-log.md');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('Move Log');
    expect(log).toContain('ปลายทางใน Vault');
  });
});
