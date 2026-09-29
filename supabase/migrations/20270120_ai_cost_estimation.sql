-- =============================================================================
-- MONOLITH v17.5 — AI Cost Estimation Module
-- Migration: 20270120_ai_cost_estimation.sql
--
-- Tracks AI tool usage and estimates per-task cost and ROI for each org.
-- Plan Gate: ENTERPRISE
--
-- Tables:
--   ace_cost_models       — per-org AI tool cost configurations (rates)
--   ace_usage_logs        — append-only AI tool usage events
--   ace_task_estimates    — cost + time estimates per task/job
--   ace_budget_periods    — monthly/quarterly AI spend budgets
--
-- Views:
--   ace_usage_summary_v   — aggregated usage + cost per org per tool
--   ace_task_roi_v        — ROI per task (estimated savings vs AI cost)
--
-- Plan gate function:
--   ace_is_enterprise()   — helper for RLS + application layer
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE ace_ai_tool AS ENUM (
  'CHATGPT',
  'CLAUDE',
  'GEMINI',
  'COPILOT',
  'MIDJOURNEY',
  'STABLE_DIFFUSION',
  'CUSTOM_MODEL',
  'OTHER'
);

CREATE TYPE ace_cost_unit AS ENUM (
  'PER_TOKEN',        -- LLM APIs (input+output tokens)
  'PER_REQUEST',      -- flat per-call pricing
  'PER_IMAGE',        -- image generation
  'PER_MINUTE',       -- audio/video AI processing
  'MONTHLY_FLAT'      -- subscription seat cost spread per task
);

CREATE TYPE ace_task_category AS ENUM (
  'DESIGN',
  'QUOTATION',
  'QUALITY_CHECK',
  'PRODUCTION_PLANNING',
  'CUSTOMER_SERVICE',
  'DOCUMENTATION',
  'DATA_ANALYSIS',
  'OTHER'
);

CREATE TYPE ace_period_type AS ENUM (
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLAN GATE FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * ace_is_enterprise()
 *
 * Returns TRUE when the calling user's org is on the ENTERPRISE plan.
 * Used in every RLS policy for this module.
 */
CREATE OR REPLACE FUNCTION ace_is_enterprise()
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
-- ace_cost_models — per-org AI tool cost configuration
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ace_cost_models (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  tool             ace_ai_tool NOT NULL,
  display_name     TEXT NOT NULL,               -- e.g. "GPT-4o (API)"
  cost_unit        ace_cost_unit NOT NULL,

  -- Rate in USD (stored as numeric for precision)
  rate_usd         NUMERIC(12, 8) NOT NULL CHECK (rate_usd >= 0),

  -- For PER_TOKEN models: separate input/output rates (nullable when not applicable)
  input_rate_usd   NUMERIC(12, 8),
  output_rate_usd  NUMERIC(12, 8),

  -- THB exchange rate snapshot at configuration time (for local reporting)
  thb_exchange_rate NUMERIC(8, 4) NOT NULL DEFAULT 35.0,

  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ace_cost_models_org_tool_name_uq
    UNIQUE (org_id, tool, display_name)
);

COMMENT ON TABLE ace_cost_models IS
  'Per-org AI tool cost configurations. Each org may define multiple models for the same tool (e.g. GPT-4o vs GPT-4o-mini). ENTERPRISE plan required.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ace_usage_logs — append-only AI tool usage events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ace_usage_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL,               -- references employees.id (no FK for perf)
  cost_model_id    UUID NOT NULL REFERENCES ace_cost_models(id),

  task_category    ace_task_category NOT NULL,
  task_ref_id      UUID,                        -- optional: job_id, template_id, etc.
  task_description TEXT,

  -- Usage quantities (depends on cost_unit)
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  request_count    INTEGER NOT NULL DEFAULT 1,
  duration_minutes NUMERIC(8, 2),

  -- Computed cost (snapshotted at log time — rate may change later)
  computed_cost_usd  NUMERIC(12, 6) NOT NULL DEFAULT 0,
  computed_cost_thb  NUMERIC(12, 4) NOT NULL DEFAULT 0,

  -- Time saved vs manual estimate (minutes, self-reported or system-calculated)
  time_saved_minutes INTEGER,

  logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ace_usage_logs IS
  'Append-only AI tool usage events. One row per usage session/request. Cost is snapshotted at log time.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ace_task_estimates — pre-task AI cost + time estimates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ace_task_estimates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  created_by       UUID REFERENCES auth.users(id),

  task_category    ace_task_category NOT NULL,
  task_description TEXT NOT NULL,
  task_ref_id      UUID,

  -- Cost models selected for this estimate (array of cost_model_ids)
  cost_model_ids   UUID[] NOT NULL DEFAULT '{}',

  -- Estimated quantities
  est_input_tokens    INTEGER,
  est_output_tokens   INTEGER,
  est_requests        INTEGER NOT NULL DEFAULT 1,
  est_duration_minutes NUMERIC(8, 2),

  -- Estimated costs (USD + THB)
  est_cost_usd     NUMERIC(12, 6) NOT NULL DEFAULT 0,
  est_cost_thb     NUMERIC(12, 4) NOT NULL DEFAULT 0,

  -- Manual baseline for ROI comparison (what it costs WITHOUT AI)
  manual_cost_thb  NUMERIC(12, 4),
  manual_time_min  INTEGER,

  -- Estimated ROI
  est_roi_pct      NUMERIC(8, 2),  -- (manual_cost - ai_cost) / manual_cost * 100

  -- Actuals (filled in after task completion, nullable until then)
  actual_cost_usd  NUMERIC(12, 6),
  actual_cost_thb  NUMERIC(12, 4),
  actual_roi_pct   NUMERIC(8, 2),
  completed_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ace_task_estimates IS
  'Pre-task AI cost + time estimates. Actuals filled in after completion to track ROI accuracy.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ace_budget_periods — org AI spend budgets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ace_budget_periods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  period_type      ace_period_type NOT NULL,
  period_label     TEXT NOT NULL,               -- e.g. "2027-Q1", "2027-02"
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,

  budget_usd       NUMERIC(12, 2) NOT NULL CHECK (budget_usd >= 0),
  budget_thb       NUMERIC(14, 2) NOT NULL CHECK (budget_thb >= 0),

  -- Alert threshold (0.0–1.0, e.g. 0.80 = alert at 80% utilization)
  alert_threshold  NUMERIC(4, 3) NOT NULL DEFAULT 0.80 CHECK (alert_threshold BETWEEN 0 AND 1),
  alert_sent       BOOLEAN NOT NULL DEFAULT FALSE,

  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ace_budget_periods_org_label_uq
    UNIQUE (org_id, period_label)
);

COMMENT ON TABLE ace_budget_periods IS
  'Monthly/quarterly/annual AI spend budgets per org. Tracks actual vs budgeted.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- ace_usage_summary_v: aggregated cost + usage per org per tool per month
CREATE OR REPLACE VIEW ace_usage_summary_v
WITH (security_invoker = TRUE)
AS
SELECT
  ul.org_id,
  cm.tool,
  cm.display_name                              AS model_name,
  DATE_TRUNC('month', ul.logged_at)::DATE      AS usage_month,
  COUNT(*)                                     AS request_count,
  COALESCE(SUM(ul.input_tokens), 0)            AS total_input_tokens,
  COALESCE(SUM(ul.output_tokens), 0)           AS total_output_tokens,
  ROUND(SUM(ul.computed_cost_usd)::NUMERIC, 6) AS total_cost_usd,
  ROUND(SUM(ul.computed_cost_thb)::NUMERIC, 2) AS total_cost_thb,
  COALESCE(SUM(ul.time_saved_minutes), 0)      AS total_time_saved_min,
  COUNT(DISTINCT ul.employee_id)               AS unique_employees
FROM ace_usage_logs ul
JOIN ace_cost_models cm ON cm.id = ul.cost_model_id
GROUP BY ul.org_id, cm.tool, cm.display_name, DATE_TRUNC('month', ul.logged_at)::DATE;

COMMENT ON VIEW ace_usage_summary_v IS
  'Monthly aggregated AI tool usage and cost per org. SECURITY INVOKER — respects caller RLS.';

-- ace_task_roi_v: per-task ROI comparison (estimated vs actual)
CREATE OR REPLACE VIEW ace_task_roi_v
WITH (security_invoker = TRUE)
AS
SELECT
  te.id,
  te.org_id,
  te.task_category,
  te.task_description,
  te.est_cost_thb,
  te.manual_cost_thb,
  te.est_roi_pct,
  te.actual_cost_thb,
  te.actual_roi_pct,
  -- Variance: how accurate was the estimate?
  CASE
    WHEN te.actual_cost_thb IS NOT NULL AND te.est_cost_thb > 0
    THEN ROUND(((te.actual_cost_thb - te.est_cost_thb) / te.est_cost_thb * 100)::NUMERIC, 2)
    ELSE NULL
  END                                          AS cost_variance_pct,
  te.completed_at IS NOT NULL                  AS is_completed,
  te.created_at
FROM ace_task_estimates te;

COMMENT ON VIEW ace_task_roi_v IS
  'Per-task ROI view comparing estimated vs actual AI cost. SECURITY INVOKER.';

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ace_cost_models_org_idx ON ace_cost_models(org_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ace_usage_logs_org_logged_idx ON ace_usage_logs(org_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS ace_usage_logs_employee_idx ON ace_usage_logs(org_id, employee_id);
CREATE INDEX IF NOT EXISTS ace_usage_logs_model_idx ON ace_usage_logs(cost_model_id);
CREATE INDEX IF NOT EXISTS ace_task_estimates_org_idx ON ace_task_estimates(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ace_budget_periods_org_idx ON ace_budget_periods(org_id, start_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- ace_cost_models ─────────────────────────────────────────────────────────────
ALTER TABLE ace_cost_models ENABLE ROW LEVEL SECURITY;

-- Any org member may read cost models (for estimate UI)
CREATE POLICY "ace_cost_models_select" ON ace_cost_models
  FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    AND ace_is_enterprise()
  );

-- ADMIN+ may insert/update/delete cost models
CREATE POLICY "ace_cost_models_admin_write" ON ace_cost_models
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
    AND ace_is_enterprise()
  );

-- ace_usage_logs ──────────────────────────────────────────────────────────────
ALTER TABLE ace_usage_logs ENABLE ROW LEVEL SECURITY;

-- Employees see only their own usage logs; ADMIN+ see all org logs
CREATE POLICY "ace_usage_logs_select" ON ace_usage_logs
  FOR SELECT
  USING (
    ace_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    AND (
      employee_id IN (
        SELECT employee_id FROM public.identity_binding WHERE auth_user_id = auth.uid() AND is_active = TRUE
      )
      OR org_id IN (
        SELECT org_id FROM org_members
        WHERE user_id = auth.uid()
          AND is_active = TRUE
          AND role IN ('managing_director', 'governance')
      )
    )
  );

-- Any org member (ENTERPRISE) may insert their own usage logs
CREATE POLICY "ace_usage_logs_insert" ON ace_usage_logs
  FOR INSERT
  WITH CHECK (
    ace_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- No UPDATE/DELETE on usage_logs — append-only audit trail
-- (ADMIN+ may delete via service role only)

-- ace_task_estimates ──────────────────────────────────────────────────────────
ALTER TABLE ace_task_estimates ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read/create estimates
CREATE POLICY "ace_task_estimates_select" ON ace_task_estimates
  FOR SELECT
  USING (
    ace_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "ace_task_estimates_insert" ON ace_task_estimates
  FOR INSERT
  WITH CHECK (
    ace_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Creator or ADMIN+ may update (to fill in actuals)
CREATE POLICY "ace_task_estimates_update" ON ace_task_estimates
  FOR UPDATE
  USING (
    ace_is_enterprise()
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

-- ace_budget_periods ──────────────────────────────────────────────────────────
ALTER TABLE ace_budget_periods ENABLE ROW LEVEL SECURITY;

-- Any ENTERPRISE org member may read budgets
CREATE POLICY "ace_budget_periods_select" ON ace_budget_periods
  FOR SELECT
  USING (
    ace_is_enterprise()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ADMIN+ only for budget write
CREATE POLICY "ace_budget_periods_admin_write" ON ace_budget_periods
  FOR ALL
  USING (
    ace_is_enterprise()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ace_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ace_cost_models_updated_at
  BEFORE UPDATE ON ace_cost_models
  FOR EACH ROW EXECUTE FUNCTION ace_set_updated_at();

CREATE TRIGGER ace_task_estimates_updated_at
  BEFORE UPDATE ON ace_task_estimates
  FOR EACH ROW EXECUTE FUNCTION ace_set_updated_at();

CREATE TRIGGER ace_budget_periods_updated_at
  BEFORE UPDATE ON ace_budget_periods
  FOR EACH ROW EXECUTE FUNCTION ace_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTION BLOCK (dev-time integrity check)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables   TEXT[] := ARRAY[
    'ace_cost_models', 'ace_usage_logs', 'ace_task_estimates', 'ace_budget_periods'
  ];
  v_views    TEXT[] := ARRAY['ace_usage_summary_v', 'ace_task_roi_v'];
  t          TEXT;
BEGIN
  -- Assert tables exist
  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Assertion failed: table % not found', t;
    END IF;
  END LOOP;

  -- Assert views exist
  FOREACH t IN ARRAY v_views LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE EXCEPTION 'Assertion failed: view % not found', t;
    END IF;
  END LOOP;

  -- Assert RLS enabled on all tables
  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE relname = t AND relrowsecurity = TRUE
    ) THEN
      RAISE EXCEPTION 'Assertion failed: RLS not enabled on table %', t;
    END IF;
  END LOOP;

  RAISE NOTICE 'AI Cost Estimation schema assertions passed (4 tables, 2 views, RLS enabled)';
END;
$$;

COMMIT;
