// Feature: monolith-workflow-copilot — field-capture orchestration (Req 7.7, 7.9 §1, task 17.5)
// Edge caller logic: rpc_record_capture (business tx) → ถ้า throw → rpc_log_capture_failure
// ในการเรียกครั้งใหม่ (transaction แยก) → failure-audit ติดแม้ business roll back.
// best-effort: ถ้า log เองก็ throw (Edge ตาย) → audit อาจหาย (ยอมรับสำหรับ capture).

export interface CaptureOrchestrationDeps {
  /** เรียก rpc_record_capture (atomic business tx) — throw เมื่อ business fail */
  recordCapture: () => string;
  /** เรียก rpc_log_capture_failure (transaction แยก) — best-effort */
  logCaptureFailure: (reason: string) => void;
}

export type CaptureOrchestrationResult =
  | { ok: true; captureId: string }
  | { ok: false; error: string; failureLogged: boolean };

/**
 * Req 7.7/7.9 §1 — orchestrate capture:
 *   success → คืน captureId
 *   business fail (record throw) → business roll back ทั้งก้อน + เรียก log failure (tx แยก)
 *     - log สำเร็จ → failureLogged=true (failure-audit ติด)
 *     - log throw (Edge ตาย) → failureLogged=false (best-effort, audit อาจหาย)
 */
export function orchestrateCapture(
  deps: CaptureOrchestrationDeps,
): CaptureOrchestrationResult {
  let captureId: string;
  try {
    captureId = deps.recordCapture();
  } catch (businessErr) {
    const reason = businessErr instanceof Error ? businessErr.message : String(businessErr);
    // caller-driven separate transaction (ไม่ใช่ dblink/pg_background)
    try {
      deps.logCaptureFailure(reason);
      return { ok: false, error: reason, failureLogged: true };
    } catch {
      return { ok: false, error: reason, failureLogged: false }; // best-effort
    }
  }
  return { ok: true, captureId };
}
