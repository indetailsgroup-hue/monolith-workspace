/**
 * src/core/supabase.ts
 *
 * Compatibility shim for people/culture modules.
 *
 * Uses a Proxy so that:
 *   1. Tests can mock this module with `vi.mock('@/core/supabase', ...)` without
 *      triggering the real Supabase client initialisation.
 *   2. Runtime callers always receive a live SupabaseClient (or a clear error
 *      if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set).
 *
 * All new modules under src/people/ and src/culture/ import from here:
 *   import { supabase } from '../core/supabase';
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './auth/supabaseClient';

/**
 * Lazy Proxy — the real client is only resolved on first property access,
 * so the module can be imported freely (including in tests) without throwing
 * during import-time evaluation.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        '[monolith/supabase] Client not initialised. ' +
          'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.',
      );
    }
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
