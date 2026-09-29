/**
 * supabaseAuth.ts — Real Supabase Auth integration for MONOLITH
 *
 * Wraps @supabase/supabase-js auth methods:
 * - signIn (email+password)
 * - signOut
 * - getSession / onAuthStateChange
 * - Role derivation from JWT app_metadata.role
 *
 * ENV: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';
import { type Role, ROLES } from './roles';

// ============================================================================
// Supabase Client Singleton
// ============================================================================

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }

  _client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return _client;
}

/** For testing: inject a mock client */
export function setSupabaseClient(client: SupabaseClient | null): void {
  _client = client;
}

// ============================================================================
// Auth Operations
// ============================================================================

export interface AuthResult {
  success: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
}

/** Sign in with email + password */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { success: false, session: null, user: null, error: error.message };
  }

  return {
    success: true,
    session: data.session,
    user: data.user,
    error: null,
  };
}

/** Sign out and clear session */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  await client.auth.signOut();
}

/** Get current session (returns null if not authenticated) */
export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session;
}

/** Get current user */
export async function getUser(): Promise<User | null> {
  const client = getSupabaseClient();
  const { data } = await client.auth.getUser();
  return data.user;
}

/** Refresh the current session token */
export async function refreshSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.refreshSession();
  if (error) return null;
  return data.session;
}

// ============================================================================
// Role Derivation from JWT
// ============================================================================

/**
 * Extract app role from Supabase user metadata.
 * Priority: app_metadata.role > user_metadata.role > fallback 'DESIGNER'
 *
 * Set via Supabase dashboard or admin API:
 *   supabase.auth.admin.updateUserById(uid, { app_metadata: { role: 'FINANCE' } })
 */
export function deriveRoleFromUser(user: User | null): Role {
  if (!user) return 'DESIGNER';

  const appRole = user.app_metadata?.role as string | undefined;
  if (appRole && ROLES.includes(appRole as Role)) {
    return appRole as Role;
  }

  const userRole = user.user_metadata?.role as string | undefined;
  if (userRole && ROLES.includes(userRole as Role)) {
    return userRole as Role;
  }

  return 'DESIGNER';
}

/**
 * Extract role from a raw JWT access_token (without network call).
 * Decodes the base64url payload segment.
 */
export function deriveRoleFromToken(accessToken: string): Role {
  try {
    const payloadSegment = accessToken.split('.')[1];
    if (!payloadSegment) return 'DESIGNER';

    const payload = JSON.parse(atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/')));
    const role = payload.app_metadata?.role ?? payload.user_metadata?.role;
    if (role && ROLES.includes(role as Role)) {
      return role as Role;
    }
  } catch {
    // malformed token — fall back
  }
  return 'DESIGNER';
}

// ============================================================================
// Auth State Subscription
// ============================================================================

export type AuthStateCallback = (event: string, session: Session | null) => void;

/**
 * Subscribe to auth state changes.
 * Returns unsubscribe function.
 */
export function onAuthStateChange(callback: AuthStateCallback): () => void {
  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}
