/**
 * moc-generator.test.ts — Property: MOC link completeness
 * Feature: daph-obsidian-second-brain, Task 11.2 / Req 8.3, 8.4
 */

import { describe, expect, it } from 'vitest';

import { buildInventory } from './inventory.js';
import { generateMocs } from './moc-generator.js';
import type { ExtractIndex, SourceFile } from './types.js';

const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };
const mk = (n: string): SourceFile => ({
  originalName: n, absolutePath: `/src/${n}`, domainHint: 'Process', ext: '.xlsx', sizeBytes: 1024,
});

describe('moc-generator — Task 11.2: MOC completeness', () => {
  const inv = buildInventory([mk('DAPH PFMEA, Sale.xlsx')], EMPTY_INDEX);
  const mocs = generateMocs(inv);
  const names = mocs.map((m) => m.relativePath);

  it('มี Group MOC ครบสามกลุ่ม + Hardware MOC', () => {
    expect(names.some((p) => p.endsWith('Office-MOC.md'))).toBe(true);
    expect(names.some((p) => p.endsWith('Factory-MOC.md'))).toBe(true);
    expect(names.some((p) => p.endsWith('Installation-MOC.md'))).toBe(true);
    expect(names.some((p) => p.endsWith('Hardware-MOC.md'))).toBe(true);
  });

  it('Unit MOC ของ Sale ลิงก์ไป Index_Note ของ PFMEA Sale', () => {
    const saleMoc = mocs.find((m) => m.relativePath.includes('/Sale/'));
    expect(saleMoc).toBeDefined();
    const pfmea = inv.entries.find((e) => e.documentType === 'PFMEA')!;
    expect(saleMoc?.content).toContain(`[[${pfmea.noteTitle}]]`);
  });

  it('มี Unit MOC ครบทุกหน่วย canonical (5+6+16 = 27) + 3 group + 1 hardware', () => {
    expect(mocs.length).toBe(27 + 3 + 1);
  });
});
