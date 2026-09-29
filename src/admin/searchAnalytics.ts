/**
 * searchAnalytics.ts — Data layer for platform search analytics
 * Fetches search usage data and logs searches
 * v16.6.0
 */

import { supabase } from '../core/auth/supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchAnalyticsData {
  totalSearches: number;
  uniqueUsers: number;
  avgQueryTimeMs: number;
  avgResultCount: number;
  zeroResultRate: number;
  searchesPerDay: { date: string; count: number }[];
  topQueries: { query: string; count: number }[];
  topEntityTypes: { type: string; count: number }[];
}

export interface SearchLogEntry {
  id: string;
  userId: string;
  query: string;
  entityTypes: string[];
  orgFilter: string | null;
  resultCount: number;
  queryTimeMs: number;
  clickedResultId: string | null;
  clickedResultType: string | null;
  createdAt: string;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function fetchSearchAnalytics(daysBack = 30): Promise<SearchAnalyticsData> {
  const { data, error } = await supabase.rpc('get_search_analytics', {
    days_back: daysBack,
  });

  if (error) throw new Error(`Analytics fetch failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;

  return {
    totalSearches: row?.total_searches || 0,
    uniqueUsers: row?.unique_users || 0,
    avgQueryTimeMs: Number(row?.avg_query_time_ms || 0),
    avgResultCount: Number(row?.avg_result_count || 0),
    zeroResultRate: Number(row?.zero_result_rate || 0),
    searchesPerDay: row?.searches_per_day || [],
    topQueries: row?.top_queries || [],
    topEntityTypes: row?.top_entity_types || [],
  };
}

export async function logSearch(params: {
  query: string;
  entityTypes: string[];
  orgFilter?: string;
  resultCount: number;
  queryTimeMs: number;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('log_platform_search', {
    search_query: params.query,
    entity_types: params.entityTypes,
    org_filter: params.orgFilter || null,
    result_count: params.resultCount,
    query_time_ms: params.queryTimeMs,
  });

  if (error) {
    console.warn('Search logging failed:', error.message);
    return null;
  }

  return data;
}

export async function logSearchClick(logId: string, resultId: string, resultType: string): Promise<void> {
  await supabase
    .from('platform_search_logs')
    .update({ clicked_result_id: resultId, clicked_result_type: resultType })
    .eq('id', logId);
}
