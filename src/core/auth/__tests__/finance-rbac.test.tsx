/** @vitest-environment jsdom */
/**
 * RBAC Middleware Tests — Finance Dashboard Route Access
 *
 * Verifies that:
 * - DESIGNER role CANNOT access Finance Dashboard routes
 * - FACTORY role CANNOT access Finance Dashboard routes
 * - INSTALLER role CANNOT access Finance Dashboard routes
 * - FINANCE role CAN access Finance Dashboard
 * - ADMIN role CAN access Finance Dashboard
 *
 * Tests the RequireRole guard component used in routes/index.tsx:
 *   <RequireRole allow={['FINANCE', 'ADMIN']}> ... </RequireRole>
 *
 * @version 14.1.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RequireRole } from '../guards';
import { setCurrentRole, getCurrentRole } from '../roles';
import type { Role } from '../roles';

// Mock useRoleStore to return the role from localStorage (same as production)
vi.mock('../useRoleStore', () => ({
  useRoleStore: (selector: (state: { role: Role; setRole: (r: Role) => void }) => unknown) => {
    const role = (typeof localStorage !== 'undefined'
      ? localStorage.getItem('monolith.user.role')
      : 'ADMIN') as Role || 'ADMIN';
    return selector({ role, setRole: () => {} });
  },
}));

// Mock RoleGateDialog to avoid importing heavy UI dependency
vi.mock('../../../components/ui/RoleGateDialog', () => ({
  RoleGateDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="role-gate-dialog">Access Denied Dialog</div> : null,
}));

// ============================================================================
// Test helpers
// ============================================================================

function setRole(role: Role) {
  localStorage.setItem('monolith.user.role', role);
  setCurrentRole(role);
}

/**
 * Simulates the route guard from routes/index.tsx:
 *   <RequireRole allow={['FINANCE', 'ADMIN']}> <FinanceDashboard /> </RequireRole>
 */
function FinanceRouteWithGuard() {
  return (
    <RequireRole allow={['FINANCE', 'ADMIN']}>
      <div data-testid="finance-content">Finance Dashboard Content</div>
    </RequireRole>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('RBAC: Finance Dashboard Route Access', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // DENIED roles — must NOT see Finance Dashboard content
  // --------------------------------------------------------------------------

  describe('DESIGNER role (DENIED)', () => {
    beforeEach(() => setRole('DESIGNER'));

    it('cannot access Finance Dashboard — content is NOT rendered', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('finance-content')).toBeNull();
    });

    it('sees the RoleGateDialog fallback explaining required roles', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('role-gate-dialog')).toBeDefined();
    });

    it('getCurrentRole() returns DESIGNER', () => {
      expect(getCurrentRole()).toBe('DESIGNER');
    });
  });

  describe('FACTORY role (DENIED)', () => {
    beforeEach(() => setRole('FACTORY'));

    it('cannot access Finance Dashboard — content is NOT rendered', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('finance-content')).toBeNull();
    });

    it('sees the RoleGateDialog fallback', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('role-gate-dialog')).toBeDefined();
    });
  });

  describe('INSTALLER role (DENIED)', () => {
    beforeEach(() => setRole('INSTALLER'));

    it('cannot access Finance Dashboard — content is NOT rendered', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('finance-content')).toBeNull();
    });

    it('sees the RoleGateDialog fallback', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('role-gate-dialog')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // ALLOWED roles — must see Finance Dashboard content
  // --------------------------------------------------------------------------

  describe('FINANCE role (ALLOWED)', () => {
    beforeEach(() => setRole('FINANCE'));

    it('can access Finance Dashboard — content IS rendered', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('finance-content')).toBeDefined();
      expect(screen.getByText('Finance Dashboard Content')).toBeDefined();
    });

    it('does NOT see the RoleGateDialog', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('role-gate-dialog')).toBeNull();
    });
  });

  describe('ADMIN role (ALLOWED)', () => {
    beforeEach(() => setRole('ADMIN'));

    it('can access Finance Dashboard — content IS rendered', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('finance-content')).toBeDefined();
      expect(screen.getByText('Finance Dashboard Content')).toBeDefined();
    });

    it('does NOT see the RoleGateDialog', () => {
      render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('role-gate-dialog')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('no role set in localStorage defaults to ADMIN (fallback)', () => {
      localStorage.removeItem('monolith.user.role');
      // Without explicit role, the guard falls back based on implementation
      // In production: getCurrentRole() returns from localStorage or default
      render(<FinanceRouteWithGuard />);
      // Should be allowed (ADMIN fallback)
      expect(screen.getByTestId('finance-content')).toBeDefined();
    });

    it('RequireRole with hide=true renders nothing for DESIGNER', () => {
      setRole('DESIGNER');
      render(
        <RequireRole allow={['FINANCE', 'ADMIN']} hide>
          <div data-testid="hidden-content">Hidden</div>
        </RequireRole>,
      );
      expect(screen.queryByTestId('hidden-content')).toBeNull();
      // No dialog either when hide=true
      expect(screen.queryByTestId('role-gate-dialog')).toBeNull();
    });

    it('RequireRole with custom fallback renders fallback for FACTORY', () => {
      setRole('FACTORY');
      render(
        <RequireRole
          allow={['FINANCE', 'ADMIN']}
          fallback={<div data-testid="custom-fallback">ไม่มีสิทธิ์</div>}
        >
          <div data-testid="protected-content">Finance</div>
        </RequireRole>,
      );
      expect(screen.queryByTestId('protected-content')).toBeNull();
      expect(screen.getByTestId('custom-fallback')).toBeDefined();
      expect(screen.getByText('ไม่มีสิทธิ์')).toBeDefined();
    });

    it('role switch from DESIGNER to FINANCE (simulating AppShell role change)', () => {
      setRole('DESIGNER');
      const { rerender } = render(<FinanceRouteWithGuard />);
      expect(screen.queryByTestId('finance-content')).toBeNull();

      // Switch role (simulates user changing role in AppShell)
      setRole('FINANCE');
      rerender(<FinanceRouteWithGuard />);
      expect(screen.getByTestId('finance-content')).toBeDefined();
    });
  });
});
