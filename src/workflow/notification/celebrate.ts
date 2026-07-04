// Feature: monolith-workflow-copilot — celebrate completion (Req 12.3, 12.7)

export type CompletionKind = 'finished_last_step' | 'manual_close' | 'cancelled';

export interface CelebrateInput {
  /** ถึงขั้นสุดท้ายของ canonical จริงหรือไม่ */
  reachedLastStep: boolean;
  completionKind: CompletionKind;
  /** มี error อื่นใน operation เดียวกันหรือไม่ (Req 12.7) */
  otherOperationError?: boolean;
}

/**
 * Req 12.3/12.7 — ส่งคำยินดีเฉพาะเมื่อจบ Process_Step สุดท้ายจริง
 * (ไม่ใช่ปิด/ยกเลิกมือ); ยังส่งได้แม้มี error อื่นใน operation เดียวกัน.
 */
export function shouldCelebrate(input: CelebrateInput): boolean {
  return input.reachedLastStep && input.completionKind === 'finished_last_step';
  // หมายเหตุ: otherOperationError ไม่มีผลต่อการส่งคำยินดี (Req 12.7) — celebrate เป็นอิสระ
}
