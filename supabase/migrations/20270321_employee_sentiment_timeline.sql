-- =============================================================================
-- MONOLITH v18.5 Sprint 13 — Employee Sentiment Timeline (EST) module
-- Migration: 20270321_employee_sentiment_timeline.sql
-- =============================================================================
-- Tables  : est_timeline_configs, est_sentiment_entries
-- View    : est_sentiment_summary_v  (aggregated timeline with health status)
-- RLS     : entries INSERT=all-org-members, SELECT=ADMIN+; configs=ADMIN+
-- Plan gate: PROFESSIONAL or ENTERPRISE  (enforced in app layer + helper fn)
-- Anonymous model: no user_id on est_sentiment_entries (mirrors enps_responses)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PLAN GATE HELPER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_est_plan_gate(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan INTO v_plan FROM public.organizations WHERE org_id = p_org_id;
  IF v_plan NOT IN ('PROFESSIONAL', 'ENTERPRISE') THEN
    RAISE EXCEPTION 'EST module requires PROFESSIONAL or ENTERPRISE plan (org: %)', p_org_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-org per-dimension configuration (active flag, inversion, period type)
CREATE TABLE IF NOT EXISTS est_timeline_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  dimension     TEXT        NOT NULL CHECK (dimension IN (
                              'MORALE','ENGAGEMENT','STRESS','COLLABORATION','CLARITY'
                            )),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- is_inverted = TRUE means high score is BAD (used for STRESS dimension)
  is_inverted   BOOLEAN     NOT NULL DEFAULT FALSE,
  min_responses INT         NOT NULL DEFAULT 3,
  period_type   TEXT        NOT NULL DEFAULT 'WEEKLY' CHECK (period_type IN (
                              'WEEKLY','MONTHLY','QUARTERLY'
                            )),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, dimension)
);

-- Anonymous sentiment entries — no user_id (same anonymity model as enps_responses)
CREATE TABLE IF NOT EXISTS est_sentiment_entries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  dimension    TEXT        NOT NULL CHECK (dimension IN (
                             'MORALE','ENGAGEMENT','STRESS','COLLABORATION','CLARITY'
                           )),
  score        INT         NOT NULL CHECK (score BETWEEN 1 AND 10),
  period_type  TEXT        NOT NULL CHECK (period_type IN (
                             'WEEKLY','MONTHLY','QUARTERLY'
                           )),
  period_label TEXT        NOT NULL,   -- e.g. '2027-W12', '2027-03', '2027-Q1'
  note         TEXT,                   -- optional free-text (anonymous)
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: intentionally no user_id — anonymous submission model
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_est_entries_org_dim
  ON est_sentiment_entries(org_id, dimension);

CREATE INDEX IF NOT EXISTS idx_est_entries_org_period
  ON est_sentiment_entries(org_id, period_type, period_label);

CREATE INDEX IF NOT EXISTS idx_est_configs_org
  ON est_timeline_configs(org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VIEW: aggregated timeline summary per org / dimension / period
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW est_sentiment_summary_v AS
SELECT
  e.org_id,
  e.dimension,
  e.period_type,
  e.period_label,
  ROUND(AVG(e.score)::NUMERIC, 2)  AS avg_score,
  COUNT(*)::INT                    AS response_count,
  COALESCE(c.is_inverted,   FALSE) AS is_inverted,
  COALESCE(c.min_responses, 3)     AS min_responses,
  CASE
    -- suppress score until min_responses reached
    WHEN COUNT(*) < COALESCE(c.min_responses, 3) THEN NULL
    -- inverted dimension (STRESS): high score = bad
    WHEN COALESCE(c.is_inverted, FALSE) THEN
      CASE
        WHEN AVG(e.score) >= 7 THEN 'CRITICAL'
        WHEN AVG(e.score) >= 5 THEN 'WARNING'
        ELSE                        'NORMAL'
      END
    -- normal dimension: low score = bad
    ELSE
      CASE
        WHEN AVG(e.score) <= 4 THEN 'CRITICAL'
        WHEN AVG(e.score) <= 6 THEN 'WARNING'
        ELSE                        'NORMAL'
      END
  END                              AS health_status
FROM est_sentiment_entries e
LEFT JOIN est_timeline_configs c
  ON c.org_id   = e.org_id
 AND c.dimension = e.dimension
GROUP BY
  e.org_id,
  e.dimension,
  e.period_type,
  e.period_label,
  c.is_inverted,
  c.min_responses;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE est_sentiment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE est_timeline_configs  ENABLE ROW LEVEL SECURITY;

-- est_sentiment_entries: any authenticated member of the org can INSERT (anonymous)
CREATE POLICY est_entries_insert ON est_sentiment_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
       WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- est_sentiment_entries: only ADMIN+ (hierarchy >= 80) can SELECT
CREATE POLICY est_entries_select_admin ON est_sentiment_entries
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid()
         AND om.role IN ('OWNER', 'ADMIN') AND om.is_active = true
    )
  );

-- est_timeline_configs: ADMIN+ full access (SELECT / INSERT / UPDATE / DELETE)
CREATE POLICY est_configs_admin ON est_timeline_configs
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid()
         AND om.role IN ('OWNER', 'ADMIN') AND om.is_active = true
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid()
         AND om.role IN ('OWNER', 'ADMIN') AND om.is_active = true
    )
  );

COMMIT;
