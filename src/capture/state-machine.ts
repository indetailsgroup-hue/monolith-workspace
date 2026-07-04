// Feature: capture-spine — lifecycle state machine (ลอก TCCK agent_artifact) (Req 5.1, 5.2, 5.4, 6.1)
// Pure deterministic — mirror สิ่งที่ rpc_capture_verify/promote enforce.
// no-commit-until-emitted; approve-before-promote; terminal immutability.

export type CaptureStatus = 'proposed' | 'approved' | 'rejected' | 'emitted' | 'superseded';

/** transition ที่อนุญาต (proposed→approved/rejected→emitted→superseded) */
const ALLOWED: Record<CaptureStatus, readonly CaptureStatus[]> = {
  proposed: ['approved', 'rejected'],
  approved: ['emitted'],
  emitted: ['superseded'],
  rejected: [],
  superseded: [],
};

/** สถานะที่ไม่มี transition ออก (terminal จริง) — rejected / superseded.
 *  หมายเหตุ: emitted **ไม่ใช่** terminal (ยังไป superseded ได้) — ดู isContentImmutable สำหรับ Req 5.4. */
export function isTerminal(status: CaptureStatus): boolean {
  return status === 'rejected' || status === 'superseded';
}

/** Req 5.4 / Property 6 — content/extraction แก้ย้อนหลังไม่ได้ เมื่อถึง emitted/superseded/rejected
 *  (การแก้ = artifact ใหม่ + supersede); ต่างจาก isTerminal ที่ emitted ยัง transition→superseded ได้. */
export function isContentImmutable(status: CaptureStatus): boolean {
  return status === 'emitted' || status === 'superseded' || status === 'rejected';
}

/** transition ถูกต้องตาม lifecycle หรือไม่ */
export function canTransition(from: CaptureStatus, to: CaptureStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Req 5.2 — promote (→emitted) ได้เฉพาะจาก approved (approve-before-promote) */
export function canPromote(status: CaptureStatus): boolean {
  return status === 'approved';
}

/**
 * Req 4.1/5.1 — business-layer (Commit_Target) เปลี่ยนได้ก็ต่อเมื่อ artifact ถึง emitted เท่านั้น
 * (no-commit-until-emitted; Property 1).
 */
export function canCommitBusiness(status: CaptureStatus): boolean {
  return status === 'emitted';
}
