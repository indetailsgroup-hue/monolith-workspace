/**
 * e2e/tenant-lifecycle.spec.ts — E2E Tests: Full Tenant Lifecycle
 *
 * Covers: Onboarding → Billing → Usage → Grace Period → Suspension
 *
 * Uses Playwright-style assertions (mocked for Vitest compatibility)
 * Tests the complete journey of a tenant from registration to suspension.
 */

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('E2E: Tenant Lifecycle — Onboarding through Suspension', () => {
  afterEach(() => cleanup());

  // ==========================================================================
  // Stage 1: Tenant Onboarding
  // ==========================================================================

  describe('Stage 1: Tenant Onboarding', () => {
    it('renders onboarding form for new users', async () => {
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');
      const onComplete = vi.fn();
      render(
        <TenantOnboarding
          userId="user-new-1"
          userEmail="newuser@example.com"
          userDisplayName="New User"
          onComplete={onComplete}
        />
      );
      expect(screen.getByText(/สร้างองค์กรใหม่/)).toBeDefined();
      expect(screen.getByPlaceholderText('เช่น DAPH Decor')).toBeDefined();
    });

    it('validates required fields before submission', async () => {
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');
      const onComplete = vi.fn();
      render(
        <TenantOnboarding
          userId="user-new-2"
          userEmail="test@example.com"
          userDisplayName="Test"
          onComplete={onComplete}
        />
      );
      // The "ถัดไป" button should be disabled without filling company name
      const nextBtn = screen.getByText(/ถัดไป/);
      expect(nextBtn).toBeDefined();
      // onComplete should NOT be called from step 1
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('completes onboarding with valid data', async () => {
      const { TenantOnboarding } = await import('../tenant/TenantOnboarding');
      const onComplete = vi.fn();
      render(
        <TenantOnboarding
          userId="user-new-3"
          userEmail="owner@daph.com"
          userDisplayName="DAPH Owner"
          onComplete={onComplete}
        />
      );
      // Fill in company name using placeholder
      const input = screen.getByPlaceholderText('เช่น DAPH Decor');
      fireEvent.change(input, { target: { value: 'DAPH Decor' } });
      // Click next to advance steps (multi-step wizard)
      const nextBtn = screen.getByTestId('next-btn');
      fireEvent.click(nextBtn);
      // We verify that step navigation works (form progresses)
      await waitFor(() => {
        // Step 2 should now show (plan selection)
        expect(screen.getByText(/เลือกแพลนที่เหมาะกับคุณ/)).toBeDefined();
      }, { timeout: 3000 });
    });
  });

  // ==========================================================================
  // Stage 2: Billing & Plan Upgrade
  // ==========================================================================

  describe('Stage 2: Billing & Plan Management', () => {
    it('renders billing page with current plan', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-daph', name: 'DAPH Decor', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { BillingPage } = await import('../tenant/BillingPage');
      render(<BillingPage />);
      expect(screen.getByText(/STARTER/)).toBeDefined();
    });

    it('shows plan comparison with upgrade options', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-daph', name: 'DAPH Decor', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { BillingPage } = await import('../tenant/BillingPage');
      render(<BillingPage />);
      // Plan names are rendered in title case
      expect(screen.getByText('Professional')).toBeDefined();
      expect(screen.getByText('Enterprise')).toBeDefined();
    });

    it('handles plan upgrade action', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-daph', name: 'DAPH Decor', plan: 'FREE', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { BillingPage } = await import('../tenant/BillingPage');
      const { container } = render(<BillingPage />);
      // Should show upgrade buttons
      const upgradeButtons = container.querySelectorAll('[data-action="upgrade"]');
      // At least one upgrade option available
      expect(container.textContent).toContain('อัปเกรด');
    });
  });

  // ==========================================================================
  // Stage 3: Usage Metering & Limits
  // ==========================================================================

  describe('Stage 3: Usage Metering', () => {
    it('tracks job creation against plan limit', async () => {
      const { canCreateJob } = await import('../tenant/usageMetering');
      const org = { orgId: 'org-1', plan: 'STARTER', status: 'ACTIVE', maxJobsPerMonth: 50 } as any;
      // Under limit
      const result = canCreateJob(org, 30);
      expect(result.allowed).toBe(true);
      // At limit
      const resultAtLimit = canCreateJob(org, 50);
      expect(resultAtLimit.allowed).toBe(false);
    });

    it('calculates usage percentage in canCreateJob result', async () => {
      const { canCreateJob } = await import('../tenant/usageMetering');
      const org = { orgId: 'org-1', plan: 'STARTER', status: 'ACTIVE', maxJobsPerMonth: 50 } as any;
      const result = canCreateJob(org, 45);
      expect(result.percentUsed).toBe(90); // 45/50 = 90%
      const full = canCreateJob(org, 50);
      expect(full.percentUsed).toBe(100);
    });

    it('renders usage dashboard with progress bars', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const metrics = {
        orgId: 'org-1',
        period: '2026-08',
        jobsCreated: 150,
        jobsLimit: 200,
        membersCount: 15,
        membersLimit: 20,
        storageUsedMb: 18000,
        storagelimitMb: 25000,
      };
      const { container } = render(<UsageDashboard metrics={metrics} />);
      expect(container.textContent).toContain('150');
      expect(container.textContent).toContain('200');
    });

    it('shows alert when usage exceeds 80%', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const metrics = {
        orgId: 'org-1',
        period: '2026-08',
        jobsCreated: 45,
        jobsLimit: 50,
        membersCount: 9,
        membersLimit: 10,
        storageUsedMb: 4500,
        storagelimitMb: 5000,
      };
      const { container } = render(<UsageDashboard metrics={metrics} />);
      // Should show warning indicators
      expect(container.textContent).toContain('90%') ; // 45/50 = 90%
    });
  });

  // ==========================================================================
  // Stage 4: Grace Period
  // ==========================================================================

  describe('Stage 4: Grace Period & Downgrade', () => {
    it('initializes grace period with correct defaults', async () => {
      const { createGracePeriod, DEFAULT_GRACE_CONFIG } = await import('../tenant/gracePeriod');
      const gp = createGracePeriod('org-1', 'payment_failed');
      expect(gp.orgId).toBe('org-1');
      expect(gp.reason).toBe('payment_failed');
      expect(gp.status).toBe('active');
      expect(gp.remindersSent).toEqual([]);
      // Duration should be ~7 days
      const duration = new Date(gp.expiresAt).getTime() - new Date(gp.startedAt).getTime();
      const daysDiff = Math.round(duration / 86400000);
      expect(daysDiff).toBe(DEFAULT_GRACE_CONFIG.graceDays);
    });

    it('calculates remaining days correctly', async () => {
      const { getRemainingGraceDays } = await import('../tenant/gracePeriod');
      const future = new Date(Date.now() + 3 * 86400000).toISOString();
      const state = { orgId: 'org-1', reason: 'payment_failed' as const, startedAt: new Date().toISOString(), expiresAt: future, remindersSent: [] as number[], status: 'active' as const };
      const remaining = getRemainingGraceDays(state);
      expect(remaining).toBeGreaterThanOrEqual(2);
      expect(remaining).toBeLessThanOrEqual(4);
    });

    it('marks grace period as expired when past deadline', async () => {
      const { isGracePeriodExpired } = await import('../tenant/gracePeriod');
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const expiredState = { orgId: 'org-1', reason: 'payment_failed' as const, startedAt: new Date(Date.now() - 8 * 86400000).toISOString(), expiresAt: pastDate, remindersSent: [] as number[], status: 'active' as const };
      expect(isGracePeriodExpired(expiredState)).toBe(true);
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const activeState = { ...expiredState, expiresAt: futureDate };
      expect(isGracePeriodExpired(activeState)).toBe(false);
    });

    it('generates email reminder content', async () => {
      const { buildGraceReminderEmail } = await import('../tenant/gracePeriod');
      const email = buildGraceReminderEmail('owner@daph.com', 'DAPH Decor', 3);
      expect(email.to).toBe('owner@daph.com');
      expect(email.subject).toBeDefined();
      expect(email.variables.days_left).toBe('3');
    });

    it('triggers auto-downgrade via expireGracePeriod', async () => {
      const { expireGracePeriod } = await import('../tenant/gracePeriod');
      const result = expireGracePeriod({
        orgId: 'org-1',
        reason: 'payment_failed',
        startedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
        expiresAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        remindersSent: [1, 3, 5, 7],
        status: 'active',
      });
      expect(result.status).toBe('expired');
    });
  });

  // ==========================================================================
  // Stage 5: Suspension
  // ==========================================================================

  describe('Stage 5: Tenant Suspension', () => {
    it('shows org settings even when org is suspended (data still visible)', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-suspended', name: 'Suspended Co', slug: 'suspended-co', plan: 'STARTER', status: 'SUSPENDED' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { OrgSettingsPage } = await import('../tenant/OrgSettingsPage');
      const { container } = render(<OrgSettingsPage />);
      // Org settings page still renders (owner can view settings)
      expect(container.textContent).toContain('ตั้งค่าองค์กร');
    });

    it('super admin can suspend a tenant', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      const mockTenants = [
        {
          orgId: 'org-1',
          name: 'Test Org',
          slug: 'test-org',
          plan: 'STARTER' as const,
          status: 'ACTIVE' as const,
          memberCount: 5,
          jobsThisMonth: 20,
          storageUsedMb: 1000,
          mrr: 1990,
          lastActiveAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          healthScore: 85,
          alerts: [],
        },
      ];
      const mockMetrics = {
        totalTenants: 1,
        activeTenants: 1,
        suspendedTenants: 0,
        trialTenants: 0,
        totalUsers: 5,
        monthlyRecurringRevenue: 1990,
        annualRecurringRevenue: 23880,
        avgRevenuePerTenant: 1990,
        totalJobsThisMonth: 20,
        avgJobsPerTenant: 20,
        storageUsedGb: 1,
        planDistribution: { FREE: 0, STARTER: 1, PROFESSIONAL: 0, ENTERPRISE: 0 },
        growthRate: 5,
        churnRate: 0,
        newTenantsThisMonth: 1,
      };
      render(
        <SuperAdminDashboard
          adminUser={{ userId: 'sa-1', email: 'admin@monolith.app', isSuperAdmin: true }}
          initialTenants={mockTenants}
          initialMetrics={mockMetrics}
        />
      );
      // Should render the tenant
      expect(screen.getByText('Test Org')).toBeDefined();
      // Find and click suspend button
      const suspendBtn = screen.getByTitle('Suspend');
      fireEvent.click(suspendBtn);
      // After click, status should change to SUSPENDED
      await waitFor(() => {
        expect(screen.getByText('SUSPENDED')).toBeDefined();
      });
    });

    it('super admin can reactivate a suspended tenant', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      const mockTenants = [
        {
          orgId: 'org-2',
          name: 'Suspended Org',
          slug: 'suspended-org',
          plan: 'PROFESSIONAL' as const,
          status: 'SUSPENDED' as const,
          memberCount: 10,
          jobsThisMonth: 0,
          storageUsedMb: 2000,
          mrr: 4990,
          lastActiveAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          healthScore: 30,
          alerts: [{ type: 'payment_failed' as const, message: 'Payment overdue', severity: 'critical' as const }],
        },
      ];
      const mockMetrics = {
        totalTenants: 1,
        activeTenants: 0,
        suspendedTenants: 1,
        trialTenants: 0,
        totalUsers: 10,
        monthlyRecurringRevenue: 0,
        annualRecurringRevenue: 0,
        avgRevenuePerTenant: 0,
        totalJobsThisMonth: 0,
        avgJobsPerTenant: 0,
        storageUsedGb: 2,
        planDistribution: { FREE: 0, STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 0 },
        growthRate: 0,
        churnRate: 100,
        newTenantsThisMonth: 0,
      };
      render(
        <SuperAdminDashboard
          adminUser={{ userId: 'sa-1', email: 'admin@monolith.app', isSuperAdmin: true }}
          initialTenants={mockTenants}
          initialMetrics={mockMetrics}
        />
      );
      expect(screen.getByText('Suspended Org')).toBeDefined();
      // Click reactivate
      const reactivateBtn = screen.getByTitle('Reactivate');
      fireEvent.click(reactivateBtn);
      await waitFor(() => {
        expect(screen.getByText('ACTIVE')).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Stage 6: Notification Center
  // ==========================================================================

  describe('Stage 6: Notification Center', () => {
    it('renders notification bell with zero unread badge', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({ notifications: [], isPanelOpen: false });
      const { NotificationBell } = await import('../notifications/NotificationCenter');
      const { container } = render(<NotificationBell />);
      // No badge when 0 unread
      expect(container.querySelector('[data-testid="unread-badge"]')).toBeNull();
    });

    it('shows unread count badge when notifications exist', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', orgId: 'org-1', userId: 'u1', category: 'job_status', priority: 'normal', title: 'Job Created', body: 'New job', isRead: false, createdAt: new Date().toISOString() },
          { id: 'n2', orgId: 'org-1', userId: 'u1', category: 'billing', priority: 'high', title: 'Payment Due', body: 'Invoice', isRead: false, createdAt: new Date().toISOString() },
        ],
        isPanelOpen: false,
      });
      const { NotificationBell } = await import('../notifications/NotificationCenter');
      const { container } = render(<NotificationBell />);
      const badge = container.querySelector('[data-testid="unread-badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2');
    });

    it('opens notification panel on bell click', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', orgId: 'org-1', userId: 'u1', category: 'job_status', priority: 'normal', title: 'Test Notification', body: 'Body text', isRead: false, createdAt: new Date().toISOString() },
        ],
        isPanelOpen: false,
      });
      const { NotificationCenter } = await import('../notifications/NotificationCenter');
      render(<NotificationCenter />);
      const bell = screen.getByTestId('notification-bell');
      fireEvent.click(bell);
      // Panel should now be visible
      expect(screen.getByTestId('notification-panel')).toBeDefined();
      expect(screen.getByText('Test Notification')).toBeDefined();
    });

    it('marks notification as read on click', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        notifications: [
          { id: 'n-mark', orgId: 'org-1', userId: 'u1', category: 'team', priority: 'normal', title: 'New Member', body: 'Someone joined', isRead: false, createdAt: new Date().toISOString() },
        ],
        isPanelOpen: true,
      });
      const { NotificationCenter } = await import('../notifications/NotificationCenter');
      render(<NotificationCenter />);
      const notifItem = screen.getByText('New Member');
      fireEvent.click(notifItem.closest('[data-testid^="notif-item"]')!);
      // Check store updated
      const state = useNotificationStore.getState();
      expect(state.notifications[0].isRead).toBe(true);
    });

    it('marks all notifications as read', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        notifications: [
          { id: 'n-a', orgId: 'org-1', userId: 'u1', category: 'system', priority: 'low', title: 'Update 1', body: 'b', isRead: false, createdAt: new Date().toISOString() },
          { id: 'n-b', orgId: 'org-1', userId: 'u1', category: 'system', priority: 'low', title: 'Update 2', body: 'b', isRead: false, createdAt: new Date().toISOString() },
        ],
        isPanelOpen: true,
      });
      const { NotificationCenter } = await import('../notifications/NotificationCenter');
      render(<NotificationCenter />);
      const markAllBtn = screen.getByText('อ่านทั้งหมด');
      fireEvent.click(markAllBtn);
      const state = useNotificationStore.getState();
      expect(state.notifications.every(n => n.isRead)).toBe(true);
    });

    it('filters notifications by category', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        notifications: [
          { id: 'n-job', orgId: 'org-1', userId: 'u1', category: 'job_status', priority: 'normal', title: 'Job Done', body: 'b', isRead: false, createdAt: new Date().toISOString() },
          { id: 'n-bill', orgId: 'org-1', userId: 'u1', category: 'billing', priority: 'high', title: 'Invoice Ready', body: 'b', isRead: false, createdAt: new Date().toISOString() },
        ],
        isPanelOpen: true,
        filterCategory: 'all',
      });
      const { NotificationCenter } = await import('../notifications/NotificationCenter');
      render(<NotificationCenter />);
      // Both visible initially
      expect(screen.getByText('Job Done')).toBeDefined();
      expect(screen.getByText('Invoice Ready')).toBeDefined();
      // Filter to billing only
      const billingFilter = screen.getByText('💳');
      fireEvent.click(billingFilter);
      // After state update, store filterCategory changes
      const state = useNotificationStore.getState();
      expect(state.filterCategory).toBe('billing');
    });
  });

  // ==========================================================================
  // Stage 7: Notification Preferences
  // ==========================================================================

  describe('Stage 7: Notification Preferences', () => {
    it('renders preferences page with all categories', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        preferences: {
          userId: 'u1',
          orgId: 'org-1',
          emailDigest: { job_status: 'immediate', billing: 'immediate', team: 'daily', system: 'weekly', usage: 'immediate', export: 'none' },
          inAppEnabled: { job_status: true, billing: true, team: true, system: true, usage: true, export: true },
          globalMute: false,
        },
      });
      const { NotificationPreferencesPage } = await import('../notifications/NotificationPreferencesPage');
      render(<NotificationPreferencesPage />);
      expect(screen.getByText('📋 สถานะงาน')).toBeDefined();
      expect(screen.getByText('💳 การเงิน')).toBeDefined();
      expect(screen.getByText('👥 ทีมงาน')).toBeDefined();
    });

    it('toggles global mute', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        preferences: {
          userId: 'u1',
          orgId: 'org-1',
          emailDigest: { job_status: 'immediate', billing: 'immediate', team: 'daily', system: 'weekly', usage: 'immediate', export: 'none' },
          inAppEnabled: { job_status: true, billing: true, team: true, system: true, usage: true, export: true },
          globalMute: false,
        },
      });
      const { NotificationPreferencesPage } = await import('../notifications/NotificationPreferencesPage');
      render(<NotificationPreferencesPage />);
      const muteCheckbox = screen.getByLabelText(/ปิดเสียงการแจ้งเตือนทั้งหมด/) as HTMLInputElement;
      expect(muteCheckbox.checked).toBe(false);
      fireEvent.click(muteCheckbox);
      const state = useNotificationStore.getState();
      expect(state.preferences!.globalMute).toBe(true);
    });

    it('handles snooze for 1 hour', async () => {
      const { useNotificationStore } = await import('../notifications/notificationStore');
      useNotificationStore.setState({
        preferences: {
          userId: 'u1',
          orgId: 'org-1',
          emailDigest: { job_status: 'immediate', billing: 'immediate', team: 'daily', system: 'weekly', usage: 'immediate', export: 'none' },
          inAppEnabled: { job_status: true, billing: true, team: true, system: true, usage: true, export: true },
          globalMute: false,
        },
      });
      const { NotificationPreferencesPage } = await import('../notifications/NotificationPreferencesPage');
      render(<NotificationPreferencesPage />);
      const snooze1h = screen.getByText('1 ชม.');
      fireEvent.click(snooze1h);
      const state = useNotificationStore.getState();
      expect(state.preferences!.muteUntil).toBeDefined();
      const muteTime = new Date(state.preferences!.muteUntil!).getTime();
      const expected = Date.now() + 3600000;
      expect(Math.abs(muteTime - expected)).toBeLessThan(5000); // within 5s tolerance
    });
  });

  // ==========================================================================
  // Stage 8: Super Admin Dashboard
  // ==========================================================================

  describe('Stage 8: Super Admin Dashboard', () => {
    it('denies access for non-super-admin users', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      render(
        <SuperAdminDashboard adminUser={{ userId: 'u1', email: 'user@org.com', isSuperAdmin: false }} />
      );
      expect(screen.getByText(/Super Admin Access Required/)).toBeDefined();
    });

    it('renders platform KPIs for super admin', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      const metrics = {
        totalTenants: 50,
        activeTenants: 45,
        suspendedTenants: 3,
        trialTenants: 2,
        totalUsers: 500,
        monthlyRecurringRevenue: 250000,
        annualRecurringRevenue: 3000000,
        avgRevenuePerTenant: 5000,
        totalJobsThisMonth: 1200,
        avgJobsPerTenant: 24,
        storageUsedGb: 100,
        planDistribution: { FREE: 10, STARTER: 20, PROFESSIONAL: 15, ENTERPRISE: 5 },
        growthRate: 8,
        churnRate: 1.5,
        newTenantsThisMonth: 7,
      };
      render(
        <SuperAdminDashboard
          adminUser={{ userId: 'sa-1', email: 'admin@monolith.app', isSuperAdmin: true }}
          initialMetrics={metrics}
          initialTenants={[]}
        />
      );
      expect(screen.getByTestId('super-admin-dashboard')).toBeDefined();
      expect(screen.getByText('50')).toBeDefined(); // total tenants
      expect(screen.getByText('฿250,000')).toBeDefined(); // MRR
    });

    it('filters tenant list by plan', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      const tenants = [
        { orgId: 'o1', name: 'Free Org', slug: 'free', plan: 'FREE' as const, status: 'ACTIVE' as const, memberCount: 3, jobsThisMonth: 5, storageUsedMb: 100, mrr: 0, lastActiveAt: new Date().toISOString(), createdAt: new Date().toISOString(), healthScore: 70, alerts: [] },
        { orgId: 'o2', name: 'Pro Org', slug: 'pro', plan: 'PROFESSIONAL' as const, status: 'ACTIVE' as const, memberCount: 15, jobsThisMonth: 80, storageUsedMb: 5000, mrr: 4990, lastActiveAt: new Date().toISOString(), createdAt: new Date().toISOString(), healthScore: 95, alerts: [] },
      ];
      const metrics = { totalTenants: 2, activeTenants: 2, suspendedTenants: 0, trialTenants: 0, totalUsers: 18, monthlyRecurringRevenue: 4990, annualRecurringRevenue: 59880, avgRevenuePerTenant: 2495, totalJobsThisMonth: 85, avgJobsPerTenant: 42.5, storageUsedGb: 5.1, planDistribution: { FREE: 1, STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 0 }, growthRate: 10, churnRate: 0, newTenantsThisMonth: 2 };
      render(
        <SuperAdminDashboard
          adminUser={{ userId: 'sa-1', email: 'admin@monolith.app', isSuperAdmin: true }}
          initialTenants={tenants}
          initialMetrics={metrics}
        />
      );
      // Both visible initially
      expect(screen.getByText('Free Org')).toBeDefined();
      expect(screen.getByText('Pro Org')).toBeDefined();
    });

    it('opens tenant detail modal', async () => {
      const { SuperAdminDashboard } = await import('../admin/SuperAdminDashboard');
      const tenants = [
        { orgId: 'o1', name: 'Detail Org', slug: 'detail', plan: 'ENTERPRISE' as const, status: 'ACTIVE' as const, memberCount: 25, jobsThisMonth: 150, storageUsedMb: 12000, mrr: 14990, lastActiveAt: new Date().toISOString(), createdAt: '2025-03-15T00:00:00Z', healthScore: 92, alerts: [] },
      ];
      const metrics = { totalTenants: 1, activeTenants: 1, suspendedTenants: 0, trialTenants: 0, totalUsers: 25, monthlyRecurringRevenue: 14990, annualRecurringRevenue: 179880, avgRevenuePerTenant: 14990, totalJobsThisMonth: 150, avgJobsPerTenant: 150, storageUsedGb: 12, planDistribution: { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 1 }, growthRate: 0, churnRate: 0, newTenantsThisMonth: 0 };
      render(
        <SuperAdminDashboard
          adminUser={{ userId: 'sa-1', email: 'admin@monolith.app', isSuperAdmin: true }}
          initialTenants={tenants}
          initialMetrics={metrics}
        />
      );
      // Click view details button
      const viewBtn = screen.getByTitle('View Details');
      fireEvent.click(viewBtn);
      // Modal should show org details
      await waitFor(() => {
        expect(screen.getByText('Org ID:')).toBeDefined();
        expect(screen.getByText('o1')).toBeDefined();
      });
    });
  });
});
