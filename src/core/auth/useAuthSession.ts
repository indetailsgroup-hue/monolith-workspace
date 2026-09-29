/**
 * useAuthSession.ts — React hook for Supabase auth session management
 *
 * Provides:
 * - session (Session | null)
 * - user (User | null)
 * - role (Role) derived from JWT claims
 * - isAuthenticated (boolean)
 * - isLoading (initial session check)
 * - login(email, password) → AuthResult
 * - logout()
 *
 * Automatically syncs role to useRoleStore so all guards react in real-time.
 */

import { useState, useEffect, useCallback } from 'react';
import { type Session, type User } from '@supabase/supabase-js';
import { type Role } from './roles';
import { useRoleStore } from './useRoleStore';
import {
  signIn,
  signOut,
  getSession,
  onAuthStateChange,
  deriveRoleFromUser,
  type AuthResult,
} from './supabaseAuth';

export interface AuthSessionState {
  session: Session | null;
  user: User | null;
  role: Role;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setRole = useRoleStore((s) => s.setRole);
  const role = useRoleStore((s) => s.role);

  // Sync role from user JWT
  const syncRole = useCallback(
    (u: User | null) => {
      const derived = deriveRoleFromUser(u);
      setRole(derived);
    },
    [setRole],
  );

  // Initial session check
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const sess = await getSession();
        if (cancelled) return;
        setSession(sess);
        setUser(sess?.user ?? null);
        syncRole(sess?.user ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Auth init failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [syncRole]);

  // Subscribe to auth state changes (token refresh, sign out from another tab)
  useEffect(() => {
    const unsub = onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      syncRole(sess?.user ?? null);
    });

    return unsub;
  }, [syncRole]);

  // Login
  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      setError(null);
      const result = await signIn(email, password);
      if (result.success) {
        setSession(result.session);
        setUser(result.user);
        syncRole(result.user);
      } else {
        setError(result.error);
      }
      return result;
    },
    [syncRole],
  );

  // Logout
  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setUser(null);
    syncRole(null);
  }, [syncRole]);

  return {
    session,
    user,
    role,
    isAuthenticated: !!session?.access_token,
    isLoading,
    error,
    login,
    logout,
  };
}
