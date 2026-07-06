// Feature: monolith-workflow-copilot — revision gate wiring (Req 21.3, 21.12)
// The design-lock RPCs (0024) and the classify/re-quote RPCs are building blocks
// keyed by GATE (G1–G4), but nothing mapped a canonical Process_Step to its gate,
// so the feature never engaged on a real approve/reject. This is the missing
// mapping + the thin orchestration that migration 0083 mirrors.

import type { ProcessStep } from '../domain/types';

export type DesignGate = 'G1' | 'G2' | 'G3' | 'G4';

/**
 * Req 21.3 — a lock is set when its gate step is approved:
 *   G1 ← Designer (Mood&Tone/style/color, customer sign-off before 3D)
 *   G2 ← 3D_Presentation (furniture layout/spatial)
 *   G3 ← 3D_Rendering_Final (material/finishes)
 *   G4 ← Production Planning (construction/internal release)
 * NOTE: the G-letter is a COST TIER (G1 > G2 > G3 > G4), not canonical order —
 * Production Planning (order 4) runs before 3D_Rendering_Final (order 5) in time
 * but locks the cheapest-to-break internal gate G4 (Req 21.12).
 */
const STEP_TO_GATE: Partial<Record<ProcessStep, DesignGate>> = {
  Designer: 'G1',
  '3D_Presentation': 'G2',
  '3D_Rendering_Final': 'G3',
  'Production Planning': 'G4',
};

/** gate ของ step ที่ lock ได้ หรือ null ถ้า step นั้นไม่ตั้ง lock (Sale/Area Measurement/Factory/Installation) */
export function gateForStep(step: ProcessStep): DesignGate | null {
  return STEP_TO_GATE[step] ?? null;
}

/** step ที่มีการตั้ง design lock (สำหรับ iterate/validate) */
export const LOCKABLE_STEPS: readonly ProcessStep[] = Object.keys(STEP_TO_GATE) as ProcessStep[];

/** customer gate = G1/G2/G3 (ลูกค้าเซ็น), internal = G4 (Production Planning) */
export function isCustomerGate(gate: DesignGate): boolean {
  return gate === 'G1' || gate === 'G2' || gate === 'G3';
}

/**
 * Req 21.10 — ปลายทางของ reject ที่ผ่าน classify:
 *   scope_change → re-quote path (awaiting_requote)
 *   อื่น ๆ (customer_change/daph_defect/pm_judgment) → rework ปกติ
 */
export type RevisionReason = 'scope_change' | 'daph_defect' | 'customer_change' | 'pm_judgment';
export function rejectRoute(reason: RevisionReason): 'requote' | 'rework' {
  return reason === 'scope_change' ? 'requote' : 'rework';
}
