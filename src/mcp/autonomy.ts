// Feature: monolith-mcp-layer — Autonomy_Tier enforcement ต่อ Tool_Class (Req 4.1, 4.2, 4.3, 4.5, 12.3)
// reuse-not-fork: ใช้ D2 Autonomy Ladder type ของ line-oa/workflow-copilot (ไม่นิยามบันไดใหม่ — Req 4.6/14).

import type { AutonomyLadderTier } from '../workflow/autonomy/registry';
import type { ToolClass } from './domain/types';

/** ผลการตัดสิน autonomy ของ Tool_Invocation หนึ่ง */
export type AutonomyDecision =
  | { route: 'auto'; tier: AutonomyLadderTier } // Read_Tool ภายใต้ guardrail (Req 4.2)
  | { route: 'human_gate'; tier: AutonomyLadderTier }; // Write/Approval → Pending_Invocation (Req 4.3/4.5)

/** tier ที่ "อนุญาตให้ดำเนินการอัตโนมัติ" ตาม D2 (auto-within-guardrail / auto-with-notify) */
export function isAutoTier(tier: AutonomyLadderTier): boolean {
  return tier === 'L2_auto_within_guardrail' || tier === 'L3_auto_with_notify';
}

/**
 * Req 4 — จัด Autonomy_Tier ตาม Tool_Class ก่อนตัดสิน (Req 4.1/4.4):
 *   Read_Tool ที่ tier "อนุญาต auto" (L2/L3)  → auto (ภายใต้ guardrail D2) (Req 4.2)
 *   Read_Tool ที่ tier ไม่อนุญาต auto (L0/L1) → human_gate (fail-safe; ไม่ auto-run ตาม tier ที่ไม่อนุญาต)
 *   Write_Tool/Approval_Tool                  → human_gate เสมอ (human-in-the-loop invariant Req 4.3/4.5)
 * classify ไม่สำเร็จ (toolClass undefined/ไม่รู้จัก) → fail-safe = human_gate (Req 12.3 ไม่ auto-pass).
 */
export function decideAutonomy(
  toolClass: ToolClass | undefined,
  defaultTier: AutonomyLadderTier,
): AutonomyDecision {
  if (toolClass === 'Read_Tool' && isAutoTier(defaultTier)) {
    return { route: 'auto', tier: defaultTier };
  }
  // Read ที่ tier ไม่ใช่ auto / Write_Tool / Approval_Tool / unknown → human gate (fail-safe)
  return { route: 'human_gate', tier: defaultTier };
}

/** true ถ้า Tool_Class นี้ต้องผ่าน Human_Approval_Gate เสมอ (Req 4.3) */
export function requiresHumanGate(toolClass: ToolClass | undefined): boolean {
  return toolClass !== 'Read_Tool';
}
