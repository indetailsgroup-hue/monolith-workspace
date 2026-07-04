/**
 * document-set-linker.test.ts
 *
 * Feature: daph-obsidian-second-brain
 *   Property: document-set completeness/symmetry → Task 9.2 / Req 5.1, 5.2, 5.4, 5.5
 *   Property: JES/MC linkage                     → Task 9.3 / Req 5.3
 */

import { describe, expect, it } from 'vitest';

import { buildDocumentSets, documentSetSection, extractReferencedCodes } from './document-set-linker.js';
import { buildInventory } from './inventory.js';
import type { ExtractIndex, SourceFile } from './types.js';

const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };
const mk = (n: string, ext = '.xlsx'): SourceFile => ({
  originalName: n, absolutePath: `/src/${n}`, domainHint: 'Process', ext, sizeBytes: 1024,
});

describe('document-set-linker — Task 9.2: completeness/symmetry', () => {
  it('สมาชิกในชุดหน่วยเดียวกันลิงก์ถึงกัน (symmetry)', () => {
    const inv = buildInventory(
      [mk('DAPH PFMEA, Sale.xlsx'), mk('DAPH Process control plan,Sale.xls', '.xls')],
      EMPTY_INDEX,
    );
    const sets = buildDocumentSets(inv);
    const saleSet = sets.find((s) => s.group === 'Office' && s.unit === 'Sale');
    expect(saleSet).toBeDefined();
    // มีทั้ง pfmea และ controlPlan ในชุด office/sale
    expect(saleSet?.members.pfmea).toBeDefined();
    expect(saleSet?.members.controlPlan).toBeDefined();

    const pfmea = inv.entries.find((e) => e.documentType === 'PFMEA')!;
    const section = documentSetSection(pfmea, sets);
    // PFMEA ลิงก์ไป Control Plan ในชุดเดียวกัน
    expect(section).toContain('ชุดเอกสารที่เกี่ยวข้อง');
    expect(section).toContain('Office/Sale');
  });
});

describe('document-set-linker — Task 9.3: JES/MC code extraction', () => {
  it('ดึงรหัส JES-### และ MC-### จากเนื้อหา (normalize)', () => {
    const { jes, mc } = extractReferencedCodes('ใช้ JES-001 และ MC 002 ตาม JES 001');
    expect(jes).toContain('JES-001');
    expect(mc).toContain('MC-002');
    // normalize ทำให้ JES-001 ไม่ซ้ำ
    expect(jes.filter((x) => x === 'JES-001').length).toBe(1);
  });
});
