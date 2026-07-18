/**
 * @vitest-environment jsdom
 */

/**
 * signInPage.test.tsx - S18 L7 Slice 1: SignIn page (email + password)
 *
 * SignIn must call supabase signInWithPassword with the entered credentials
 * and surface auth errors instead of failing silently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signInWithPassword = vi.fn();

vi.mock('../supabaseClient', () => ({
  getAuthStorageKey: (url: string) => `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

import { SignIn } from '../../../pages/SignIn';
import { useSessionStore } from '../useSessionStore';

describe('SignIn page (S18 L7 Slice 1)', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    useSessionStore.setState({ session: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders email + password fields and a sign-in button', () => {
    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits credentials via signInWithPassword and stores the session', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'jwt-x', user: { email: 'dev@example.com' } },
      },
      error: null,
    });

    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'dev@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'secret123',
      })
    );
    await waitFor(() =>
      expect(useSessionStore.getState().session?.user?.email).toBe('dev@example.com')
    );
  });

  it('shows the auth error message when sign-in fails', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'dev@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/Invalid login credentials/)).toBeInTheDocument();
    expect(useSessionStore.getState().session).toBeNull();
  });
});
