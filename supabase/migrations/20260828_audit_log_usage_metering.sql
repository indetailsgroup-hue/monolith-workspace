-- Migration: Audit Log + Usage Metering
-- Version: v16.2.0
-- Description: Add audit_logs table, usage tracking, and plan enforcement functions

-- ============================================================================
-- Audit Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'api')),
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  actor_email TEXT,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_id);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('OWNER', 'ADMIN')
    )
  );

CREATE POLICY "Service role inserts audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Billing columns on organizations
-- ============================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_interval TEXT CHECK (billing_interval IN ('monthly', 'yearly'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- Usage Metering RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION get_org_usage(p_org_id UUID)
RETURNS JSON AS $$
DECLARE
  v_job_count INTEGER;
  v_member_count INTEGER;
  v_storage_bytes BIGINT;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', NOW());

  SELECT COUNT(*) INTO v_job_count
  FROM jobs
  WHERE org_id = p_org_id
    AND created_at >= v_period_start;

  SELECT COUNT(*) INTO v_member_count
  FROM org_members
  WHERE org_id = p_org_id
    AND is_active = TRUE;

  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO v_storage_bytes
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

-- ============================================================================
-- Enforcement Function: check_job_limit
-- ============================================================================

CREATE OR REPLACE FUNCTION check_job_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org RECORD;
  v_job_count INTEGER;
  v_max_jobs INTEGER;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', NOW());

  SELECT plan, max_jobs_per_month, status INTO v_org
  FROM organizations
  WHERE org_id = NEW.org_id;

  IF v_org.status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Organization is suspended';
  END IF;

  SELECT COUNT(*) INTO v_job_count
  FROM jobs
  WHERE org_id = NEW.org_id
    AND created_at >= v_period_start;

  IF v_job_count >= v_org.max_jobs_per_month THEN
    RAISE EXCEPTION 'Monthly job limit reached (% / %)', v_job_count, v_org.max_jobs_per_month;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_job_limit
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION check_job_limit();

-- ============================================================================
-- Enforcement Function: check_member_limit
-- ============================================================================

CREATE OR REPLACE FUNCTION check_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org RECORD;
  v_member_count INTEGER;
BEGIN
  SELECT plan, max_users, status INTO v_org
  FROM organizations
  WHERE org_id = NEW.org_id;

  IF v_org.status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Organization is suspended';
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM org_members
  WHERE org_id = NEW.org_id
    AND is_active = TRUE;

  IF v_member_count >= v_org.max_users THEN
    RAISE EXCEPTION 'Member limit reached (% / %)', v_member_count, v_org.max_users;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_member_limit
  BEFORE INSERT ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION check_member_limit();
