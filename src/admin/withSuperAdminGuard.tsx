/**
 * withSuperAdminGuard.tsx
 * v1.0.0 — 2026-08-28
 *
 * Higher-order component that gates access to super-admin-only UI panels.
 * Authorization is determined by a live query against the `super_admins` table
 * (row presence ↔ authorization) rather than JWT claims, which carry no
 * `is_super_admin` field in this codebase.
 *
 * Usage:
 *   export const GuardedPlatformSearchPanel = withSuperAdminGuard(PlatformSearchPanel);
 */

import React, {
  ComponentType,
  useEffect,
  useState,
  ReactElement,
} from 'react';
import { supabase } from '../core/auth/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape returned by the super_admins table membership check. */
interface SuperAdminCheckResult {
  /** null while the async check is in-flight. */
  isSuperAdmin: boolean | null;
  /** Non-null when a network/auth error occurred during the check. */
  error: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Checks whether the currently authenticated user has a row in `super_admins`.
 * Returns { isSuperAdmin: null, error: null } while loading.
 */
function useSuperAdminCheck(): SuperAdminCheckResult {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const {
          data: { user },
          error: sessionError,
        } = await supabase.auth.getUser();

        if (sessionError) {
          if (!cancelled) {
            setError(sessionError.message);
            setIsSuperAdmin(false);
          }
          return;
        }

        if (!user) {
          if (!cancelled) {
            setIsSuperAdmin(false);
          }
          return;
        }

        const { data, error: queryError } = await supabase
          .from('super_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (queryError) {
          if (!cancelled) {
            setError(queryError.message);
            setIsSuperAdmin(false);
          }
          return;
        }

        if (!cancelled) {
          setIsSuperAdmin(data !== null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsSuperAdmin(false);
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isSuperAdmin, error };
}

// ─── Fallback components ───────────────────────────────────────────────────────

/** Shown while the super-admin check is in-flight. */
function SuperAdminLoading(): ReactElement {
  return (
    <div
      data-testid="super-admin-loading"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: '#6b7280',
        fontSize: '0.875rem',
      }}
    >
      <span>Verifying access…</span>
    </div>
  );
}

/** Shown when the user is not in the super_admins table (or auth failed). */
export function SuperAdminDenied({
  reason,
}: {
  reason?: string;
}): ReactElement {
  return (
    <div
      data-testid="super-admin-denied"
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 2rem',
        gap: '0.75rem',
        color: '#991b1b',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      <strong style={{ fontSize: '1rem' }}>Access Denied</strong>
      <p style={{ margin: 0 }}>
        This panel is restricted to super-administrators.
      </p>
      {reason && (
        <p
          data-testid="super-admin-denied-reason"
          style={{ margin: 0, color: '#b91c1c', fontFamily: 'monospace' }}
        >
          {reason}
        </p>
      )}
    </div>
  );
}

// ─── HOC ──────────────────────────────────────────────────────────────────────

/**
 * Wraps `WrappedComponent` so it is only rendered when the authenticated user
 * has a row in `public.super_admins`.
 *
 * - While the check is in-flight  → renders `<SuperAdminLoading />`
 * - On denial or auth error       → renders `<SuperAdminDenied />`
 * - On success                    → renders `<WrappedComponent {...props} />`
 *
 * All props are forwarded unchanged.
 */
function withSuperAdminGuard<P extends object>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P> {
  const displayName =
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component';

  function GuardedComponent(props: P): ReactElement {
    const { isSuperAdmin, error } = useSuperAdminCheck();

    if (isSuperAdmin === null && error === null) {
      return <SuperAdminLoading />;
    }

    if (!isSuperAdmin) {
      return <SuperAdminDenied reason={error ?? undefined} />;
    }

    return <WrappedComponent {...props} />;
  }

  GuardedComponent.displayName = `withSuperAdminGuard(${displayName})`;
  return GuardedComponent;
}

export default withSuperAdminGuard;
