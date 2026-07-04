// Feature: monolith-workflow-copilot — canonical domain types (Req 2, 11, 15)
// แหล่งความจริงของลำดับ process มาจาก Knowledge_Export; ที่นี่เป็น type projection เท่านั้น.

/** Process_Step ตามลำดับ canonical (Req 2.1, 11.8 — index เริ่มที่ 0) */
export type ProcessStep =
  | 'Sale'
  | 'Area Measurement'
  | 'Designer'
  | '3D_Presentation'
  | 'Production Planning'
  | '3D_Rendering_Final'
  | 'Factory'
  | 'Installation';

/** กลุ่มกระบวนการย่อย (Req 11.3) */
export type SubProcessGroup = 'Office' | 'Factory' | 'Installation';

/** กติกาการรวมผลอนุมัติ (Req 15) */
export type ApprovalQuorum = 'unanimous' | 'majority' | 'first_response';

/** สถานะ Work_Item (mirror enum ใน 0001_workflow_init.sql + Req 21 ส่วนขยาย) */
export type WorkItemStatus =
  | 'in_progress'
  | 'awaiting_approval'
  | 'blocked'
  | 'rework'
  | 'completed'
  | 'awaiting_requote' // Req 21
  | 'awaiting_customer_acceptance'; // Req 21

/** ผลการตัดสินอนุมัติ (Req 4) */
export type ApprovalDecisionKind = 'approved' | 'rejected';

/** ช่องทางการแจ้งเตือน (Req 6) */
export type NotificationChannel = 'direct_push' | 'group_message';

/** ชนิดผู้อนุมัติ (Req 20) */
export type ApproverKind = 'employee' | 'customer';

/** หนึ่งแถวในโมเดลกระบวนการ (มาจาก Knowledge_Export) */
export interface ProcessModelStep {
  step: ProcessStep;
  /** index ตามลำดับ canonical (เริ่มที่ 0) */
  order: number;
  group: SubProcessGroup;
  /** quorum ที่ใช้ในขั้นนี้ (ถ้าขั้นต้องอนุมัติ) */
  quorum?: ApprovalQuorum;
}
