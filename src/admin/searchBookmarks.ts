/**
 * searchBookmarks.ts — Saved search bookmarks for Super Admin
 * Pin frequently-used queries for quick access
 * v16.7.0
 */

import { supabase } from '../core/auth/supabaseClient';
import type { SearchEntityType } from './platformSearch';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchBookmark {
  id: string;
  userId: string;
  label: string;
  query: string;
  entityTypes: SearchEntityType[];
  orgFilter?: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface CreateBookmarkParams {
  label: string;
  query: string;
  entityTypes: SearchEntityType[];
  orgFilter?: string;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function fetchBookmarks(): Promise<SearchBookmark[]> {
  const { data, error } = await supabase
    .from('search_bookmarks')
    .select('*')
    .order('use_count', { ascending: false });

  if (error) throw new Error(`Failed to fetch bookmarks: ${error.message}`);

  return (data || []).map(mapRow);
}

export async function createBookmark(params: CreateBookmarkParams): Promise<SearchBookmark> {
  const { data, error } = await supabase
    .from('search_bookmarks')
    .insert({
      label: params.label,
      query: params.query,
      entity_types: params.entityTypes,
      org_filter: params.orgFilter || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create bookmark: ${error.message}`);
  return mapRow(data);
}

export async function deleteBookmark(id: string): Promise<void> {
  const { error } = await supabase
    .from('search_bookmarks')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete bookmark: ${error.message}`);
}

export async function incrementBookmarkUse(id: string): Promise<void> {
  const { error } = await supabase.rpc('increment_bookmark_use', { bookmark_id: id });
  if (error) console.warn('Bookmark use increment failed:', error.message);
}

export async function updateBookmarkLabel(id: string, label: string): Promise<void> {
  const { error } = await supabase
    .from('search_bookmarks')
    .update({ label })
    .eq('id', id);

  if (error) throw new Error(`Failed to update bookmark: ${error.message}`);
}

// ─── Row Mapper ──────────────────────────────────────────────────────────────

function mapRow(row: any): SearchBookmark {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    query: row.query,
    entityTypes: row.entity_types || ['job', 'member', 'invoice'],
    orgFilter: row.org_filter || undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || row.created_at,
    useCount: row.use_count || 0,
  };
}
