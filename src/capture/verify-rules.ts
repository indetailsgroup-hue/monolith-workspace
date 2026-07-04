// Feature: capture-spine — Verify_Rule priority + pfmea trace (Req 11.1, 11.2, 11.3, Property 11)
// Pure; mirror การจัด priority ใน rpc_capture_set_extraction. computed RPN ก่อน severity_only.

export interface PfmeaRef {
  source_file: string;
  source_step: string;
}

export type RulePriority =
  | { kind: 'rpn'; rpn: number }
  | { kind: 'severity_only'; sev: number };

export interface VerifyRule {
  checkpoint: string;
  guards_against: string;
  method: string;
  pfmea_ref: PfmeaRef; // Req 11.2 — ทุก rule trace กลับ PFMEA ได้
  priority: RulePriority;
}

/** offset ให้ rpn rule ทุกตัวจัดอันดับ "เหนือ" severity_only ทุกตัว (Req 11.3) */
const RPN_BASE = 1_000_000;

/**
 * Req 11.3 — คะแนน priority (มาก = เสี่ยงสูง = ตรวจก่อน):
 *   computed RPN → RPN_BASE + rpn (อยู่เหนือ severity_only เสมอ)
 *   severity_only → sev (0–~10)
 */
export function priorityScore(rule: VerifyRule): number {
  return rule.priority.kind === 'rpn' ? RPN_BASE + rule.priority.rpn : rule.priority.sev;
}

/** เรียง rule จากเสี่ยงสูง→ต่ำ (computed RPN ก่อน severity_only) — เสถียร (stable) */
export function sortByPriority(rules: readonly VerifyRule[]): VerifyRule[] {
  return [...rules].sort((a, b) => priorityScore(b) - priorityScore(a));
}

/** Property 11 — ทุก active rule ต้องมี pfmea_ref ครบ (source_file + source_step) */
export function allRulesTracePfmea(rules: readonly VerifyRule[]): boolean {
  return rules.every(
    (r) =>
      r.pfmea_ref !== undefined &&
      typeof r.pfmea_ref.source_file === 'string' &&
      r.pfmea_ref.source_file.length > 0 &&
      typeof r.pfmea_ref.source_step === 'string' &&
      r.pfmea_ref.source_step.length > 0,
  );
}
