/**
 * process-model.ts — โมเดลกระบวนการ canonical (สำหรับ Knowledge_Export / workflow)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 * อิง ADR-010 (โมเดล 3D สองขั้น) + raci-map.draft.md + monolith-workflow-copilot Req 8
 *
 * หมายเหตุสถาปัตยกรรม: นี่คือ "โมเดลกระบวนการเชิงธุรกิจ" (สิ่งที่ workflow บริโภค)
 * แยกจาก "vault document taxonomy" (โฟลเดอร์ตามเอกสารที่มีจริง) โดยตั้งใจ —
 * `3D_Rendering_Final` เป็นขั้นจริงในกระบวนการแต่ไม่มีเอกสาร SOS/JES ของตัวเอง
 * (มาจาก Master Matrix เท่านั้น) จึงอยู่ใน process model แต่ไม่มีโฟลเดอร์ใน vault
 *
 * canonicalOrder เป็น 0-based และเรียงต่อเนื่องตลอดสาย Office → Factory → Installation
 * (workflow บังคับ handoff ทีละขั้นตามลำดับนี้อย่างเคร่งครัด)
 */

import type { SubProcessGroup } from './types.js';

/** กติกาการรวมผลอนุมัติเมื่อมีหลายผู้อนุมัติ (ตรงกับ workflow design enum) */
export type ApprovalQuorum = 'unanimous' | 'majority' | 'first_response';

/** หนึ่งขั้นในโมเดลกระบวนการ canonical */
export interface ProcessStep {
  /** ตัวระบุขั้น (machine id) — ตรงกับ ubiquitous-language */
  processStep: string;
  subProcessGroup: SubProcessGroup;
  /** ลำดับ canonical แบบ 0-based ต่อเนื่องทั้งสาย */
  canonicalOrder: number;
  /** ขั้นนี้ต้องมีการอนุมัติก่อนส่งต่อหรือไม่ */
  requiresApproval: boolean;
  /** กติกา quorum เมื่อ requiresApproval; null เมื่อไม่ต้องอนุมัติ */
  approvalQuorum: ApprovalQuorum | null;
}

/**
 * Office — 6 หน่วยเชิงตรรกะ (ADR-010): 3D แยกเป็นสองขั้น
 * requiresApproval อ้าง workflow Req 8:
 *  - Designer draft sign-off → Designer Manager (Req 8.4)
 *  - 3D_Presentation → ลูกค้าอนุมัติคอนเซ็ปต์
 *  - Production Planning (release) → PP Head / escalate (Req 8.1/8.2/8.5)
 *  - 3D_Rendering_Final → ลูกค้าอนุมัติก่อนผลิต
 */
const OFFICE_STEPS: ReadonlyArray<Omit<ProcessStep, 'canonicalOrder'>> = [
  { processStep: 'Sale', subProcessGroup: 'Office', requiresApproval: false, approvalQuorum: null },
  { processStep: 'Area Measurement', subProcessGroup: 'Office', requiresApproval: false, approvalQuorum: null },
  { processStep: 'Designer', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'unanimous' },
  { processStep: '3D_Presentation', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'unanimous' },
  { processStep: 'Production Planning', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'first_response' },
  { processStep: '3D_Rendering_Final', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'unanimous' },
];

/** Factory — 6 สถานี (ไม่มี formal approval รายสถานี; QA เป็น Consulted) */
const FACTORY_STEPS: ReadonlyArray<Omit<ProcessStep, 'canonicalOrder'>> = [
  'Laminate HPL',
  'Cutting',
  'Edging',
  'CNC',
  'Assembly',
  'Packing',
].map((s) => ({ processStep: s, subProcessGroup: 'Factory' as const, requiresApproval: false, approvalQuorum: null }));

/**
 * Installation — 16 ขั้น; ขั้นแรก (start) และขั้นสุดท้าย (finish) ต้องอนุมัติ
 * → Installation Team Lead + แจ้ง Sale/PM (Req 8.6)
 */
const INSTALLATION_STEP_NAMES = [
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
] as const;

const INSTALLATION_STEPS: ReadonlyArray<Omit<ProcessStep, 'canonicalOrder'>> = INSTALLATION_STEP_NAMES.map(
  (s, i) => ({
    processStep: s,
    subProcessGroup: 'Installation' as const,
    // ขั้นแรก = start, ขั้นสุดท้าย = finish → ต้องอนุมัติ (Req 8.6)
    requiresApproval: i === 0 || i === INSTALLATION_STEP_NAMES.length - 1,
    approvalQuorum: i === 0 || i === INSTALLATION_STEP_NAMES.length - 1 ? ('first_response' as const) : null,
  }),
);

/** โมเดลกระบวนการ canonical เต็มสาย (0-based, ต่อเนื่อง) */
export const PROCESS_MODEL: readonly ProcessStep[] = [
  ...OFFICE_STEPS,
  ...FACTORY_STEPS,
  ...INSTALLATION_STEPS,
].map((step, index) => ({ ...step, canonicalOrder: index }));

/** หา ProcessStep ตาม id (null ถ้าไม่พบ) */
export function findProcessStep(id: string): ProcessStep | null {
  return PROCESS_MODEL.find((s) => s.processStep === id) ?? null;
}

/** เซ็ตของ processStep id ทั้งหมด (ใช้ validate) */
export const PROCESS_STEP_IDS: ReadonlySet<string> = new Set(PROCESS_MODEL.map((s) => s.processStep));
