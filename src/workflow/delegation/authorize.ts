// Feature: monolith-workflow-copilot — delegation authorization (Req 14.2, 14.3)

export interface DelegationAuthzInput {
  /** Acting_Approver มี C12_Role เพียงพอตาม Process_Step หรือไม่ (has_any_app_role) */
  actingHasSufficientRole: boolean;
}

export type DelegationAuthzResult =
  | { allowed: true }
  | { allowed: false; reason: 'insufficient_role' };

/**
 * Req 14.2/14.3 — อนุญาตการมอบหมาย iff Acting_Approver มีบทบาทเพียงพอตาม Process_Step
 * มิฉะนั้น reject.
 */
export function authorizeDelegation(input: DelegationAuthzInput): DelegationAuthzResult {
  return input.actingHasSufficientRole
    ? { allowed: true }
    : { allowed: false, reason: 'insufficient_role' };
}
