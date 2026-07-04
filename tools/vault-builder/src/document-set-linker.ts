/**
 * document-set-linker.ts — DocumentSetLinker ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 9.1)
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.5
 *
 * จับกลุ่ม Index_Note ที่สังกัด Process_Unit เดียวกันเป็น Document_Set
 * (SOS ↔ JES ↔ PFMEA ↔ Process Control Plan) แล้วสร้างลิงก์ข้ามแบบสมมาตร
 * รวมถึงดึงรหัส JES-### / MC-### จากเนื้อหา SOS เพื่อลิงก์ไปเอกสารที่เกี่ยวข้อง
 *
 * ฟังก์ชันหลักเป็น pure: รับ Inventory → คืนรายการ DocumentSet และ
 * สร้าง markdown ของลิงก์ต่อโน้ตหนึ่งใบ (ให้ pipeline นำไปต่อท้ายโน้ต)
 */

import type { DocumentSet, Inventory, InventoryEntry } from './types.js';

/** map doc_type → ช่องสมาชิกใน DocumentSet */
function memberSlot(entry: InventoryEntry): keyof DocumentSet['members'] | null {
  switch (entry.documentType) {
    case 'SOS':
      return 'sos';
    case 'JES':
      return 'jes';
    case 'PFMEA':
      return 'pfmea';
    case 'Process Control Plan':
      return 'controlPlan';
    default:
      return null;
  }
}

/** ชื่อโน้ต (ไม่รวมนามสกุล) ของ entry สำหรับใช้เป็น wikilink target */
function noteName(entry: InventoryEntry): string | null {
  if (entry.noteRelativePath === null) return entry.noteTitle || null;
  return entry.noteTitle || null;
}

/**
 * จับกลุ่มเอกสารเป็น Document_Set ตามคีย์ `group/unit`
 * เอกสาร multi-unit เป็นสมาชิกของหลายชุด (หนึ่งชุดต่อหนึ่งหน่วย)
 */
export function buildDocumentSets(inv: Inventory): DocumentSet[] {
  const byKey = new Map<string, DocumentSet>();

  for (const entry of inv.entries) {
    if (entry.domain !== 'Process' || entry.isJunk || entry.group === null) continue;
    const slot = memberSlot(entry);
    if (slot === null) continue;
    const note = noteName(entry);
    if (note === null) continue;

    for (const unit of entry.units) {
      const key = `${entry.group}/${unit}`;
      let set = byKey.get(key);
      if (!set) {
        set = { group: entry.group, unit, members: {} };
        byKey.set(key, set);
      }
      // เก็บสมาชิกแรกที่พบของแต่ละ slot (active ตัวจริงมาก่อน duplicate)
      if (set.members[slot] === undefined) {
        set.members[slot] = note;
      }
    }
  }

  return [...byKey.values()];
}

/**
 * สร้าง markdown ส่วน "ชุดเอกสารที่เกี่ยวข้อง (Document Set)" สำหรับโน้ตหนึ่งใบ
 * โดยลิงก์ไปสมาชิกอื่นในทุกชุดที่โน้ตนี้สังกัด (สมมาตร: ทุกฉบับลิงก์หากัน)
 *
 * @param entry โน้ตที่กำลังพิจารณา
 * @param sets  รายการ DocumentSet ทั้งหมด (จาก buildDocumentSets)
 * @returns markdown section หรือ '' เมื่อไม่มีสมาชิกอื่นให้ลิงก์
 */
export function documentSetSection(entry: InventoryEntry, sets: DocumentSet[]): string {
  if (entry.group === null) return '';
  const self = noteName(entry);
  const selfSlot = memberSlot(entry);

  const linkLines: string[] = [];
  for (const unit of entry.units) {
    const key = `${entry.group}/${unit}`;
    const set = sets.find((s) => s.group === entry.group && s.unit === unit);
    if (!set) continue;

    const links: string[] = [];
    for (const [slot, note] of Object.entries(set.members)) {
      if (!note) continue;
      if (slot === selfSlot && note === self) continue; // ไม่ลิงก์หาตัวเอง
      links.push(`[[${note}]]`);
    }
    if (links.length > 0) {
      linkLines.push(`- **${key}**: ${links.join(' · ')}`);
    }
  }

  if (linkLines.length === 0) return '';
  return ['## ชุดเอกสารที่เกี่ยวข้อง (Document Set)', ...linkLines].join('\n');
}

/** regex จับรหัส JES และ MC ในเนื้อหา SOS (Req 5.3) */
const JES_CODE = /JES[-\s]?\d+/g;
const MC_CODE = /MC[-\s]?\d+/g;

/**
 * ดึงรหัส JES-### / MC-### ที่พบในเนื้อหา (เช่น SOS) เพื่อนำไปแสดง/ลิงก์
 * คืนรายการรหัสไม่ซ้ำ (normalize เป็นรูป `JES-001` / `MC-001`)
 */
export function extractReferencedCodes(text: string): { jes: string[]; mc: string[] } {
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/^([A-Z]+)(\d+)$/, '$1-$2');
  const jes = [...new Set((text.match(JES_CODE) ?? []).map((m) => norm(m.toUpperCase())))];
  const mc = [...new Set((text.match(MC_CODE) ?? []).map((m) => norm(m.toUpperCase())))];
  return { jes, mc };
}
