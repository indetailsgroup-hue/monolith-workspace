/**
 * note-generator.ts — NoteGenerator ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 8.1)
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.2, 7.3, 7.4, 11.1, 11.2, 11.3, 11.4, 12.5
 *
 * หน้าที่: สร้างเนื้อหา Index_Note (Markdown) หนึ่งโน้ตต่อไฟล์ non-junk หนึ่งไฟล์
 * โดยอ้างเนื้อหาจริงจาก Extract_Folder / ผล XlsConverter เมื่อมี (ส่งผ่าน
 * พารามิเตอร์ `extractText`) โครงสร้างโน้ตเป็นไปตามหัวข้อ NoteGenerator ใน
 * design.md:
 *
 *   - YAML frontmatter ครบ: domain, doc_type, group, units, status, owner,
 *     document_set, source_file, tags[] (Req 4.3, 11.1–11.4)
 *   - H1 ชื่อโน้ต
 *   - `## สรุป` — สรุปจาก extract เมื่อมี มิฉะนั้นสรุปจาก metadata / placeholder (Req 4.4)
 *   - `## ไฟล์ต้นฉบับ` — Obsidian embed `![[<source_file>]]` (Req 4.2)
 *   - `## หน่วยกระบวนการในเอกสารนี้ (รายชีต)` — หนึ่งหัวข้อย่อยต่อหน่วย เมื่อ multi-unit (Req 4.5)
 *   - `## การนำทางตามกระบวนการ` — ลิงก์ prev/next ตามลำดับ canonical (Req 4.6)
 *   - `## คำย่อที่เกี่ยวข้อง` — ลิงก์ไป Glossary (Req 12.5)
 *
 * กรณี `.xls` (Req 7.2, 7.3, 7.4):
 *   - `extractText` มีค่า  → ฝัง/สรุปข้อความที่แปลงได้ใน `## สรุป`
 *   - `extractText === null` และต้องแปลงแต่ล้มเหลว (conversion === 'attach-only')
 *     → ใส่หมายเหตุ "เปิดด้วย Excel" พร้อมเหตุผล
 *   - ไม่ว่าผลแปลงเป็นอย่างไร ไฟล์ non-junk ทุกไฟล์ได้ Index_Note เสมอ
 *
 * ฟังก์ชันนี้เป็น pure function — คืนค่าเป็น string เท่านั้น ไม่เขียนไฟล์
 * คงอักขระไทยตามต้นฉบับ (UTF-8) โดยไม่แปลง/ตัดทอนอักขระ
 */

import {
  DOCUMENT_TYPE_TAG_SLUG,
  DOC_UNIT_PROCESS_STEP_BRIDGE,
  DOMAIN_TAG_SLUG,
  GROUP_TAG_SLUG,
  TAG_PREFIX,
  UNIT_TAG_SLUG,
} from './constants.js';
import type { InventoryEntry, ProcessUnit } from './types.js';

/** หน่วยกระบวนการก่อนหน้า/ถัดไปตามลำดับ canonical ของกลุ่ม (Req 4.6) */
export interface NoteNeighbors {
  prev: ProcessUnit | null;
  next: ProcessUnit | null;
}

/** จำนวนบรรทัด/อักขระสูงสุดของข้อความที่ดึงมาแสดงใน `## สรุป` */
const MAX_EXCERPT_LINES = 20;
const MAX_EXCERPT_CHARS = 1500;

/**
 * สร้างเนื้อหา Index_Note ของไฟล์หนึ่งไฟล์
 *
 * @param entry       รายการในบัญชีไฟล์ (SourceFile + Classification + ตำแหน่ง)
 * @param extractText ข้อความที่แตก/แปลงได้ (จาก Extract_Folder หรือ XlsConverter) — null เมื่อไม่มี
 * @param neighbors   หน่วยก่อนหน้า/ถัดไปตามลำดับ canonical ของกลุ่ม
 * @returns เนื้อหา Markdown เต็มของ Index_Note
 */
export function generateIndexNote(
  entry: InventoryEntry,
  extractText: string | null,
  neighbors: NoteNeighbors,
): string {
  const sections: string[] = [];

  // ── Frontmatter (Req 4.3, 11.1–11.4) ─────────────────────────────────────
  sections.push(buildFrontmatter(entry));

  // ── H1 ชื่อโน้ต ───────────────────────────────────────────────────────────
  const title = entry.noteTitle.trim() || entry.originalName;
  sections.push(`# ${title}`);

  // ── `## สรุป` (Req 4.4, 7.2, 7.3) ─────────────────────────────────────────
  const summary = buildSummarySection(entry, extractText);
  sections.push(summary);

  // ── `## ไฟล์ต้นฉบับ` — embed (Req 4.2) ────────────────────────────────────
  sections.push(`## ไฟล์ต้นฉบับ\n![[${entry.originalName}]]`);

  // ── `## หน่วยกระบวนการในเอกสารนี้ (รายชีต)` — multi-unit (Req 4.5) ─────────
  if (entry.units.length > 1) {
    sections.push(buildUnitsSection(entry.units));
  }

  // ── `## การนำทางตามกระบวนการ` (Req 4.6) ───────────────────────────────────
  sections.push(buildNavigationSection(neighbors));

  // ── `## ความเชื่อมโยงกับ Process Model` — สะพาน doc-unit → process step (ADR-015) ──
  const bridge = buildProcessStepBridge(entry.units);
  if (bridge) sections.push(bridge);

  // ── `## คำย่อที่เกี่ยวข้อง` — Glossary auto-link (Req 12.5) ────────────────
  const searchableText = [title, summary, entry.documentType ?? '', entry.units.join(' '), extractText ?? '']
    .join('\n');
  sections.push(buildGlossarySection(searchableText));

  return `${sections.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * สร้างบล็อก YAML frontmatter ครบทุกฟิลด์ที่ดีไซน์กำหนด
 * (domain, doc_type, group, units, status, owner, document_set, source_file, tags)
 */
function buildFrontmatter(entry: InventoryEntry): string {
  const lines: string[] = ['---'];

  lines.push(`domain: ${entry.domain}`);
  lines.push(`doc_type: ${entry.documentType ?? 'null'}`);
  lines.push(`group: ${entry.group ?? 'null'}`);
  lines.push(`units: ${yamlQuotedList(entry.units)}`);
  lines.push(`status: ${entry.statusTag}`);
  lines.push(`owner: ${entry.owner !== null ? yamlString(entry.owner) : 'null'}`);
  lines.push(`document_set: ${entry.documentSetKey !== null ? entry.documentSetKey : 'null'}`);
  lines.push(`source_file: ${yamlString(entry.originalName)}`);
  lines.push(`tags: ${yamlPlainList(buildTags(entry))}`);

  lines.push('---');
  return lines.join('\n');
}

/**
 * สร้างเซ็ตแท็กจาก taxonomy slugs (Req 11.1–11.4):
 *   domain/<slug>, group/<slug>, unit/<slug> (หลายค่าได้), type/<slug>, status/<value>
 */
function buildTags(entry: InventoryEntry): string[] {
  const tags: string[] = [];

  tags.push(TAG_PREFIX.domain + DOMAIN_TAG_SLUG[entry.domain]);

  if (entry.group !== null) {
    tags.push(TAG_PREFIX.group + GROUP_TAG_SLUG[entry.group]);
  }

  for (const unit of entry.units) {
    tags.push(TAG_PREFIX.unit + unitTagSlug(unit));
  }

  if (entry.documentType !== null) {
    tags.push(TAG_PREFIX.type + DOCUMENT_TYPE_TAG_SLUG[entry.documentType]);
  }

  tags.push(TAG_PREFIX.status + entry.statusTag);

  return tags;
}

/**
 * slug ของแท็ก unit/ — ใช้ตารางสำหรับหน่วยภาษาอังกฤษ (Office/Factory)
 * หน่วยภาษาไทย (Installation) ใช้ชื่อหน่วยตรง ๆ เพื่อคงอักขระไทย (Req 9.5)
 */
function unitTagSlug(unit: string): string {
  return UNIT_TAG_SLUG[unit] ?? unit;
}

// ---------------------------------------------------------------------------
// `## สรุป`
// ---------------------------------------------------------------------------

/**
 * สร้างหัวข้อ `## สรุป`:
 *   - มี extractText → คำอธิบายจาก metadata + ตัวอย่างเนื้อหาที่แตก/แปลงได้ (Req 4.4, 7.2)
 *   - ไม่มี extractText และเป็น `.xls` ที่แปลงไม่สำเร็จ → หมายเหตุ "เปิดด้วย Excel" (Req 7.3)
 *   - ไม่มี extractText กรณีอื่น → placeholder ระบุว่ายังไม่มีเนื้อหาที่แตกข้อความ (Req 4.4)
 */
function buildSummarySection(entry: InventoryEntry, extractText: string | null): string {
  const parts: string[] = ['## สรุป', describeDocument(entry)];

  const trimmed = extractText?.trim() ?? '';

  if (trimmed.length > 0) {
    parts.push('### เนื้อหาที่แตกได้ (ตัวอย่าง)');
    parts.push(excerpt(trimmed));
  } else if (isXls(entry.ext)) {
    // ไฟล์ .xls ที่แปลงไม่สำเร็จ → attach-only + หมายเหตุเปิดด้วย Excel (Req 7.3)
    parts.push(
      '> [!warning] เปิดด้วย Excel\n' +
        '> ระบบไม่สามารถแปลงเนื้อหาไฟล์ `.xls` นี้เป็นข้อความที่ค้นหาได้โดยอัตโนมัติ ' +
        'กรุณาเปิดไฟล์ต้นฉบับด้านล่างด้วย Microsoft Excel เพื่อดูเนื้อหาทั้งหมด',
    );
  } else {
    // ไม่มีไฟล์ extract สำหรับเอกสารนี้ (Req 4.4 — placeholder แทนการ throw)
    parts.push('> [!note] ยังไม่มีเนื้อหาที่แตกข้อความสำหรับเอกสารนี้ — ดูไฟล์ต้นฉบับด้านล่าง');
  }

  return parts.join('\n\n');
}

/** คำอธิบายเอกสารจาก metadata (ใช้เมื่อไม่มี/มี extract ก็ตาม) */
function describeDocument(entry: InventoryEntry): string {
  const typeLabel = entry.documentType ?? 'เอกสาร';

  if (entry.group === null || entry.units.length === 0) {
    if (entry.group !== null) {
      return `เอกสารประเภท **${typeLabel}** ในกลุ่มกระบวนการ **${entry.group}**`;
    }
    return `เอกสารประเภท **${typeLabel}**`;
  }

  const unitList = entry.units.join(', ');
  const scope = entry.units.length > 1 ? `ครอบคลุมหน่วยกระบวนการ: ${unitList}` : `ของหน่วยกระบวนการ **${unitList}**`;
  return `เอกสารประเภท **${typeLabel}** ในกลุ่มกระบวนการ **${entry.group}** ${scope}`;
}

/** ตัดข้อความให้อยู่ในขอบเขตบรรทัด/อักขระที่กำหนด เพื่อให้โน้ตกระชับแต่ยังค้นหาได้ */
function excerpt(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_EXCERPT_LINES);

  let joined = lines.join('\n');
  if (joined.length > MAX_EXCERPT_CHARS) {
    joined = `${joined.slice(0, MAX_EXCERPT_CHARS).trimEnd()}\n…`;
  }

  return `\`\`\`\n${joined}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// `## หน่วยกระบวนการในเอกสารนี้ (รายชีต)`
// ---------------------------------------------------------------------------

/**
 * สร้างหัวข้อย่อยหนึ่งหัวข้อต่อหนึ่งหน่วย/ชีต สำหรับเอกสาร multi-unit (Req 4.5)
 * (ลิงก์ Document_Set ระดับหน่วยจะถูกเติมภายหลังโดย DocumentSetLinker)
 */
function buildUnitsSection(units: readonly ProcessUnit[]): string {
  const parts: string[] = ['## หน่วยกระบวนการในเอกสารนี้ (รายชีต)'];

  for (const unit of units) {
    parts.push(`### ${unit}\nสรุปขั้นตอน/ชีตของหน่วย **${unit}** ในเอกสารนี้`);
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// `## การนำทางตามกระบวนการ`
// ---------------------------------------------------------------------------

/** สร้างลิงก์ prev/next ตามลำดับ canonical (null = จุดเริ่ม/จุดจบของกลุ่ม) — Req 4.6 */
function buildNavigationSection(neighbors: NoteNeighbors): string {
  const prev = neighbors.prev !== null
    ? unitMocLink(neighbors.prev)
    : '(ไม่มี — เป็นจุดเริ่มของกลุ่ม)';
  const next = neighbors.next !== null
    ? unitMocLink(neighbors.next)
    : '(ไม่มี — เป็นจุดสิ้นสุดของกลุ่ม)';

  return ['## การนำทางตามกระบวนการ', `- ◀️ ก่อนหน้า: ${prev}`, `- ▶️ ถัดไป: ${next}`].join('\n');
}

/** ลิงก์ไป Unit MOC ของหน่วยหนึ่ง (รูปแบบชื่อ `<Unit>-MOC`, แสดงชื่อหน่วยเป็น alias) */
function unitMocLink(unit: ProcessUnit): string {
  const noteName = `${unit.replace(/\s+/g, '-')}-MOC`;
  return `[[${noteName}|${unit}]]`;
}

// ---------------------------------------------------------------------------
// `## คำย่อที่เกี่ยวข้อง` (Glossary auto-link)
// ---------------------------------------------------------------------------

/** คำย่อ/ซอฟต์แวร์ที่นิยามใน Glossary พร้อม anchor และตัวจับในเนื้อหา (Req 12.5) */
interface GlossaryTerm {
  /** anchor ในไฟล์ Glossary.md (ตรงกับ Req 12.2/12.3) */
  anchor: string;
  /** label ที่แสดง (ค่าเริ่มต้น = anchor) */
  label?: string;
  /** regex ตรวจหาคำในเนื้อหาโน้ต */
  test: RegExp;
}

const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  { anchor: 'SOS', test: /\bSOS\b/ },
  { anchor: 'JES', test: /\bJES\b/ },
  { anchor: 'PFMEA', test: /\bPFMEA\b/ },
  { anchor: 'RPN', test: /\bRPN\b/ },
  { anchor: 'MOC', test: /\bMOC\b/ },
  { anchor: 'PARA', test: /\bPARA\b/ },
  { anchor: 'Pytha', test: /\bPytha\b/i },
  { anchor: 'MaxCut', test: /\bMaxCut\b/i },
  { anchor: 'AutoCAD', test: /\bAutoCAD\b/i },
  { anchor: '3D_Max', label: '3D Max', test: /3D\s?Max/i },
];

/** จับรหัสเครื่องจักรในเนื้อหา (เช่น MC-001) เพื่อลิงก์ไป Glossary#MC_Code */
const MC_CODE_REGEX = /MC-\d+/g;

/**
 * สร้างหัวข้อ `## คำย่อที่เกี่ยวข้อง` โดยสแกนเนื้อหาที่ค้นหาได้แล้วลิงก์ไป Glossary
 * รูปแบบลิงก์: `[[Glossary#<anchor>|<label>]]` (Req 12.5)
 */
function buildGlossarySection(searchableText: string): string {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const term of GLOSSARY_TERMS) {
    if (term.test.test(searchableText)) {
      const label = term.label ?? term.anchor;
      const link = `[[Glossary#${term.anchor}|${label}]]`;
      if (!seen.has(link)) {
        seen.add(link);
        links.push(link);
      }
    }
  }

  // รหัสเครื่องจักร MC-### → ลิงก์ไป anchor MC_Code โดยใช้รหัสจริงเป็น label
  const mcCodes = new Set(searchableText.match(MC_CODE_REGEX) ?? []);
  for (const code of mcCodes) {
    const link = `[[Glossary#MC_Code|${code}]]`;
    if (!seen.has(link)) {
      seen.add(link);
      links.push(link);
    }
  }

  const body = links.length > 0 ? links.join(', ') : '(ไม่มีคำย่อที่ต้องอ้างอิงในเอกสารนี้)';
  return `## คำย่อที่เกี่ยวข้อง\n${body}`;
}

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

/** escape สตริงให้อยู่ในเครื่องหมายคำพูดคู่ของ YAML (รองรับ apostrophe ใน owner) */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** สร้าง flow sequence ของ YAML โดยใส่คำพูดคู่ให้ทุกสมาชิก (เช่น units ที่มีช่องว่าง/อักขระไทย) */
function yamlQuotedList(items: readonly string[]): string {
  if (items.length === 0) return '[]';
  return `[${items.map((item) => yamlString(item)).join(', ')}]`;
}

/** สร้าง flow sequence ของ YAML แบบ plain scalar (ใช้กับ tag slugs ที่ปลอดอักขระพิเศษ) */
function yamlPlainList(items: readonly string[]): string {
  if (items.length === 0) return '[]';
  return `[${items.join(', ')}]`;
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

/** ไฟล์เป็น `.xls` (BIFF เก่า) หรือไม่ */
function isXls(ext: string): boolean {
  return ext.toLowerCase() === '.xls';
}

/**
 * สะพานเชื่อมไป process model (ADR-015) — เมื่อ doc-unit ของ vault มีชื่อต่างจาก
 * process step ใน Knowledge_Export (เช่น "3D Perspective" บรรจุทั้ง 3D_Presentation
 * และ 3D_Rendering_Final) ใส่ section ระบุความเชื่อมให้ชัด กัน navigation gap
 * คืน null เมื่อไม่มี doc-unit ที่ต้องเชื่อม
 */
function buildProcessStepBridge(units: ProcessUnit[]): string | null {
  const lines: string[] = [];
  for (const unit of units) {
    const maps = DOC_UNIT_PROCESS_STEP_BRIDGE[unit];
    if (!maps) continue;
    for (const m of maps) {
      lines.push(`- **${m.step}** ← ${m.section} ของเอกสารนี้`);
    }
  }
  if (lines.length === 0) return null;
  return (
    `## ความเชื่อมโยงกับ Process Model (ADR-015)\n\n` +
    `เอกสารนี้ใช้ชื่อตามต้นฉบับ (document fidelity) และครอบคลุม process step ต่อไปนี้ของ Knowledge_Export:\n` +
    lines.join('\n')
  );
}
