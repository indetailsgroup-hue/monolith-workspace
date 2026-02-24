/**
 * Export Policy Evaluation
 *
 * Step 9: Server-side policy enforcement
 *
 * Features:
 * - Rule-based policy evaluation
 * - Format-specific rules
 * - Factory-specific rules
 * - Verification-dependent rules
 */

import type {
  ExportPolicy,
  PolicyRule,
  PolicyReport,
  PolicyDecision,
  ExportRequest,
  VerifyReport,
  Manifest,
} from '../types.js';

// ============================================================================
// Default Policy
// ============================================================================

export const DEFAULT_EXPORT_POLICY: ExportPolicy = {
  version: '1.0',
  name: 'DEFAULT_FACTORY_POLICY',
  rules: [
    {
      id: 'REQUIRE_VALID_SIG',
      effect: 'DENY',
      condition: { type: 'VERIFY_FAILED' },
      reason: 'Bundle verification must pass',
    },
    {
      id: 'ALLOW_ALL_FORMATS',
      effect: 'ALLOW',
      condition: { type: 'ALWAYS' },
      reason: 'Default allow for verified bundles',
    },
  ],
  defaultEffect: 'DENY',
};

// ============================================================================
// Policy Evaluation
// ============================================================================

export interface PolicyEvalInput {
  policy: ExportPolicy;
  request: ExportRequest;
  verify: VerifyReport;
  manifest: Manifest | null;
}

/**
 * Evaluate export policy.
 * Returns a report with decisions from each matching rule.
 */
export function evalExportPolicy(input: PolicyEvalInput): PolicyReport {
  const { policy, request, verify, manifest } = input;
  const decisions: PolicyDecision[] = [];

  // Evaluate each rule in order
  for (const rule of policy.rules) {
    const matches = evaluateCondition(rule, request, verify, manifest);

    if (matches) {
      decisions.push({
        effect: rule.effect,
        reason: rule.reason,
      });

      // First matching DENY or REQUIRE_APPROVAL stops evaluation
      if (rule.effect === 'DENY' || rule.effect === 'REQUIRE_APPROVAL') {
        break;
      }
    }
  }

  // If no rules matched, use default effect
  if (decisions.length === 0) {
    decisions.push({
      effect: policy.defaultEffect,
      reason: 'No matching rules, using default policy',
    });
  }

  // Check final decision
  const finalEffect = decisions[decisions.length - 1].effect;
  const ok = finalEffect === 'ALLOW';

  return { ok, decisions };
}

// ============================================================================
// Condition Evaluation
// ============================================================================

function evaluateCondition(
  rule: PolicyRule,
  request: ExportRequest,
  verify: VerifyReport,
  manifest: Manifest | null
): boolean {
  const condition = rule.condition;

  switch (condition.type) {
    case 'ALWAYS':
      return true;

    case 'VERIFY_FAILED':
      return !verify.ok;

    case 'FORMAT_MATCH':
      return request.format === condition.format;

    case 'FACTORY_MATCH':
      return manifest?.factoryId === condition.factoryId;

    default:
      return false;
  }
}

// ============================================================================
// Policy Helpers
// ============================================================================

/**
 * Create a strict policy that only allows specific formats.
 */
export function createFormatRestrictedPolicy(
  allowedFormats: string[],
  factoryId?: string
): ExportPolicy {
  const rules: PolicyRule[] = [
    // Always require valid signature
    {
      id: 'REQUIRE_VALID_SIG',
      effect: 'DENY',
      condition: { type: 'VERIFY_FAILED' },
      reason: 'Bundle verification must pass',
    },
  ];

  // If factory-specific, add factory check
  if (factoryId) {
    rules.push({
      id: `REQUIRE_FACTORY_${factoryId}`,
      effect: 'DENY',
      condition: { type: 'FACTORY_MATCH', factoryId },
      reason: `Bundle must be for factory ${factoryId}`,
    });
  }

  // Add allowed formats
  for (const format of allowedFormats) {
    rules.push({
      id: `ALLOW_${format}`,
      effect: 'ALLOW',
      condition: { type: 'FORMAT_MATCH', format },
      reason: `Format ${format} is allowed`,
    });
  }

  return {
    version: '1.0',
    name: `RESTRICTED_POLICY_${allowedFormats.join('_')}`,
    rules,
    defaultEffect: 'DENY',
  };
}

/**
 * Merge multiple policies (first matching rule wins).
 */
export function mergePolicies(policies: ExportPolicy[]): ExportPolicy {
  const allRules: PolicyRule[] = [];

  for (const policy of policies) {
    allRules.push(...policy.rules);
  }

  return {
    version: '1.0',
    name: 'MERGED_POLICY',
    rules: allRules,
    defaultEffect: 'DENY',
  };
}
