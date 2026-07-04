/**
 * moc-generator.ts — MOCGenerator ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 11.1)
 * Requirements: 3.2, 8.2, 8.3, 8.4
 *
 * สร้างโน้ต MOC (Map of Content):
 *  - Unit MOC : หนึ่งโน้ตต่อหนึ่ง Process_Unit ลิงก์ไป Index_Note ทุกไฟล์ในหน่วย
 *               จัดกลุ่มตาม Document_Set
 *  - Group MOC: หนึ่งโน้ตต่อหนึ่ง Sub_Process_Group ลิงก์ไป Unit MOC ทั้งหมด
 *  - Hardware MOC: ลิงก์ไป MOC เดิมใน furniture-hardware-vault (คงโครงสร้างเดิม)
 *
 * คืนรายการไฟล์ MOC (relativePath + content) ให้ pipeline เขียนลง Vault
 */

import { CANONICAL_GROUPS, CANONICAL_UNITS_BY_GROUP } from './constants.js';
import type { Inventory, InventoryEntry, ProcessUnit, SubProcessGroup } from './types.js';

export interface GeneratedNote {
  /** path สัมพัทธ์จากรากของ Vault */
  relativePath: string;
  content: string;
}

/** ชื่อโน้ต MOC ของหน่วย */
export function unitMocName(unit: ProcessUnit): string {
  return `${unit.replace(/\s+/g, '-')}-MOC`;
}

/** ชื่อโน้ต MOC ของกลุ่ม */
export function groupMocName(group: SubProcessGroup): string {
  return `${group}-MOC`;
}

/** entries ที่สังกัดหน่วยหนึ่ง (non-junk, มีโน้ต) */
function entriesForUnit(inv: Inventory, group: SubProcessGroup, unit: ProcessUnit): InventoryEntry[] {
  return inv.entries.filter(
    (e) =>
      !e.isJunk &&
      e.group === group &&
      e.units.includes(unit) &&
      e.noteRelativePath !== null,
  );
}

/** สร้าง Unit MOC หนึ่งโน้ต */
function buildUnitMoc(inv: Inventory, group: SubProcessGroup, unit: ProcessUnit): GeneratedNote {
  const entries = entriesForUnit(inv, group, unit);
  const lines: string[] = [
    '---',
    `type: moc`,
    `group: ${group}`,
    `unit: "${unit}"`,
    `tags: [moc, group/${group.toLowerCase()}]`,
    '---',
    '',
    `# ${unit} — MOC`,
    '',
    `รวมเอกสารทั้งหมดของหน่วยกระบวนการ **${unit}** (กลุ่ม ${group})`,
    '',
  ];

  // จัดกลุ่มตามประเภทเอกสาร (ใกล้เคียง Document_Set)
  const byType = new Map<string, InventoryEntry[]>();
  for (const e of entries) {
    const t = e.documentType ?? 'Other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(e);
  }

  if (entries.length === 0) {
    lines.push('> [!note] ยังไม่มีเอกสารสำหรับหน่วยนี้');
  } else {
    for (const [type, list] of byType) {
      lines.push(`## ${type}`);
      for (const e of list) {
        lines.push(`- [[${e.noteTitle}]]`);
      }
      lines.push('');
    }
  }

  // Dataview fallback (ต้องติดตั้ง Dataview — ระบุใน Plugin Guide)
  lines.push('## Dataview (ต้องติดตั้งปลั๊กอิน Dataview)');
  lines.push('```dataview');
  lines.push(`LIST FROM #unit/${unit.replace(/\s+/g, '-').toLowerCase()}`);
  lines.push('```');

  return {
    relativePath: `02-Areas/Process/${group}/${unit}/${unitMocName(unit)}.md`,
    content: `${lines.join('\n')}\n`,
  };
}

/** สร้าง Group MOC หนึ่งโน้ต */
function buildGroupMoc(group: SubProcessGroup): GeneratedNote {
  const units = CANONICAL_UNITS_BY_GROUP[group];
  const lines: string[] = [
    '---',
    `type: moc`,
    `group: ${group}`,
    `tags: [moc, group/${group.toLowerCase()}]`,
    '---',
    '',
    `# ${group} — Group MOC`,
    '',
    `หน่วยกระบวนการในกลุ่ม **${group}** ตามลำดับ:`,
    '',
  ];
  units.forEach((unit, i) => {
    lines.push(`${i + 1}. [[${unitMocName(unit)}|${unit}]]`);
  });
  return {
    relativePath: `02-Areas/Process/${group}/${groupMocName(group)}.md`,
    content: `${lines.join('\n')}\n`,
  };
}

/** สร้าง Hardware MOC (ลิงก์ไปโครงสร้างเดิมของ furniture-hardware-vault) */
function buildHardwareMoc(): GeneratedNote {
  const lines: string[] = [
    '---',
    'type: moc',
    'domain: Hardware',
    'tags: [moc, domain/hardware]',
    '---',
    '',
    '# Hardware — MOC',
    '',
    'โดเมนฮาร์ดแวร์ผนวกจาก `furniture-hardware-vault` (Blum / Häfele / Italiana Ferramenta)',
    'คงโครงสร้างเดิม (00_INBOX, 10_SOURCES, 20_ATOMIC_NOTES, 30_SYSTEMS, 40_SPECS, 50_MOC, 60_VALIDATION, 90_TEMPLATES)',
    '',
    '- [[Home|⌂ กลับหน้าหลัก]]',
    '- ดู MOC เดิมในโฟลเดอร์ `02-Areas/Hardware/50_MOC/`',
  ];
  return {
    relativePath: '02-Areas/Hardware/Hardware-MOC.md',
    content: `${lines.join('\n')}\n`,
  };
}

/** สร้าง MOC ทั้งหมด (Unit + Group + Hardware) */
export function generateMocs(inv: Inventory): GeneratedNote[] {
  const notes: GeneratedNote[] = [];

  for (const group of CANONICAL_GROUPS) {
    for (const unit of CANONICAL_UNITS_BY_GROUP[group]) {
      notes.push(buildUnitMoc(inv, group, unit));
    }
    notes.push(buildGroupMoc(group));
  }
  notes.push(buildHardwareMoc());

  return notes;
}
