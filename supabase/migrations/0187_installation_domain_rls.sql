-- Migration: 0187_installation_domain_rls
-- Phase 2 RLS epic — batch 1: installation + production domain (12 tables)
-- Addresses: 0185 open audit findings; first 12 of 70 remaining site_code-scoped tables
-- Depends on: 0186 (work_item.org_id must exist for root backfill)
--
-- Tables covered (12):
--   installation_projects, installation_rooms, installation_tasks,
--   installation_photos, installation_photo_annotations,
--   installation_field_reports, installation_approvals,
--   installation_audit_log, installation_memberships,
--   installation_issues, installation_plans,
--   production_milestones
--
-- Strategy (mirrors 0186 pattern):
--   (1) ADD COLUMN org_id uuid (nullable) on all 12 tables
--   (2) Backfill in dependency order:
--         Level 1: installation_projects ← work_item.org_id (work_item_id nullable → sentinel)
--         Level 2: 9 direct children ← installation_projects.org_id
--                  (rooms, photos, field_reports, approvals, audit_log,
--                   memberships, issues, plans, production_milestones)
--         Level 3: installation_tasks ← installation_rooms.org_id
--                  installation_photo_annotations ← installation_photos.org_id
--       Rows with no recoverable parent → sentinel UUID 00000000-0000-0000-0000-000000000000
--   (3) ALTER COLUMN org_id SET NOT NULL
--   (4) ALTER TABLE ENABLE ROW LEVEL SECURITY (idempotent; required for linter static analysis)
--   (5) DROP old site_code-based SELECT (*_sel) policies
--       Rationale: keeping both creates OR-semantics that allow cross-tenant access
--       via has_site_access(site_code). Must be removed — same decision as 0186.
--   (6) CREATE org_id-scoped SELECT policies (*_tenant_isolation)
--
-- Write path: all mutations go through SECURITY DEFINER RPCs (Req 10.3/10.4).
-- INSERT/UPDATE policies (_ins/_upd) are preserved as-is; site_code deprecation
-- on the write path will follow in a dedicated migration once org_id is stable.
-- Rollback: 0187_rollback.sql (CI idempotency only — DATA LOSS, never apply to production)

-- =============================================================================
-- (1) ADD org_id COLUMN — all 12 tables
-- =============================================================================
ALTER TABLE public.installation_projects
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_rooms
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_tasks
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_photos
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_photo_annotations
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_field_reports
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_approvals
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_memberships
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_issues
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.installation_plans
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.production_milestones
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- =============================================================================
-- (2) BACKFILL org_id — dependency order
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Level 1: installation_projects ← work_item.org_id
--   work_item_id is nullable (ADR-035: v1 dogfood — some projects predate work_item link)
--   Rows where work_item_id IS NULL or work_item not found → sentinel
-- ---------------------------------------------------------------------------
UPDATE public.installation_projects ip
SET    org_id = wi.org_id
FROM   public.work_item wi
WHERE  ip.work_item_id = wi.id
  AND  ip.org_id IS NULL;

UPDATE public.installation_projects
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2a: installation_rooms ← installation_projects.org_id
--   project_id NOT NULL — all rows recoverable via parent
-- ---------------------------------------------------------------------------
UPDATE public.installation_rooms ir
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  ir.project_id = ip.id
  AND  ir.org_id IS NULL;

UPDATE public.installation_rooms
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2b: installation_photos ← installation_projects.org_id
--   project_id NOT NULL CASCADE
-- ---------------------------------------------------------------------------
UPDATE public.installation_photos ph
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  ph.project_id = ip.id
  AND  ph.org_id IS NULL;

UPDATE public.installation_photos
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2c: installation_field_reports ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.installation_field_reports fr
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  fr.project_id = ip.id
  AND  fr.org_id IS NULL;

UPDATE public.installation_field_reports
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2d: installation_approvals ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.installation_approvals ia
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  ia.project_id = ip.id
  AND  ia.org_id IS NULL;

UPDATE public.installation_approvals
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2e: installation_audit_log ← installation_projects.org_id
--   project_id is nullable (audit log may capture platform-level events)
--   Rows with no project_id → sentinel
--   This table is append-only for application traffic. The schema migration
--   must temporarily suspend only its immutability trigger while it performs
--   the one-time tenant-key backfill. ALTER TABLE takes a lock for the
--   statement, and the exception handler restores the trigger before
--   propagating any failure.
-- ---------------------------------------------------------------------------
DO $installation_audit_org_backfill$
BEGIN
  EXECUTE 'ALTER TABLE public.installation_audit_log '
       || 'DISABLE TRIGGER trg_installation_audit_immutable';

  UPDATE public.installation_audit_log al
  SET    org_id = ip.org_id
  FROM   public.installation_projects ip
  WHERE  al.project_id = ip.id
    AND  al.org_id IS NULL;

  UPDATE public.installation_audit_log
  SET    org_id = '00000000-0000-0000-0000-000000000000'
  WHERE  org_id IS NULL;

  EXECUTE 'ALTER TABLE public.installation_audit_log '
       || 'ENABLE TRIGGER trg_installation_audit_immutable';
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER TABLE public.installation_audit_log '
         || 'ENABLE TRIGGER trg_installation_audit_immutable';
    RAISE;
END
$installation_audit_org_backfill$;

-- ---------------------------------------------------------------------------
-- Level 2f: installation_memberships ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.installation_memberships im
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  im.project_id = ip.id
  AND  im.org_id IS NULL;

UPDATE public.installation_memberships
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2g: installation_issues ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.installation_issues ii
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  ii.project_id = ip.id
  AND  ii.org_id IS NULL;

UPDATE public.installation_issues
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2h: installation_plans ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.installation_plans il
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  il.project_id = ip.id
  AND  il.org_id IS NULL;

UPDATE public.installation_plans
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2i: production_milestones ← installation_projects.org_id
-- ---------------------------------------------------------------------------
UPDATE public.production_milestones pm
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  pm.project_id = ip.id
  AND  pm.org_id IS NULL;

UPDATE public.production_milestones
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 3a: installation_tasks ← installation_rooms.org_id
--   room_id NOT NULL CASCADE; rooms already backfilled above
-- ---------------------------------------------------------------------------
UPDATE public.installation_tasks it
SET    org_id = ir.org_id
FROM   public.installation_rooms ir
WHERE  it.room_id = ir.id
  AND  it.org_id IS NULL;

UPDATE public.installation_tasks
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 3b: installation_photo_annotations ← installation_photos.org_id
--   photo_id NOT NULL CASCADE; photos already backfilled above
-- ---------------------------------------------------------------------------
UPDATE public.installation_photo_annotations pa
SET    org_id = ph.org_id
FROM   public.installation_photos ph
WHERE  pa.photo_id = ph.id
  AND  pa.org_id IS NULL;

UPDATE public.installation_photo_annotations
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- =============================================================================
-- (3) ENFORCE NOT NULL — all 12 tables
-- =============================================================================
ALTER TABLE public.installation_projects          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_rooms             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_tasks             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_photos            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_photo_annotations ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_field_reports     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_approvals         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_audit_log         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_memberships       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_issues            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.installation_plans             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.production_milestones          ALTER COLUMN org_id SET NOT NULL;

-- =============================================================================
-- (4) ENABLE ROW LEVEL SECURITY — idempotent; required for linter static analysis
-- =============================================================================
ALTER TABLE public.installation_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_photos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_photo_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_field_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_approvals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_issues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_milestones          ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- (5) DROP old site_code-based SELECT policies
--     (note: installation_audit_log policy is named 'installation_audit_sel')
-- =============================================================================
DROP POLICY IF EXISTS installation_projects_sel          ON public.installation_projects;
DROP POLICY IF EXISTS installation_rooms_sel             ON public.installation_rooms;
DROP POLICY IF EXISTS installation_tasks_sel             ON public.installation_tasks;
DROP POLICY IF EXISTS installation_photos_sel            ON public.installation_photos;
DROP POLICY IF EXISTS installation_photo_annotations_sel ON public.installation_photo_annotations;
DROP POLICY IF EXISTS installation_field_reports_sel     ON public.installation_field_reports;
DROP POLICY IF EXISTS installation_approvals_sel         ON public.installation_approvals;
DROP POLICY IF EXISTS installation_audit_sel             ON public.installation_audit_log;
DROP POLICY IF EXISTS installation_memberships_sel       ON public.installation_memberships;
DROP POLICY IF EXISTS installation_issues_sel            ON public.installation_issues;
DROP POLICY IF EXISTS installation_plans_sel             ON public.installation_plans;
DROP POLICY IF EXISTS production_milestones_sel          ON public.production_milestones;

-- =============================================================================
-- (6) CREATE org_id-scoped SELECT policies
--     SELECT only — write path remains SECURITY DEFINER RPCs (Req 10.3/10.4)
-- =============================================================================
CREATE POLICY installation_projects_tenant_isolation
  ON public.installation_projects
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_rooms_tenant_isolation
  ON public.installation_rooms
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_tasks_tenant_isolation
  ON public.installation_tasks
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_photos_tenant_isolation
  ON public.installation_photos
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_photo_annotations_tenant_isolation
  ON public.installation_photo_annotations
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_field_reports_tenant_isolation
  ON public.installation_field_reports
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_approvals_tenant_isolation
  ON public.installation_approvals
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_audit_log_tenant_isolation
  ON public.installation_audit_log
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_memberships_tenant_isolation
  ON public.installation_memberships
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_issues_tenant_isolation
  ON public.installation_issues
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY installation_plans_tenant_isolation
  ON public.installation_plans
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY production_milestones_tenant_isolation
  ON public.production_milestones
  FOR SELECT USING (org_id = public.get_user_org_id());
