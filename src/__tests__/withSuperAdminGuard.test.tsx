/**
 * withSuperAdminGuard.test.tsx
 * Unit tests for the withSuperAdminGuard HOC.
 *
 * Covers:
 *   T-SG-01  renders wrapped component when user IS in super_admins table
 *   T-SG-02  renders <SuperAdminDenied> when user is NOT in super_admins table
 *   T-SG-03  renders <SuperAdminLoading> while the async check is in-flight
 *   T-SG-04  renders <SuperAdminDenied> with reason when a Supabase error occurs
 *   T-SG-05  renders <SuperAdminDenied> when no authenticated user is present
 *   T-SG-06  forwards all props unchanged to the wrapped component
 *   T-SG-07  cleanup — cancels async check on unmount (no state-update-after-unmount)
 */

/// <reference types="vitest/globals" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import withSuperAdminGuard, { SuperAdminDenied } from '../admin/withSuperAdminGuard';

// ─── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('../core/auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc:  vi.fn(),
  },
}));

import { supabase } from '../core/auth/supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockGetUser = supabase.auth.getUser as MockedFunction<
  typeof supabase.auth.getUser
>;

const mockRpc = supabase.rpc as MockedFunction<typeof supabase.rpc>;

/**
 * Configures `supabase.from('super_admins').select(...).eq(...).maybeSingle()`
 * to return the given response.
 */
function mockSuperAdminsQuery(response: {
  data: { user_id: string } | null;
  error: { message: string } | null;
}): void {
  (supabase.from as Mock).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(response),
      }),
    }),
  });
}

/** A simple component used as the wrapped target in all HOC tests. */
interface TargetProps {
  label: string;
  count?: number;
}

function TargetComponent({ label, count = 0 }: TargetProps): React.ReactElement {
  return (
    <div data-testid="target-component">
      <span data-testid="target-label">{label}</span>
      <span data-testid="target-count">{count}</span>
    </div>
  );
}

const GuardedTarget = withSuperAdminGuard(TargetComponent);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('withSuperAdminGuard HOC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── T-SG-01 ──────────────────────────────────────────────────────────────
  it('T-SG-01: renders wrapped component when user IS in super_admins table', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-superadmin-001' } },
      error: null,
    } as never);

    mockSuperAdminsQuery({
      data: { user_id: 'user-superadmin-001' },
      error: null,
    });

    render(<GuardedTarget label="Analytics Panel" count={42} />);

    // Loading state shown first
    expect(screen.getByTestId('super-admin-loading')).toBeInTheDocument();

    // After async resolves, wrapped component should appear
    await waitFor(() => {
      expect(screen.getByTestId('target-component')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('super-admin-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('super-admin-denied')).not.toBeInTheDocument();
  });

  // ── T-SG-02 ──────────────────────────────────────────────────────────────
  it('T-SG-02: renders SuperAdminDenied when user is NOT in super_admins table', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-regular-001' } },
      error: null,
    } as never);

    mockSuperAdminsQuery({ data: null, error: null });

    render(<GuardedTarget label="Analytics Panel" />);

    await waitFor(() => {
      expect(screen.getByTestId('super-admin-denied')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('target-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('super-admin-loading')).not.toBeInTheDocument();
    // No error reason should be shown when it is purely a denial (no error)
    expect(
      screen.queryByTestId('super-admin-denied-reason'),
    ).not.toBeInTheDocument();
  });

  // ── T-SG-03 ──────────────────────────────────────────────────────────────
  it('T-SG-03: renders SuperAdminLoading while the async check is in-flight', async () => {
    // Return a promise that never resolves so the check stays pending
    mockGetUser.mockReturnValue(new Promise(() => {}) as never);

    render(<GuardedTarget label="Analytics Panel" />);

    expect(screen.getByTestId('super-admin-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('target-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('super-admin-denied')).not.toBeInTheDocument();
  });

  // ── T-SG-04 ──────────────────────────────────────────────────────────────
  it('T-SG-04: renders SuperAdminDenied with error reason on Supabase query error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-001' } },
      error: null,
    } as never);

    mockSuperAdminsQuery({
      data: null,
      error: { message: 'relation "super_admins" does not exist' },
    });

    render(<GuardedTarget label="Analytics Panel" />);

    await waitFor(() => {
      expect(screen.getByTestId('super-admin-denied')).toBeInTheDocument();
    });

    const reason = screen.getByTestId('super-admin-denied-reason');
    expect(reason).toHaveTextContent('relation "super_admins" does not exist');
    expect(screen.queryByTestId('target-component')).not.toBeInTheDocument();
  });

  // ── T-SG-05 ──────────────────────────────────────────────────────────────
  it('T-SG-05: renders SuperAdminDenied when no authenticated user is present', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    // from() should NOT be called when user is null
    const fromSpy = supabase.from as Mock;

    render(<GuardedTarget label="Analytics Panel" />);

    await waitFor(() => {
      expect(screen.getByTestId('super-admin-denied')).toBeInTheDocument();
    });

    // Confirms we did not make a DB query for an unauthenticated user
    expect(fromSpy).not.toHaveBeenCalled();
  });

  // ── T-SG-06 ──────────────────────────────────────────────────────────────
  it('T-SG-06: forwards all props unchanged to the wrapped component', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-superadmin-002' } },
      error: null,
    } as never);

    mockSuperAdminsQuery({
      data: { user_id: 'user-superadmin-002' },
      error: null,
    });

    render(<GuardedTarget label="Forwarded Label" count={99} />);

    await waitFor(() => {
      expect(screen.getByTestId('target-component')).toBeInTheDocument();
    });

    expect(screen.getByTestId('target-label')).toHaveTextContent(
      'Forwarded Label',
    );
    expect(screen.getByTestId('target-count')).toHaveTextContent('99');
  });

  // ── T-SG-07 ──────────────────────────────────────────────────────────────
  it('T-SG-07: does not update state after unmount (no act() warning)', async () => {
    // Resolve slowly so we can unmount before it completes
    let resolveUser!: (val: unknown) => void;
    const slowPromise = new Promise((res) => {
      resolveUser = res;
    });
    mockGetUser.mockReturnValue(slowPromise as never);

    const spy = vi.spyOn(console, 'error');

    const { unmount } = render(<GuardedTarget label="Panel" />);

    // Unmount before the promise resolves
    unmount();

    // Now resolve — the `cancelled` flag in the effect should prevent setState
    resolveUser({
      data: { user: { id: 'user-001' } },
      error: null,
    });

    // Wait a tick to let any queued microtasks run
    await Promise.resolve();

    // React 18 raises an act() / no-op setState warning if state is set after unmount
    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('Warning:'),
    );

    spy.mockRestore();
  });

  // ── displayName ──────────────────────────────────────────────────────────
  it('sets displayName to withSuperAdminGuard(TargetComponent)', () => {
    expect(GuardedTarget.displayName).toBe(
      'withSuperAdminGuard(TargetComponent)',
    );
  });
});

// ─── SuperAdminDenied unit tests ─────────────────────────────────────────────

describe('SuperAdminDenied component', () => {
  it('renders access-denied heading and description', () => {
    render(<SuperAdminDenied />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(/restricted to super-administrators/i),
    ).toBeInTheDocument();
  });

  it('renders reason when provided', () => {
    render(<SuperAdminDenied reason="Token expired" />);
    expect(screen.getByTestId('super-admin-denied-reason')).toHaveTextContent(
      'Token expired',
    );
  });

  it('does not render reason element when reason is omitted', () => {
    render(<SuperAdminDenied />);
    expect(
      screen.queryByTestId('super-admin-denied-reason'),
    ).not.toBeInTheDocument();
  });
});

// ─── get_search_suggestions SECURITY INVOKER path ────────────────────────────
//
// These tests verify that withSuperAdminGuard correctly gates a component that
// calls get_search_suggestions via supabase.rpc, and that the SECURITY INVOKER
// backend guard (ERRCODE 42501) is handled gracefully by the wrapped component.

/**
 * Minimal panel that calls get_search_suggestions through supabase.rpc.
 * Mirrors real usage: guard wraps a component; the component fires the RPC
 * only after the HOC confirms super-admin status.
 */
interface SearchSuggestion {
  query_text: string;
  frequency: number;
  last_used: string;
}

interface SearchSuggestionsPanelProps {
  queryPrefix: string;
  limit?: number;
}

function SearchSuggestionsPanel({
  queryPrefix,
  limit = 8,
}: SearchSuggestionsPanelProps): React.ReactElement {
  const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
  const [rpcError, setRpcError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (supabase.rpc as Mock)(
      'get_search_suggestions',
      { query_prefix: queryPrefix, result_limit: limit },
    ).then(
      ({ data, error }: { data: SearchSuggestion[] | null; error: { message: string; code?: string } | null }) => {
        if (error) { setRpcError(error.message); return; }
        setSuggestions(data ?? []);
      },
    );
  }, [queryPrefix, limit]);

  if (rpcError) {
    return <div data-testid="rpc-error">{rpcError}</div>;
  }

  return (
    <ul data-testid="suggestions-list">
      {suggestions.map((s) => (
        <li key={s.query_text} data-testid="suggestion-item">
          {s.query_text}
        </li>
      ))}
    </ul>
  );
}

const GuardedSearchPanel = withSuperAdminGuard(SearchSuggestionsPanel);

describe('withSuperAdminGuard + get_search_suggestions (SECURITY INVOKER)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── T-SG-08 ──────────────────────────────────────────────────────────────
  it(
    'T-SG-08: super-admin passes guard and get_search_suggestions RPC returns results',
    async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'sa-001' } },
        error: null,
      } as never);
      mockSuperAdminsQuery({ data: { user_id: 'sa-001' }, error: null });

      mockRpc.mockResolvedValue({
        data: [
          { query_text: 'laser cut',     frequency: 42, last_used: '2026-08-28T10:00:00Z' },
          { query_text: 'laser engrave', frequency: 17, last_used: '2026-08-27T09:00:00Z' },
        ],
        error: null,
      } as never);

      render(<GuardedSearchPanel queryPrefix="laser" limit={8} />);

      // Wait for the RPC state update, not merely the empty list container that
      // renders one tick earlier. This keeps the assertion deterministic when
      // the full suite is scheduling many async component tests concurrently.
      const items = await screen.findAllByTestId('suggestion-item');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('laser cut');
      expect(items[1]).toHaveTextContent('laser engrave');

      // RPC was called exactly once with the correct parameters
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('get_search_suggestions', {
        query_prefix: 'laser',
        result_limit: 8,
      });
    },
  );

  // ── T-SG-09 ──────────────────────────────────────────────────────────────
  it(
    'T-SG-09: non-super-admin is blocked by guard; get_search_suggestions RPC is never called',
    async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-regular-002' } },
        error: null,
      } as never);
      mockSuperAdminsQuery({ data: null, error: null });

      render(<GuardedSearchPanel queryPrefix="laser" />);

      await waitFor(() => {
        expect(screen.getByTestId('super-admin-denied')).toBeInTheDocument();
      });

      // Wrapped component was never mounted — RPC must never have been called
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  // ── T-SG-10 ──────────────────────────────────────────────────────────────
  it(
    'T-SG-10: super-admin passes UI guard but RPC returns insufficient_privilege (42501) — component shows error',
    async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'sa-002' } },
        error: null,
      } as never);
      mockSuperAdminsQuery({ data: { user_id: 'sa-002' }, error: null });

      // Simulate the SECURITY INVOKER backend guard raising ERRCODE 42501
      mockRpc.mockResolvedValue({
        data: null,
        error: {
          message:
            'Forbidden: get_search_suggestions is restricted to platform super-administrators',
          code: '42501',
        },
      } as never);

      render(<GuardedSearchPanel queryPrefix="material" />);

      await waitFor(() => {
        expect(screen.getByTestId('rpc-error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rpc-error')).toHaveTextContent(
        'Forbidden: get_search_suggestions is restricted to platform super-administrators',
      );
      expect(screen.queryByTestId('suggestions-list')).not.toBeInTheDocument();
    },
  );

  // ── T-SG-11 ──────────────────────────────────────────────────────────────
  it(
    'T-SG-11: forwards custom result_limit prop to the get_search_suggestions RPC call',
    async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'sa-003' } },
        error: null,
      } as never);
      mockSuperAdminsQuery({ data: { user_id: 'sa-003' }, error: null });
      mockRpc.mockResolvedValue({ data: [], error: null } as never);

      render(<GuardedSearchPanel queryPrefix="cut" limit={5} />);

      await waitFor(() => {
        expect(screen.getByTestId('suggestions-list')).toBeInTheDocument();
      });

      expect(mockRpc).toHaveBeenCalledWith('get_search_suggestions', {
        query_prefix: 'cut',
        result_limit: 5,
      });
    },
  );

  // ── T-SG-12 ──────────────────────────────────────────────────────────────
  it(
    'T-SG-12: super-admin passes guard but session expires mid-RPC call — component shows JWT error',
    async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'sa-005' } },
        error: null,
      } as never);
      mockSuperAdminsQuery({ data: { user_id: 'sa-005' }, error: null });

      // Simulate Supabase session expiry during the RPC call (PGRST301 — JWT expired)
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'JWT expired', code: 'PGRST301' },
      } as never);

      render(<GuardedSearchPanel queryPrefix="shelf" />);

      await waitFor(() => {
        expect(screen.getByTestId('rpc-error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rpc-error')).toHaveTextContent('JWT expired');
      expect(screen.queryByTestId('suggestions-list')).not.toBeInTheDocument();

      expect(mockRpc).toHaveBeenCalledWith('get_search_suggestions', {
        query_prefix: 'shelf',
        result_limit: 8,
      });
    },
  );
});
