/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ============================================================================
// v16.1 — Stripe Billing, Org Settings, Tenant Storage Tests
// ============================================================================

describe('v16.1 — Billing + Settings + Storage', () => {
  afterEach(() => cleanup());

  // ==========================================================================
  // Billing Module
  // ==========================================================================

  describe('tenant/billing.ts', () => {
    it('PLAN_PRICING has all 4 plans', async () => {
      const { PLAN_PRICING } = await import('../tenant/billing');
      expect(PLAN_PRICING).toHaveLength(4);
      expect(PLAN_PRICING.map((p) => p.plan)).toEqual(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']);
    });

    it('getPlanChangeDirection detects upgrade', async () => {
      const { getPlanChangeDirection } = await import('../tenant/billing');
      expect(getPlanChangeDirection('FREE', 'STARTER')).toBe('upgrade');
      expect(getPlanChangeDirection('STARTER', 'PROFESSIONAL')).toBe('upgrade');
      expect(getPlanChangeDirection('PROFESSIONAL', 'ENTERPRISE')).toBe('upgrade');
    });

    it('getPlanChangeDirection detects downgrade', async () => {
      const { getPlanChangeDirection } = await import('../tenant/billing');
      expect(getPlanChangeDirection('ENTERPRISE', 'PROFESSIONAL')).toBe('downgrade');
      expect(getPlanChangeDirection('STARTER', 'FREE')).toBe('downgrade');
    });

    it('getPlanChangeDirection detects same', async () => {
      const { getPlanChangeDirection } = await import('../tenant/billing');
      expect(getPlanChangeDirection('PROFESSIONAL', 'PROFESSIONAL')).toBe('same');
    });

    it('canChangePlan blocks suspended orgs', async () => {
      const { canChangePlan } = await import('../tenant/billing');
      const suspended = { status: 'SUSPENDED', plan: 'FREE' } as any;
      expect(canChangePlan(suspended, 'STARTER').allowed).toBe(false);
    });

    it('canChangePlan blocks same plan', async () => {
      const { canChangePlan } = await import('../tenant/billing');
      const org = { status: 'ACTIVE', plan: 'STARTER' } as any;
      expect(canChangePlan(org, 'STARTER').allowed).toBe(false);
    });

    it('canChangePlan allows valid changes', async () => {
      const { canChangePlan } = await import('../tenant/billing');
      const org = { status: 'ACTIVE', plan: 'FREE' } as any;
      expect(canChangePlan(org, 'PROFESSIONAL').allowed).toBe(true);
    });

    it('calculateProration returns positive for upgrade', async () => {
      const { calculateProration } = await import('../tenant/billing');
      const amount = calculateProration('STARTER', 'PROFESSIONAL', 'monthly', 15, 30);
      expect(amount).toBeGreaterThan(0);
    });

    it('calculateProration returns negative for downgrade', async () => {
      const { calculateProration } = await import('../tenant/billing');
      const amount = calculateProration('PROFESSIONAL', 'STARTER', 'monthly', 15, 30);
      expect(amount).toBeLessThan(0);
    });

    it('stripePriceToOrgPlan maps known price IDs', async () => {
      const { stripePriceToOrgPlan } = await import('../tenant/billing');
      expect(stripePriceToOrgPlan('price_starter_monthly')).toBe('STARTER');
      expect(stripePriceToOrgPlan('price_pro_yearly')).toBe('PROFESSIONAL');
      expect(stripePriceToOrgPlan('price_unknown')).toBeNull();
    });

    it('stripePriceToInterval detects monthly/yearly', async () => {
      const { stripePriceToInterval } = await import('../tenant/billing');
      expect(stripePriceToInterval('price_starter_monthly')).toBe('monthly');
      expect(stripePriceToInterval('price_starter_yearly')).toBe('yearly');
    });

    it('createCheckoutSession throws for FREE plan', async () => {
      const { createCheckoutSession } = await import('../tenant/billing');
      await expect(
        createCheckoutSession({ orgId: 'o1', plan: 'FREE', interval: 'monthly', successUrl: '/', cancelUrl: '/' })
      ).rejects.toThrow('Cannot create checkout for FREE plan');
    });
  });

  // ==========================================================================
  // Org Settings Page
  // ==========================================================================

  describe('tenant/OrgSettingsPage.tsx', () => {
    it('renders settings page with tabs', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { OrgSettingsPage } = await import('../tenant/OrgSettingsPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      // Setup store
      const org = { orgId: 'o1', name: 'Test Org', slug: 'test-org', plan: 'PROFESSIONAL', maxUsers: 20, settings: { locale: 'th-TH', currency: 'THB', timezone: 'Asia/Bangkok', jobCodePrefix: 'TST', quotationPrefix: 'QT' } } as any;
      const member = { memberId: 'm1', userId: 'u1', role: 'ADMIN', email: 'admin@test.com', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      render(React.createElement(OrgSettingsPage));

      expect(screen.getByTestId('org-settings-page')).toBeTruthy();
      expect(screen.getByTestId('tab-general')).toBeTruthy();
      expect(screen.getByTestId('tab-members')).toBeTruthy();
      expect(screen.getByTestId('tab-workspace')).toBeTruthy();
    });

    it('shows access denied for non-admin', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { OrgSettingsPage } = await import('../tenant/OrgSettingsPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', plan: 'STARTER', settings: {} } as any;
      const member = { memberId: 'm2', role: 'VIEWER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      render(React.createElement(OrgSettingsPage));
      expect(screen.getByText(/ไม่มีสิทธิ์เข้าถึง/)).toBeTruthy();
    });

    it('members tab shows invite button', async () => {
      const React = await import('react');
      const { render, screen, fireEvent } = await import('@testing-library/react');
      const { OrgSettingsPage } = await import('../tenant/OrgSettingsPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', slug: 'test', plan: 'PROFESSIONAL', maxUsers: 20, settings: { locale: 'th-TH', currency: 'THB', timezone: 'Asia/Bangkok', jobCodePrefix: 'T', quotationPrefix: 'Q' } } as any;
      const member = { memberId: 'm1', userId: 'u1', role: 'OWNER', email: 'owner@test.com', displayName: 'Owner', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      useTenantStore.getState().setMembers([member]);

      render(React.createElement(OrgSettingsPage));
      fireEvent.click(screen.getByTestId('tab-members'));
      expect(screen.getByTestId('invite-btn')).toBeTruthy();
    });

    it('invite form appears and sends invitation', async () => {
      const React = await import('react');
      const { render, screen, fireEvent } = await import('@testing-library/react');
      const { OrgSettingsPage } = await import('../tenant/OrgSettingsPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', slug: 'test', plan: 'PROFESSIONAL', maxUsers: 20, settings: { locale: 'th-TH', currency: 'THB', timezone: 'Asia/Bangkok', jobCodePrefix: 'T', quotationPrefix: 'Q' } } as any;
      const member = { memberId: 'm1', userId: 'u1', role: 'OWNER', email: 'owner@test.com', displayName: 'Owner', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);
      useTenantStore.getState().setMembers([member]);
      useTenantStore.getState().setInvitations([]);

      render(React.createElement(OrgSettingsPage));
      fireEvent.click(screen.getByTestId('tab-members'));
      fireEvent.click(screen.getByTestId('invite-btn'));

      expect(screen.getByTestId('invite-form')).toBeTruthy();
      fireEvent.change(screen.getByTestId('invite-email-input'), { target: { value: 'new@company.com' } });
      fireEvent.click(screen.getByTestId('send-invite-btn'));

      expect(useTenantStore.getState().invitations).toHaveLength(1);
      expect(useTenantStore.getState().invitations[0].email).toBe('new@company.com');
    });
  });

  // ==========================================================================
  // Billing Page
  // ==========================================================================

  describe('tenant/BillingPage.tsx', () => {
    it('renders billing page with current plan', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { BillingPage } = await import('../tenant/BillingPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', plan: 'STARTER', status: 'ACTIVE', maxUsers: 5, maxJobsPerMonth: 50, settings: {} } as any;
      const member = { memberId: 'm1', role: 'OWNER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      render(React.createElement(BillingPage));
      expect(screen.getByTestId('billing-page')).toBeTruthy();
      expect(screen.getByTestId('current-plan-card')).toBeTruthy();
      expect(screen.getByTestId('plan-grid')).toBeTruthy();
    });

    it('renders all 4 plan cards', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { BillingPage } = await import('../tenant/BillingPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', plan: 'FREE', status: 'ACTIVE', maxUsers: 2, maxJobsPerMonth: 10, settings: {} } as any;
      const member = { memberId: 'm1', role: 'OWNER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      render(React.createElement(BillingPage));
      expect(screen.getByTestId('plan-card-free')).toBeTruthy();
      expect(screen.getByTestId('plan-card-starter')).toBeTruthy();
      expect(screen.getByTestId('plan-card-professional')).toBeTruthy();
      expect(screen.getByTestId('plan-card-enterprise')).toBeTruthy();
    });

    it('shows manage subscription button for paid plans', async () => {
      const React = await import('react');
      const { render, screen } = await import('@testing-library/react');
      const { BillingPage } = await import('../tenant/BillingPage');
      const { useTenantStore } = await import('../tenant/tenantStore');

      const org = { orgId: 'o1', name: 'Test', plan: 'PROFESSIONAL', status: 'ACTIVE', maxUsers: 20, maxJobsPerMonth: 200, settings: {} } as any;
      const member = { memberId: 'm1', role: 'OWNER', isActive: true } as any;
      useTenantStore.getState().setCurrentOrg(org, member);

      render(React.createElement(BillingPage));
      expect(screen.getByTestId('manage-subscription-btn')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Tenant Storage
  // ==========================================================================

  describe('tenant/tenantStorage.ts', () => {
    it('buildStoragePath creates correct path', async () => {
      const { buildStoragePath } = await import('../tenant/tenantStorage');
      const path = buildStoragePath('org-123', 'jobs', 'panel.dxf');
      expect(path).toBe('org-123/jobs/panel.dxf');
    });

    it('buildJobFilePath includes job ID', async () => {
      const { buildJobFilePath } = await import('../tenant/tenantStorage');
      const path = buildJobFilePath('org-123', 'job-456', 'output.pdf');
      expect(path).toBe('org-123/jobs/job-456/output.pdf');
    });

    it('sanitizeFilename removes special chars', async () => {
      const { sanitizeFilename } = await import('../tenant/tenantStorage');
      expect(sanitizeFilename('hello world!@#$.pdf')).toBe('hello_world_.pdf');
      expect(sanitizeFilename('..hidden')).toBe('f_hidden');
    });

    it('uniqueFilename generates unique names', async () => {
      const { uniqueFilename } = await import('../tenant/tenantStorage');
      const a = uniqueFilename('test.pdf');
      const b = uniqueFilename('test.pdf');
      expect(a).not.toBe(b);
      expect(a).toContain('test');
      expect(a).toMatch(/\.pdf$/);
    });

    it('extractOrgIdFromPath extracts UUID', async () => {
      const { extractOrgIdFromPath } = await import('../tenant/tenantStorage');
      const uuid = '12345678-1234-1234-1234-123456789abc';
      expect(extractOrgIdFromPath(`${uuid}/jobs/test.pdf`)).toBe(uuid);
      expect(extractOrgIdFromPath('short/test.pdf')).toBeNull();
    });

    it('pathBelongsToOrg checks prefix', async () => {
      const { pathBelongsToOrg } = await import('../tenant/tenantStorage');
      expect(pathBelongsToOrg('org-A/jobs/test.pdf', 'org-A')).toBe(true);
      expect(pathBelongsToOrg('org-B/jobs/test.pdf', 'org-A')).toBe(false);
    });

    it('validateFile rejects oversized files', async () => {
      const { validateFile } = await import('../tenant/tenantStorage');
      const bigFile = { name: 'big.png', size: 100 * 1024 * 1024, type: 'image/png' };
      const result = validateFile(bigFile, 'logos');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('เกินขนาด');
    });

    it('validateFile rejects wrong mime type', async () => {
      const { validateFile } = await import('../tenant/tenantStorage');
      const exeFile = { name: 'virus.exe', size: 1000, type: 'application/x-msdownload' };
      const result = validateFile(exeFile, 'attachments');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ไม่อนุญาต');
    });

    it('validateFile accepts valid files', async () => {
      const { validateFile } = await import('../tenant/tenantStorage');
      const pdf = { name: 'report.pdf', size: 1024 * 1024, type: 'application/pdf' };
      expect(validateFile(pdf, 'attachments').valid).toBe(true);
    });

    it('uploadFile validates before upload', async () => {
      const { uploadFile } = await import('../tenant/tenantStorage');
      const org = { orgId: 'org-test' } as any;
      const badFile = new File([''], 'test.exe', { type: 'application/x-msdownload' });
      const result = await uploadFile({ org, category: 'logos', file: badFile });
      expect(result.success).toBe(false);
    });

    it('uploadFile succeeds for valid file', async () => {
      const { uploadFile } = await import('../tenant/tenantStorage');
      const org = { orgId: 'org-test' } as any;
      const goodFile = new File(['data'], 'logo.png', { type: 'image/png' });
      const result = await uploadFile({ org, category: 'logos', file: goodFile });
      expect(result.success).toBe(true);
      expect(result.path).toContain('org-test/logos/');
    });

    it('deleteFile blocks cross-org deletion', async () => {
      const { deleteFile } = await import('../tenant/tenantStorage');
      const result = await deleteFile('org-A', 'org-B/jobs/secret.pdf');
      expect(result.success).toBe(false);
      expect(result.error).toContain('TENANT_ISOLATION');
    });

    it('deleteFile allows same-org deletion', async () => {
      const { deleteFile } = await import('../tenant/tenantStorage');
      const result = await deleteFile('org-A', 'org-A/jobs/my-file.pdf');
      expect(result.success).toBe(true);
    });

    it('generateStoragePolicy produces RLS SQL', async () => {
      const { generateStoragePolicy } = await import('../tenant/tenantStorage');
      const sql = generateStoragePolicy();
      expect(sql).toContain('storage_tenant_select');
      expect(sql).toContain('storage_tenant_insert');
      expect(sql).toContain('storage_tenant_delete');
      expect(sql).toContain('monolith-files');
    });
  });
});
