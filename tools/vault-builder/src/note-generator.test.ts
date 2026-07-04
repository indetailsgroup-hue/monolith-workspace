/**
 * note-generator.test.ts — tests for Index_Note generation
 *
 * Feature: daph-obsidian-second-brain
 *   Property 5  (one note per non-junk) → Task 8.2 / Req 4.1
 *   Property 6  (xls outcome in note)   → Task 8.3 / Req 7.2, 7.3
 *   Property 8  (process-order linkage) → Task 8.4 / Req 4.6
 *   frontmatter + glossary auto-link    → Task 8.5 / Req 4.3, 12.5
 */

import { describe, expect, it } from 'vitest';

import { buildInventory } from './inventory.js';
import { generateIndexNote } from './note-generator.js';
import type { ExtractIndex, InventoryEntry, SourceFile } from './types.js';

const EMPTY_INDEX: ExtractIndex = { xlsx: [], xls_unsupported: [] };

function mk(originalName: string, ext = '.xlsx'): SourceFile {
  return { originalName, absolutePath: `/src/${originalName}`, domainHint: 'Process', ext, sizeBytes: 1024 };
}

function entryFor(name: string, ext = '.xlsx'): InventoryEntry {
  const inv = buildInventory([mk(name, ext)], EMPTY_INDEX);
  return inv.entries[0];
}

describe('note-generator — frontmatter + glossary (Task 8.5 / Req 4.3, 12.5)', () => {
  it('มี frontmatter ครบและลิงก์ Glossary สำหรับ SOS/PFMEA', () => {
    const e = entryFor('DAPH PFMEA, Sale.xlsx');
    const note = generateIndexNote(e, 'Process: DAPH Sale\nRPN ...', { prev: null, next: 'Designer' });
    expect(note.startsWith('---')).toBe(true);
    for (const field of ['domain:', 'doc_type:', 'group:', 'units:', 'status:', 'owner:', 'source_file:', 'tags:']) {
      expect(note.includes(field)).toBe(true);
    }
    expect(note).toContain('[[Glossary#PFMEA|PFMEA]]');
    expect(note).toContain('[[Glossary#RPN|RPN]]');
  });

  it('embed ไฟล์ต้นฉบับด้วย ![[...]]', () => {
    const e = entryFor('DAPH PFMEA, Sale.xlsx');
    const note = generateIndexNote(e, null, { prev: null, next: null });
    expect(note).toContain('![[DAPH PFMEA, Sale.xlsx]]');
  });
});

describe('note-generator — Property 6: xls outcome (Task 8.3 / Req 7.2, 7.3)', () => {
  it('extractText มีค่า → ฝังตัวอย่างเนื้อหา', () => {
    const e = entryFor('DAPH Process control plan,Sale.xls', '.xls');
    const note = generateIndexNote(e, 'หัวข้อ A\nหัวข้อ B', { prev: null, next: null });
    expect(note).toContain('เนื้อหาที่แตกได้');
  });

  it('.xls ไม่มี extractText → หมายเหตุเปิดด้วย Excel', () => {
    const e = entryFor('DAPH Process control plan,Sale.xls', '.xls');
    const note = generateIndexNote(e, null, { prev: null, next: null });
    expect(note).toContain('เปิดด้วย Excel');
  });
});

describe('note-generator — Property 8: process-order linkage (Task 8.4 / Req 4.6)', () => {
  it('prev=null แสดงจุดเริ่ม, next ลิงก์ไป MOC ของหน่วยถัดไป', () => {
    const e = entryFor('DAPH PFMEA, Sale.xlsx');
    const note = generateIndexNote(e, null, { prev: null, next: 'Designer' });
    expect(note).toContain('จุดเริ่มของกลุ่ม');
    expect(note).toContain('[[Designer-MOC|Designer]]');
  });
});

describe('note-generator — Property 5: one note per non-junk (Task 8.2 / Req 4.1)', () => {
  it('จำนวน entry ที่มี noteRelativePath = จำนวนไฟล์ non-junk (Process)', () => {
    const files = [
      mk('DAPH PFMEA, Sale.xlsx'),
      mk('1.SOS DAPH.xlsx'),
      mk('~$1.SOS DAPH Draft.xlsx'),
      mk('สำหรับคุณชุ.xlsx'),
    ];
    const inv = buildInventory(files, EMPTY_INDEX);
    const nonJunk = inv.entries.filter((e) => !e.isJunk && e.domain === 'Process');
    const withNote = inv.entries.filter((e) => e.noteRelativePath !== null);
    expect(withNote.length).toBe(nonJunk.length);
  });
});

describe('note-generator — process-step bridge (ADR-015)', () => {
  it('โน้ตของ doc-unit "3D Perspective" มี cross-ref ไป 3D_Presentation + 3D_Rendering_Final', () => {
    const e = entryFor('DAPH PFMEA, 3D Perspective.xlsx');
    const note = generateIndexNote(e, null, { prev: 'Designer', next: 'Production Planning' });
    expect(note).toContain('ความเชื่อมโยงกับ Process Model');
    expect(note).toContain('3D_Presentation');
    expect(note).toContain('3D_Rendering_Final');
  });

  it('โน้ตของ unit ทั่วไป (ไม่มีใน bridge) ไม่มี section นี้', () => {
    const e = entryFor('DAPH PFMEA, Designer.xlsx');
    const note = generateIndexNote(e, null, { prev: 'Area Measurement', next: '3D Perspective' });
    expect(note).not.toContain('ความเชื่อมโยงกับ Process Model');
  });
});
