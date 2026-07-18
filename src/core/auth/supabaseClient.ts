/**
 * supabaseClient.ts - Shared Supabase browser client (S18 L7 Slice 1)
 *
 * Single supabase-js client for auth (login/session). The session persists in
 * localStorage under `sb-<ref>-auth-token` — the exact pattern that
 * src/factory/api/client.ts authHeaders() scans (/^sb-.+-auth-token$/), so the
 * factory API picks up the end-user JWT without importing this module.
 *
 * Config comes from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. When either is
 * missing (local dev without hosted env) the client is null and callers must
 * degrade gracefully — never throw at import time.
 *
 * NOTE: client-side auth/role state is presentation-only. Server authorization
 * (RLS + Edge Functions) never trusts anything derived here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Derive the localStorage key supabase-js uses for the session.
 * Must always match /^sb-.+-auth-token$/ (contract with factory authHeaders()).
 */
export function getAuthStorageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${ref}-auth-token`;
}

let cachedClient: SupabaseClient | null | undefined;

/**
 * Get the shared Supabase client, or null when env config is missing.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Pin the storage key explicitly so the authHeaders() contract cannot
      // drift with supabase-js internals.
      storageKey: getAuthStorageKey(SUPABASE_URL),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cachedClient;
}
