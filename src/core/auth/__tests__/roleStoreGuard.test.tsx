/**
 * @vitest-environment jsdom
 */

/**
 * roleStoreGuard.test.tsx - S18 L7 Slices 2-3: role store + RequireRole guard
 *
 * - useRoleStore persists the raw role string to the legacy key
 *   'monolith.user.role' so getCurrentRole() (non-React readers) stays in sync
 * - RequireRole is reactive: switching role re-renders the guard
 * - RequireRole no longer bounces silently: default fallback is the
 *   RoleGateDialog explaining which roles the page is for
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

import { useRoleStore } from '../useRoleStore';
import { RequireRole } from '../guards';
import { getCurrentRole } from '../roles';

describe('useRoleStore (S18 L7 Slice 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    useRoleStore.setState({ role: 'DESIGNER' });
  });

  afterEach(() => {
    cleanup();
  });

  it('setRole persists the raw value getCurrentRole() reads', () => {
    useRoleStore.getState().setRole('FACTORY');

    expect(useRoleStore.getState().role).toBe('FACTORY');
    expect(localStorage.getItem('monolith.user.role')).toBe('FACTORY');
    expect(getCurrentRole()).toBe('FACTORY');
  });
});

describe('RequireRole guard (S18 L7 Slice 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    useRoleStore.setState({ role: 'DESIGNER' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children when the current role is allowed', () => {
    useRoleStore.setState({ role: 'FACTORY' });
    render(
      <RequireRole allow={['FACTORY', 'ADMIN']}>
        <div>factory-secret</div>
      </RequireRole>
    );
    expect(screen.getByText('factory-secret')).toBeInTheDocument();
  });

  it('shows the RoleGateDialog fallback instead of bouncing silently', () => {
    render(
      <RequireRole allow={['FACTORY', 'ADMIN']}>
        <div>factory-secret</div>
      </RequireRole>
    );

    expect(screen.queryByText('factory-secret')).toBeNull();
    // "หน้านี้สำหรับ <roles> — สลับ role หรือติดต่อ admin"
    expect(screen.getAllByText(/หน้านี้สำหรับ/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/สลับ role หรือติดต่อ admin/).length).toBeGreaterThan(0);
  });

  it('re-renders when the role store switches to an allowed role', () => {
    render(
      <RequireRole allow={['FACTORY', 'ADMIN']}>
        <div>factory-secret</div>
      </RequireRole>
    );
    expect(screen.queryByText('factory-secret')).toBeNull();

    act(() => {
      useRoleStore.getState().setRole('FACTORY');
    });

    expect(screen.getByText('factory-secret')).toBeInTheDocument();
  });

  it('still honors an explicit fallback prop', () => {
    render(
      <RequireRole allow={['ADMIN']} fallback={<div>custom-fallback</div>}>
        <div>admin-secret</div>
      </RequireRole>
    );
    expect(screen.queryByText('admin-secret')).toBeNull();
    expect(screen.getByText('custom-fallback')).toBeInTheDocument();
  });
});
