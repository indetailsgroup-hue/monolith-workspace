-- ============================================================================
-- Migration: Notifications + Super Admin Tables
-- Version: v16.4.0
-- ============================================================================

-- Notifications table (tenant-scoped)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- target user; use 00000000-0000-0000-0000-000000000000 as broadcast sentinel
  category TEXT NOT NULL CHECK (category IN ('job_status', 'billing', 'team', 'system', 'usage', 'export')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_notifications_org_user ON notifications(org_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(org_id, user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_category ON notifications(org_id, category);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  email_digest JSONB NOT NULL DEFAULT '{"job_status":"immediate","billing":"immediate","team":"daily","system":"weekly","usage":"immediate","export":"none"}',
  in_app_enabled JSONB NOT NULL DEFAULT '{"job_status":true,"billing":true,"team":true,"system":true,"usage":true,"export":true}',
  global_mute BOOLEAN DEFAULT false,
  mute_until TIMESTAMPTZ,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- Email digest queue (for batch sending)
CREATE TABLE IF NOT EXISTS notification_digest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  notification_ids UUID[] NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_digest_queue_pending ON notification_digest_queue(scheduled_at) WHERE sent_at IS NULL;

-- Super Admin users table (platform operators)
CREATE TABLE IF NOT EXISTS super_admins (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  granted_at TIMESTAMPTZ DEFAULT now(),
  granted_by UUID,
  permissions JSONB DEFAULT '{"can_suspend": true, "can_impersonate": true, "can_modify_plans": true, "can_view_billing": true}'
);

-- Platform metrics snapshots (daily aggregation)
CREATE TABLE IF NOT EXISTS platform_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  total_tenants INTEGER NOT NULL,
  active_tenants INTEGER NOT NULL,
  suspended_tenants INTEGER NOT NULL,
  trial_tenants INTEGER NOT NULL,
  total_users INTEGER NOT NULL,
  mrr_thb NUMERIC(12,2) NOT NULL,
  total_jobs_month INTEGER NOT NULL,
  storage_used_gb NUMERIC(8,2) NOT NULL,
  plan_distribution JSONB NOT NULL,
  new_tenants INTEGER NOT NULL DEFAULT 0,
  churned_tenants INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications in their org
CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    AND (user_id = auth.uid() OR user_id = '00000000-0000-0000-0000-000000000000')
  );

-- Users can manage their own preferences
CREATE POLICY prefs_own_only ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Only super admins can access super admin table
CREATE POLICY super_admin_access ON super_admins
  FOR ALL USING (user_id = auth.uid());

-- Auto-cleanup old notifications (> 90 days)
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *', -- 03:00 UTC daily
  $$DELETE FROM notifications WHERE created_at < now() - interval '90 days'$$
);

-- Daily digest processing
SELECT cron.schedule(
  'process-daily-digest',
  '0 8 * * *', -- 08:00 UTC daily
  $$
  INSERT INTO notification_digest_queue (user_id, org_id, notification_ids, frequency, scheduled_at)
  SELECT 
    np.user_id,
    np.org_id,
    ARRAY_AGG(n.id),
    'daily',
    now()
  FROM notification_preferences np
  JOIN notifications n ON n.org_id = np.org_id AND n.user_id = np.user_id
  WHERE np.global_mute = false
    AND n.is_read = false
    AND n.created_at > now() - interval '24 hours'
    AND EXISTS (
      SELECT 1 FROM jsonb_each_text(np.email_digest)
      WHERE value = 'daily' AND key = n.category
    )
  GROUP BY np.user_id, np.org_id
  HAVING COUNT(*) > 0
  $$
);

-- Weekly digest processing  
SELECT cron.schedule(
  'process-weekly-digest',
  '0 8 * * 1', -- 08:00 UTC every Monday
  $$
  INSERT INTO notification_digest_queue (user_id, org_id, notification_ids, frequency, scheduled_at)
  SELECT 
    np.user_id,
    np.org_id,
    ARRAY_AGG(n.id),
    'weekly',
    now()
  FROM notification_preferences np
  JOIN notifications n ON n.org_id = np.org_id AND n.user_id = np.user_id
  WHERE np.global_mute = false
    AND n.is_read = false
    AND n.created_at > now() - interval '7 days'
    AND EXISTS (
      SELECT 1 FROM jsonb_each_text(np.email_digest)
      WHERE value = 'weekly' AND key = n.category
    )
  GROUP BY np.user_id, np.org_id
  HAVING COUNT(*) > 0
  $$
);

-- Trigger: auto-create notification preferences on member join
CREATE OR REPLACE FUNCTION create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, org_id)
  VALUES (NEW.user_id, NEW.org_id)
  ON CONFLICT (user_id, org_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_notification_prefs
  AFTER INSERT ON org_members
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_prefs();

-- Daily platform metrics snapshot
SELECT cron.schedule(
  'daily-platform-metrics',
  '0 1 * * *', -- 01:00 UTC daily
  $$
  INSERT INTO platform_metrics_snapshots (
    snapshot_date, total_tenants, active_tenants, suspended_tenants, trial_tenants,
    total_users, mrr_thb, total_jobs_month, storage_used_gb, plan_distribution,
    new_tenants, churned_tenants
  )
  SELECT
    CURRENT_DATE,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'ACTIVE'),
    COUNT(*) FILTER (WHERE status = 'SUSPENDED'),
    COUNT(*) FILTER (WHERE status = 'TRIAL'),
    (SELECT COUNT(*) FROM org_members),
    COALESCE(SUM(CASE plan 
      WHEN 'STARTER' THEN 1990 
      WHEN 'PROFESSIONAL' THEN 4990 
      WHEN 'ENTERPRISE' THEN 14990 
      ELSE 0 END), 0),
    (SELECT COUNT(*) FROM jobs WHERE created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE((SELECT SUM(storage_used_bytes) FROM org_storage_usage) / 1073741824.0, 0),
    jsonb_build_object(
      'FREE', COUNT(*) FILTER (WHERE plan = 'FREE'),
      'STARTER', COUNT(*) FILTER (WHERE plan = 'STARTER'),
      'PROFESSIONAL', COUNT(*) FILTER (WHERE plan = 'PROFESSIONAL'),
      'ENTERPRISE', COUNT(*) FILTER (WHERE plan = 'ENTERPRISE')
    ),
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - interval '1 day'),
    COUNT(*) FILTER (WHERE status = 'CANCELLED' AND updated_at >= CURRENT_DATE - interval '1 day')
  FROM organizations
  ON CONFLICT (snapshot_date) DO UPDATE SET
    total_tenants = EXCLUDED.total_tenants,
    active_tenants = EXCLUDED.active_tenants,
    mrr_thb = EXCLUDED.mrr_thb;
  $$
);
