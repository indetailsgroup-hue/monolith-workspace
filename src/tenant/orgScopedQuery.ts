/**
 * tenant/orgScopedQuery.ts — Utility for org-scoped Supabase queries
 *
 * All data queries in MONOLITH must be scoped to the current organization.
 * This module provides helpers to:
 * - Add org_id filter to any Supabase query
 * - Verify row-level org ownership
 * - Create org-scoped insert helpers
 */

import type { Organization } from './types';

// ============================================================================
// Query Scoping
// ============================================================================

/**
 * Adds org_id = currentOrgId filter to a Supabase query builder.
 * Use this wrapper for every data-fetching query.
 *
 * @example
 * const { data } = await scopeToOrg(
 *   supabase.from('jobs').select('*'),
 *   currentOrg
 * );
 */
export function scopeToOrg<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  org: Organization
): T {
  return query.eq('org_id', org.orgId);
}

/**
 * Adds org_id to an insert payload.
 *
 * @example
 * const payload = withOrgId({ title: 'New Job', ... }, currentOrg);
 * await supabase.from('jobs').insert(payload);
 */
export function withOrgId<T extends Record<string, unknown>>(
  data: T,
  org: Organization
): T & { org_id: string } {
  return { ...data, org_id: org.orgId };
}

/**
 * Batch-adds org_id to an array of insert payloads.
 */
export function withOrgIdBatch<T extends Record<string, unknown>>(
  rows: T[],
  org: Organization
): (T & { org_id: string })[] {
  return rows.map((row) => withOrgId(row, org));
}

/**
 * Verifies that a record belongs to the current org.
 * Use for authorization checks before mutations.
 */
export function assertOrgOwnership(
  record: { org_id?: string },
  org: Organization
): void {
  if (record.org_id !== org.orgId) {
    throw new Error(
      `TENANT_ISOLATION: Record org_id "${record.org_id}" does not match current org "${org.orgId}"`
    );
  }
}

/**
 * Type guard: checks if a record has a matching org_id.
 */
export function belongsToOrg(
  record: { org_id?: string },
  org: Organization
): boolean {
  return record.org_id === org.orgId;
}

// ============================================================================
// RLS Policy Helpers (for Supabase SQL migrations)
// ============================================================================

/**
 * Generates SQL for a standard RLS policy that scopes to org_id.
 * Used by migration generators.
 */
export function generateRlsPolicy(tableName: string): string {
  return `
-- Enable RLS on ${tableName}
ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: users can only see rows belonging to their org
CREATE POLICY "${tableName}_tenant_isolation" ON public.${tableName}
  USING (org_id = (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1));

-- Insert policy: org_id must match user's active org
CREATE POLICY "${tableName}_tenant_insert" ON public.${tableName}
  FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1));
`.trim();
}
