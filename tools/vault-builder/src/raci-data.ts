/**
 * raci-data.ts — RACI entries (transcribe จาก raci-map.draft.md) สำหรับ Knowledge_Export
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 *
 * ค่าทั้งหมด derive จากหลักฐาน JD/SOS/PFMEA (ดู raci-map.draft.md) — คงธง confidence:
 *   - high: มีหลักฐานชัด
 *   - needs_confirmation: รอ DAPH ยืนยัน (Area Measurement A = Project Manager เป็น default)
 * raci_status ระดับ export = 'draft' จนกว่า DAPH ยืนยันครบ (draft-guard, Req 3.4 fail-safe)
 */

import { FACTORY_UNITS, INSTALLATION_UNITS } from './constants.js';
import type { RaciEntryInput } from './knowledge-export.js';

const OFFICE_RACI: RaciEntryInput[] = [
  {
    processStep: 'Sale',
    responsible: 'เจ้าหน้าที่ฝ่ายขาย',
    accountable: 'ผู้จัดการฝ่ายขาย',
    consulted: ['ลูกค้า'],
    informed: ['Designer', 'Area Measurement'],
    confidence: 'high',
  },
  {
    processStep: 'Area Measurement',
    responsible: 'ทีมวัดพื้นที่',
    accountable: 'ผู้จัดการโครงการ', // default (JD: Sales=office-only, PM=field-owner)
    consulted: [],
    informed: ['Designer'],
    confidence: 'needs_confirmation',
  },
  {
    processStep: 'Designer',
    responsible: 'เจ้าหน้าที่ฝ่ายออกแบบ',
    accountable: 'ผู้จัดการฝ่ายออกแบบ',
    consulted: ['Sale'],
    informed: [],
    confidence: 'high',
    // OQ-KX-2 §7: ลูกค้าเลื่อนจาก informed → approver; quorum=unanimous { lead + ลูกค้า }
    approvers: [
      { kind: 'role', ref: 'ผู้จัดการฝ่ายออกแบบ' },
      { kind: 'customer', ref: 'ลูกค้า' },
    ],
  },
  {
    processStep: '3D_Presentation',
    responsible: 'ทีม 3D/Perspective',
    accountable: 'ผู้จัดการฝ่ายออกแบบ',
    consulted: ['Sale'],
    informed: [],
    confidence: 'high',
    approvers: [
      { kind: 'role', ref: 'ผู้จัดการฝ่ายออกแบบ' },
      { kind: 'customer', ref: 'ลูกค้า' },
    ],
  },
  {
    processStep: 'Production Planning',
    responsible: 'เจ้าหน้าที่ฝ่ายวางแผนการผลิต',
    accountable: 'ผู้จัดการโครงการ',
    consulted: ['Designer', 'จัดซื้อ', 'ฝ่ายผลิต'],
    informed: ['คลังสินค้า'],
    confidence: 'high',
  },
  {
    processStep: '3D_Rendering_Final',
    responsible: 'ทีม 3D/Perspective',
    accountable: 'ผู้จัดการโครงการ',
    consulted: ['Production Planning'],
    informed: [],
    confidence: 'high',
    // OQ-KX-2 §7: ลูกค้าเซ็นครั้งสุดท้ายก่อนผลิต → approver; quorum=unanimous { PM + ลูกค้า }
    approvers: [
      { kind: 'role', ref: 'ผู้จัดการโครงการ' },
      { kind: 'customer', ref: 'ลูกค้า' },
    ],
  },
];

const FACTORY_RACI: RaciEntryInput[] = FACTORY_UNITS.map((unit) => ({
  processStep: unit,
  responsible: 'พนักงานผลิต',
  accountable: 'หัวหน้าฝ่ายผลิต',
  consulted: ['เจ้าหน้าที่ประกันคุณภาพ (QA)'],
  informed: unit === 'Packing' ? ['Installation'] : [],
  confidence: 'high',
}));

const INSTALLATION_RACI: RaciEntryInput[] = INSTALLATION_UNITS.map((unit, i) => {
  const isStartOrFinish = i === 0 || i === INSTALLATION_UNITS.length - 1;
  return {
    processStep: unit,
    responsible: 'เจ้าหน้าที่ฝ่ายติดตั้ง',
    accountable: 'หัวหน้าทีม/ฝ่ายติดตั้ง',
    consulted: isStartOrFinish ? ['ผู้จัดการโครงการ'] : [],
    informed: isStartOrFinish ? ['Sale', 'ผู้จัดการโครงการ', 'ลูกค้า'] : [],
    confidence: 'high',
  };
});

/** RACI entries ครบทั้ง 28 ขั้น (Office 6 + Factory 6 + Installation 16) */
export const RACI_ENTRIES: readonly RaciEntryInput[] = [
  ...OFFICE_RACI,
  ...FACTORY_RACI,
  ...INSTALLATION_RACI,
];

/** ยังเป็น draft จนกว่า DAPH ยืนยัน 3 จุดที่เหลือ (Area Measurement A ฯลฯ) */
export const RACI_STATUS = 'draft' as const;
