/**
 * @vitest-environment jsdom
 */

/**
 * appShellSession.test.tsx - S18 L7 Slices 1-3: AppShell chrome
 *
 * - "signed in as <email>" badge + Sign out button when a session exists
 * - role switcher dropdown (presentation-only, server stays authoritative)
 * - MONOLITH logo links to /projects/current
 * - footer shows real values (no hardcoded Homag / Nesting / Panels: 6)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// AppShell reads the live cabinet for footer values; keep the test hermetic.
vi.mock('../../store/useCabinetStore', () => ({
  useCabinetStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cabinet: { panels: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] },
    }),
}));

import { AppShell } from '../../../components/layout/AppShell';
import { useSessionStore } from '../useSessionStore';
import { useRoleStore } from '../useRoleStore';

const ROLE_SWITCHER_LABEL = 'สิทธิ์แสดงผลฝั่งจอ — สิทธิ์จริงอยู่ที่ server';

const baseProject = {
  name: 'Test Cabinet',
  version: '1.0',
  specState: 'DRAFT' as const,
  gateStatus: 'OK' as const,
  gateErrors: [],
  gateWarnings: [],
};

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell
        project={baseProject}
        leftPanel={null}
        viewport={null}
        rightPanel={null}
      />
    </MemoryRouter>
  );
}

describe('AppShell session badge + role switcher (S18 L7)', () => {
  beforeEach(() => {
    localStorage.clear();
    useRoleStore.setState({ role: 'DESIGNER' });
    useSessionStore.setState({ session: null, initialized: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows "signed in as <email>" and a Sign out button when a session exists', async () => {
    useSessionStore.setState({
      session: { user: { email: 'dev@example.com' } } as never,
      initialized: true,
    });

    renderShell();

    expect(screen.getByText(/signed in as dev@example\.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() =>
      expect(screen.queryByText(/signed in as dev@example\.com/)).toBeNull()
    );
    expect(useSessionStore.getState().session).toBeNull();
  });

  it('shows a Sign in link to /login when no session exists', () => {
    renderShell();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('renders a role switcher that persists to the shared monolith.user.role key', () => {
    renderShell();

    const select = screen.getByLabelText(ROLE_SWITCHER_LABEL);
    fireEvent.change(select, { target: { value: 'FACTORY' } });

    expect(useRoleStore.getState().role).toBe('FACTORY');
    // Raw string in the legacy key so getCurrentRole() keeps working unchanged.
    expect(localStorage.getItem('monolith.user.role')).toBe('FACTORY');
  });

  it('links the MONOLITH logo to /projects/current', () => {
    renderShell();
    const logoLink = screen.getByRole('link', { name: /MONOLITH/ });
    expect(logoLink).toHaveAttribute('href', '/projects/current');
  });

  it('footer shows real panel count and drops hardcoded machine claims', () => {
    renderShell();

    // Real value from the cabinet store mock (3 panels)
    expect(screen.getByText('Panels:')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Hardcoded demo values must be gone
    expect(screen.queryByText(/Homag/)).toBeNull();
    expect(screen.queryByText(/Nesting/)).toBeNull();
  });
});
