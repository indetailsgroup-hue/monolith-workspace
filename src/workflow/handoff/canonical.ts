// Feature: monolith-workflow-copilot — canonical sequence enforcement (Req 2.1, 2.3, 2.5, 2.6, 2.7, 10.6)
import type { ProcessModelStep, ProcessStep } from '../domain/types';

export type HandoffError =
  | 'unknown_current_step'
  | 'unknown_target_step'
  | 'invalid_sequence'
  | 'inactive_site';

export interface HandoffOk {
  ok: true;
  fromStep: ProcessStep;
  toStep: ProcessStep;
  /** เจ้าของใหม่ที่ resolve จาก RACI (caller ส่งเข้ามา) */
}

export interface HandoffFail {
  ok: false;
  error: HandoffError;
}

export type HandoffOutcome = HandoffOk | HandoffFail;

function indexOfStep(model: readonly ProcessModelStep[], step: ProcessStep): number {
  // ใช้ order จาก process model (Knowledge_Export) เป็น ground truth
  const found = model.find((m) => m.step === step);
  return found ? found.order : -1;
}

/**
 * Req 2.3/2.5/2.7 — อนุญาต handoff เฉพาะขั้นถัดไปติดกันตามลำดับ canonical
 * และทั้ง current/target ต้องมีในโมเดลกระบวนการ.
 * site active check แยกผ่าน activeSiteCodes (Req 2.6, 10.6).
 */
export function validateHandoff(
  model: readonly ProcessModelStep[],
  currentStep: ProcessStep,
  targetStep: ProcessStep,
  opts?: { siteCode?: string | null; activeSiteCodes?: readonly string[] },
): HandoffOutcome {
  const curIdx = indexOfStep(model, currentStep);
  if (curIdx < 0) return { ok: false, error: 'unknown_current_step' };
  const tgtIdx = indexOfStep(model, targetStep);
  if (tgtIdx < 0) return { ok: false, error: 'unknown_target_step' };

  // ต้องเป็นขั้นถัดไปติดกันเท่านั้น (ไม่ข้าม, ไม่ถอยหลัง)
  if (tgtIdx !== curIdx + 1) return { ok: false, error: 'invalid_sequence' };

  // site_code ต้อง active (ถ้าระบุเงื่อนไข) — Req 2.6, 10.6
  if (opts?.activeSiteCodes !== undefined) {
    const site = opts.siteCode ?? null;
    if (site === null || !opts.activeSiteCodes.includes(site)) {
      return { ok: false, error: 'inactive_site' };
    }
  }

  return { ok: true, fromStep: currentStep, toStep: targetStep };
}

/** ขั้นถัดไปตาม canonical (undefined ถ้าเป็นขั้นสุดท้าย) */
export function nextCanonicalStep(
  model: readonly ProcessModelStep[],
  currentStep: ProcessStep,
): ProcessStep | undefined {
  const idx = indexOfStep(model, currentStep);
  if (idx < 0) return undefined;
  const next = model.find((m) => m.order === idx + 1);
  return next?.step;
}

/** เป็นขั้นสุดท้ายของกระบวนการหรือไม่ (Req 12.3 celebrate) */
export function isLastStep(
  model: readonly ProcessModelStep[],
  step: ProcessStep,
): boolean {
  const maxOrder = model.reduce((m, s) => Math.max(m, s.order), -1);
  const found = model.find((s) => s.step === step);
  return found !== undefined && found.order === maxOrder;
}
