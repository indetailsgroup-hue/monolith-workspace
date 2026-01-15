/**
 * Export Policy Types
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - PolicyEffect: ALLOW/DENY decision
 * - ExportPolicy: Policy configuration
 * - PolicyReport: Evaluation result
 *
 * v1.0: Initial policy types
 */

import type { ExportFormat } from '../types';

/** Policy effect */
export type PolicyEffect = 'ALLOW' | 'DENY';

/**
 * Individual policy decision.
 */
export interface PolicyDecision {
  /** Effect of the decision */
  effect: PolicyEffect;
  /** Reason for the decision */
  reason: string;
}

/**
 * Export policy configuration.
 * Can be extended for factory/project-specific policies.
 */
export interface ExportPolicy {
  /** Policy version */
  version: 'export-policy.v1';
  /** Allowed export formats */
  allowFormats: ExportFormat[];
  /** Require verified bundle */
  requireVerifiedBundle: boolean;
  /** Minimum approvals required */
  requireApprovalsMin: number;
}

/**
 * Policy evaluation report.
 */
export interface PolicyReport {
  /** Overall policy result */
  ok: boolean;
  /** All policy decisions */
  decisions: PolicyDecision[];
}
