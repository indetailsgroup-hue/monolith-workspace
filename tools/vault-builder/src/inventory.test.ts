/**
 * inventory.test.ts — Property tests: duplicate detection, placement, naming
 *
 * Feature: daph-obsidian-second-brain
 *   Property 15 (duplicate) → Task 4.2 / Req 6.5
 *   Property 11 (placement) → Task 4.3 / Req 3.4, 3.6
 *   Property 6  (naming uniqueness) → Task 4.4 / Req 5.4
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildInventory } from './inventory.js';
import type { ExtractIndex, SourceFile } from './types.js';

const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };

function makeFile(originalName: string, ext = '.xlsx', domainHint: 'Hardware' | 'Process' = 'Process'): SourceFile {
  return {
    originalName,
    absolutePath: `/src/${originalName}`,
    domainHint,
    ext,
    sizeBytes: 1024,
  };
}

/** ชื่อไฟล์จริงจากชุดข้อมูล DAPH สำหรับสุ่มประกอบ input */
const REAL_NAMES = [
  'DAPH PFMEA, Sale.xlsx',
  'DAPH PFMEA, Designer.xlsx',
  'DAPH PFMEA, Area measurement.xlsx',
  'DAPH PFMEA, Main Process.xlsx',
  'DAPH PFMEA, Main Process (Revise 1).xlsx',
  'DAPH PFMEA, Producting Planning.xlsx',
  'DAPH PFMEA, Producting Planning(1).xlsx',
  '1.SOS DAPH, Main Process.xlsx',
  '1.SOS DAPH.xlsx',
  '1.SOS DAPH Draft.xlsx',
  '2.JES DAPH, INSTALLATION.xlsx',
  '~$1.SOS DAPH Draft.xlsx',
  'สำหรับคุณชุ.xlsx',
  'Citadines Arch ID KDR cklst.xls',
  'Template Feasibility By Daph decor send 251019.xlsx',
];

const arbFileSubset = fc
  .uniqueArray(fc.constantFrom(...REAL_NAMES), { minLength: 1, maxLength: REAL_NAMES.length })
  .map((names) => names.map((n) => makeFile(n, n.endsWith('.xls') ? '.xls' : '.xlsx')));

describe('inventory — Property 6: naming uniqueness (Task 4.4 / Req 5.4)', () => {
  it('noteRelativePath ที่ไม่ใช่ null ต้องไม่ซ้ำกันเสมอ', () => {
    fc.assert(
      fc.property(arbFileSubset, (files) => {
        const inv = buildInventory(files, EMPTY_INDEX);
        const paths = inv.entries
          .map((e) => e.noteRelativePath)
          .filter((p): p is string => p !== null);
        return new Set(paths).size === paths.length;
      }),
      { numRuns: 100 },
    );
  });

  it('ชื่อโน้ตต้องไม่มี owner token (P\'oil/P\'Mean)', () => {
    const inv = buildInventory(
      [makeFile("DAPH PFMEA, INSTALLATION,P'oil.xlsx"), makeFile("DAPH PFMEA, P'Mean.xlsx")],
      EMPTY_INDEX,
    );
    for (const e of inv.entries) {
      expect(e.noteTitle.includes("P'")).toBe(false);
    }
  });
});

describe('inventory — Property 11: placement correctness (Task 4.3 / Req 3.4, 3.6)', () => {
  it('แต่ละ entry วางในโฟลเดอร์ที่ถูกต้องตามกฎ', () => {
    fc.assert(
      fc.property(arbFileSubset, (files) => {
        const inv = buildInventory(files, EMPTY_INDEX);
        return inv.entries.every((e) => {
          const p = e.vaultRelativePath;
          if (e.isJunk) return p.startsWith('04-Archives');
          if (e.duplicateOf !== null) return p.startsWith('04-Archives');
          if (e.documentType === 'Project Doc') return p.startsWith('01-Projects');
          if (e.group === null) return p.startsWith('03-Resources');
          return p.startsWith('02-Areas/Process/') || p.startsWith('02-Areas\\Process\\');
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('inventory — Property 15: duplicate detection (Task 4.2 / Req 6.5)', () => {
  it('ฉบับ revise/(1) ชี้ duplicateOf ไปยังฉบับ active ตัวจริง', () => {
    const inv = buildInventory(
      [
        makeFile('DAPH PFMEA, Producting Planning.xlsx'),
        makeFile('DAPH PFMEA, Producting Planning(1).xlsx'),
      ],
      EMPTY_INDEX,
    );
    const real = inv.entries.find((e) => e.originalName === 'DAPH PFMEA, Producting Planning.xlsx');
    const dup = inv.entries.find((e) => e.originalName === 'DAPH PFMEA, Producting Planning(1).xlsx');
    expect(real?.duplicateOf).toBeNull();
    expect(dup?.duplicateOf).toBe('DAPH PFMEA, Producting Planning.xlsx');
  });

  it('junk ไม่มี Document_Type และไม่สร้างโน้ต', () => {
    const inv = buildInventory([makeFile('~$1.SOS DAPH Draft.xlsx')], EMPTY_INDEX);
    const junk = inv.entries[0];
    expect(junk.isJunk).toBe(true);
    expect(junk.documentType).toBeNull();
    expect(junk.noteRelativePath).toBeNull();
  });
});
