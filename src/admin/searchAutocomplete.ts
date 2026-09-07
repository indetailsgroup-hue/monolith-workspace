/**
 * searchAutocomplete.ts — Autocomplete suggestions from platform_search_logs
 * Returns top matching historical queries for type-ahead
 * v16.7.0
 */

import { supabase } from '../core/auth/supabaseClient';
import { readRaw, remove, writeJson } from '../core/persistence/unsafeStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AutocompleteSuggestion {
  query: string;
  frequency: number;
  lastUsed: string;
}

interface AutocompleteRpcRow {
  query_text: string;
  frequency: number;
  last_used: string;
}

// ─── SQL RPC (defined in migration) ──────────────────────────────────────────

export async function fetchAutocompleteSuggestions(
  prefix: string,
  limit = 8
): Promise<AutocompleteSuggestion[]> {
  if (!prefix.trim() || prefix.trim().length < 2) return [];

  const { data, error } = await supabase.rpc('get_search_suggestions', {
    query_prefix: prefix.trim().toLowerCase(),
    result_limit: limit,
  });

  if (error) {
    console.warn('Autocomplete fetch failed:', error.message);
    return [];
  }

  return ((data || []) as AutocompleteRpcRow[]).map((row) => ({
    query: row.query_text,
    frequency: row.frequency,
    lastUsed: row.last_used,
  }));
}

// ─── Local recent searches (browser-side) ────────────────────────────────────

const RECENT_KEY = 'monolith-recent-searches';
const MAX_RECENT = 10;

export function getRecentSearches(): string[] {
  try {
    const raw = readRaw(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  if (!query.trim()) return;
  const recent = getRecentSearches().filter((q) => q !== query.trim());
  recent.unshift(query.trim());
  writeJson(RECENT_KEY, recent.slice(0, MAX_RECENT));
}

export function clearRecentSearches(): void {
  remove(RECENT_KEY);
}

// ─── Combined suggestions: recent + server ───────────────────────────────────

export interface CombinedSuggestions {
  recent: string[];
  popular: AutocompleteSuggestion[];
}

export async function getCombinedSuggestions(
  prefix: string
): Promise<CombinedSuggestions> {
  const recent = getRecentSearches()
    .filter((q) => q.toLowerCase().includes(prefix.toLowerCase()))
    .slice(0, 3);

  const popular = await fetchAutocompleteSuggestions(prefix);

  return { recent, popular };
}
