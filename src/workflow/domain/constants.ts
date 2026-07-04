// Feature: monolith-workflow-copilot — canonical constants (Req 2.1, 11.3, 11.8)
// ลำดับ canonical = ground truth จาก Knowledge_Export; ทำซ้ำที่นี่เป็น default/fallback
// สำหรับ pure logic + test เท่านั้น — runtime ต้องใช้ค่าจาก import จริงเสมอ.

import type {
  ApprovalQuorum,
  ProcessModelStep,
  ProcessStep,
  SubProcessGroup,
} from './types';

/** ลำดับ canonical (Req 2.1): Sale → … → Installation, index เริ่มที่ 0 (Req 11.8) */
export const CANONICAL_PROCESS_ORDER: readonly ProcessStep[] = [
  'Sale',
  'Area Measurement',
  'Designer',
  '3D_Presentation',
  'Production Planning',
  '3D_Rendering_Final',
  'Factory',
  'Installation',
] as const;

/** กลุ่มย่อยทั้งหมด (Req 11.3) */
export const SUB_PROCESS_GROUPS: readonly SubProcessGroup[] = [
  'Office',
  'Factory',
  'Installation',
] as const;

/** quorum ที่อนุญาต (Req 15) */
export const APPROVAL_QUORUMS: readonly ApprovalQuorum[] = [
  'unanimous',
  'majority',
  'first_response',
] as const;

/** map step → กลุ่มย่อย (default; export จริง override ได้) */
export const STEP_GROUP: Readonly<Record<ProcessStep, SubProcessGroup>> = {
  Sale: 'Office',
  'Area Measurement': 'Office',
  Designer: 'Office',
  '3D_Presentation': 'Office',
  'Production Planning': 'Office',
  '3D_Rendering_Final': 'Office',
  Factory: 'Factory',
  Installation: 'Installation',
};

/** ขั้นที่ต้องการอนุมัติแบบมีลูกค้าร่วม (Req 20.2) → unanimous {internal lead + customer} */
export const CUSTOMER_APPROVAL_STEPS: readonly ProcessStep[] = [
  'Designer',
  '3D_Presentation',
  '3D_Rendering_Final',
] as const;

/** Notification_Category ที่ผู้ใช้ mute ได้ (non-Direct) (Req 6.5) */
export const MUTABLE_NOTIFICATION_CATEGORIES: readonly string[] = [
  'fyi',
  'group_handoff',
  'digest_summary',
  'celebrate',
] as const;

/** สร้างโมเดลกระบวนการ default จากลำดับ canonical (สำหรับ test/fallback) */
export function buildDefaultProcessModel(): ProcessModelStep[] {
  return CANONICAL_PROCESS_ORDER.map((step, order) => ({
    step,
    order,
    group: STEP_GROUP[step],
  }));
}
