/**
 * useSessionStore.ts - Supabase auth session store (S18 L7 Slice 1)
 *
 * Zustand store holding the current Supabase session for UI (signed-in badge,
 * SignIn page). supabase-js itself persists the session in localStorage under
 * sb-<ref>-auth-token; this store is only the reactive mirror for React.
 *
 * Presentation-only: server authorization (RLS/Edge) validates the JWT itself.
 */

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

interface SessionState {
  /** Current Supabase session, or null when signed out / not configured */
  session: Session | null;
  /** True once initialize() has run (prevents duplicate listeners) */
  initialized: boolean;
}

interface SessionActions {
  /** Load the persisted session and subscribe to auth state changes */
  initialize: () => Promise<void>;
  /** Sign in with email + password via supabase signInWithPassword */
  signIn: (
    email: string,
    password: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Sign out and clear the local session */
  signOut: () => Promise<void>;
}

type SessionStore = SessionState & SessionActions;

export const useSessionStore = create<SessionStore>()((set, get) => ({
  session: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const client = getSupabaseClient();
    if (!client) return; // env not configured — stay signed out

    const { data } = await client.auth.getSession();
    set({ session: data.session ?? null });

    client.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
  },

  signIn: async (email, password) => {
    const client = getSupabaseClient();
    if (!client) {
      return {
        ok: false,
        error:
          'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)',
      };
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: error.message };
    }

    set({ session: data.session ?? null });
    return { ok: true };
  },

  signOut: async () => {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch {
        // local sign-out still proceeds
      }
    }
    set({ session: null });
  },
}));
