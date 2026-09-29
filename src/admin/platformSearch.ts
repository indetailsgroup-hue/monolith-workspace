/**
 * Platform-Wide Search — Super Admin
 * Searches across jobs, members, and invoices for all tenants
 * v16.5.0
 */

import { supabase } from '../core/auth/supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SearchEntityType = 'job' | 'member' | 'invoice';

export interface SearchResult {
  id: string;
  entityType: SearchEntityType;
  title: string;
  subtitle: string;
  orgId: string;
  orgName: string;
  matchField: string;
  matchSnippet: string;
  createdAt: string;
  url: string;
}

export interface PlatformSearchOptions {
  query: string;
  entityTypes?: SearchEntityType[];
  orgId?: string; // filter to specific tenant
  limit?: number;
  offset?: number;
}

export interface PlatformSearchResponse {
  results: SearchResult[];
  totalCount: number;
  queryTimeMs: number;
  facets: {
    byType: Record<SearchEntityType, number>;
    byOrg: { orgId: string; orgName: string; count: number }[];
  };
}

// ─── Search Functions ────────────────────────────────────────────────────────

export async function searchJobs(
  query: string,
  orgId?: string,
  limit = 20,
  offset = 0
): Promise<{ results: SearchResult[]; count: number }> {
  const rpcParams: Record<string, unknown> = {
    search_query: query,
    result_limit: limit,
    result_offset: offset,
  };
  if (orgId) rpcParams.filter_org_id = orgId;

  const { data, error } = await supabase.rpc('platform_search_jobs', rpcParams);

  if (error) throw new Error(`Job search failed: ${error.message}`);

  const results: SearchResult[] = (data || []).map((row: any) => ({
    id: row.id,
    entityType: 'job' as const,
    title: row.title || row.job_number || `Job #${row.id.slice(0, 8)}`,
    subtitle: `${row.status} — ${row.customer_name || 'No customer'}`,
    orgId: row.org_id,
    orgName: row.org_name || 'Unknown',
    matchField: row.match_field,
    matchSnippet: row.match_snippet,
    createdAt: row.created_at,
    url: `/jobs/${row.id}`,
  }));

  return { results, count: data?.[0]?.total_count || results.length };
}

export async function searchMembers(
  query: string,
  orgId?: string,
  limit = 20,
  offset = 0
): Promise<{ results: SearchResult[]; count: number }> {
  const rpcParams: Record<string, unknown> = {
    search_query: query,
    result_limit: limit,
    result_offset: offset,
  };
  if (orgId) rpcParams.filter_org_id = orgId;

  const { data, error } = await supabase.rpc('platform_search_members', rpcParams);

  if (error) throw new Error(`Member search failed: ${error.message}`);

  const results: SearchResult[] = (data || []).map((row: any) => ({
    id: row.id,
    entityType: 'member' as const,
    title: row.display_name || row.email,
    subtitle: `${row.role} at ${row.org_name || 'Unknown org'}`,
    orgId: row.org_id,
    orgName: row.org_name || 'Unknown',
    matchField: row.match_field,
    matchSnippet: row.match_snippet,
    createdAt: row.joined_at || row.created_at,
    url: `/admin/tenants/${row.org_id}/members`,
  }));

  return { results, count: data?.[0]?.total_count || results.length };
}

export async function searchInvoices(
  query: string,
  orgId?: string,
  limit = 20,
  offset = 0
): Promise<{ results: SearchResult[]; count: number }> {
  const rpcParams: Record<string, unknown> = {
    search_query: query,
    result_limit: limit,
    result_offset: offset,
  };
  if (orgId) rpcParams.filter_org_id = orgId;

  const { data, error } = await supabase.rpc('platform_search_invoices', rpcParams);

  if (error) throw new Error(`Invoice search failed: ${error.message}`);

  const results: SearchResult[] = (data || []).map((row: any) => ({
    id: row.id,
    entityType: 'invoice' as const,
    title: row.invoice_number || `INV-${row.id.slice(0, 8)}`,
    subtitle: `${row.status} — ฿${Number(row.total_amount || 0).toLocaleString()}`,
    orgId: row.org_id,
    orgName: row.org_name || 'Unknown',
    matchField: row.match_field,
    matchSnippet: row.match_snippet,
    createdAt: row.issued_at || row.created_at,
    url: `/invoices/${row.id}`,
  }));

  return { results, count: data?.[0]?.total_count || results.length };
}

// ─── Unified Platform Search ─────────────────────────────────────────────────

export async function platformSearch(
  options: PlatformSearchOptions
): Promise<PlatformSearchResponse> {
  const {
    query,
    entityTypes = ['job', 'member', 'invoice'],
    orgId,
    limit = 20,
    offset = 0,
  } = options;

  if (!query.trim()) {
    return {
      results: [],
      totalCount: 0,
      queryTimeMs: 0,
      facets: { byType: { job: 0, member: 0, invoice: 0 }, byOrg: [] },
    };
  }

  const startTime = performance.now();

  // Execute searches in parallel for included entity types
  const searches = await Promise.allSettled([
    entityTypes.includes('job')
      ? searchJobs(query, orgId, limit, offset)
      : Promise.resolve({ results: [], count: 0 }),
    entityTypes.includes('member')
      ? searchMembers(query, orgId, limit, offset)
      : Promise.resolve({ results: [], count: 0 }),
    entityTypes.includes('invoice')
      ? searchInvoices(query, orgId, limit, offset)
      : Promise.resolve({ results: [], count: 0 }),
  ]);

  const [jobsResult, membersResult, invoicesResult] = searches.map((s) =>
    s.status === 'fulfilled' ? s.value : { results: [], count: 0 }
  );

  // Merge and sort by relevance (most recent first as proxy)
  const allResults = [
    ...jobsResult.results,
    ...membersResult.results,
    ...invoicesResult.results,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Build facets
  const byType: Record<SearchEntityType, number> = {
    job: jobsResult.count,
    member: membersResult.count,
    invoice: invoicesResult.count,
  };

  const orgMap = new Map<string, { orgName: string; count: number }>();
  allResults.forEach((r) => {
    const existing = orgMap.get(r.orgId);
    if (existing) {
      existing.count++;
    } else {
      orgMap.set(r.orgId, { orgName: r.orgName, count: 1 });
    }
  });

  const byOrg = Array.from(orgMap.entries())
    .map(([orgId, { orgName, count }]) => ({ orgId, orgName, count }))
    .sort((a, b) => b.count - a.count);

  const queryTimeMs = Math.round(performance.now() - startTime);

  return {
    results: allResults.slice(0, limit),
    totalCount: jobsResult.count + membersResult.count + invoicesResult.count,
    queryTimeMs,
    facets: { byType, byOrg },
  };
}

// ─── Debounced Search Helper ─────────────────────────────────────────────────

export function createDebouncedSearch(delayMs = 300) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (
    options: PlatformSearchOptions,
    callback: (response: PlatformSearchResponse) => void
  ) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      const response = await platformSearch(options);
      callback(response);
    }, delayMs);
  };
}
