// Feature: monolith-workflow-copilot — Action Type Registry & Autonomy Classification (Req 19)
// Pure deterministic logic mirroring supabase/migrations/0004_autonomy_registry.sql (ground truth).
//
// D2 ตัวเลือก C: classify/label เท่านั้น — ไม่มี execute_autonomous_action / guardrail / escalation_record.
// Invariants (mirror DB CHECK constraints — ห้าม merge สองตัว):
//   atr_r02_implies_high  : r02_bound ⇒ risk_class = high                       (REG-1, Req 19.1/19.2)
//   atr_ceiling_for_risk  : risk_class ≠ low ⇒ tier ≤ L1_propose (invariant ถาวร) (REG-2, Req 19.2)
//   atr_phase_tier_cap    : ทุก row (รวม low) ⇒ tier ≤ L1_propose (phase-scoped)   (REG-3, Req 19.11)

export type RiskClass = 'low' | 'medium' | 'high';

export type AutonomyLadderTier =
  | 'L0_advisory'
  | 'L1_propose'
  | 'L2_auto_within_guardrail'
  | 'L3_auto_with_notify';

/** ลำดับ tier (ต่ำ→สูง) สำหรับเปรียบเทียบ ≤ */
export const TIER_RANK: Record<AutonomyLadderTier, number> = {
  L0_advisory: 0,
  L1_propose: 1,
  L2_auto_within_guardrail: 2,
  L3_auto_with_notify: 3,
};

/** เพดาน tier สูงสุดที่ phase นี้อนุญาต (Req 19.5/19.11) — clamp ทุก action ≤ L1 */
export const PHASE_MAX_TIER: AutonomyLadderTier = 'L1_propose';

/** PFMEA risk row จาก Knowledge_Export (รูปแบบ field ตาม _knowledge-export.json) */
export interface PfmeaRiskRow {
  processStep: string;
  /** 'High' | 'Medium' | 'Low' — actionPriority ของ AIAG-VDA */
  actionPriority?: string;
  /** 'computed' | 'severity_only' | 'not_assessed' */
  rpnStatus?: string;
}

/** แถวใน action_type_registry */
export interface ActionTypeEntry {
  actionType: string;
  riskClass: RiskClass;
  maxAllowedTier: AutonomyLadderTier;
  r02Bound: boolean;
  riskSource: 'manual' | 'derived';
  processStep?: string | null;
}

/**
 * Req 19.3 — derive risk_class จาก PFMEA rows ของ process_step (fail-safe ceiling).
 *   - ไม่มีแถวของ step           → high (fail-safe)
 *   - มีแถว rpnStatus ≠ computed → high (severity_only / not_assessed → fail-safe)
 *   - actionPriority High        → high
 *   - actionPriority Medium      → medium
 *   - else                       → low
 * mirror SQL derive_risk_from_export ทุกบรรทัด.
 */
export function deriveRiskFromExport(
  processStep: string,
  allRows: readonly PfmeaRiskRow[],
): RiskClass {
  const rows = allRows.filter((r) => r.processStep === processStep);
  if (rows.length === 0) return 'high'; // step ไม่มีแถว → fail-safe
  if (rows.some((r) => (r.rpnStatus ?? '') !== 'computed')) return 'high'; // uncomputed → fail-safe ceiling
  if (rows.some((r) => r.actionPriority === 'High')) return 'high';
  if (rows.some((r) => r.actionPriority === 'Medium')) return 'medium';
  return 'low';
}

/** Req 19.5/19.11 — clamp tier ลงให้ ≤ PHASE_MAX_TIER (L2/L3 → L1) */
export function clampTierForPhase(tier: AutonomyLadderTier): AutonomyLadderTier {
  return TIER_RANK[tier] > TIER_RANK[PHASE_MAX_TIER] ? PHASE_MAX_TIER : tier;
}

/** ข้อผิดพลาดเมื่อ classify action ที่ไม่ได้ลงทะเบียน (Req 19.6) */
export class UnregisteredActionTypeError extends Error {
  constructor(public readonly actionType: string) {
    super(`unregistered action_type: ${actionType}`);
    this.name = 'UnregisteredActionTypeError';
  }
}

/**
 * Req 19.4/19.5/19.6/19.11 — classify_autonomy_tier:
 * lookup เท่านั้น (ไม่มี execute path); unregistered → throw; clamp ผล ≤ L1 ใน phase นี้.
 */
export function classifyAutonomyTier(
  registry: ReadonlyMap<string, ActionTypeEntry>,
  actionType: string,
): AutonomyLadderTier {
  const entry = registry.get(actionType);
  if (entry === undefined) throw new UnregisteredActionTypeError(actionType);
  return clampTierForPhase(entry.maxAllowedTier);
}

// ---------------------------------------------------------------------------
// Invariant validators — mirror DB CHECK constraints (สำหรับ property test + guard)
// ---------------------------------------------------------------------------

/** REG-1 (Req 19.1/19.2): r02_bound ⇒ high. คืน true ถ้า "ถูกต้อง" (constraint satisfied) */
export function satisfiesR02ImpliesHigh(entry: ActionTypeEntry): boolean {
  return !entry.r02Bound || entry.riskClass === 'high';
}

/** REG-2 (Req 19.2 invariant ถาวร): risk≠low ⇒ tier ≤ L1. คืน true ถ้าถูกต้อง */
export function satisfiesCeilingForRisk(entry: ActionTypeEntry): boolean {
  return entry.riskClass === 'low' || TIER_RANK[entry.maxAllowedTier] <= TIER_RANK.L1_propose;
}

/** REG-3 (Req 19.11 phase cap): ทุก row (รวม low) ⇒ tier ≤ L1. คืน true ถ้าถูกต้อง */
export function satisfiesPhaseCap(entry: ActionTypeEntry): boolean {
  return TIER_RANK[entry.maxAllowedTier] <= TIER_RANK[PHASE_MAX_TIER];
}

/** รวมทั้ง 3 invariant — ใช้ validate ก่อน upsert (กันค่าที่ DB จะ reject) */
export function isValidRegistryEntry(entry: ActionTypeEntry): boolean {
  return (
    satisfiesR02ImpliesHigh(entry) &&
    satisfiesCeilingForRisk(entry) &&
    satisfiesPhaseCap(entry)
  );
}
