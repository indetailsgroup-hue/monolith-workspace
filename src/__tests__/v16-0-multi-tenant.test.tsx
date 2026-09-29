/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ============================================================================
// v16.0 — Multi-Tenant Architecture Tests
// ============================================================================

describe('v16.0 — Multi-Tenant Architecture', () => {
  afterEach(() => cleanup());

  // ==========================================================================
  // Types & Helpers
  // ==========================================================================

  describe('tenant/types.ts — helpers', () => {
    it('generateOrgSlug creates URL-safe slug', async () => {
      const { generateOrgSlug } = await import('../tenant/types');
      expect(generateOrgSlug('DAPH Decor')).toBe('daph-decor');
      expect(generateOrgSlug('  Hello World!  ')).toBe('hello-world');
      expect(generateOrgSlug('Thai บริษัท 123')).toBe('thai-123');
    });

    it('hasPermission checks role hierarchy', async () => {
      const { hasPermission } = await import('../tenant/types');
      const owner = { role: 'OWNER' as const } as any;
      const viewer = { role: 'VIEWER' as const } as any;
      expect(hasPermission(owner, 'ADMIN')).toBe(true);
      expect(hasPermission(viewer, 'DESIGNER')).toBe(false);
    });

    it('isOwnerOrAdmin returns true for OWNER and ADMIN only', async () => {
      const { isOwnerOrAdmin } = await import('../tenant/types');
      expect(isOwnerOrAdmin({ role: 'OWNER' } as any)).toBe(true);
      expect(isOwnerOrAdmin({ role: 'ADMIN' } as any)).toBe(true);
      expect(isOwnerOrAdmin({ role: 'DESIGNER' } as any)).toBe(false);
      expect(isOwnerOrAdmin({ role: 'FINANCE' } as any)).toBe(false);
    });

    it('canAccessFeature checks plan limits', async () => {
      const { canAccessFeature } = await import('../tenant/types');
      const freeOrg = { plan: 'FREE' } as any;
      const proOrg = { plan: 'PROFESSIONAL' } as any;
      expect(canAccessFeature(freeOrg, 'curved_panels')).toBe(false);
      expect(canAccessFeature(proOrg, 'curved_panels')).toBe(true);
    });

    it('isTrialExpired detects expired trials', async () => {
      const { isTrialExpired } = await import('../tenant/types');
      const expired = { status: 'TRIAL', trialEndsAt: '2020-01-01T00:00:00Z' } as any;
      const active = { status: 'TRIAL', trialEndsAt: '2099-01-01T00:00:00Z' } as any;
      const notTrial = { status: 'ACTIVE' } as any;
      expect(isTrialExpired(expired)).toBe(true);
      expect(isTrialExpired(active)).toBe(false);
      expect(isTrialExpired(notTrial)).toBe(false);
    });

    it('PLAN_LIMITS has all 4 plans defined', async () => {
      const { PLAN_LIMITS } = await import('../tenant/types');
      expect(Object.keys(PLAN_LIMITS)).toEqual(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']);
      expect(PLAN_LIMITS.ENTERPRISE.maxUsers).toBe(999);
    });
  });

  // ==========================================================================
  // Org-Scoped Query
  // ==========================================================================

  describe('tenant/orgScopedQuery.ts', () => {
    it('withOrgId adds org_id to payload', async () => {
      const { withOrgId } = await import('../tenant/orgScopedQuery');
      const org = { orgId: 'org-123' } as any;
      const result = withOrgId({ title: 'Test Job' }, org);
      expect(result).toEqual({ title: 'Test Job', org_id: 'org-123' });
    });

    it('withOrgIdBatch adds org_id to all rows', async () => {
      const { withOrgIdBatch } = await import('../tenant/orgScopedQuery');
      const org = { orgId: 'org-456' } as any;
      const rows = [{ a: 1 }, { a: 2 }];
      const result = withOrgIdBatch(rows, org);
      expect(result).toHaveLength(2);
      expect(result[0].org_id).toBe('org-456');
      expect(result[1].org_id).toBe('org-456');
    });

    it('assertOrgOwnership throws on mismatch', async () => {
      const { assertOrgOwnership } = await import('../tenant/orgScopedQuery');
      const org = { orgId: 'org-A' } as any;
      expect(() => assertOrgOwnership({ org_id: 'org-B' }, org)).toThrow('TENANT_ISOLATION');
      expect(() => assertOrgOwnership({ org_id: 'org-A' }, org)).not.toThrow();
    });

    it('belongsToOrg returns boolean', async () => {
      const { belongsToOrg } = await import('../tenant/orgScopedQuery');
      const org = { orgId: 'org-X' } as any;
      expect(belongsToOrg({ org_id: 'org-X' }, org)).toBe(true);
      expect(belongsToOrg({ org_id: 'org-Y' }, org)).toBe(false);
    });

    it('scopeToOrg calls .eq with org_id', async () => {
      const { scopeToOrg } = await import('../tenant/orgScopedQuery');
      const org = { orgId: 'org-scoped' } as any;
      const mockQuery = { eq: (col: string, val: string) => ({ col, val }) };
      const result = scopeToOrg(mockQuery as any, org);
      expect(result).toEqual({ col: 'org_id', val: 'org-scoped' });
    });

    it('generateRlsPolicy produces SQL with table name', async () => {
      const { generateRlsPolicy } = await import('../tenant/orgScopedQuery');
      const sql = generateRlsPolicy('jobs');
      expect(sql).toContain('ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('jobs_tenant_isolation');
      expect(sql).toContain('jobs_tenant_insert');
    });
  });

  // ==========================================================================
  // Tenant Store
  // ==========================================================================

  describe('tenant/tenantStore.ts', () => {
    let useTenantStore: any;

    beforeEach(async () => {
      const mod = await import('../tenant/tenantStore');
      useTenantStore = mod.useTenantStore;
      useTenantStore.getState().clear();
    });

    it('initial state has null org and member', () => {
      const state = useTenantStore.getState();
      expect(state.currentOrg).toBeNull();
      expect(state.currentMember).toBeNull();
    });

    it('setCurrentOrg sets org and member', () => {
      const org = { orgId: 'o1', name: 'Test', plan: 'PROFESSIONAL' } as any;
      const member = { memberId: 'm1', role: 'OWNER' } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      expect(useTenantStore.getState().currentOrg?.orgId).toBe('o1');
      expect(useTenantStore.getState().currentMember?.role).toBe('OWNER');
    });

    it('getPermissions returns full access for OWNER', () => {
      const org = { orgId: 'o1' } as any;
      const member = { memberId: 'm1', role: 'OWNER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      const perms = useTenantStore.getState().getPermissions();
      expect(perms.canManageMembers).toBe(true);
      expect(perms.canManageBilling).toBe(true);
      expect(perms.canCreateJobs).toBe(true);
    });

    it('getPermissions returns restricted access for VIEWER', () => {
      const org = { orgId: 'o1' } as any;
      const member = { memberId: 'm1', role: 'VIEWER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      const perms = useTenantStore.getState().getPermissions();
      expect(perms.canManageMembers).toBe(false);
      expect(perms.canCreateJobs).toBe(false);
      expect(perms.canViewFinance).toBe(false);
    });

    it('hasFeature checks plan features', () => {
      const org = { orgId: 'o1', plan: 'FREE' } as any;
      const member = { memberId: 'm1', role: 'OWNER' } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      expect(useTenantStore.getState().hasFeature('curved_panels')).toBe(false);
      expect(useTenantStore.getState().hasFeature('basic_design')).toBe(true);
    });

    it('addMember and removeMember work', () => {
      const m = { memberId: 'new-1', role: 'DESIGNER' } as any;
      useTenantStore.getState().addMember(m);
      expect(useTenantStore.getState().members).toHaveLength(1);
      useTenantStore.getState().removeMember('new-1');
      expect(useTenantStore.getState().members).toHaveLength(0);
    });

    it('updateMemberRole changes role', () => {
      const m = { memberId: 'x1', role: 'VIEWER' } as any;
      useTenantStore.getState().addMember(m);
      useTenantStore.getState().updateMemberRole('x1', 'ADMIN');
      expect(useTenantStore.getState().members[0].role).toBe('ADMIN');
    });

    it('createInvitation and revokeInvitation work', () => {
      const inv = { inviteId: 'inv-1', status: 'PENDING', email: 'test@x.com' } as any;
      useTenantStore.getState().createInvitation(inv);
      expect(useTenantStore.getState().invitations).toHaveLength(1);
      useTenantStore.getState().revokeInvitation('inv-1');
      expect(useTenantStore.getState().invitations[0].status).toBe('REVOKED');
    });

    it('updateSettings merges partial settings', () => {
      const org = {
        orgId: 'o1',
        settings: { locale: 'th-TH', currency: 'THB', timezone: 'Asia/Bangkok' },
      } as any;
      const member = { memberId: 'm1', role: 'OWNER' } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      useTenantStore.getState().updateSettings({ currency: 'USD' });
      expect(useTenantStore.getState().currentOrg?.settings.currency).toBe('USD');
      expect(useTenantStore.getState().currentOrg?.settings.locale).toBe('th-TH');
    });

    it('updatePlan changes plan and limits', () => {
      const org = { orgId: 'o1', plan: 'FREE', maxUsers: 2 } as any;
      const member = { memberId: 'm1', role: 'OWNER' } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      useTenantStore.getState().updatePlan('ENTERPRISE');
      expect(useTenantStore.getState().currentOrg?.plan).toBe('ENTERPRISE');
      expect(useTenantStore.getState().currentOrg?.maxUsers).toBe(999);
    });

    it('clear resets all state', () => {
      const org = { orgId: 'o1' } as any;
      const member = { memberId: 'm1', role: 'OWNER' } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      useTenantStore.getState().clear();
      expect(useTenantStore.getState().currentOrg).toBeNull();
      expect(useTenantStore.getState().currentMember).toBeNull();
    });
  });

  // ==========================================================================
  // TenantOnboarding Component
  // ==========================================================================

  describe('tenant/TenantOnboarding.tsx', () => {
    it('renders step 1 with org name input', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');

      render(
        React.createElement(TenantOnboarding, {
          userId: 'u1',
          userEmail: 'test@example.com',
          userDisplayName: 'Test User',
          onComplete: () => {},
        })
      );

      expect(screen.getByTestId('step-org-info')).toBeTruthy();
      expect(screen.getByTestId('org-name-input')).toBeTruthy();
    });

    it('next button is disabled when org name is empty', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');

      render(
        React.createElement(TenantOnboarding, {
          userId: 'u1',
          userEmail: 'test@example.com',
          userDisplayName: 'Test User',
          onComplete: () => {},
        })
      );

      const btn = screen.getByTestId('next-btn');
      expect(btn.hasAttribute('disabled')).toBe(true);
    });

    it('advances to plan select when name filled and next clicked', async () => {
      const React = await import('react');
      const { render, screen, fireEvent } = await import('@testing-library/react');
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');

      render(
        React.createElement(TenantOnboarding, {
          userId: 'u1',
          userEmail: 'test@example.com',
          userDisplayName: 'Test User',
          onComplete: () => {},
        })
      );

      const input = screen.getByTestId('org-name-input');
      fireEvent.change(input, { target: { value: 'DAPH Decor' } });
      fireEvent.click(screen.getByTestId('next-btn'));

      expect(screen.getByTestId('step-plan-select')).toBeTruthy();
    });

    it('can complete full flow to confirmation', async () => {
      const React = await import('react');
      const { render, screen, fireEvent } = await import('@testing-library/react');
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');

      const onComplete = { fn: (_: any) => {} };
      render(
        React.createElement(TenantOnboarding, {
          userId: 'u1',
          userEmail: 'admin@daph.co.th',
          userDisplayName: 'Admin DAPH',
          onComplete: (org: any) => { onComplete.fn(org); },
        })
      );

      // Step 1 → 2
      fireEvent.change(screen.getByTestId('org-name-input'), { target: { value: 'DAPH Decor' } });
      fireEvent.click(screen.getByTestId('next-btn'));

      // Step 2 → 3
      fireEvent.click(screen.getByTestId('plan-professional'));
      fireEvent.click(screen.getByTestId('next-btn'));

      // Step 3 → 4
      fireEvent.click(screen.getByTestId('next-btn'));

      // Confirmation step
      expect(screen.getByTestId('step-confirmation')).toBeTruthy();
      expect(screen.getByText('DAPH Decor')).toBeTruthy();
    });
  });

  // ==========================================================================
  // TenantProvider
  // ==========================================================================

  describe('tenant/TenantProvider.tsx', () => {
    it('useTenant throws when used outside provider', async () => {
      const React = await import('react');
      const { renderHook } = await import('@testing-library/react');
      const { useTenant } = await import('../tenant/TenantProvider');

      expect(() => {
        renderHook(() => useTenant());
      }).toThrow('useTenant must be used within <TenantProvider>');
    });

    it('provides tenant context within provider', async () => {
      const React = await import('react');
      const { renderHook } = await import('@testing-library/react');
      const { TenantProvider, useTenant } = await import('../tenant/TenantProvider');
      const { useTenantStore } = await import('../tenant/tenantStore');

      // Pre-set store
      const org = { orgId: 'o1', name: 'Test Org', plan: 'PROFESSIONAL', settings: {} } as any;
      const member = { memberId: 'm1', role: 'ADMIN', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(TenantProvider, null, children);

      const { result } = renderHook(() => useTenant(), { wrapper });
      expect(result.current.org?.orgId).toBe('o1');
      expect(result.current.permissions.canManageMembers).toBe(true);
    });
  });
});
