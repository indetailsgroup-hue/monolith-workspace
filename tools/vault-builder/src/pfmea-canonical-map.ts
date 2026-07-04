/**
 * pfmea-canonical-map.ts — แผนที่เลือกฉบับ PFMEA canonical ต่อ Process_Step (Phase 3)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export)
 *
 * นโยบาย: เลือก "1 ฉบับที่ดีที่สุดต่อ Process_Step" (ไม่ merge → กัน double-count)
 * พร้อมบันทึก provenance (source_file + section) และ confidence; ฉบับที่ไม่เลือก = superseded
 * (ไม่ทิ้ง ตาม non-destructive) ตัดสินจากหลักฐาน parse จริง (ดู PFMEA PARSE REPORT)
 *
 * การ map ทั้งหมดนี้เป็น advisory text + SEV เท่านั้น (ยกเว้น Factory ที่มี computed RPN)
 * จึง fail-safe ได้แม้เลือกพลาด และทุกแถวพก sourceFile เพื่อ traceability
 */

import { INSTALLATION_UNITS } from './constants.js';

export type MapConfidence = 'high' | 'needs_confirmation';
export interface PfmeaSourceMapping {
  /** canonical process step id (ตรง process-model.ts) */
  processStep: string;
  /** ชื่อไฟล์ extract ต้นทาง (ใน _daph_extract) */
  sourceFile: string;
  /**
   * ชื่อ step ภายในไฟล์ต้นทางที่ป้อนขั้นนี้ (null = ทั้งไฟล์)
   * ใช้ filter เมื่อไฟล์เดียวป้อนหลาย canonical step (เช่น 3D Perspective split 2 ขั้น)
   */
  sourceSteps: string[] | null;
  confidence: MapConfidence;
  note?: string;
}

/** ฉบับที่ไม่ถูกเลือก — เก็บเป็น provenance (ไม่ทิ้ง) */
export interface SupersededRecord {
  sourceFile: string;
  reason: string;
}

export const PFMEA_CANONICAL_MAP: readonly PfmeaSourceMapping[] = [
  // ----- Office -----
  {
    processStep: 'Sale',
    sourceFile: 'DAPH_PFMEA_Main_Process_Revise_1_.xlsx.txt',
    sourceSteps: ['1.Sales Process'],
    confidence: 'high',
    note: 'Sale per-unit ไม่มี SEV; Revise1 section Sales มี SEV=9',
  },
  {
    processStep: 'Area Measurement',
    sourceFile: 'DAPH_PFMEA_Area_measurement.xlsx.txt',
    sourceSteps: null,
    confidence: 'high',
    note: 'per-unit รวย + มี SEV',
  },
  {
    processStep: 'Designer',
    sourceFile: 'DAPH_PFMEA_Designer.xlsx.txt',
    sourceSteps: null,
    confidence: 'high',
    note: 'per-unit รวย + SEV=8',
  },
  {
    processStep: '3D_Presentation',
    sourceFile: 'DAPH_PFMEA_3D_Perspective.xlsx.txt',
    sourceSteps: ['1.3D Model', '3.Contruction Drawing'],
    confidence: 'needs_confirmation',
    note: 'section 1 = modeling/คอนเซ็ปต์; Construction Drawing (section 3) map เข้าที่นี่ — ขอ DAPH ยืนยัน',
  },
  {
    processStep: 'Production Planning',
    sourceFile: 'DAPH_PFMEA_Producting_Planning_1_.xlsx.txt',
    sourceSteps: null,
    confidence: 'high',
    note: 'ฉบับ (1) เป็น superset ของ 24-row variant (8 steps เดียวกัน เนื้อหารวยกว่า)',
  },
  {
    processStep: '3D_Rendering_Final',
    sourceFile: 'DAPH_PFMEA_3D_Perspective.xlsx.txt',
    sourceSteps: ['2.3D Rendering'],
    confidence: 'high',
    note: 'section 2 (Furniture/Decoration/Lighting/Material/Rendering Setting) ตรง Master Matrix "3D rendering หลัง PP"',
  },

  // ----- Factory (DAPH PFMEA.xlsx — ฉบับเดียวที่มี computed RPN) -----
  {
    processStep: 'Laminate HPL',
    sourceFile: 'DAPH_PFMEA.xlsx.txt',
    sourceSteps: ['1. Incoming Inspection', '2. Laminate HPL'],
    confidence: 'high',
    note: 'CONFIRMED จาก SOS: 1.SOS_DAPH.xlsx ชีต "1 SOS Laminate HPL" R3 ระบุ "1.Incoming Inspection / 2.Laminate HPL", R7 JES-001 element 2 = Incoming Inspection → Incoming เป็น sub-step ของสถานี Laminate HPL ตามนิยาม DAPH เอง (สถานีนี้ถือ RPN สูงสุด 168 จาก incoming ถูกต้อง)',
  },
  { processStep: 'Cutting', sourceFile: 'DAPH_PFMEA.xlsx.txt', sourceSteps: ['3.Cutting'], confidence: 'high' },
  { processStep: 'Edging', sourceFile: 'DAPH_PFMEA.xlsx.txt', sourceSteps: ['4.Edging'], confidence: 'high' },
  { processStep: 'CNC', sourceFile: 'DAPH_PFMEA.xlsx.txt', sourceSteps: ['5.CNC'], confidence: 'high' },
  { processStep: 'Assembly', sourceFile: 'DAPH_PFMEA.xlsx.txt', sourceSteps: ['6.Assembly'], confidence: 'high' },
  { processStep: 'Packing', sourceFile: 'DAPH_PFMEA.xlsx.txt', sourceSteps: ['7.Packing'], confidence: 'high' },
];

/**
 * Installation 16 ขั้น → DAPH PFMEA, INSTALLATION.xlsx (ทั้งหมด not_assessed)
 * map รายขั้นทำในชั้น wiring (จับคู่ step ตามลำดับ); ที่นี่บันทึกแหล่งรวม
 */
export const INSTALLATION_PFMEA_SOURCE = 'DAPH_PFMEA_INSTALLATION.xlsx.txt';

export const PFMEA_SUPERSEDED: readonly SupersededRecord[] = [
  { sourceFile: 'DAPH_PFMEA_P_Mean.xlsx.txt', reason: 'Factory free-text variant ไม่มี RPN — ใช้ DAPH PFMEA.xlsx แทน' },
  { sourceFile: 'DAPH_PFMEA_Main_Process.xlsx.txt', reason: 'ถูกแทนด้วย Main Process (Revise 1) ที่รวยกว่า' },
  { sourceFile: 'DAPH_PFMEA_Producting_Planning.xlsx.txt', reason: 'subset ของ Producting Planning(1)' },
  { sourceFile: 'DAPH_PFMEA_Sale.xlsx.txt', reason: 'ไม่มี SEV — ใช้ section Sales ของ Revise1 แทน' },
  { sourceFile: 'DAPH_PFMEA_INSTALLATION_P_oil.xlsx.txt', reason: 'owner-variant (P\'oil) — ใช้ INSTALLATION ฉบับหลัก' },
];

/** canonical step ids ที่ map แล้ว (ไม่รวม Installation ที่ wire รายขั้นภายหลัง) */
export const MAPPED_OFFICE_FACTORY_STEPS: ReadonlySet<string> = new Set(
  PFMEA_CANONICAL_MAP.map((m) => m.processStep),
);

/** รายชื่อไฟล์ extract ที่ต้องอ่าน (canonical ที่เลือก + Installation) — ไม่ซ้ำ */
export const CANONICAL_PFMEA_FILES: readonly string[] = [
  ...new Set<string>([
    ...PFMEA_CANONICAL_MAP.map((m) => m.sourceFile),
    INSTALLATION_PFMEA_SOURCE,
  ]),
];

/** ผลการ resolve file-step → canonical step */
export interface ResolvedStep {
  canonicalStep: string;
  /** ข้อความ flag เมื่อ mapping ยังต้องให้เจ้าของยืนยัน (undefined = มั่นใจ) */
  flagged?: string;
}

/** normalize ชื่อ step ให้เทียบได้ (จัด dot-spacing + lowercase ascii; ไทยไม่กระทบ) */
function normStep(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s*\.\s*/, '$1.')
    .trim()
    .toLowerCase();
}

/**
 * map (sourceFile, file-internal step) → canonical process step
 * คืน null เมื่อ map ไม่ได้ (เช่น step ของ Revise1 ที่ไม่ใช่ Sales — ใช้ per-unit แทน)
 */
export function resolveCanonicalStep(sourceFile: string, fileStep: string): ResolvedStep | null {
  // Installation: จับคู่ตามชื่อหน่วยที่ปรากฏใน step (เลือก unit ที่ยาวสุดที่ตรง กันชนกัน)
  if (sourceFile === INSTALLATION_PFMEA_SOURCE) {
    const match = [...INSTALLATION_UNITS]
      .filter((u) => fileStep.includes(u))
      .sort((a, b) => b.length - a.length)[0];
    return match ? { canonicalStep: match } : null;
  }

  const entries = PFMEA_CANONICAL_MAP.filter((m) => m.sourceFile === sourceFile);
  if (entries.length === 0) return null;

  const target = normStep(fileStep);
  for (const e of entries) {
    const matched =
      e.sourceSteps === null /* ทั้งไฟล์ */ ||
      e.sourceSteps.some((s) => normStep(s) === target);
    if (matched) {
      return {
        canonicalStep: e.processStep,
        flagged: e.confidence === 'needs_confirmation' ? (e.note ?? 'needs confirmation') : undefined,
      };
    }
  }
  return null;
}
