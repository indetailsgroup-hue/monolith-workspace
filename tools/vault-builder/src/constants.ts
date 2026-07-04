/**
 * constants.ts — ค่าคงที่ canonical ของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 1.2)
 * Requirements: 2.1, 2.2, 2.3, 2.4, 11.5
 *
 * รวมลำดับ canonical ของแต่ละ Sub_Process_Group, ตาราง keyword → group/unit
 * สำหรับ Classifier และ taxonomy ของแท็ก (domain/, group/, unit/, type/, status/)
 * ข้อมูลทั้งหมด grounded กับเนื้อหาจริงใน `_daph_extract/` (ชื่อชีตจริงของ
 * `1.SOS DAPH, Main Process.xlsx`, `1.SOS DAPH.xlsx`, `1.SOS DAPH, INSTALLATION.xlsx`)
 */

import type {
  DocumentType,
  ProcessUnit,
  StatusTag,
  SubProcessGroup,
} from './types.js';

// ---------------------------------------------------------------------------
// ลำดับ canonical ของ Process_Unit ในแต่ละกลุ่ม (Req 2.2, 2.3, 2.4)
// ---------------------------------------------------------------------------

/** Office — 5 แผนกก่อนการผลิต ตามลำดับ (Req 2.2) */
export const OFFICE_UNITS = [
  'Sale',
  'Area Measurement',
  'Designer',
  '3D Perspective',
  'Production Planning',
] as const satisfies readonly ProcessUnit[];

/** Factory — 6 สถานีไลน์ผลิต ตามลำดับ (Req 2.3) */
export const FACTORY_UNITS = [
  'Laminate HPL',
  'Cutting',
  'Edging',
  'CNC',
  'Assembly',
  'Packing',
] as const satisfies readonly ProcessUnit[];

/**
 * Installation — 16 ขั้นตอนหน้างาน ตามลำดับชีตจริงใน
 * `1.SOS DAPH, INSTALLATION.xlsx` (Req 2.4)
 */
export const INSTALLATION_UNITS = [
  'การบรีฟงาน',
  'การตรวจสอบหน้างาน',
  'การตรวจสอบระยะ',
  'การปูรองพื้น',
  'เรียงอุปกรณ์',
  'การติดตั้งโครงอลูมิเนียม',
  'การตรวจสอบขนาดตู้',
  'การจัดวางตู้',
  'การติดตั้งผนัง',
  'การติดตั้งท๊อป',
  'การติดตั้งอุปกรณ์ภายในตู้',
  'งานระบบไฟฟ้า',
  'งานเก็บซิลิโคน',
  'การตรวจสอบหน้าบาน',
  'การรักษาความสะอาด',
  'การเก็บของ',
] as const satisfies readonly ProcessUnit[];

/** ลำดับ canonical ของหน่วยในแต่ละกลุ่ม (ใช้สร้างลิงก์ prev/next และ MOC) */
export const CANONICAL_UNITS_BY_GROUP: Record<SubProcessGroup, readonly ProcessUnit[]> = {
  Office: OFFICE_UNITS,
  Factory: FACTORY_UNITS,
  Installation: INSTALLATION_UNITS,
};

/** ลำดับ canonical ของ Sub_Process_Group เอง (Office → Factory → Installation) */
export const CANONICAL_GROUPS = ['Office', 'Factory', 'Installation'] as const satisfies readonly SubProcessGroup[];

// ---------------------------------------------------------------------------
// ตาราง keyword → group/unit สำหรับ Classifier (design §Classifier ขั้น (ง))
// ---------------------------------------------------------------------------

/** กฎ keyword หนึ่งข้อ: คำที่พบในชื่อไฟล์/ชีต → กลุ่ม (และหน่วยเดียวถ้าระบุได้) */
export interface KeywordRule {
  /** คำค้น (จับแบบ case-insensitive ในชั้น Classifier) */
  keyword: string;
  group: SubProcessGroup;
  /**
   * หน่วยเดียวที่ตรงกับคำค้น; ถ้า null หมายถึงคำค้นนี้ครอบคลุมหลายหน่วย
   * (ต้องอ่านชื่อชีตจาก extract เพื่อระบุหน่วยทั้งหมด)
   */
  unit: ProcessUnit | null;
}

/**
 * ตาราง keyword → group/unit ตามดีไซน์
 * เรียงจาก keyword ที่เจาะจงหน่วยเดียวก่อน แล้วตามด้วย keyword ที่ครอบหลายหน่วย
 */
export const KEYWORD_RULES: readonly KeywordRule[] = [
  // Office — หน่วยเดียว
  { keyword: 'Sale', group: 'Office', unit: 'Sale' },
  { keyword: 'Area measurement', group: 'Office', unit: 'Area Measurement' },
  { keyword: 'Designer', group: 'Office', unit: 'Designer' },
  { keyword: '3D Perspective', group: 'Office', unit: '3D Perspective' },
  { keyword: 'Production Planning', group: 'Office', unit: 'Production Planning' },
  { keyword: 'Producting Planning', group: 'Office', unit: 'Production Planning' },
  // Office — หลายหน่วย (อ่านหน่วยจากชีต)
  { keyword: 'Main Process', group: 'Office', unit: null },
  // Factory — สถานีเดียว (ตามชื่อชีต)
  { keyword: 'Laminate', group: 'Factory', unit: 'Laminate HPL' },
  { keyword: 'Cutting', group: 'Factory', unit: 'Cutting' },
  { keyword: 'Edging', group: 'Factory', unit: 'Edging' },
  { keyword: 'CNC', group: 'Factory', unit: 'CNC' },
  { keyword: 'Asm', group: 'Factory', unit: 'Assembly' },
  { keyword: 'Packing', group: 'Factory', unit: 'Packing' },
  // Factory — master Production (เจ้าของ P'Mean)
  { keyword: "P'Mean", group: 'Factory', unit: null },
  // Installation — หลายหน่วย (อ่าน 16 ขั้นตอนจากชีต)
  { keyword: 'INSTALLATION', group: 'Installation', unit: null },
  { keyword: 'Installation', group: 'Installation', unit: null },
] as const;

// ---------------------------------------------------------------------------
// Tag taxonomy (Req 11.5) — มิติ domain/ group/ unit/ type/ status/
// ---------------------------------------------------------------------------

/** prefix ของแท็กแต่ละมิติ */
export const TAG_PREFIX = {
  domain: 'domain/',
  group: 'group/',
  unit: 'unit/',
  type: 'type/',
  status: 'status/',
} as const;

/** slug ของแท็ก domain/ */
export const DOMAIN_TAG_SLUG: Record<'Hardware' | 'Process', string> = {
  Hardware: 'hardware',
  Process: 'process',
};

/** slug ของแท็ก group/ */
export const GROUP_TAG_SLUG: Record<SubProcessGroup, string> = {
  Office: 'office',
  Factory: 'factory',
  Installation: 'installation',
};

/** slug ของแท็ก type/ */
export const DOCUMENT_TYPE_TAG_SLUG: Record<DocumentType, string> = {
  SOS: 'sos',
  JES: 'jes',
  PFMEA: 'pfmea',
  'Process Control Plan': 'process-control-plan',
  Template: 'template',
  'Master Matrix': 'master-matrix',
  'Project Doc': 'project-doc',
  Other: 'other',
};

/** ค่าทั้งหมดของแท็ก status/ (slug = ค่าเดิม) */
export const STATUS_TAGS = ['active', 'draft', 'revise', 'archived'] as const satisfies readonly StatusTag[];

/**
 * slug ของแท็ก unit/ สำหรับหน่วยภาษาอังกฤษ (Office + Factory)
 * หน่วยภาษาไทย (Installation) ใช้ชื่อหน่วยตรง ๆ เป็น slug เพื่อคงอักขระไทย (Req 9.5)
 */
export const UNIT_TAG_SLUG: Record<string, string> = {
  Sale: 'sale',
  'Area Measurement': 'area-measurement',
  Designer: 'designer',
  '3D Perspective': '3d-perspective',
  'Production Planning': 'production-planning',
  'Laminate HPL': 'laminate-hpl',
  Cutting: 'cutting',
  Edging: 'edging',
  CNC: 'cnc',
  Assembly: 'assembly',
  Packing: 'packing',
};

// ---------------------------------------------------------------------------
// สะพานเชื่อม vault doc-unit → process step (ADR-015)
// ---------------------------------------------------------------------------

/**
 * doc-unit ใน vault (ซื่อตรงต่อ source) → process step ใน Knowledge_Export
 * ใช้เมื่อชื่อสองฝั่งต่างกัน (เช่น "3D Perspective" บรรจุทั้ง 3D_Presentation + 3D_Rendering_Final)
 * Vault_Builder ใส่ cross-ref note ตาม map นี้ และ deep-link resolver (Phase 4) อ้าง map เดียวกัน
 */
export const DOC_UNIT_PROCESS_STEP_BRIDGE: Record<string, { step: string; section: string }[]> = {
  '3D Perspective': [
    { step: '3D_Presentation', section: '§1 "1.3D Model"' },
    { step: '3D_Rendering_Final', section: '§2 "2.3D Rendering"' },
  ],
};
