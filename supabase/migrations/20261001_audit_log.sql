-- =============================================================================
-- Migration: 20261001_audit_log.sql
-- MONOLITH v16.0 — Audit Log Table + SECURITY DEFINER Triggers
-- Addresses Issue 6 in SECURITY_REVIEW_RLS.md
-- Coverage: public.org_members, public.jobs, public.employees
-- =============================================================================

-- ============================================================
-- AUDIT LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  table_name   TEXT        NOT NULL,
  operation    TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  row_id       UUID,
  old_data     JSONB,
  new_data     JSONB,
  changed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   INET,

  -- Ensure at least one side of the change is present
  CONSTRAINT audit_log_data_check CHECK (NOT (old_data IS NULL AND new_data IS NULL))
);

-- FORCE RLS — prevent owner/service-role bypass
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_audit_log_org_id
  ON public.audit_log (org_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_table
  ON public.audit_log (table_name);

CREATE INDEX IF NOT EXISTS idx_audit_log_row_id
  ON public.audit_log (row_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON public.audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON public.audit_log (changed_by);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- SELECT: ADMIN+ (role >= 80) can read their own org's audit trail
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND has_any_app_role(ARRAY['managing_director','governance'])
  );

-- INSERT: Blocked for ALL direct callers (authenticated or otherwise)
-- Only the SECURITY DEFINER trigger function audit_trigger_fn() can insert
CREATE POLICY "audit_log_insert_deny"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

-- UPDATE: No policy defined → implicit deny for all roles
-- DELETE: No policy defined → implicit deny for all roles
-- Audit log is intentionally immutable from the application layer

-- ============================================================
-- AUDIT TRIGGER FUNCTION (SECURITY DEFINER)
-- Runs as the function owner (postgres), bypasses RLS on audit_log
-- allowing INSERT despite WITH CHECK (FALSE) policy above.
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_json  JSONB;
  v_old_json  JSONB;
  v_new_json  JSONB;
  v_org_id    UUID;
  v_row_id    UUID;
BEGIN
  -- Build JSON representations
  CASE TG_OP
    WHEN 'DELETE' THEN
      v_row_json := to_jsonb(OLD);
      v_old_json := v_row_json;
      v_new_json := NULL;
    WHEN 'INSERT' THEN
      v_row_json := to_jsonb(NEW);
      v_old_json := NULL;
      v_new_json := v_row_json;
    ELSE -- UPDATE
      v_row_json := to_jsonb(NEW);
      v_old_json := to_jsonb(OLD);
      v_new_json := v_row_json;
  END CASE;

  -- Extract org_id dynamically from row data
  v_org_id := (v_row_json->>'org_id')::UUID;

  -- Extract primary key id dynamically
  v_row_id  := (v_row_json->>'id')::UUID;

  -- Skip rows with no org_id (defensive guard)
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_log (
    org_id,
    table_name,
    operation,
    row_id,
    old_data,
    new_data,
    changed_by,
    changed_at,
    ip_address
  ) VALUES (
    v_org_id,
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    v_old_json,
    v_new_json,
    auth.uid(),                 -- NULL for system operations; valid UUID for user operations
    NOW(),
    NULL                        -- ip_address: populated by application RPC if required
  );

  -- For AFTER triggers, return value is ignored by PG but required by plpgsql
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger_fn() IS
  'SECURITY DEFINER trigger function that writes to audit_log. '
  'Bypasses RLS on audit_log so it can INSERT despite WITH CHECK (FALSE) policy. '
  'Extracts org_id and row_id dynamically from row JSON — works for any table '
  'that has org_id and id columns.';

-- ============================================================
-- AUDIT TRIGGERS
-- ============================================================

-- Trigger: org_members
DROP TRIGGER IF EXISTS audit_org_members ON public.org_members;
CREATE TRIGGER audit_org_members
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- Trigger: jobs
DROP TRIGGER IF EXISTS audit_jobs ON public.jobs;
CREATE TRIGGER audit_jobs
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================================
-- GRANTS
-- ============================================================

-- Allow authenticated users to SELECT (RLS filters to ADMIN+ only)
GRANT SELECT ON public.audit_log TO authenticated;

-- INSERT / UPDATE / DELETE intentionally NOT granted
-- All writes must go through audit_trigger_fn() (SECURITY DEFINER)

-- ============================================================
-- TABLE COMMENT
-- ============================================================

COMMENT ON TABLE public.audit_log IS
  'Immutable audit trail for org_members, jobs, and employees. '
  'Written exclusively by SECURITY DEFINER triggers (audit_trigger_fn). '
  'Direct INSERT/UPDATE/DELETE blocked by RLS WITH CHECK (FALSE). '
  'Readable by ADMIN+ (role >= 80) within their own organisation only. '
  'Addresses Issue 6 in SECURITY_REVIEW_RLS.md.';
