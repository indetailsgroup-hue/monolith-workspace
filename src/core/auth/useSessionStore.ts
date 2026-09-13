/**
 * useSessionStore.ts - Supabase auth session store (S18 L7 Slice 1)
 *
 * Zustand store holding the current Supabase session for UI (signed-in badge,
 * SignIn page). supabase-js itself persists the session in localStorage under
 * sb-<ref>-auth-token; this store is only the reactive mirror for React.
 *
 * Session changes also invalidate pending bearer lookups on this page.
 * Server authorization (RLS/Edge) still validates the JWT itself.
 */

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';
import { updateRequestAuthSession } from './requestAuthHeaders';
import { useTenantStore } from '../../tenant/tenantStore';

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

export const useSessionStore = create<SessionStore>()((set, get) => {
  let authVersion = 0;
  let signInOperation = 0;
  let locallySignedOut = false;
  const publishSession = (session: Session | null) => {
    authVersion += 1;
    // Delayed SDK events cannot undo this page's explicit logout intent.
    if (locallySignedOut && session) return;
    const actorId = session?.user?.id;
    updateRequestAuthSession(actorId ?? null);
    const previousActorId = get().session?.user?.id;
    const tenant = useTenantStore.getState();
    if (!actorId || (previousActorId && previousActorId !== actorId) || tenant.currentMember?.userId !== actorId) {
      try {
        tenant.clear();
      } catch {
        // The in-memory reset precedes persistence; storage failure must not block auth changes.
      }
    }
    set({ session });
  };
  return {
  session: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const client = getSupabaseClient();
    if (!client) {
      publishSession(null);
      return;
    }

    const observedVersion = authVersion;
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') signInOperation += 1;
      publishSession(session);
    });
    try {
      const { data, error } = await client.auth.getSession();
      if (observedVersion === authVersion) publishSession(error ? null : data.session ?? null);
    } catch {
      if (observedVersion === authVersion) publishSession(null);
    }
  },

  signIn: async (email, password) => {
    const operation = ++signInOperation;
    authVersion += 1;
    locallySignedOut = false;
    const client = getSupabaseClient();
    if (!client) {
      return {
        ok: false,
        error:
          'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)',
      };
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (operation !== signInOperation) {
      return { ok: false, error: 'Sign-in canceled by a newer authentication change / การเข้าสู่ระบบถูกยกเลิกหลังสถานะการเข้าสู่ระบบเปลี่ยน' };
    }
    if (error) {
      return { ok: false, error: error.message };
    }

    publishSession(data.session ?? null);
    return { ok: true };
  },

  signOut: async () => {
    // Invalidate pending bootstrap before waiting for the remote sign-out.
    signInOperation += 1;
    locallySignedOut = true;
    publishSession(null);
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch {
        // local sign-out still proceeds
      }
    }
  },
  };
});
