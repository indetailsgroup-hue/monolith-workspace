/**
 * Default Export Policy
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Safe default policy for factory export
 *
 * v1.0: Initial default policy
 */

import type { ExportPolicy } from './policyTypes';

/**
 * Default export policy (safe defaults).
 * MVP: Only allows CSV format with verified bundle and 1 approval.
 */
export const DEFAULT_EXPORT_POLICY: ExportPolicy = {
  version: 'export-policy.v1',
  allowFormats: ['CUTLIST_CSV'], // MVP: Only CSV enabled
  requireVerifiedBundle: true,
  requireApprovalsMin: 1,
};
