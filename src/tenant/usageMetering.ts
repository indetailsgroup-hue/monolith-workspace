/**
 * tenant/usageMetering.ts — Plan Limit Enforcement for MONOLITH Multi-Tenant
 *
 * Provides:
 * - Real-time usage tracking (jobs/month, members count)
 * - Plan limit gate checks (canCreateJob, canInviteMember, canUseFeature)
 * - Usage summary for dashboard display
 * - Overage detection and alerts
 * - Period reset logic
 *
 * All checks are org-scoped and enforce PLAN_LIMITS from types.ts.
 */

import type { OrgPlan, Organization } from './types';
import { PLAN_LIMITS } from './types';

// ============================================================================
// Types
// ============================================================================

export interface UsageMetrics {
  orgId: string;
  period: string;           // YYYY-MM format
  jobsCreated: number;
  jobsLimit: number;
  membersCount: number;
  membersLimit: number;
  storageUsedMb: number;
  storagelimitMb: number;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
  percentUsed: number;
}

export interface UsageAlert {
  type: 'warning' | 'critical' | 'blocked';
  resource: 'jobs' | 'members' | 'storage';
  message: string;
  percentUsed: number;
}

export type UsageResource = 'jobs' | 'members' | 'storage';

// Storage limits per plan (MB)
export const PLAN_STORAGE_LIMITS: Record<OrgPlan, number> = {
  FREE: 500,           // 500 MB
  STARTER: 5000,       // 5 GB
  PROFESSIONAL: 25000, // 25 GB
  ENTERPRISE: 100000,  // 100 GB
};

// Alert thresholds
const WARNING_THRESHOLD = 0.8;   // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%

// ============================================================================
// Period Utilities
// ============================================================================

/**
 * Get current billing period string (YYYY-MM).
 */
export function getCurrentPeriod(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get start and end dates for a billing period.
 */
export function getPeriodRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Check if a date falls within a billing period.
 */
export function isInPeriod(date: Date, period: string): boolean {
  const { start, end } = getPeriodRange(period);
  return date >= start && date <= end;
}

// ============================================================================
// Usage Checks — Gate Functions
// ============================================================================

/**
 * Check if an org can create a new job this period.
 */
export function canCreateJob(
  org: Organization,
  currentJobCount: number
): UsageCheckResult {
  const limit = PLAN_LIMITS[org.plan].maxJobsPerMonth;
  const percentUsed = limit === 0 ? 100 : (currentJobCount / limit) * 100;

  if (org.status === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'Organization is suspended. Please resolve billing issues.',
      current: currentJobCount,
      limit,
      percentUsed,
    };
  }

  if (currentJobCount >= limit) {
    return {
      allowed: false,
      reason: `Monthly job limit reached (${currentJobCount}/${limit}). Upgrade your plan for more.`,
      current: currentJobCount,
      limit,
      percentUsed: 100,
    };
  }

  return {
    allowed: true,
    current: currentJobCount,
    limit,
    percentUsed,
  };
}

/**
 * Check if an org can invite a new member.
 */
export function canInviteMember(
  org: Organization,
  currentMemberCount: number
): UsageCheckResult {
  const limit = PLAN_LIMITS[org.plan].maxUsers;
  const percentUsed = limit === 0 ? 100 : (currentMemberCount / limit) * 100;

  if (org.status === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'Organization is suspended. Please resolve billing issues.',
      current: currentMemberCount,
      limit,
      percentUsed,
    };
  }

  if (currentMemberCount >= limit) {
    return {
      allowed: false,
      reason: `Member limit reached (${currentMemberCount}/${limit}). Upgrade your plan for more seats.`,
      current: currentMemberCount,
      limit,
      percentUsed: 100,
    };
  }

  return {
    allowed: true,
    current: currentMemberCount,
    limit,
    percentUsed,
  };
}

/**
 * Check if an org can use a specific feature.
 */
export function canUseFeature(org: Organization, feature: string): boolean {
  if (org.status === 'SUSPENDED') return false;
  return PLAN_LIMITS[org.plan].features.includes(feature);
}

/**
 * Check storage usage against plan limit.
 */
export function canUploadFile(
  org: Organization,
  currentStorageMb: number,
  fileSizeMb: number
): UsageCheckResult {
  const limit = PLAN_STORAGE_LIMITS[org.plan];
  const afterUpload = currentStorageMb + fileSizeMb;
  const percentUsed = (afterUpload / limit) * 100;

  if (org.status === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'Organization is suspended. Please resolve billing issues.',
      current: currentStorageMb,
      limit,
      percentUsed: (currentStorageMb / limit) * 100,
    };
  }

  if (afterUpload > limit) {
    return {
      allowed: false,
      reason: `Storage limit would be exceeded (${currentStorageMb.toFixed(1)}/${limit} MB used). Upgrade for more storage.`,
      current: currentStorageMb,
      limit,
      percentUsed: (currentStorageMb / limit) * 100,
    };
  }

  return {
    allowed: true,
    current: currentStorageMb,
    limit,
    percentUsed,
  };
}

// ============================================================================
// Usage Alerts
// ============================================================================

/**
 * Generate usage alerts based on current metrics.
 */
export function getUsageAlerts(metrics: UsageMetrics): UsageAlert[] {
  const alerts: UsageAlert[] = [];

  // Jobs alerts
  const jobPercent = metrics.jobsLimit > 0
    ? metrics.jobsCreated / metrics.jobsLimit
    : 0;
  if (jobPercent >= 1) {
    alerts.push({
      type: 'blocked',
      resource: 'jobs',
      message: `คุณใช้งานครบ ${metrics.jobsLimit} งาน/เดือนแล้ว กรุณาอัพเกรดแพลน`,
      percentUsed: 100,
    });
  } else if (jobPercent >= CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'critical',
      resource: 'jobs',
      message: `เหลือโควตางานอีก ${metrics.jobsLimit - metrics.jobsCreated} งานเดือนนี้`,
      percentUsed: jobPercent * 100,
    });
  } else if (jobPercent >= WARNING_THRESHOLD) {
    alerts.push({
      type: 'warning',
      resource: 'jobs',
      message: `ใช้โควตางานไปแล้ว ${Math.round(jobPercent * 100)}%`,
      percentUsed: jobPercent * 100,
    });
  }

  // Members alerts
  const memberPercent = metrics.membersLimit > 0
    ? metrics.membersCount / metrics.membersLimit
    : 0;
  if (memberPercent >= 1) {
    alerts.push({
      type: 'blocked',
      resource: 'members',
      message: `ที่นั่งสมาชิกเต็มแล้ว (${metrics.membersCount}/${metrics.membersLimit})`,
      percentUsed: 100,
    });
  } else if (memberPercent >= CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'critical',
      resource: 'members',
      message: `เหลือที่นั่งสมาชิกอีก ${metrics.membersLimit - metrics.membersCount} คน`,
      percentUsed: memberPercent * 100,
    });
  }

  // Storage alerts
  const storagePercent = metrics.storagelimitMb > 0
    ? metrics.storageUsedMb / metrics.storagelimitMb
    : 0;
  if (storagePercent >= 1) {
    alerts.push({
      type: 'blocked',
      resource: 'storage',
      message: `พื้นที่จัดเก็บเต็มแล้ว กรุณาอัพเกรดแพลน`,
      percentUsed: 100,
    });
  } else if (storagePercent >= CRITICAL_THRESHOLD) {
    alerts.push({
      type: 'critical',
      resource: 'storage',
      message: `พื้นที่จัดเก็บเหลือน้อยกว่า 5%`,
      percentUsed: storagePercent * 100,
    });
  }

  return alerts;
}

// ============================================================================
// Usage Summary Builder
// ============================================================================

/**
 * Build a usage metrics object for display.
 */
export function buildUsageMetrics(
  org: Organization,
  jobsCreatedThisPeriod: number,
  currentMemberCount: number,
  storageUsedMb: number
): UsageMetrics {
  return {
    orgId: org.orgId,
    period: getCurrentPeriod(),
    jobsCreated: jobsCreatedThisPeriod,
    jobsLimit: PLAN_LIMITS[org.plan].maxJobsPerMonth,
    membersCount: currentMemberCount,
    membersLimit: PLAN_LIMITS[org.plan].maxUsers,
    storageUsedMb,
    storagelimitMb: PLAN_STORAGE_LIMITS[org.plan],
  };
}

// ============================================================================
// Supabase Query Helpers
// ============================================================================

/**
 * SQL for counting jobs in the current billing period.
 * Use with supabase.rpc() or inline.
 */
export function jobCountQuery(orgId: string, period: string): string {
  const { start, end } = getPeriodRange(period);
  return `
    SELECT COUNT(*) as job_count
    FROM jobs
    WHERE org_id = '${orgId}'
      AND created_at >= '${start.toISOString()}'
      AND created_at <= '${end.toISOString()}'
  `;
}

/**
 * SQL for counting active members in an org.
 */
export function memberCountQuery(orgId: string): string {
  return `
    SELECT COUNT(*) as member_count
    FROM org_members
    WHERE org_id = '${orgId}'
      AND status = 'active'
  `;
}

/**
 * Generate Supabase RPC function for usage metering.
 */
export function generateUsageMeteringRpc(): string {
  return `
-- Function: get_org_usage(org_id UUID)
-- Returns current period usage metrics for an organization
CREATE OR REPLACE FUNCTION get_org_usage(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
  v_job_count INTEGER;
  v_member_count INTEGER;
  v_storage_bytes BIGINT;
  v_period_start TIMESTAMPTZ;
BEGIN
  -- Current period start (first of month)
  v_period_start := date_trunc('month', NOW());

  -- Count jobs this period
  SELECT COUNT(*) INTO v_job_count
  FROM jobs
  WHERE org_id = p_org_id
    AND created_at >= v_period_start;

  -- Count active members
  SELECT COUNT(*) INTO v_member_count
  FROM org_members
  WHERE org_id = p_org_id
    AND status = 'active';

  -- Sum storage usage (from storage.objects)
  SELECT COALESCE(SUM(metadata->>'size')::BIGINT, 0) INTO v_storage_bytes
  FROM storage.objects
  WHERE bucket_id = 'org-files'
    AND (storage.foldername(name))[1] = p_org_id::TEXT;

  RETURN json_build_object(
    'jobs_created', v_job_count,
    'members_count', v_member_count,
    'storage_used_mb', ROUND(v_storage_bytes / 1048576.0, 2),
    'period', to_char(v_period_start, 'YYYY-MM')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
  `.trim();
}

// ============================================================================
// Enforcement Middleware Helper
// ============================================================================

/**
 * Pre-action enforcement check. Call before any resource-creating action.
 * Returns null if allowed, or an error message string if blocked.
 */
export function enforceLimit(
  resource: UsageResource,
  org: Organization,
  currentUsage: number,
  additionalAmount: number = 1
): string | null {
  if (org.status === 'SUSPENDED') {
    return 'องค์กรถูกระงับ กรุณาแก้ไขปัญหาการชำระเงิน';
  }

  switch (resource) {
    case 'jobs': {
      const limit = PLAN_LIMITS[org.plan].maxJobsPerMonth;
      if (currentUsage + additionalAmount > limit) {
        return `เกินโควตางานรายเดือน (${currentUsage}/${limit}) กรุณาอัพเกรดแพลน`;
      }
      break;
    }
    case 'members': {
      const limit = PLAN_LIMITS[org.plan].maxUsers;
      if (currentUsage + additionalAmount > limit) {
        return `เกินจำนวนสมาชิกที่อนุญาต (${currentUsage}/${limit}) กรุณาอัพเกรดแพลน`;
      }
      break;
    }
    case 'storage': {
      const limit = PLAN_STORAGE_LIMITS[org.plan];
      if (currentUsage + additionalAmount > limit) {
        return `พื้นที่จัดเก็บไม่เพียงพอ (${currentUsage.toFixed(1)}/${limit} MB) กรุณาอัพเกรดแพลน`;
      }
      break;
    }
  }

  return null;
}
