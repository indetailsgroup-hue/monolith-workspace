// Feature: monolith-workflow-copilot — configurable thresholds (Req 8.7, 13, 17.2, 18.3)
// ค่าทั้งหมดต้องตั้งค่าได้ (ไม่ hard-code ใน logic) — โมดูล logic รับ config ผ่าน argument.

/** เกณฑ์การยกระดับการอนุมัติ (Req 8.1, 8.2, 8.7) */
export interface EscalationConfig {
  /** RPN เกินค่านี้ใน production release → executive_owner (Req 8.1) */
  rpnThreshold: number;
  /** งบเกินค่านี้ → executive_owner (Req 8.2/8.3) */
  budgetCeiling: number;
  /** severity_only: ใช้ SEV ≥ ค่านี้เป็นเกณฑ์ยกระดับสำรอง (ADR-011) */
  severityOnlyEscalateAt: number;
}

/** ค่า SLA (Req 13.1, 13.4) — หน่วยเป็นนาที */
export interface SlaConfig {
  /** ระยะเวลา SLA รวมต่อ Approval_Request (นาที) */
  deadlineMinutes: number;
  /** ส่ง reminder ที่สัดส่วนเวลาที่ผ่านไป (เช่น 0.5 = 50%) (Req 13.2) */
  reminderFractions: readonly number[];
}

/** ค่า retry/backoff ของ notification (Req 18.2, 18.3) */
export interface RetryConfig {
  maxAttempts: number;
  /** หน่วงพื้นฐาน (มิลลิวินาที) ก่อนคูณ exponential */
  baseDelayMs: number;
  /** ตัวคูณ exponential (เช่น 2) */
  backoffFactor: number;
  /** เพดานหน่วงสูงสุด (มิลลิวินาที) */
  maxDelayMs: number;
}

/** ความสดของความรู้ (Req 17.2) */
export interface FreshnessConfig {
  /** เก่ากว่าค่านี้ (วัน) → แสดง warning */
  staleAfterDays: number;
}

export interface WorkflowConfig {
  escalation: EscalationConfig;
  sla: SlaConfig;
  retry: RetryConfig;
  freshness: FreshnessConfig;
}

/** ค่า default ที่ปลอดภัย (override ได้จาก env/DB config) */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  escalation: {
    rpnThreshold: 100,
    budgetCeiling: 500000,
    severityOnlyEscalateAt: 8,
  },
  sla: {
    deadlineMinutes: 24 * 60,
    reminderFractions: [0.5, 1.0],
  },
  retry: {
    maxAttempts: 5,
    baseDelayMs: 1000,
    backoffFactor: 2,
    maxDelayMs: 5 * 60 * 1000,
  },
  freshness: {
    staleAfterDays: 30,
  },
};
