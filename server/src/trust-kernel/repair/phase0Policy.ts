/**
 * phase0Policy.ts — Repair Intelligence Phase 0 deny-only capability contract.
 *
 * Phase 0 integrates the Trust Kernel and freezes every later-phase Repair
 * capability behind a single stable denial. The list below is exhaustive for
 * the approved Phase 0 boundary: evidence write/upload/access, malware scan,
 * OCR, live AI, human review, diagnosis/prescription, professional and
 * commercial authority, payment, execution authority, R8-R12, native mobile,
 * BIM authoring, and the two unproven governance claims (Expert Label Gate B,
 * blanket immutable infrastructure).
 *
 * The evaluator is total and constant: no capability, environment variable, or
 * caller-supplied state can produce `allowed: true`. Enabling any capability
 * requires a NEW approved phase plan and a versioned change — never an edit
 * that widens this function's return type.
 */

export const REPAIR_PHASE0_BLOCKED_CAPABILITIES = [
  'EVIDENCE_DATABASE_WRITE',
  'EVIDENCE_UPLOAD',
  'PRIVATE_EVIDENCE_ACCESS',
  'MALWARE_SCAN',
  'OCR',
  'LIVE_AI',
  'HUMAN_REVIEW_QUEUE',
  'AUTOMATED_DIAGNOSIS',
  'REPAIR_PRESCRIPTION',
  'PROFESSIONAL_SIGNOFF',
  'WORK_ORDER',
  'PROCUREMENT',
  'PAYMENT',
  'EXECUTION_AUTHORITY',
  'R8', 'R9', 'R10', 'R11', 'R12',
  'NATIVE_MOBILE',
  'BIM_AUTHORING',
  'EXPERT_LABEL_GATE_B_CLAIM',
  'IMMUTABLE_INFRASTRUCTURE_CLAIM',
] as const;

export type RepairPhase0BlockedCapability =
  (typeof REPAIR_PHASE0_BLOCKED_CAPABILITIES)[number];

export function evaluateRepairPhase0Capability(
  capability: RepairPhase0BlockedCapability,
) {
  return {
    allowed: false as const,
    phase: 'PHASE_0' as const,
    capability,
    code: 'REPAIR_PHASE_NOT_ENABLED' as const,
  };
}
