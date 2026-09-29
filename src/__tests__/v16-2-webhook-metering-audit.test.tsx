/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ============================================================================
// Usage Metering Tests
// ============================================================================

describe('v16.2 — Webhook + Usage Metering + Audit Log', () => {
  afterEach(() => cleanup());

  describe('tenant/usageMetering.ts', () => {
    it('getCurrentPeriod returns YYYY-MM format', async () => {
      const { getCurrentPeriod } = await import('../tenant/usageMetering');
      const period = getCurrentPeriod(new Date('2026-08-15'));
      expect(period).toBe('2026-08');
    });

    it('getCurrentPeriod handles January correctly', async () => {
      const { getCurrentPeriod } = await import('../tenant/usageMetering');
      const period = getCurrentPeriod(new Date('2026-01-01'));
      expect(period).toBe('2026-01');
    });

    it('getPeriodRange returns start and end of month', async () => {
      const { getPeriodRange } = await import('../tenant/usageMetering');
      const { start, end } = getPeriodRange('2026-08');
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(7); // 0-indexed
      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(31); // August has 31 days
    });

    it('isInPeriod returns true for date within period', async () => {
      const { isInPeriod } = await import('../tenant/usageMetering');
      expect(isInPeriod(new Date('2026-08-15'), '2026-08')).toBe(true);
    });

    it('isInPeriod returns false for date outside period', async () => {
      const { isInPeriod } = await import('../tenant/usageMetering');
      expect(isInPeriod(new Date('2026-09-01'), '2026-08')).toBe(false);
    });

    it('canCreateJob allows when under limit', async () => {
      const { canCreateJob } = await import('../tenant/usageMetering');
      const org = { plan: 'STARTER', status: 'ACTIVE' } as any;
      const result = canCreateJob(org, 30);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.current).toBe(30);
    });

    it('canCreateJob blocks when at limit', async () => {
      const { canCreateJob } = await import('../tenant/usageMetering');
      const org = { plan: 'FREE', status: 'ACTIVE' } as any;
      const result = canCreateJob(org, 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit reached');
    });

    it('canCreateJob blocks suspended orgs', async () => {
      const { canCreateJob } = await import('../tenant/usageMetering');
      const org = { plan: 'PROFESSIONAL', status: 'SUSPENDED' } as any;
      const result = canCreateJob(org, 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('suspended');
    });

    it('canInviteMember allows when under limit', async () => {
      const { canInviteMember } = await import('../tenant/usageMetering');
      const org = { plan: 'PROFESSIONAL', status: 'ACTIVE' } as any;
      const result = canInviteMember(org, 15);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(20);
    });

    it('canInviteMember blocks when at limit', async () => {
      const { canInviteMember } = await import('../tenant/usageMetering');
      const org = { plan: 'STARTER', status: 'ACTIVE' } as any;
      const result = canInviteMember(org, 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Member limit');
    });

    it('canUseFeature returns true for allowed feature', async () => {
      const { canUseFeature } = await import('../tenant/usageMetering');
      const org = { plan: 'PROFESSIONAL', status: 'ACTIVE' } as any;
      expect(canUseFeature(org, 'curved_panels')).toBe(true);
    });

    it('canUseFeature returns false for disallowed feature', async () => {
      const { canUseFeature } = await import('../tenant/usageMetering');
      const org = { plan: 'FREE', status: 'ACTIVE' } as any;
      expect(canUseFeature(org, 'curved_panels')).toBe(false);
    });

    it('canUseFeature returns false for suspended org', async () => {
      const { canUseFeature } = await import('../tenant/usageMetering');
      const org = { plan: 'ENTERPRISE', status: 'SUSPENDED' } as any;
      expect(canUseFeature(org, 'api_access')).toBe(false);
    });

    it('canUploadFile allows when under storage limit', async () => {
      const { canUploadFile } = await import('../tenant/usageMetering');
      const org = { plan: 'STARTER', status: 'ACTIVE' } as any;
      const result = canUploadFile(org, 1000, 50);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5000);
    });

    it('canUploadFile blocks when would exceed limit', async () => {
      const { canUploadFile } = await import('../tenant/usageMetering');
      const org = { plan: 'FREE', status: 'ACTIVE' } as any;
      const result = canUploadFile(org, 490, 20);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeded');
    });

    it('getUsageAlerts returns blocked alert when at 100%', async () => {
      const { getUsageAlerts } = await import('../tenant/usageMetering');
      const metrics = {
        orgId: 'test',
        period: '2026-08',
        jobsCreated: 10,
        jobsLimit: 10,
        membersCount: 2,
        membersLimit: 5,
        storageUsedMb: 100,
        storagelimitMb: 500,
      };
      const alerts = getUsageAlerts(metrics);
      expect(alerts.some(a => a.type === 'blocked' && a.resource === 'jobs')).toBe(true);
    });

    it('getUsageAlerts returns warning at 80%+', async () => {
      const { getUsageAlerts } = await import('../tenant/usageMetering');
      const metrics = {
        orgId: 'test',
        period: '2026-08',
        jobsCreated: 42,
        jobsLimit: 50,
        membersCount: 2,
        membersLimit: 5,
        storageUsedMb: 100,
        storagelimitMb: 500,
      };
      const alerts = getUsageAlerts(metrics);
      expect(alerts.some(a => a.resource === 'jobs' && (a.type === 'warning' || a.type === 'critical'))).toBe(true);
    });

    it('getUsageAlerts returns empty for low usage', async () => {
      const { getUsageAlerts } = await import('../tenant/usageMetering');
      const metrics = {
        orgId: 'test',
        period: '2026-08',
        jobsCreated: 5,
        jobsLimit: 200,
        membersCount: 3,
        membersLimit: 20,
        storageUsedMb: 100,
        storagelimitMb: 25000,
      };
      const alerts = getUsageAlerts(metrics);
      expect(alerts).toHaveLength(0);
    });

    it('buildUsageMetrics produces correct shape', async () => {
      const { buildUsageMetrics } = await import('../tenant/usageMetering');
      const org = { orgId: 'org-123', plan: 'PROFESSIONAL', status: 'ACTIVE' } as any;
      const metrics = buildUsageMetrics(org, 45, 12, 5000);
      expect(metrics.orgId).toBe('org-123');
      expect(metrics.jobsCreated).toBe(45);
      expect(metrics.jobsLimit).toBe(200);
      expect(metrics.membersCount).toBe(12);
      expect(metrics.membersLimit).toBe(20);
      expect(metrics.storageUsedMb).toBe(5000);
    });

    it('enforceLimit returns null when allowed', async () => {
      const { enforceLimit } = await import('../tenant/usageMetering');
      const org = { plan: 'PROFESSIONAL', status: 'ACTIVE' } as any;
      const result = enforceLimit('jobs', org, 50);
      expect(result).toBeNull();
    });

    it('enforceLimit returns error message when exceeded', async () => {
      const { enforceLimit } = await import('../tenant/usageMetering');
      const org = { plan: 'FREE', status: 'ACTIVE' } as any;
      const result = enforceLimit('jobs', org, 10);
      expect(result).toContain('เกินโควตา');
    });

    it('enforceLimit blocks suspended org', async () => {
      const { enforceLimit } = await import('../tenant/usageMetering');
      const org = { plan: 'ENTERPRISE', status: 'SUSPENDED' } as any;
      const result = enforceLimit('jobs', org, 0);
      expect(result).toContain('ระงับ');
    });

    it('PLAN_STORAGE_LIMITS has all plans', async () => {
      const { PLAN_STORAGE_LIMITS } = await import('../tenant/usageMetering');
      expect(PLAN_STORAGE_LIMITS.FREE).toBe(500);
      expect(PLAN_STORAGE_LIMITS.STARTER).toBe(5000);
      expect(PLAN_STORAGE_LIMITS.PROFESSIONAL).toBe(25000);
      expect(PLAN_STORAGE_LIMITS.ENTERPRISE).toBe(100000);
    });

    it('generateUsageMeteringRpc produces valid SQL', async () => {
      const { generateUsageMeteringRpc } = await import('../tenant/usageMetering');
      const sql = generateUsageMeteringRpc();
      expect(sql).toContain('CREATE OR REPLACE FUNCTION get_org_usage');
      expect(sql).toContain('p_org_id UUID');
      expect(sql).toContain('RETURNS JSON');
    });
  });

  // ============================================================================
  // Audit Log Tests
  // ============================================================================

  describe('tenant/auditLog.ts', () => {
    it('AUDIT_ACTION_LABELS has all actions', async () => {
      const { AUDIT_ACTION_LABELS } = await import('../tenant/auditLog');
      expect(AUDIT_ACTION_LABELS['member.invited']).toBe('เชิญสมาชิก');
      expect(AUDIT_ACTION_LABELS['billing.subscription_created']).toBe('สร้างการสมัครสมาชิก');
      expect(AUDIT_ACTION_LABELS['job.created']).toBe('สร้างงาน');
      expect(AUDIT_ACTION_LABELS['auth.login']).toBe('เข้าสู่ระบบ');
      expect(AUDIT_ACTION_LABELS['storage.file_uploaded']).toBe('อัพโหลดไฟล์');
    });

    it('getActionCategory extracts category from action', async () => {
      const { getActionCategory } = await import('../tenant/auditLog');
      expect(getActionCategory('member.invited')).toBe('member');
      expect(getActionCategory('billing.plan_upgraded')).toBe('billing');
      expect(getActionCategory('job.status_changed')).toBe('job');
      expect(getActionCategory('auth.login')).toBe('auth');
      expect(getActionCategory('storage.file_uploaded')).toBe('storage');
    });

    it('getActionSeverity returns correct levels', async () => {
      const { getActionSeverity } = await import('../tenant/auditLog');
      expect(getActionSeverity('billing.payment_failed')).toBe('error');
      expect(getActionSeverity('member.removed')).toBe('error');
      expect(getActionSeverity('billing.plan_downgraded')).toBe('warning');
      expect(getActionSeverity('member.joined')).toBe('success');
      expect(getActionSeverity('billing.plan_upgraded')).toBe('success');
      expect(getActionSeverity('settings.org_updated')).toBe('info');
    });

    it('formatAuditDescription formats member.invited', async () => {
      const { formatAuditDescription } = await import('../tenant/auditLog');
      const entry = {
        id: '1',
        orgId: 'org-1',
        action: 'member.invited' as const,
        actorType: 'user' as const,
        actorId: 'u1',
        actorName: 'Admin',
        targetName: 'newuser@example.com',
        createdAt: '2026-08-28T00:00:00Z',
      };
      const desc = formatAuditDescription(entry);
      expect(desc).toContain('Admin');
      expect(desc).toContain('เชิญ');
      expect(desc).toContain('newuser@example.com');
    });

    it('formatAuditDescription formats job.created', async () => {
      const { formatAuditDescription } = await import('../tenant/auditLog');
      const entry = {
        id: '2',
        orgId: 'org-1',
        action: 'job.created' as const,
        actorType: 'user' as const,
        actorId: 'u2',
        actorName: 'Designer',
        targetName: 'JOB-001',
        createdAt: '2026-08-28T00:00:00Z',
      };
      const desc = formatAuditDescription(entry);
      expect(desc).toContain('Designer');
      expect(desc).toContain('สร้างงาน');
      expect(desc).toContain('JOB-001');
    });

    it('formatAuditDescription formats billing.payment_failed', async () => {
      const { formatAuditDescription } = await import('../tenant/auditLog');
      const entry = {
        id: '3',
        orgId: 'org-1',
        action: 'billing.payment_failed' as const,
        actorType: 'system' as const,
        actorId: 'stripe-webhook',
        createdAt: '2026-08-28T00:00:00Z',
      };
      const desc = formatAuditDescription(entry);
      expect(desc).toContain('ล้มเหลว');
    });

    it('getAuditIcon returns correct icon for each category', async () => {
      const { getAuditIcon } = await import('../tenant/auditLog');
      expect(getAuditIcon('member.invited')).toBe('users');
      expect(getAuditIcon('billing.invoice_paid')).toBe('credit-card');
      expect(getAuditIcon('job.created')).toBe('briefcase');
      expect(getAuditIcon('settings.org_updated')).toBe('settings');
      expect(getAuditIcon('auth.login')).toBe('shield');
      expect(getAuditIcon('storage.file_uploaded')).toBe('hard-drive');
    });

    it('recordAuditEntry calls supabase insert', async () => {
      const { recordAuditEntry } = await import('../tenant/auditLog');
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = { from: () => ({ insert: mockInsert }) };

      const result = await recordAuditEntry(mockSupabase as any, {
        orgId: 'org-123',
        action: 'job.created',
        actorType: 'user',
        actorId: 'user-456',
        actorName: 'Test User',
        targetName: 'JOB-007',
      });

      expect(result.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-123',
          action: 'job.created',
          actor_type: 'user',
          actor_id: 'user-456',
        })
      );
    });

    it('recordAuditEntry returns error on failure', async () => {
      const { recordAuditEntry } = await import('../tenant/auditLog');
      const mockInsert = vi.fn().mockResolvedValue({ error: 'DB Error' });
      const mockSupabase = { from: () => ({ insert: mockInsert }) };

      const result = await recordAuditEntry(mockSupabase as any, {
        orgId: 'org-123',
        action: 'job.created',
        actorType: 'user',
        actorId: 'user-456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('generateAuditLogMigration produces valid SQL', async () => {
      const { generateAuditLogMigration } = await import('../tenant/auditLog');
      const sql = generateAuditLogMigration();
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS audit_logs');
      expect(sql).toContain('ROW LEVEL SECURITY');
      expect(sql).toContain('org_id UUID NOT NULL');
      expect(sql).toContain('idx_audit_logs_org_created');
    });
  });

  // ============================================================================
  // Stripe Webhook Edge Function (unit tests on exported logic)
  // ============================================================================

  describe('stripe-webhook (signature verification logic)', () => {
    it('PRICE_TO_PLAN mapping covers all paid plans', async () => {
      // We test the mapping logic via usageMetering/billing since Edge Function
      // runs in Deno and can't be directly imported in Vitest
      const { PLAN_PRICING } = await import('../tenant/billing');
      const priceIds = PLAN_PRICING
        .filter(p => p.plan !== 'FREE')
        .flatMap(p => [p.stripePriceIdMonthly, p.stripePriceIdYearly]);
      expect(priceIds.length).toBe(6);
      expect(priceIds.every(id => id.length > 0)).toBe(true);
    });

    it('stripePriceToOrgPlan maps all price IDs correctly', async () => {
      const { stripePriceToOrgPlan } = await import('../tenant/billing');
      expect(stripePriceToOrgPlan('price_starter_monthly')).toBe('STARTER');
      expect(stripePriceToOrgPlan('price_starter_yearly')).toBe('STARTER');
      expect(stripePriceToOrgPlan('price_pro_monthly')).toBe('PROFESSIONAL');
      expect(stripePriceToOrgPlan('price_pro_yearly')).toBe('PROFESSIONAL');
      expect(stripePriceToOrgPlan('price_enterprise_monthly')).toBe('ENTERPRISE');
      expect(stripePriceToOrgPlan('price_enterprise_yearly')).toBe('ENTERPRISE');
      expect(stripePriceToOrgPlan('unknown')).toBeNull();
    });

    it('stripePriceToInterval detects monthly and yearly', async () => {
      const { stripePriceToInterval } = await import('../tenant/billing');
      expect(stripePriceToInterval('price_starter_monthly')).toBe('monthly');
      expect(stripePriceToInterval('price_starter_yearly')).toBe('yearly');
      expect(stripePriceToInterval('price_pro_monthly')).toBe('monthly');
      expect(stripePriceToInterval('unknown')).toBeNull();
    });
  });
});
