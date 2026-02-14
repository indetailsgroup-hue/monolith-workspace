/**
 * Policy Schemas (G9 Persistence Boundary)
 *
 * Zod schemas for policy data stored in localStorage.
 *
 * @version 1.0.0
 */

import { z } from 'zod';

/**
 * Revocation rule schema
 */
export const RevocationRuleSchema = z.object({
  keyId: z.string().min(1),
  revokedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
  reason: z.string(),
});

/**
 * Local revocation policy schema (editable draft)
 */
export const LocalRevocationPolicySchema = z.object({
  scope: z.enum(['ORG', 'FACTORY', 'PROJECT']),
  scopeId: z.string().optional(),
  updatedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
  updatedBy: z.string(),
  rules: z.array(RevocationRuleSchema),
});

/**
 * Installed policy metadata schema
 */
export const InstalledPolicyMetaSchema = z.object({
  installedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
  installedBy: z.string(),
  source: z.enum(['IMPORT', 'BUNDLE_INSTALL']),
  note: z.string().optional(),
});

export type LocalRevocationPolicy = z.infer<typeof LocalRevocationPolicySchema>;
export type InstalledPolicyMeta = z.infer<typeof InstalledPolicyMetaSchema>;
