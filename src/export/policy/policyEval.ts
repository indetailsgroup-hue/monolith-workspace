/**
 * Export Policy Evaluator
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Evaluates export policy against request
 * - Checks format, verification, approvals
 *
 * v1.0: Initial policy evaluator (MVP)
 */

import type { ExportPolicy, PolicyReport, PolicyDecision } from './policyTypes';
import type { ExportRequest } from '../types';
import type { VerifyReport } from '../verify/verifyTypes';

/**
 * Manifest structure for policy evaluation.
 */
interface ManifestForPolicy {
  approvals?: Array<{ approverId: string; role: string }>;
}

/**
 * Evaluate export policy.
 *
 * Hook point: You can create resolveEffectivePolicy() that merges
 * global + factory + project policies before calling this function.
 */
export function evalExportPolicy(input: {
  policy: ExportPolicy;
  request: ExportRequest;
  verify: VerifyReport;
  manifest: ManifestForPolicy | null;
}): PolicyReport {
  const decisions: PolicyDecision[] = [];

  // Check verified bundle requirement
  if (input.policy.requireVerifiedBundle && !input.verify.ok) {
    decisions.push({
      effect: 'DENY',
      reason: 'Bundle not verified (verify.ok=false)',
    });
    return { ok: false, decisions };
  }

  // Check format allowance
  if (!input.policy.allowFormats.includes(input.request.format)) {
    decisions.push({
      effect: 'DENY',
      reason: `Format not allowed by policy: ${input.request.format}`,
    });
    return { ok: false, decisions };
  }

  // Check approvals requirement
  const approvals = input.manifest?.approvals?.length ?? 0;
  if (approvals < input.policy.requireApprovalsMin) {
    decisions.push({
      effect: 'DENY',
      reason: `Approvals insufficient: ${approvals} < ${input.policy.requireApprovalsMin} required`,
    });
    return { ok: false, decisions };
  }

  // All checks passed
  decisions.push({
    effect: 'ALLOW',
    reason: 'Policy satisfied',
  });

  return { ok: true, decisions };
}
