/**
 * tenant/gracePeriod.ts — Automated Plan Downgrade Grace Period
 *
 * Handles the lifecycle when a subscription is canceled or payment fails:
 * 1. Payment fails → enter grace period (7 days by default)
 * 2. Send warning emails at day 1, 3, 5, 7
 * 3. After grace period expires → downgrade to FREE
 * 4. Send final downgrade notification
 *
 * Also handles scheduled cancellations (cancel_at_period_end):
 * - Send reminder 7 days before period ends
 * - Send reminder 1 day before
 * - Downgrade at period end
 *
 * Integration:
 * - Called from stripe-webhook on payment_failed events
 * - Scheduled via Supabase pg_cron for daily checks
 * - Email sending via Supabase Edge Functions (Resend/SendGrid)
 */

import type { OrgPlan, Organization } from './types';
import { PLAN_LIMITS } from './types';

// ============================================================================
// Types
// ============================================================================

export interface GracePeriodConfig {
  /** Number of days before auto-downgrade (default: 7) */
  graceDays: number;
  /** Days at which to send reminder emails */
  reminderDays: number[];
  /** Plan to downgrade to after grace period */
  fallbackPlan: OrgPlan;
}

export interface GracePeriodState {
  orgId: string;
  reason: 'payment_failed' | 'subscription_canceled' | 'trial_expired';
  startedAt: string;       // ISO timestamp
  expiresAt: string;       // ISO timestamp
  remindersSent: number[]; // days at which reminders were sent
  status: 'active' | 'resolved' | 'expired';
  metadata?: Record<string, unknown>;
}

export interface EmailNotification {
  to: string;
  subject: string;
  templateId: string;
  variables: Record<string, string>;
  scheduledAt?: string;
}

export type NotificationTemplate =
  | 'grace_period_started'
  | 'grace_period_reminder'
  | 'grace_period_final_warning'
  | 'plan_downgraded'
  | 'cancellation_reminder'
  | 'payment_retry_success';

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_GRACE_CONFIG: GracePeriodConfig = {
  graceDays: 7,
  reminderDays: [1, 3, 5, 7],
  fallbackPlan: 'FREE',
};

export const CANCELLATION_REMINDER_DAYS = [7, 3, 1]; // days before period end

// ============================================================================
// Email Templates
// ============================================================================

interface EmailTemplate {
  subject: string;
  templateId: string;
  priority: 'high' | 'normal' | 'low';
}

export const EMAIL_TEMPLATES: Record<NotificationTemplate, EmailTemplate> = {
  grace_period_started: {
    subject: '⚠️ การชำระเงินล้มเหลว — กรุณาอัพเดทข้อมูลการชำระเงิน',
    templateId: 'tmpl_grace_start',
    priority: 'high',
  },
  grace_period_reminder: {
    subject: '🔔 เตือน: เหลือเวลาอีก {days_left} วันก่อนระบบจะดาวน์เกรดแพลน',
    templateId: 'tmpl_grace_reminder',
    priority: 'high',
  },
  grace_period_final_warning: {
    subject: '🚨 สุดท้าย: แพลนของคุณจะถูกดาวน์เกรดภายใน 24 ชม.',
    templateId: 'tmpl_grace_final',
    priority: 'high',
  },
  plan_downgraded: {
    subject: '📉 แพลนของคุณถูกดาวน์เกรดเป็น Free แล้ว',
    templateId: 'tmpl_plan_downgraded',
    priority: 'normal',
  },
  cancellation_reminder: {
    subject: '📅 แพลนของคุณจะสิ้นสุดในอีก {days_left} วัน',
    templateId: 'tmpl_cancel_reminder',
    priority: 'normal',
  },
  payment_retry_success: {
    subject: '✅ ชำระเงินสำเร็จ — แพลนของคุณกลับมาปกติแล้ว',
    templateId: 'tmpl_payment_success',
    priority: 'normal',
  },
};

// ============================================================================
// Grace Period Logic
// ============================================================================

/**
 * Calculate grace period expiry from start date.
 */
export function calculateGraceExpiry(startDate: Date, config: GracePeriodConfig = DEFAULT_GRACE_CONFIG): Date {
  const expiry = new Date(startDate);
  expiry.setDate(expiry.getDate() + config.graceDays);
  return expiry;
}

/**
 * Get remaining days in grace period.
 */
export function getRemainingGraceDays(state: GracePeriodState): number {
  const now = new Date();
  const expiry = new Date(state.expiresAt);
  const diff = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Check if grace period has expired.
 */
export function isGracePeriodExpired(state: GracePeriodState): boolean {
  return new Date() >= new Date(state.expiresAt);
}

/**
 * Determine which reminder to send based on days elapsed.
 */
export function getNextReminder(
  state: GracePeriodState,
  config: GracePeriodConfig = DEFAULT_GRACE_CONFIG
): number | null {
  const startDate = new Date(state.startedAt);
  const now = new Date();
  const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  for (const day of config.reminderDays) {
    if (daysElapsed >= day && !state.remindersSent.includes(day)) {
      return day;
    }
  }
  return null;
}

/**
 * Create a new grace period state.
 */
export function createGracePeriod(
  orgId: string,
  reason: GracePeriodState['reason'],
  config: GracePeriodConfig = DEFAULT_GRACE_CONFIG
): GracePeriodState {
  const now = new Date();
  return {
    orgId,
    reason,
    startedAt: now.toISOString(),
    expiresAt: calculateGraceExpiry(now, config).toISOString(),
    remindersSent: [],
    status: 'active',
  };
}

/**
 * Resolve a grace period (payment succeeded).
 */
export function resolveGracePeriod(state: GracePeriodState): GracePeriodState {
  return { ...state, status: 'resolved' };
}

/**
 * Mark grace period as expired (will trigger downgrade).
 */
export function expireGracePeriod(state: GracePeriodState): GracePeriodState {
  return { ...state, status: 'expired' };
}

// ============================================================================
// Email Notification Builders
// ============================================================================

/**
 * Build notification for grace period start.
 */
export function buildGraceStartEmail(
  ownerEmail: string,
  orgName: string,
  graceDays: number
): EmailNotification {
  const template = EMAIL_TEMPLATES.grace_period_started;
  return {
    to: ownerEmail,
    subject: template.subject,
    templateId: template.templateId,
    variables: {
      org_name: orgName,
      grace_days: String(graceDays),
      action_url: '/settings/billing',
    },
  };
}

/**
 * Build reminder notification during grace period.
 */
export function buildGraceReminderEmail(
  ownerEmail: string,
  orgName: string,
  daysLeft: number
): EmailNotification {
  const isLastDay = daysLeft <= 1;
  const template = isLastDay
    ? EMAIL_TEMPLATES.grace_period_final_warning
    : EMAIL_TEMPLATES.grace_period_reminder;

  return {
    to: ownerEmail,
    subject: template.subject.replace('{days_left}', String(daysLeft)),
    templateId: template.templateId,
    variables: {
      org_name: orgName,
      days_left: String(daysLeft),
      action_url: '/settings/billing',
    },
  };
}

/**
 * Build downgrade notification.
 */
export function buildDowngradeEmail(
  ownerEmail: string,
  orgName: string,
  previousPlan: OrgPlan
): EmailNotification {
  const template = EMAIL_TEMPLATES.plan_downgraded;
  return {
    to: ownerEmail,
    subject: template.subject,
    templateId: template.templateId,
    variables: {
      org_name: orgName,
      previous_plan: previousPlan,
      new_plan: 'FREE',
      action_url: '/settings/billing',
    },
  };
}

/**
 * Build cancellation reminder.
 */
export function buildCancellationReminderEmail(
  ownerEmail: string,
  orgName: string,
  daysLeft: number,
  currentPlan: OrgPlan
): EmailNotification {
  const template = EMAIL_TEMPLATES.cancellation_reminder;
  return {
    to: ownerEmail,
    subject: template.subject.replace('{days_left}', String(daysLeft)),
    templateId: template.templateId,
    variables: {
      org_name: orgName,
      days_left: String(daysLeft),
      current_plan: currentPlan,
      action_url: '/settings/billing',
    },
  };
}

/**
 * Build payment success notification.
 */
export function buildPaymentSuccessEmail(
  ownerEmail: string,
  orgName: string,
  plan: OrgPlan
): EmailNotification {
  const template = EMAIL_TEMPLATES.payment_retry_success;
  return {
    to: ownerEmail,
    subject: template.subject,
    templateId: template.templateId,
    variables: {
      org_name: orgName,
      plan,
      action_url: '/settings',
    },
  };
}

// ============================================================================
// Scheduled Job Logic (for pg_cron / Edge Function scheduler)
// ============================================================================

/**
 * Process all active grace periods — called daily by scheduler.
 * Returns list of actions to take.
 */
export interface GraceAction {
  type: 'send_reminder' | 'downgrade' | 'noop';
  orgId: string;
  email?: EmailNotification;
}

export function processGracePeriods(
  activeGracePeriods: GracePeriodState[],
  orgOwnerEmails: Record<string, { email: string; orgName: string; plan: OrgPlan }>,
  config: GracePeriodConfig = DEFAULT_GRACE_CONFIG
): GraceAction[] {
  const actions: GraceAction[] = [];

  for (const gp of activeGracePeriods) {
    if (gp.status !== 'active') continue;

    const owner = orgOwnerEmails[gp.orgId];
    if (!owner) continue;

    // Check if expired → downgrade
    if (isGracePeriodExpired(gp)) {
      actions.push({
        type: 'downgrade',
        orgId: gp.orgId,
        email: buildDowngradeEmail(owner.email, owner.orgName, owner.plan),
      });
      continue;
    }

    // Check if reminder is due
    const nextReminder = getNextReminder(gp, config);
    if (nextReminder !== null) {
      const daysLeft = getRemainingGraceDays(gp);
      actions.push({
        type: 'send_reminder',
        orgId: gp.orgId,
        email: buildGraceReminderEmail(owner.email, owner.orgName, daysLeft),
      });
    } else {
      actions.push({ type: 'noop', orgId: gp.orgId });
    }
  }

  return actions;
}

// ============================================================================
// SQL for Scheduled Processing
// ============================================================================

/**
 * Generate pg_cron SQL for daily grace period processing.
 */
export function generateGracePeriodCronSql(): string {
  return `
-- Schedule daily grace period check (runs at 09:00 UTC)
SELECT cron.schedule(
  'process-grace-periods',
  '0 9 * * *',
  $$
    -- Find orgs in grace period that have expired
    UPDATE organizations
    SET plan = 'FREE',
        status = 'ACTIVE',
        max_users = 2,
        max_jobs_per_month = 10,
        stripe_subscription_id = NULL,
        billing_interval = NULL,
        updated_at = NOW()
    WHERE id IN (
      SELECT org_id FROM grace_periods
      WHERE status = 'active'
        AND expires_at < NOW()
    );

    -- Mark those grace periods as expired
    UPDATE grace_periods
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at < NOW();

    -- Notify via Edge Function (calls send-email function)
    SELECT net.http_post(
      url := current_setting('app.edge_function_url') || '/process-grace-notifications',
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body := '{}'::jsonb
    );
  $$
);
  `.trim();
}

/**
 * Generate grace_periods table migration.
 */
export function generateGracePeriodMigration(): string {
  return `
-- Grace Periods tracking table
CREATE TABLE IF NOT EXISTS grace_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('payment_failed', 'subscription_canceled', 'trial_expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reminders_sent INTEGER[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grace_periods_org ON grace_periods(org_id);
CREATE INDEX IF NOT EXISTS idx_grace_periods_status ON grace_periods(status);
CREATE INDEX IF NOT EXISTS idx_grace_periods_expires ON grace_periods(expires_at) WHERE status = 'active';

-- RLS
ALTER TABLE grace_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can view grace periods"
  ON grace_periods FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.role = 'OWNER'
    )
  );

-- Only service role can modify
CREATE POLICY "Service role manages grace periods"
  ON grace_periods FOR ALL
  USING (true)
  WITH CHECK (true);
  `.trim();
}
