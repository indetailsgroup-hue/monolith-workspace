// Feature: monolith-workflow-copilot — revision classification (Req 21.1, 21.2, 21.4, 21.13)
// mirror supabase/migrations/0024_revision_discipline.sql rpc_classify_revision (ground truth).

export type RevisionReason = 'scope_change' | 'daph_defect' | 'customer_change' | 'pm_judgment';

export interface ClassifyInput {
  changedFields: readonly string[];
  lockedFields: readonly string[];
  /** การเปลี่ยนตรงกับ signed spec หรือไม่ (false → daph_defect) */
  matchesSignedSpec: boolean;
  /** การจัดประเภทชัดเจนหรือไม่ (false → pm_judgment) */
  isClear: boolean;
}

/**
 * Req 21.1/21.4 — deterministic classify (ลำดับสำคัญ):
 *   change ∩ locked_fields → scope_change
 *   ≠ signed spec          → daph_defect (Req 21.2/21.13 — ไม่นับ threshold, feed QA_Metric)
 *   ไม่ชัด                  → pm_judgment
 *   else                   → customer_change
 */
export function classifyRevision(input: ClassifyInput): RevisionReason {
  const lockedSet = new Set(input.lockedFields);
  const touchesLocked = input.changedFields.some((f) => lockedSet.has(f));
  if (touchesLocked) return 'scope_change';
  if (!input.matchesSignedSpec) return 'daph_defect';
  if (!input.isClear) return 'pm_judgment';
  return 'customer_change';
}

/** daph_defect ไม่นับ revision threshold (Req 21.13 — เข้า QA_Metric แทน) */
export function countsTowardThreshold(reason: RevisionReason): boolean {
  return reason === 'customer_change';
}
