-- Migration: 0188_factory_domain_rls
-- Phase 2 RLS epic — batch 2: factory domain (5 tables)
-- Addresses: 58 remaining violations identified by lint-rls-org-id.py post-0187
-- Depends on: 0187 (org_id pattern established; this migration is self-contained)
--
-- Tables covered (5):
--   factory_checkins, factory_gate_config, factory_job_events,
--   factory_jobs, factory_station_checklists
--
-- Strategy (mirrors 0186/0187 pattern):
--   (1) ADD COLUMN org_id uuid (nullable) on all 5 tables
--   (2) Backfill in dependency order:
--         factory_jobs → sentinel (no traceable org parent; job_id comes from Designer client)
--         factory_job_events ← factory_jobs.org_id via job_id FK;
--                            → sentinel for orphaned events (parent job not found)
--         factory_checkins → sentinel (keyed by site_code only; no org-rooted parent table)
--         factory_gate_config → sentinel (shared config; 2 seeded rows: assembly, packing;
--                               all application reads via SECURITY DEFINER RPCs)
--         factory_station_checklists → sentinel (shared config; ~13 seeded rows;
--                                      all application reads via SECURITY DEFINER RPCs)
--   (3) ALTER COLUMN org_id SET NOT NULL
--   (4) ALTER TABLE ENABLE ROW LEVEL SECURITY (idempotent)
--   (5) DROP old SELECT policies (factory_*_sel)
--       Rationale: factory_gate_config_sel, factory_jobs_sel, factory_job_events_sel
--       use USING (true) — exposes all rows to every authenticated user across tenants.
--       factory_checkins_sel uses is_governance_role() OR has_site_access(site_code)
--       which does not enforce org-level isolation. Both patterns must be replaced.
--   (6) CREATE org_id-scoped SELECT policies (*_tenant_isolation)
--
-- Config-table note (factory_gate_config, factory_station_checklists):
--   Seeded rows receive sentinel UUID 00000000-0000-0000-0000-000000000000.
--   Direct SELECT is blocked by the tenant_isolation policy; all application reads
--   go through SECURITY DEFINER RPCs which bypass RLS — existing functionality is
--   fully preserved (Req 10.3/10.4).
--
-- Write path: all mutations go through SECURITY DEFINER RPCs (Req 10.3/10.4).
-- INSERT/UPDATE policies (_ins/_upd) are preserved as-is; site_code deprecation on
-- the write path will follow in a dedicated migration once org_id is stable.
-- Rollback: 0188_rollback.sql (CI idempotency only — DATA LOSS, never apply to production)

-- =============================================================================
-- (1) ADD org_id COLUMN — all 5 tables
-- =============================================================================
ALTER TABLE public.factory_jobs
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.factory_job_events
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.factory_checkins
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.factory_gate_config
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.factory_station_checklists
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- =============================================================================
-- (2) BACKFILL org_id — dependency order
-- =============================================================================

-- ---------------------------------------------------------------------------
-- factory_jobs → sentinel
--   job_id is a client-supplied text key (Designer workspace); there is no
--   org-keyed parent table to JOIN against. All existing rows receive the
--   sentinel UUID; new rows will carry the correct org_id from the write RPC.
-- ---------------------------------------------------------------------------
UPDATE public.factory_jobs
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- factory_job_events ← factory_jobs.org_id via job_id FK
--   job_id NOT NULL — events whose parent job still exists inherit its org_id.
--   Events whose parent job was deleted (orphaned) fall back to sentinel.
-- ---------------------------------------------------------------------------
UPDATE public.factory_job_events fje
SET    org_id = fj.org_id
FROM   public.factory_jobs fj
WHERE  fje.job_id = fj.job_id
  AND  fje.org_id IS NULL;

UPDATE public.factory_job_events
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- factory_checkins → sentinel
--   Keyed by site_code (text) only; there is no org-keyed parent table to
--   resolve the org. All existing rows receive sentinel UUID.
-- ---------------------------------------------------------------------------
UPDATE public.factory_checkins
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- factory_gate_config → sentinel
--   Shared config table with 2 seeded rows (assembly, packing).
--   Not tenant-specific; sentinel signals "shared / infrastructure row".
-- ---------------------------------------------------------------------------
UPDATE public.factory_gate_config
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- factory_station_checklists → sentinel
--   Shared QMS config table with ~13 seeded checklist rows.
--   Not tenant-specific; sentinel signals "shared / infrastructure row".
-- ---------------------------------------------------------------------------
UPDATE public.factory_station_checklists
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- =============================================================================
-- (3) ENFORCE NOT NULL — all 5 tables
-- =============================================================================
ALTER TABLE public.factory_jobs                ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.factory_job_events          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.factory_checkins            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.factory_gate_config         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.factory_station_checklists  ALTER COLUMN org_id SET NOT NULL;

-- =============================================================================
-- (4) ENABLE ROW LEVEL SECURITY — idempotent; required for linter static analysis
-- =============================================================================
ALTER TABLE public.factory_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_job_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_checkins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_gate_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_station_checklists ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- (5) DROP old SELECT policies
--     Sources: 0155_factory_state_server.sql (factory_jobs, factory_job_events),
--              0141_factory_ops.sql (factory_checkins),
--              0124_gate_sla.sql (factory_gate_config),
--              0143_qms_factory_design.sql (factory_station_checklists)
-- =============================================================================
DROP POLICY IF EXISTS factory_jobs_sel               ON public.factory_jobs;
DROP POLICY IF EXISTS factory_job_events_sel         ON public.factory_job_events;
DROP POLICY IF EXISTS factory_checkins_sel           ON public.factory_checkins;
DROP POLICY IF EXISTS factory_gate_config_sel        ON public.factory_gate_config;
DROP POLICY IF EXISTS factory_station_checklists_sel ON public.factory_station_checklists;

-- =============================================================================
-- (6) CREATE org_id-scoped SELECT policies
--     SELECT only — write path remains SECURITY DEFINER RPCs (Req 10.3/10.4)
-- =============================================================================
CREATE POLICY factory_jobs_tenant_isolation
  ON public.factory_jobs
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY factory_job_events_tenant_isolation
  ON public.factory_job_events
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY factory_checkins_tenant_isolation
  ON public.factory_checkins
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY factory_gate_config_tenant_isolation
  ON public.factory_gate_config
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY factory_station_checklists_tenant_isolation
  ON public.factory_station_checklists
  FOR SELECT USING (org_id = public.get_user_org_id());
