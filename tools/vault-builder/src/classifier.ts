/**
 * classifier.ts — Classifier ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 3.1)
 * Requirements: 1.2, 1.3, 1.4, 2.5, 2.6, 9.3, 10.3
 *
 * จัดประเภทไฟล์ต้นทางหนึ่งไฟล์เป็น Domain / Document_Type / Process_Unit(s) /
 * Sub_Process_Group / Status_Tag / owner / isJunk ตาม "ลำดับกฎ deterministic"
 * ในหัวข้อ Classifier ของ design.md:
 *
 *   (ก) Hardware short-circuit  → domain Hardware, documentType 'Other', คงเดิม
 *   (ข) Junk detection (ก่อนเสมอสำหรับ Process)
 *   (ค) Document_Type จากชื่อไฟล์ (case-insensitive)
 *   (ง) Process_Unit(s) + group — อิงชื่อชีตจาก extract เมื่อมี แล้วจึงชื่อไฟล์
 *       (รองรับ multi-unit: หนึ่งไฟล์ติดได้หลายหน่วย)
 *   (จ) Status_Tag
 *   (ฉ) owner regex  P'[\wก-๙]+
 *
 * ฟังก์ชันนี้เป็น pure function ไม่มี side effect ต่อระบบไฟล์
 *
 * หมายเหตุการออกแบบ: โครงสร้าง `_INDEX.json` (ExtractIndex) เก็บ "จำนวนชีต"
 * (`sheets`) แต่ไม่เก็บ "ชื่อชีต" ดังนั้น Classifier จึงใช้จำนวนชีตจาก extract
 * เป็นสัญญาณช่วยแยกไฟล์ multi-unit (เช่น `1.SOS DAPH.xlsx` ที่มี 6 ชีต = 6 สถานี
 * Factory) ร่วมกับ keyword จากชื่อไฟล์ และเทียบกับลำดับ canonical ของแต่ละกลุ่ม
 */

import {
  CANONICAL_UNITS_BY_GROUP,
  FACTORY_UNITS,
  KEYWORD_RULES,
} from './constants.js';
import type {
  Classification,
  DocumentType,
  ExtractIndex,
  ProcessUnit,
  SourceFile,
  StatusTag,
  SubProcessGroup,
} from './types.js';

/** regex จับ owner token เช่น "P'oil", "P'Mean" (รองรับอักขระไทย) — Req 9.3 */
const OWNER_REGEX = /P'[A-Za-z0-9_ก-๙]+/;

/** ชื่อไฟล์ exact ของ Master_Process_Matrix (Req 6.1) */
const MASTER_MATRIX_NAME = 'สำหรับคุณชุ.xlsx';

/** Document_Type ที่ถือเป็นเอกสาร QMS ของหน่วยกระบวนการ (ใช้ใน fallback group) */
const QMS_DOC_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'SOS',
  'JES',
  'PFMEA',
  'Process Control Plan',
]);

/**
 * จัดประเภทไฟล์ต้นทางหนึ่งไฟล์
 *
 * @param file  ไฟล์ต้นทางจาก Scanner
 * @param index ดัชนี `_INDEX.json` ของ Extract_Folder (ใช้จำนวนชีตช่วยแยก multi-unit)
 */
export function classify(file: SourceFile, index: ExtractIndex): Classification {
  // ── (ก) Hardware short-circuit ───────────────────────────────────────────
  // ไฟล์ฝั่งฮาร์ดแวร์คงโครงสร้าง/ชื่อเดิม ไม่จัดเข้ากลุ่ม/หน่วยของกระบวนการ
  if (file.domainHint === 'Hardware') {
    return {
      domain: 'Hardware',
      documentType: 'Other',
      group: null,
      units: [],
      statusTag: 'active',
      owner: null,
      isJunk: false,
    };
  }

  // ── (ข) Junk detection (Process) — ตรวจก่อนเสมอ (Req 1.4, 10.1) ────────────
  if (isJunkFile(file)) {
    return {
      domain: 'Process',
      documentType: null,
      group: null,
      units: [],
      statusTag: 'archived',
      owner: null,
      isJunk: true,
    };
  }

  const name = file.originalName;

  // ── (ค) Document_Type จากชื่อไฟล์ (Req 1.3) ───────────────────────────────
  const documentType = classifyDocumentType(name);

  // ── (ง) Process_Unit(s) + group (Req 2.5, 2.6) ───────────────────────────
  const { group, units } = classifyGroupAndUnits(name, documentType, file, index);

  // ── (จ) Status_Tag (Req 10.3) ────────────────────────────────────────────
  const statusTag = classifyStatusTag(name);

  // ── (ฉ) owner (Req 9.3) ──────────────────────────────────────────────────
  const ownerMatch = OWNER_REGEX.exec(name);
  const owner = ownerMatch ? ownerMatch[0] : null;

  return {
    domain: 'Process',
    documentType,
    group,
    units,
    statusTag,
    owner,
    isJunk: false,
  };
}

// ---------------------------------------------------------------------------
// (ข) Junk detection
// ---------------------------------------------------------------------------

/** ไฟล์ขยะ/ชั่วคราว: ชื่อขึ้นต้น `~$` หรือ ext `.tmp`/`.temp` (Req 1.4) */
function isJunkFile(file: SourceFile): boolean {
  if (file.originalName.startsWith('~$')) return true;
  const ext = file.ext.toLowerCase();
  return ext === '.tmp' || ext === '.temp';
}

// ---------------------------------------------------------------------------
// (ค) Document_Type
// ---------------------------------------------------------------------------

/**
 * จัดประเภทเอกสารจากชื่อไฟล์ (case-insensitive) ตามตารางใน design.md
 * คืน Document_Type เสมอ (อย่างน้อย 'Other') เพื่อให้ไฟล์ non-junk ไม่ถูกปล่อย
 * ให้ documentType === null (ค้ำ Property 2: junk exclusivity)
 */
function classifyDocumentType(name: string): DocumentType {
  if (name === MASTER_MATRIX_NAME) return 'Master Matrix';

  const lower = name.toLowerCase();

  if (lower.includes('citadines')) return 'Project Doc';
  if (lower.includes('pfmea')) return 'PFMEA';
  if (lower.includes('process control plan')) return 'Process Control Plan';
  if (lower.startsWith('1.sos') || lower.includes('sos')) return 'SOS';
  if (lower.startsWith('2.jes') || lower.includes('jes')) return 'JES';
  if (
    lower.includes('template') ||
    lower.includes('sample-spec') ||
    lower.includes('feasibility') ||
    name.includes('แผนการทำงานช่างติดตั้ง')
  ) {
    return 'Template';
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// (ง) Process_Unit(s) + group
// ---------------------------------------------------------------------------

/**
 * กำหนดกลุ่มและหน่วยกระบวนการ โดย:
 * 1) จับคู่ KEYWORD_RULES (case-insensitive)
 *    - มี keyword ที่ระบุ "หน่วยเดียว" → single-unit
 *    - มี keyword "หลายหน่วย" (unit === null) → ใช้ลำดับ canonical ของกลุ่มนั้น
 *      (Main Process → 5 แผนก Office, INSTALLATION → 16 ขั้นตอน, P'Mean → master Production)
 * 2) ถ้าไม่มี keyword ตรง → fallback สำหรับไฟล์ DAPH แบบไม่มีตัวระบุหน่วย
 *    - มีคำว่า Draft → กลุ่ม Office (ฉบับร่าง)
 *    - เป็นเอกสาร QMS อื่น → กลุ่ม Factory (สาย Production หลัก) ;
 *      SOS ที่มีหลายชีต = SOS 6 สถานี → ติดครบทั้ง 6 สถานี
 */
function classifyGroupAndUnits(
  name: string,
  documentType: DocumentType,
  file: SourceFile,
  index: ExtractIndex,
): { group: SubProcessGroup | null; units: ProcessUnit[] } {
  const lower = name.toLowerCase();

  const matches = KEYWORD_RULES.filter((rule) =>
    lower.includes(rule.keyword.toLowerCase()),
  );

  const singleMatches = matches.filter((m) => m.unit !== null);
  const multiMatches = matches.filter((m) => m.unit === null);

  // 1a) single-unit keyword(s)
  if (singleMatches.length > 0) {
    const group = singleMatches[0].group;
    const units = uniqueUnits(
      singleMatches.map((m) => m.unit as ProcessUnit),
    );
    return { group, units };
  }

  // 1b) multi-unit keyword → ใช้ลำดับ canonical ของกลุ่ม
  if (multiMatches.length > 0) {
    const group = multiMatches[0].group;
    return { group, units: canonicalUnitsForMultiUnit(group) };
  }

  // 2) fallback — ไฟล์ DAPH แบบไม่มีตัวระบุหน่วย
  if (lower.includes('draft')) {
    // ฉบับร่างของ Office (เช่น 1.SOS DAPH Draft.xlsx, 2.JES DAPH Draft.xlsx)
    return { group: 'Office', units: [] };
  }

  if (QMS_DOC_TYPES.has(documentType)) {
    // เอกสาร QMS แบบ bare (เช่น 1.SOS DAPH.xlsx, DAPH PFMEA.xlsx) → สาย Production = Factory
    const sheetCount = extractSheetCount(index, file.originalName);
    if (documentType === 'SOS' && (sheetCount === undefined || sheetCount > 1)) {
      // SOS แบบ multi-sheet = SOS 6 สถานีของ Factory line
      return { group: 'Factory', units: [...FACTORY_UNITS] };
    }
    // master Production (PFMEA/Process Control Plan ฉบับรวม) — กลุ่ม Factory ไม่ผูกหน่วยเดียว
    return { group: 'Factory', units: [] };
  }

  // ไม่สังกัดหน่วย/กลุ่มใด (Template / Master Matrix / Project Doc / Other ทั่วไป) → Resources
  return { group: null, units: [] };
}

/** หน่วยทั้งหมดตามลำดับ canonical ของกลุ่มสำหรับไฟล์ multi-unit */
function canonicalUnitsForMultiUnit(group: SubProcessGroup): ProcessUnit[] {
  // Factory multi-unit keyword ปัจจุบันคือ P'Mean (master Production) → ไม่ผูกหน่วยเดียว
  if (group === 'Factory') return [];
  return [...CANONICAL_UNITS_BY_GROUP[group]];
}

/** กำจัดหน่วยซ้ำโดยคงลำดับเดิม */
function uniqueUnits(units: ProcessUnit[]): ProcessUnit[] {
  const seen = new Set<ProcessUnit>();
  const result: ProcessUnit[] = [];
  for (const unit of units) {
    if (!seen.has(unit)) {
      seen.add(unit);
      result.push(unit);
    }
  }
  return result;
}

/** จำนวนชีตจาก extract index (undefined เมื่อไฟล์ไม่ได้ถูกแตกข้อความ) */
function extractSheetCount(index: ExtractIndex, fileName: string): number | undefined {
  const entry = index.xlsx.find((e) => e.file === fileName);
  return entry?.sheets;
}

// ---------------------------------------------------------------------------
// (จ) Status_Tag
// ---------------------------------------------------------------------------

/**
 * สถานะเอกสาร (Req 10.3) — ลำดับ:
 *   Draft → draft ; (Revise 1)/Revise/(1) → revise ; ที่เหลือ → active
 * (junk ถูกจัดการก่อนหน้าด้วย archived แล้ว)
 */
function classifyStatusTag(name: string): StatusTag {
  const lower = name.toLowerCase();
  if (lower.includes('draft')) return 'draft';
  if (/\(revise\s*1\)/i.test(name) || /revise/i.test(name) || /\(1\)/.test(name)) {
    return 'revise';
  }
  return 'active';
}
