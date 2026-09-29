-- =============================================================================
-- MONOLITH v17.5 — AI Production Scheduler Module
-- Migration: 20270125_ai_production_scheduler.sql
--
-- AI-assisted production scheduling for DAPH Decor manufacturing floor.
-- Generates optimised job sequences from pending orders, machine capacity,
-- and delivery deadlines using an AI scheduling engine.
--
-- Plan Gate: ENTERPRISE
--
-- Tables:
--   aps_machine_configs         — machine/resource definitions + capacity
--   aps_production_runs         — AI scheduler execution results (schedule head)
--   aps_schedule_items          — individual job items within a run
--   aps_scheduling_constraints  — custom constraints fed to AI engine
--
-- Views:
--   aps_schedule_summary_v      — run-level KPIs (items, utilisation, delay risk)
--   aps_machine_utilisation_v   — per-machine load across active runs
--
-- Plan gate function:
--   aps_is_enterprise()         — helper for RLS + application layer
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE aps_run_status AS ENUM (
  'DRAFT',          -- schedule being configured
  'GENERATING',     -- AI engine processing
  'READY',          -- AI result returned, awaiting human review
  'APPROVED',       -- production manager approved the schedule
  'IN_PROGRESS',    -- production has started
  'COMPLETED',      -- all items done
  'CANCELLED',      -- run discarded
  'FAILED'          -- AI engine error or timeout
);

CREATE TYPE aps_item_status AS ENUM (
  'PENDING',        -- not yet started
  'IN_PROGRESS',    -- machine assigned, running
  'DONE',           -- completed
  'SKIPPED',        -- intentionally skipped (override)
  'BLOCKED'         -- blocked by upstream dependency or machine issue
);

CREATE TYPE aps_priority AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

CREATE TYPE aps_machine_type AS ENUM (
  'CNC',
  'LASER_CUTTING',
  'EDGE_BANDING',
  'ASSEMBLY',
  'PAINTING',
  'QUALITY_CHECK',
  'PACKAGING',
  'OTHER'
);

CREATE TYPE aps_schedule_mode AS ENUM (
  'AUTO',            -- fully AI-generated
  'SEMI_AUTO',       -- AI draft + human adjustments
  'MANUAL_OVERRIDE'  -- human rearranged AI output
);

CREATE TYPE aps_constraint_type AS ENUM (
  'MACHINE_DOWN',           -- machine unavailable window
  'DEADLINE_OVERRIDE',      -- force specific job deadline
  'PRIORITY_OVERRIDE',      -- force job priority
  'CAPACITY_LIMIT',         -- max concurrent jobs per machine
  'SEQUENCE_LOCK',          -- job A must precede job B
  'EXCLUDE_JOB',            -- remove job from this run
  'CUSTOM'                  -- free-text constraint for AI prompt
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLAN GATE FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * aps_is_enterprise()
 *
 * Returns TRUE when the calling user's org is on the ENTERPRISE plan.
 * Used in every RLS policy for this module.
 */
CREATE OR REPLACE FUNCTION aps_is_enterprise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM org_members om
    JOIN public.organizations o ON o.org_id = om.org_id
    WHERE om.user_id = auth.uid()
      AND o.plan = 'ENTERPRISE'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- aps_machine_configs — machine / resource definitions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aps_machine_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  machine_type      aps_machine_type NOT NULL,
  display_name      TEXT NOT NULL,                -- e.g. "CNC-01 (Biesse Rover B)"

  -- Capacity
  daily_capacity_hrs   NUMERIC(6, 2) NOT NULL DEFAULT 8.0
                         CHECK (daily_capacity_hrs > 0),
  setup_time_min       INTEGER NOT NULL DEFAULT 15
                         CHECK (setup_time_min >= 0),
  max_concurrent_jobs  INTEGER NOT NULL DEFAULT 1
                         CHECK (max_concurrent_jobs >= 1),

  -- Scheduling weight (higher = AI prefers this machine first for its type)
  scheduling_weight    NUMERIC(5, 2) NOT NULL DEFAULT 1.0,

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT aps_machine_configs_org_name_uq
    UNIQUE (org_id, display_name)
);

COMMENT ON TABLE aps_machine_configs IS
  'Machine/resource definitions used by the AI Production Scheduler. ENTERPRISE plan required.';

-- ─────────────────────────────────────────────────────────────────────────────
-- aps_production_runs — AI scheduler execution (schedule head)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aps_production_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  run_label         TEXT NOT NULL,               -- e.g. "Week 2027-W04 Auto Schedule"
  schedule_date     DATE NOT NULL,               -- production date the run covers

  status            aps_run_status NOT NULL DEFAULT 'DRAFT',
  schedule_mode     aps_schedule_mode NOT NULL DEFAULT 'AUTO',

  -- AI engine metadata
  ai_model_used     TEXT,                        -- e.g. "gpt-4o", "internal-scheduler-v2"
  ai_prompt_tokens  INTEGER,
  ai_run_duration_ms INTEGER,
  ai_confidence_score NUMERIC(5, 2),             -- 0.00–100.00; AI-reported confidence

  -- Human override tracking
  override_count    INTEGER NOT NULL DEFAULT 0,  -- times human moved/changed items
  approved_by       UUID REFERENCES auth.users(id),
  approved_at       TIMESTAMPTZ,

  -- KPI snapshot (populated after APPROVED)
  total_items       INTEGER NOT NULL DEFAULT 0,
  estimated_utilisation_pct NUMERIC(5, 2),       -- aggregate machine utilisation
  delay_risk_count  INTEGER NOT NULL DEFAULT 0,  -- items flagged HIGH/URGENT + tight deadline

  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE aps_production_runs IS
  'AI Production Scheduler run header. One row per scheduling execution. Items stored in aps_schedule_items.';

-- ─────────────────────────────────────────────────────────────────────────────
-- aps_schedule_items — individual job items within a run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aps_schedule_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  run_id            UUID NOT NULL REFERENCES aps_production_runs(id) ON DELETE CASCADE,
  machine_config_id UUID REFERENCES aps_machine_configs(id),

  -- Job reference (e.g. links to process_templates or external job system)
  job_ref_id        UUID,
  job_label         TEXT NOT NULL,               -- e.g. "Job #PO-2027-0145 — Cabinet Door"

  priority          aps_priority NOT NULL DEFAULT 'NORMAL',
  status            aps_item_status NOT NULL DEFAULT 'PENDING',

  -- AI-scheduled time slot
  scheduled_start   TIMESTAMPTZ,
  scheduled_end     TIMESTAMPTZ,
  est_duration_min  INTEGER NOT NULL DEFAULT 30 CHECK (est_duration_min > 0),

  -- Actuals (filled when item status → DONE)
  actual_start      TIMESTAMPTZ,
  actual_end        TIMESTAMPTZ,

  -- Dependencies (IDs of items that must be DONE before this starts)
  depends_on        UUID[] NOT NULL DEFAULT '{}',

  -- AI reasoning (brief note from AI about why this slot was chosen)
  ai_rationale      TEXT,

  -- Human override flag
  is_overridden     BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason   TEXT,

  sequence_order    INTEGER NOT NULL DEFAULT 0,  -- display/sort order within run

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE aps_schedule_items IS
  'Individual job/task items within a production run. One row per scheduled job slot.';

-- ─────────────────────────────────────────────────────────────────────────────
-- aps_scheduling_constraints — constraints fed to AI engine
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aps_scheduling_constraints (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  run_id            UUID REFERENCES aps_production_runs(id) ON DELETE SET NULL,
                                                 -- NULL = global constraint for org

  constraint_type   aps_constraint_type NOT NULL,

  -- Flexible payload — content depends on constraint_type
  machine_config_id UUID REFERENCES aps_machine_configs(id),
  job_ref_id        UUID,                        -- target job for DEADLINE_OVERRIDE / PRIORITY_OVERRIDE
  job_ref_id_b      UUID,                        -- second job for SEQUENCE_LOCK

  -- Window constraints (for MACHINE_DOWN, CAPACITY_LIMIT)
  window_start      TIMESTAMPTZ,
  window_end        TIMESTAMPTZ,
  capacity_value    INTEGER,

  -- Override values
  priority_value    aps_priority,
  deadline_value    TIMESTAMPTZ,

  -- Free-text for CUSTOM constraints (passed directly to AI prompt)
  custom_note       TEXT,

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE aps_scheduling_constraints IS
  'Custom constraints passed to the AI scheduling engine. Global (run_id IS NULL) or per-run.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- aps_schedule_summary_v: run-level KPIs + item counts per status
CREATE OR REPLACE VIEW aps_schedule_summary_v
WITH (security_invoker = TRUE)
AS
SELECT
  r.id                                          AS run_id,
  r.org_id,
  r.run_label,
  r.schedule_date,
  r.status,
  r.schedule_mode,
  r.ai_confidence_score,
  r.override_count,
  r.estimated_utilisation_pct,
  r.delay_risk_count,
  COUNT(i.id)                                   AS item_count,
  COUNT(i.id) FILTER (WHERE i.status = 'DONE')  AS done_count,
  COUNT(i.id) FILTER (WHERE i.status = 'BLOCKED') AS blocked_count,
  COUNT(i.id) FILTER (WHERE i.priority IN ('HIGH','URGENT')) AS high_priority_count,
  r.created_at,
  r.updated_at
FROM aps_production_runs r
LEFT JOIN aps_schedule_items i ON i.run_id = r.id
GROUP BY r.id;

COMMENT ON VIEW aps_schedule_summary_v IS
  'Run-level summary: item counts per status, utilisation, delay risk. SECURITY INVOKER — respects caller RLS.';

-- aps_machine_utilisation_v: per-machine scheduled hours within approved/in-progress runs
CREATE OR REPLACE VIEW aps_machine_utilisation_v
WITH (security_invoker = TRUE)
AS
SELECT
  mc.org_id,
  mc.id                                         AS machine_config_id,
  mc.display_name,
  mc.machine_type,
  mc.daily_capacity_hrs,
  i.run_id,
  r.schedule_date,
  COUNT(i.id)                                   AS scheduled_item_count,
  ROUND(
    COALESCE(SUM(i.est_duration_min), 0) / 60.0, 2
  )                                             AS scheduled_hrs,
  ROUND(
    (COALESCE(SUM(i.est_duration_min), 0) / 60.0 / mc.daily_capacity_hrs * 100)::NUMERIC, 2
  )                                             AS utilisation_pct
FROM aps_machine_configs mc
JOIN aps_schedule_items i  ON i.machine_config_id = mc.id
JOIN aps_production_runs r ON r.id = i.run_id
WHERE r.status IN ('APPROVED', 'IN_PROGRESS')
  AND i.status NOT IN ('SKIPPED', 'BLOCKED')
GROUP BY mc.org_id, mc.id, mc.display_name, mc.machine_type, mc.daily_capacity_hrs, i.run_id, r.schedule_date;

COMMENT ON VIEW aps_machine_utilisation_v IS
  'Per-machine scheduled hours vs capacity for approved/in-progress runs. SECURITY INVOKER.';

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS aps_machine_configs_org_idx
  ON aps_machine_configs(org_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS aps_production_runs_org_date_idx
  ON aps_production_runs(org_id, schedule_date DESC);

CREATE INDEX IF NOT EXISTS aps_production_runs_status_idx
  ON aps_production_runs(org_id, status);

CREATE INDEX IF NOT EXISTS aps_schedule_items_run_idx
  ON aps_schedule_items(run_id, sequence_order);

CREATE INDEX IF NOT EXISTS aps_schedule_items_org_status_idx
  ON aps_schedule_items(org_id, status);

CREATE INDEX IF NOT EXISTS aps_scheduling_constraints_org_run_idx
  ON aps_scheduling_constraints(org_id, run_id) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- aps_machine_configs ─────────────────────────────────────────────────────────
ALTER TABLE aps_machine_configs ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read machine configs
CREATE POLICY "aps_machine_configs_select" ON aps_machine_configs
  FOR SELECT
  USING (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ADMIN+ may insert/update/delete machine configs
CREATE POLICY "aps_machine_configs_admin_write" ON aps_machine_configs
  FOR ALL
  USING (
    aps_is_enterprise()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- aps_production_runs ─────────────────────────────────────────────────────────
ALTER TABLE aps_production_runs ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read runs
CREATE POLICY "aps_production_runs_select" ON aps_production_runs
  FOR SELECT
  USING (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Any ENTERPRISE org member may create runs (production floor staff)
CREATE POLICY "aps_production_runs_insert" ON aps_production_runs
  FOR INSERT
  WITH CHECK (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Creator or ADMIN+ may update runs
CREATE POLICY "aps_production_runs_update" ON aps_production_runs
  FOR UPDATE
  USING (
    aps_is_enterprise()
    AND (
      created_by = auth.uid()
      OR org_id IN (
        SELECT org_id FROM org_members
        WHERE user_id = auth.uid()
          AND is_active = TRUE
          AND role IN ('managing_director', 'governance')
      )
    )
  );

-- ADMIN+ only may delete (cancel) runs
CREATE POLICY "aps_production_runs_delete" ON aps_production_runs
  FOR DELETE
  USING (
    aps_is_enterprise()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- aps_schedule_items ──────────────────────────────────────────────────────────
ALTER TABLE aps_schedule_items ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read schedule items
CREATE POLICY "aps_schedule_items_select" ON aps_schedule_items
  FOR SELECT
  USING (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Any ENTERPRISE org member may insert items (production planner)
CREATE POLICY "aps_schedule_items_insert" ON aps_schedule_items
  FOR INSERT
  WITH CHECK (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Any ENTERPRISE org member may update items (mark IN_PROGRESS, DONE, etc.)
CREATE POLICY "aps_schedule_items_update" ON aps_schedule_items
  FOR UPDATE
  USING (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- aps_scheduling_constraints ──────────────────────────────────────────────────
ALTER TABLE aps_scheduling_constraints ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read constraints
CREATE POLICY "aps_constraints_select" ON aps_scheduling_constraints
  FOR SELECT
  USING (
    aps_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ADMIN+ only may write constraints (they configure the AI engine)
CREATE POLICY "aps_constraints_admin_write" ON aps_scheduling_constraints
  FOR ALL
  USING (
    aps_is_enterprise()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aps_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER aps_machine_configs_updated_at
  BEFORE UPDATE ON aps_machine_configs
  FOR EACH ROW EXECUTE FUNCTION aps_set_updated_at();

CREATE TRIGGER aps_production_runs_updated_at
  BEFORE UPDATE ON aps_production_runs
  FOR EACH ROW EXECUTE FUNCTION aps_set_updated_at();

CREATE TRIGGER aps_schedule_items_updated_at
  BEFORE UPDATE ON aps_schedule_items
  FOR EACH ROW EXECUTE FUNCTION aps_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTION BLOCK
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'aps_machine_configs',
    'aps_production_runs',
    'aps_schedule_items',
    'aps_scheduling_constraints'
  ];
  v_views TEXT[] := ARRAY[
    'aps_schedule_summary_v',
    'aps_machine_utilisation_v'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Assertion failed: table % not found', t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY v_views LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Assertion failed: view % not found', t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE relname = t AND relrowsecurity = TRUE
    ) THEN
      RAISE EXCEPTION 'Assertion failed: RLS not enabled on table %', t;
    END IF;
  END LOOP;

  RAISE NOTICE 'AI Production Scheduler schema assertions passed (4 tables, 2 views, RLS enabled)';
END;
$$;

COMMIT;
