// Feature: monolith-workflow-copilot — knowledge freshness/trust (Req 17.1–17.4)

export interface FreshnessInput {
  sourceVersion: string;
  importedAtMs: number;
  nowMs: number;
  staleAfterDays: number;
  reviewStatus: string; // 'approved' | อื่น ๆ
}

export interface FreshnessResult {
  sourceVersion: string;
  importedAtMs: number;
  /** เก่ากว่า threshold (Req 17.2) */
  stale: boolean;
  /** ต้องแสดง warning (stale) */
  warning: boolean;
  /** review_status ≠ approved → low confidence (ไม่ซ่อน) (Req 17.3) */
  lowConfidence: boolean;
  /** ไม่เคยซ่อนข้อมูล — แสดงพร้อม flag เสมอ (Req 17.4) */
  hidden: false;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Req 17.1–17.4 — ประเมินความสด/ความน่าเชื่อถือ:
 *   stale (เก่ากว่า threshold) → warning + ยังแสดง
 *   review_status ≠ approved → low confidence (ไม่ซ่อน)
 *   ไม่ซ่อนข้อมูลในทุกกรณี (hidden=false เสมอ).
 */
export function evaluateFreshness(input: FreshnessInput): FreshnessResult {
  const ageDays = (input.nowMs - input.importedAtMs) / MS_PER_DAY;
  const stale = ageDays > input.staleAfterDays;
  return {
    sourceVersion: input.sourceVersion,
    importedAtMs: input.importedAtMs,
    stale,
    warning: stale,
    lowConfidence: input.reviewStatus !== 'approved',
    hidden: false,
  };
}
