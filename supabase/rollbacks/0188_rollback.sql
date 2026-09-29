-- Rollback: 0188_factory_domain_rls
-- CI idempotency testing ONLY. DATA LOSS: drops org_id columns.
-- NEVER apply to production.
--
-- Reverses 0188 in four steps:
--   (1) DROP *_tenant_isolation SELECT policies (the 5 policies added by 0188)
--   (2) RE-CREATE *_sel site_code/using-true SELECT policies
--       (restored from 0155_factory_state_server.sql, 0141_factory_ops.sql,
--        0124_gate_sla.sql, 0143_qms_factory_design.sql)
--   (3) DROP NOT NULL constraints on org_id columns
--   (4) DROP org_id columns — DATA LOSS, CI only
-- Note: does NOT reverse ALTER TABLE ENABLE ROW LEVEL SECURITY;
--       RLS was already enabled on these tables before 0188 (from original DDL migrations).
--       Disabling it here would remove pre-existing protection — incorrect.

-- =============================================================================
-- (1) DROP *_tenant_isolation SELECT policies
-- =============================================================================
DROP POLICY IF EXISTS factory_jobs_tenant_isolation               ON public.factory_jobs;
DROP POLICY IF EXISTS factory_job_events_tenant_isolation         ON public.factory_job_events;
DROP POLICY IF EXISTS factory_checkins_tenant_isolation           ON public.factory_checkins;
DROP POLICY IF EXISTS factory_gate_config_tenant_isolation        ON public.factory_gate_config;
DROP POLICY IF EXISTS factory_station_checklists_tenant_isolation ON public.factory_station_checklists;

-- =============================================================================
-- (2) RESTORE old SELECT policies
--     Mirrors original policies from source migrations
-- =============================================================================
CREATE POLICY factory_jobs_sel ON public.factory_jobs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY factory_job_events_sel ON public.factory_job_events
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY factory_checkins_sel ON public.factory_checkins
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY factory_gate_config_sel ON public.factory_gate_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY factory_station_checklists_sel ON public.factory_station_checklists
  FOR SELECT TO authenticated
  USING (true);

-- =============================================================================
-- (3) DROP NOT NULL constraints on org_id
-- =============================================================================
ALTER TABLE public.factory_jobs               ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.factory_job_events         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.factory_checkins           ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.factory_gate_config        ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.factory_station_checklists ALTER COLUMN org_id DROP NOT NULL;

-- =============================================================================
-- (4) DROP org_id columns — DATA LOSS; CI idempotency only
-- =============================================================================
ALTER TABLE public.factory_jobs               DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.factory_job_events         DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.factory_checkins           DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.factory_gate_config        DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.factory_station_checklists DROP COLUMN IF EXISTS org_id;
