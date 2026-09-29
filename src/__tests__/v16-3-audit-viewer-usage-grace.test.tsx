/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// ============================================================================
// AuditLogViewer Tests
// ============================================================================

describe('v16.3 — AuditLogViewer + UsageDashboard + GracePeriod', () => {
  afterEach(() => cleanup());

  describe('tenant/AuditLogViewer.tsx', () => {
    it('renders access denied for non-admin', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'Test', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'VIEWER' } as any,
      });
      const { AuditLogViewer } = await import('../tenant/AuditLogViewer');
      render(<AuditLogViewer />);
      expect(screen.getByText(/ไม่มีสิทธิ์เข้าถึง/)).toBeDefined();
    });

    it('renders audit log viewer for admin', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'Test Org', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { AuditLogViewer } = await import('../tenant/AuditLogViewer');
      render(<AuditLogViewer />);
      expect(screen.getByText('📋 Audit Log')).toBeDefined();
      expect(screen.getByText(/Test Org/)).toBeDefined();
    });

    it('renders filter controls', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'X', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'ADMIN', userId: 'u1' } as any,
      });
      const { AuditLogViewer } = await import('../tenant/AuditLogViewer');
      render(<AuditLogViewer />);
      expect(screen.getByText('หมวดหมู่')).toBeDefined();
      expect(screen.getByText('ตั้งแต่วันที่')).toBeDefined();
      expect(screen.getByText('ถึงวันที่')).toBeDefined();
      expect(screen.getByText('ค้นหา')).toBeDefined();
    });

    it('renders export CSV button', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg2', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { AuditLogViewer } = await import('../tenant/AuditLogViewer');
      const { container } = render(<AuditLogViewer />);
      // Verify it renders main content (not access denied)
      expect(container.textContent).toContain('Export CSV');
    });

    it('shows empty state when no entries', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'OrgEmpty', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'ADMIN', userId: 'u2' } as any,
      });
      const { AuditLogViewer } = await import('../tenant/AuditLogViewer');
      const { container } = render(<AuditLogViewer />);
      // After loading, empty state shown
      await vi.waitFor(() => {
        expect(container.textContent).toContain('ไม่พบรายการ');
      });
    });
  });

  // ============================================================================
  // UsageDashboard Tests
  // ============================================================================

  describe('tenant/UsageDashboard.tsx', () => {
    it('renders usage dashboard with metrics', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const metrics = {
        orgId: 'org-1',
        period: '2026-08',
        jobsCreated: 45,
        jobsLimit: 200,
        membersCount: 12,
        membersLimit: 20,
        storageUsedMb: 5000,
        storagelimitMb: 25000,
      };
      render(<UsageDashboard metrics={metrics} />);
      expect(screen.getByTestId('usage-dashboard')).toBeDefined();
      expect(screen.getByText('📊 การใช้งาน')).toBeDefined();
      expect(screen.getByText(/PROFESSIONAL/)).toBeDefined();
    });

    it('shows progress bars for all resources', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const metrics = {
        orgId: 'org-1',
        period: '2026-08',
        jobsCreated: 20,
        jobsLimit: 50,
        membersCount: 3,
        membersLimit: 5,
        storageUsedMb: 1000,
        storagelimitMb: 5000,
      };
      render(<UsageDashboard metrics={metrics} />);
      expect(screen.getByText('งาน/เดือน')).toBeDefined();
      expect(screen.getByText('สมาชิก')).toBeDefined();
      expect(screen.getByText('พื้นที่จัดเก็บ')).toBeDefined();
    });

    it('shows alerts when usage is high', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'FREE', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const metrics = {
        orgId: 'org-1',
        period: '2026-08',
        jobsCreated: 10,
        jobsLimit: 10,
        membersCount: 2,
        membersLimit: 2,
        storageUsedMb: 50,
        storagelimitMb: 500,
      };
      render(<UsageDashboard metrics={metrics} />);
      const alerts = screen.getAllByTestId('usage-alert');
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('shows upgrade button for non-enterprise', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'STARTER', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      const mockUpgrade = vi.fn();
      render(<UsageDashboard metrics={{
        orgId: 'org-1', period: '2026-08',
        jobsCreated: 5, jobsLimit: 50,
        membersCount: 2, membersLimit: 5,
        storageUsedMb: 100, storagelimitMb: 5000,
      }} onUpgrade={mockUpgrade} />);
      expect(screen.getByText('อัพเกรดแพลน')).toBeDefined();
    });

    it('hides upgrade button for enterprise', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'ENTERPRISE', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      render(<UsageDashboard metrics={{
        orgId: 'org-1', period: '2026-08',
        jobsCreated: 5, jobsLimit: 9999,
        membersCount: 50, membersLimit: 999,
        storageUsedMb: 5000, storagelimitMb: 100000,
      }} onUpgrade={() => {}} />);
      expect(screen.queryByText('อัพเกรดแพลน')).toBeNull();
    });

    it('shows remaining quotas in summary cards', async () => {
      const { useTenantStore } = await import('../tenant/tenantStore');
      useTenantStore.setState({
        currentOrg: { orgId: 'org-1', name: 'TestOrg', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any,
        currentMember: { role: 'OWNER', userId: 'u1' } as any,
      });
      const { UsageDashboard } = await import('../tenant/UsageDashboard');
      render(<UsageDashboard metrics={{
        orgId: 'org-1', period: '2026-08',
        jobsCreated: 100, jobsLimit: 200,
        membersCount: 15, membersLimit: 20,
        storageUsedMb: 10000, storagelimitMb: 25000,
      }} />);
      expect(screen.getByText('100')).toBeDefined(); // 200-100 remaining jobs
      expect(screen.getByText('5')).toBeDefined(); // 20-15 remaining members
      expect(screen.getByText('งานเหลือเดือนนี้')).toBeDefined();
      expect(screen.getByText('ที่นั่งว่าง')).toBeDefined();
    });
  });

  // ============================================================================
  // Grace Period Tests
  // ============================================================================

  describe('tenant/gracePeriod.ts', () => {
    it('calculateGraceExpiry adds grace days', async () => {
      const { calculateGraceExpiry } = await import('../tenant/gracePeriod');
      const start = new Date('2026-08-01T00:00:00Z');
      const expiry = calculateGraceExpiry(start);
      expect(expiry.toISOString()).toBe('2026-08-08T00:00:00.000Z'); // +7 days
    });

    it('calculateGraceExpiry respects custom config', async () => {
      const { calculateGraceExpiry } = await import('../tenant/gracePeriod');
      const start = new Date('2026-08-01T00:00:00Z');
      const expiry = calculateGraceExpiry(start, { graceDays: 14, reminderDays: [3, 7, 14], fallbackPlan: 'FREE' });
      expect(expiry.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    });

    it('getRemainingGraceDays returns positive for future expiry', async () => {
      const { getRemainingGraceDays } = await import('../tenant/gracePeriod');
      const future = new Date();
      future.setDate(future.getDate() + 3);
      const state = { expiresAt: future.toISOString() } as any;
      const days = getRemainingGraceDays(state);
      expect(days).toBeGreaterThanOrEqual(2);
      expect(days).toBeLessThanOrEqual(4);
    });

    it('getRemainingGraceDays returns 0 for past expiry', async () => {
      const { getRemainingGraceDays } = await import('../tenant/gracePeriod');
      const past = new Date('2026-01-01');
      const state = { expiresAt: past.toISOString() } as any;
      expect(getRemainingGraceDays(state)).toBe(0);
    });

    it('isGracePeriodExpired returns true for past date', async () => {
      const { isGracePeriodExpired } = await import('../tenant/gracePeriod');
      const state = { expiresAt: '2020-01-01T00:00:00Z' } as any;
      expect(isGracePeriodExpired(state)).toBe(true);
    });

    it('isGracePeriodExpired returns false for future date', async () => {
      const { isGracePeriodExpired } = await import('../tenant/gracePeriod');
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const state = { expiresAt: future.toISOString() } as any;
      expect(isGracePeriodExpired(state)).toBe(false);
    });

    it('createGracePeriod produces valid state', async () => {
      const { createGracePeriod } = await import('../tenant/gracePeriod');
      const gp = createGracePeriod('org-123', 'payment_failed');
      expect(gp.orgId).toBe('org-123');
      expect(gp.reason).toBe('payment_failed');
      expect(gp.status).toBe('active');
      expect(gp.remindersSent).toEqual([]);
      expect(new Date(gp.expiresAt) > new Date(gp.startedAt)).toBe(true);
    });

    it('resolveGracePeriod sets status to resolved', async () => {
      const { createGracePeriod, resolveGracePeriod } = await import('../tenant/gracePeriod');
      const gp = createGracePeriod('org-1', 'payment_failed');
      const resolved = resolveGracePeriod(gp);
      expect(resolved.status).toBe('resolved');
      expect(resolved.orgId).toBe('org-1');
    });

    it('expireGracePeriod sets status to expired', async () => {
      const { createGracePeriod, expireGracePeriod } = await import('../tenant/gracePeriod');
      const gp = createGracePeriod('org-1', 'trial_expired');
      const expired = expireGracePeriod(gp);
      expect(expired.status).toBe('expired');
    });

    it('getNextReminder returns day when due', async () => {
      const { getNextReminder } = await import('../tenant/gracePeriod');
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const state = {
        startedAt: twoDaysAgo.toISOString(),
        remindersSent: [1], // day 1 already sent
      } as any;
      // Should need day 3 next (but only 2 days elapsed, so...)
      // Actually day 1 is elapsed ≥ 1, sent. Day 3 not yet elapsed.
      // If 2 days elapsed, reminder at day 1 already sent, day 3 not yet due
      const next = getNextReminder(state);
      // 2 days elapsed, [1] sent → check day 3: 2 >= 3? no → null
      expect(next).toBeNull();
    });

    it('getNextReminder returns reminder day when elapsed', async () => {
      const { getNextReminder } = await import('../tenant/gracePeriod');
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
      const state = {
        startedAt: fourDaysAgo.toISOString(),
        remindersSent: [1], // only day 1 sent
      } as any;
      const next = getNextReminder(state);
      expect(next).toBe(3); // day 3 is due (4 >= 3) and not in sent
    });

    it('buildGraceStartEmail creates correct notification', async () => {
      const { buildGraceStartEmail } = await import('../tenant/gracePeriod');
      const email = buildGraceStartEmail('owner@test.com', 'TestOrg', 7);
      expect(email.to).toBe('owner@test.com');
      expect(email.subject).toContain('การชำระเงินล้มเหลว');
      expect(email.variables.org_name).toBe('TestOrg');
      expect(email.variables.grace_days).toBe('7');
    });

    it('buildGraceReminderEmail for last day uses final warning template', async () => {
      const { buildGraceReminderEmail } = await import('../tenant/gracePeriod');
      const email = buildGraceReminderEmail('owner@test.com', 'TestOrg', 1);
      expect(email.subject).toContain('สุดท้าย');
      expect(email.templateId).toBe('tmpl_grace_final');
    });

    it('buildGraceReminderEmail for non-last day uses reminder template', async () => {
      const { buildGraceReminderEmail } = await import('../tenant/gracePeriod');
      const email = buildGraceReminderEmail('owner@test.com', 'TestOrg', 4);
      expect(email.templateId).toBe('tmpl_grace_reminder');
      expect(email.subject).toContain('4');
    });

    it('buildDowngradeEmail creates correct notification', async () => {
      const { buildDowngradeEmail } = await import('../tenant/gracePeriod');
      const email = buildDowngradeEmail('owner@test.com', 'Org', 'PROFESSIONAL');
      expect(email.subject).toContain('ดาวน์เกรด');
      expect(email.variables.previous_plan).toBe('PROFESSIONAL');
      expect(email.variables.new_plan).toBe('FREE');
    });

    it('buildCancellationReminderEmail includes days left', async () => {
      const { buildCancellationReminderEmail } = await import('../tenant/gracePeriod');
      const email = buildCancellationReminderEmail('o@t.com', 'Org', 3, 'STARTER');
      expect(email.subject).toContain('3');
      expect(email.variables.current_plan).toBe('STARTER');
    });

    it('buildPaymentSuccessEmail notifies resolution', async () => {
      const { buildPaymentSuccessEmail } = await import('../tenant/gracePeriod');
      const email = buildPaymentSuccessEmail('o@t.com', 'Org', 'PROFESSIONAL');
      expect(email.subject).toContain('สำเร็จ');
      expect(email.variables.plan).toBe('PROFESSIONAL');
    });

    it('processGracePeriods triggers downgrade for expired', async () => {
      const { processGracePeriods } = await import('../tenant/gracePeriod');
      const actions = processGracePeriods(
        [{ orgId: 'org-1', status: 'active', expiresAt: '2020-01-01T00:00:00Z', startedAt: '2019-12-25', remindersSent: [1, 3, 5, 7] }] as any,
        { 'org-1': { email: 'o@t.com', orgName: 'Org', plan: 'STARTER' } }
      );
      expect(actions[0].type).toBe('downgrade');
      expect(actions[0].email?.subject).toContain('ดาวน์เกรด');
    });

    it('processGracePeriods skips resolved periods', async () => {
      const { processGracePeriods } = await import('../tenant/gracePeriod');
      const actions = processGracePeriods(
        [{ orgId: 'org-1', status: 'resolved', expiresAt: '2020-01-01', startedAt: '2019-12-25', remindersSent: [] }] as any,
        { 'org-1': { email: 'o@t.com', orgName: 'Org', plan: 'STARTER' } }
      );
      expect(actions).toHaveLength(0);
    });

    it('generateGracePeriodMigration produces valid SQL', async () => {
      const { generateGracePeriodMigration } = await import('../tenant/gracePeriod');
      const sql = generateGracePeriodMigration();
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS grace_periods');
      expect(sql).toContain('ROW LEVEL SECURITY');
      expect(sql).toContain('expires_at TIMESTAMPTZ');
    });

    it('generateGracePeriodCronSql produces pg_cron schedule', async () => {
      const { generateGracePeriodCronSql } = await import('../tenant/gracePeriod');
      const sql = generateGracePeriodCronSql();
      expect(sql).toContain('cron.schedule');
      expect(sql).toContain('process-grace-periods');
      expect(sql).toContain("plan = 'FREE'");
    });

    it('DEFAULT_GRACE_CONFIG has expected values', async () => {
      const { DEFAULT_GRACE_CONFIG } = await import('../tenant/gracePeriod');
      expect(DEFAULT_GRACE_CONFIG.graceDays).toBe(7);
      expect(DEFAULT_GRACE_CONFIG.reminderDays).toEqual([1, 3, 5, 7]);
      expect(DEFAULT_GRACE_CONFIG.fallbackPlan).toBe('FREE');
    });

    it('EMAIL_TEMPLATES has all template keys', async () => {
      const { EMAIL_TEMPLATES } = await import('../tenant/gracePeriod');
      expect(EMAIL_TEMPLATES.grace_period_started.templateId).toBe('tmpl_grace_start');
      expect(EMAIL_TEMPLATES.grace_period_reminder.templateId).toBe('tmpl_grace_reminder');
      expect(EMAIL_TEMPLATES.grace_period_final_warning.templateId).toBe('tmpl_grace_final');
      expect(EMAIL_TEMPLATES.plan_downgraded.templateId).toBe('tmpl_plan_downgraded');
      expect(EMAIL_TEMPLATES.cancellation_reminder.templateId).toBe('tmpl_cancel_reminder');
      expect(EMAIL_TEMPLATES.payment_retry_success.templateId).toBe('tmpl_payment_success');
    });
  });
});
