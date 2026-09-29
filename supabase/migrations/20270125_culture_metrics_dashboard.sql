-- =============================================================================
-- MONOLITH v17.5 — Culture Metrics Dashboard Module
-- Migration: 20270125_culture_metrics_dashboard.sql
--
-- Tracks org-level culture health metrics, eNPS, and engagement trends.
-- Aggregates data from ps_scores, anonymous_feedback, and SuperEmployee
-- stage distributions into a unified org health dashboard.
--
-- Plan Gate: PROFESSIONAL+ (PROFESSIONAL or ENTERPRISE)
--
-- Tables:
--   cmd_metric_definitions  — KPI definitions (what dimensions to measure)
--   cmd_metric_snapshots    — periodic metric snapshot per org per dimension
--   cmd_enps_surveys        — eNPS survey instances per org
--   cmd_enps_responses      — anonymous eNPS responses (0–10 scale)
--
-- Views:
--   cmd_org_health_v        — current org health score per metric (latest snapshot)
--   cmd_enps_results_v      — NPS score + PROMOTER/PASSIVE/DETRACTOR breakdown
--
-- Plan gate function:
--   cmd_is_professional_plus() — PROFESSIONAL or ENTERPRISE plan check
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE cmd_metric_category AS ENUM (
  'ENGAGEMENT',       -- employee engagement / connection to mission
  'PSYCHOLOGICAL_SAFETY', -- speak-up culture, error tolerance
  'COLLABORATION',    -- cross-team working quality
  'SATISFACTION',     -- job satisfaction, intent to stay
  'PRODUCTIVITY',     -- output quality perception
  'LEADERSHIP',       -- manager effectiveness score
  'AI_READINESS',     -- aggregate of SuperEmployee stage distribution
  'CUSTOM'            -- org-defined metric
);

CREATE TYPE cmd_metric_source AS ENUM (
  'PS_SURVEY',        -- derived from ps_scores table
  'ENPS',             -- from cmd_enps_responses
  'SUPER_EMPLOYEE',   -- derived from employee_ai_assessments
  'MANUAL',           -- manually entered by admin
  'ATTENDANCE',       -- derived from HR system
  'OTHER'
);

CREATE TYPE cmd_snapshot_period AS ENUM (
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL'
);

CREATE TYPE cmd_enps_status AS ENUM (
  'DRAFT',    -- survey configured but not sent
  'ACTIVE',   -- accepting responses
  'CLOSED'    -- no longer accepting responses
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PLAN GATE FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * cmd_is_professional_plus()
 *
 * Returns TRUE when the calling user's org is on PROFESSIONAL or ENTERPRISE plan.
 * Culture Metrics Dashboard is available to PROFESSIONAL+ orgs.
 */
CREATE OR REPLACE FUNCTION cmd_is_professional_plus()
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
      AND o.plan IN ('PROFESSIONAL', 'ENTERPRISE')
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- cmd_metric_definitions — KPI definitions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cmd_metric_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  metric_category   cmd_metric_category NOT NULL,
  metric_source     cmd_metric_source NOT NULL,
  display_name      TEXT NOT NULL,        -- e.g. "Psychological Safety Score"
  display_name_th   TEXT,                 -- Thai label

  -- Scoring config
  min_score         NUMERIC(6, 2) NOT NULL DEFAULT 0,
  max_score         NUMERIC(6, 2) NOT NULL DEFAULT 100,
  target_score      NUMERIC(6, 2),        -- org target for this KPI
  warning_threshold NUMERIC(6, 2),        -- below this → amber alert
  critical_threshold NUMERIC(6, 2),       -- below this → red alert

  -- Weight for org health score (0.0–1.0; sum across active metrics should = 1.0)
  health_weight     NUMERIC(4, 3) NOT NULL DEFAULT 0.1
                      CHECK (health_weight BETWEEN 0 AND 1),

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_system         BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = shipped by MONOLITH, not deletable
  description       TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cmd_metric_definitions_org_name_uq
    UNIQUE (org_id, display_name)
);

COMMENT ON TABLE cmd_metric_definitions IS
  'Culture KPI metric definitions per org. System metrics (is_system=TRUE) are seeded by MONOLITH. PROFESSIONAL+ plan required.';

-- ─────────────────────────────────────────────────────────────────────────────
-- cmd_metric_snapshots — periodic metric score snapshots
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cmd_metric_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  metric_id         UUID NOT NULL REFERENCES cmd_metric_definitions(id) ON DELETE CASCADE,

  period_type       cmd_snapshot_period NOT NULL,
  period_label      TEXT NOT NULL,          -- e.g. "2027-W04", "2027-01", "2027-Q1"
  snapshot_date     DATE NOT NULL,

  score             NUMERIC(6, 2) NOT NULL CHECK (score >= 0),
  respondent_count  INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,

  -- Source reference (e.g. ps_score period_id, enps_survey_id)
  source_ref_id     UUID,

  recorded_by       UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cmd_metric_snapshots_org_metric_period_uq
    UNIQUE (org_id, metric_id, period_label)
);

COMMENT ON TABLE cmd_metric_snapshots IS
  'Periodic metric score snapshots. One row per metric per period. Immutable after creation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- cmd_enps_surveys — eNPS survey instances
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cmd_enps_surveys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,

  title             TEXT NOT NULL,          -- e.g. "Q1 2027 Employee NPS Survey"
  title_th          TEXT,
  status            cmd_enps_status NOT NULL DEFAULT 'DRAFT',

  -- Question text (customisable but must be a 0–10 scale)
  question_text     TEXT NOT NULL DEFAULT
    'คุณมีโอกาสแนะนำบริษัทนี้ให้เป็นสถานที่ทำงานแก่เพื่อน/คนรู้จักมากน้อยเพียงใด? (0 = ไม่แนะนำเลย, 10 = แนะนำอย่างยิ่ง)',

  -- Optional follow-up open question
  followup_question TEXT DEFAULT
    'อธิบายเพิ่มเติมเกี่ยวกับคำตอบของคุณ (ไม่บังคับ)',

  -- Survey window
  opens_at          TIMESTAMPTZ,
  closes_at         TIMESTAMPTZ,

  -- Minimum responses before results are revealed (anonymity guard)
  min_responses     INTEGER NOT NULL DEFAULT 3
                      CHECK (min_responses >= 3),

  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cmd_enps_surveys IS
  'eNPS survey instances per org. Responses stored separately (cmd_enps_responses). PROFESSIONAL+ plan required.';

-- ─────────────────────────────────────────────────────────────────────────────
-- cmd_enps_responses — anonymous eNPS responses
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cmd_enps_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  survey_id         UUID NOT NULL REFERENCES cmd_enps_surveys(id) ON DELETE CASCADE,

  -- Score: 0–10 (NPS standard)
  score             SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 10),

  -- Anonymous follow-up comment (no user_id stored — same anonymity model as anonymous_feedback)
  followup_text     TEXT,

  -- Anonymous token (client-side UUID, never tied to auth.uid()) for dedup
  anonymous_token   TEXT NOT NULL,

  -- Segment (optional, allows team-level breakdown without identity)
  department_label  TEXT,

  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cmd_enps_responses_survey_token_uq
    UNIQUE (survey_id, anonymous_token)
);

COMMENT ON TABLE cmd_enps_responses IS
  'Anonymous eNPS responses. No user_id column — identity never stored. anonymous_token is client-generated UUID.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- cmd_org_health_v: latest snapshot per metric for each org
CREATE OR REPLACE VIEW cmd_org_health_v
WITH (security_invoker = TRUE)
AS
SELECT DISTINCT ON (s.org_id, s.metric_id)
  s.org_id,
  s.metric_id,
  d.display_name,
  d.display_name_th,
  d.metric_category,
  d.metric_source,
  d.target_score,
  d.warning_threshold,
  d.critical_threshold,
  d.health_weight,
  s.score                                       AS latest_score,
  s.respondent_count                            AS latest_respondent_count,
  s.period_label                                AS latest_period,
  s.snapshot_date                               AS latest_snapshot_date,
  CASE
    WHEN d.critical_threshold IS NOT NULL AND s.score < d.critical_threshold THEN 'CRITICAL'
    WHEN d.warning_threshold  IS NOT NULL AND s.score < d.warning_threshold  THEN 'WARNING'
    WHEN d.target_score       IS NOT NULL AND s.score >= d.target_score       THEN 'ON_TARGET'
    ELSE 'NORMAL'
  END                                           AS health_status
FROM cmd_metric_snapshots s
JOIN cmd_metric_definitions d ON d.id = s.metric_id
WHERE d.is_active = TRUE
ORDER BY s.org_id, s.metric_id, s.snapshot_date DESC;

COMMENT ON VIEW cmd_org_health_v IS
  'Latest metric snapshot per org metric with health_status band. SECURITY INVOKER.';

-- cmd_enps_results_v: NPS score + PROMOTER/PASSIVE/DETRACTOR breakdown per survey
--   Reveals results only when respondent count >= min_responses (anonymity guard)
CREATE OR REPLACE VIEW cmd_enps_results_v
WITH (security_invoker = TRUE)
AS
SELECT
  sv.id                                         AS survey_id,
  sv.org_id,
  sv.title,
  sv.status,
  sv.closes_at,
  sv.min_responses,
  COUNT(r.id)                                   AS total_responses,
  -- Only expose breakdown when enough responses collected
  CASE WHEN COUNT(r.id) >= sv.min_responses THEN
    COUNT(r.id) FILTER (WHERE r.score >= 9)
  ELSE NULL END                                 AS promoter_count,
  CASE WHEN COUNT(r.id) >= sv.min_responses THEN
    COUNT(r.id) FILTER (WHERE r.score BETWEEN 7 AND 8)
  ELSE NULL END                                 AS passive_count,
  CASE WHEN COUNT(r.id) >= sv.min_responses THEN
    COUNT(r.id) FILTER (WHERE r.score <= 6)
  ELSE NULL END                                 AS detractor_count,
  -- NPS = (promoters% - detractors%) * 100; NULL until threshold met
  CASE WHEN COUNT(r.id) >= sv.min_responses THEN
    ROUND(
      (
        (COUNT(r.id) FILTER (WHERE r.score >= 9)::NUMERIC
         - COUNT(r.id) FILTER (WHERE r.score <= 6)::NUMERIC)
        / NULLIF(COUNT(r.id), 0)::NUMERIC * 100
      )::NUMERIC,
      1
    )
  ELSE NULL END                                 AS nps_score,
  ROUND(AVG(r.score)::NUMERIC, 2)               AS avg_score
FROM cmd_enps_surveys sv
LEFT JOIN cmd_enps_responses r ON r.survey_id = sv.id
GROUP BY sv.id;

COMMENT ON VIEW cmd_enps_results_v IS
  'eNPS survey results: NPS score + PROMOTER/PASSIVE/DETRACTOR. Results hidden until min_responses reached. SECURITY INVOKER.';

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS cmd_metric_definitions_org_idx
  ON cmd_metric_definitions(org_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS cmd_metric_snapshots_org_metric_date_idx
  ON cmd_metric_snapshots(org_id, metric_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS cmd_enps_surveys_org_status_idx
  ON cmd_enps_surveys(org_id, status);

CREATE INDEX IF NOT EXISTS cmd_enps_responses_survey_idx
  ON cmd_enps_responses(survey_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- cmd_metric_definitions ──────────────────────────────────────────────────────
ALTER TABLE cmd_metric_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmd_metric_definitions_select" ON cmd_metric_definitions
  FOR SELECT
  USING (
    cmd_is_professional_plus()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "cmd_metric_definitions_admin_write" ON cmd_metric_definitions
  FOR ALL
  USING (
    cmd_is_professional_plus()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- cmd_metric_snapshots ────────────────────────────────────────────────────────
ALTER TABLE cmd_metric_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmd_metric_snapshots_select" ON cmd_metric_snapshots
  FOR SELECT
  USING (
    cmd_is_professional_plus()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- ADMIN+ may insert snapshots (manual or system-triggered)
CREATE POLICY "cmd_metric_snapshots_admin_insert" ON cmd_metric_snapshots
  FOR INSERT
  WITH CHECK (
    cmd_is_professional_plus()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- cmd_enps_surveys ────────────────────────────────────────────────────────────
ALTER TABLE cmd_enps_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmd_enps_surveys_select" ON cmd_enps_surveys
  FOR SELECT
  USING (
    cmd_is_professional_plus()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "cmd_enps_surveys_admin_write" ON cmd_enps_surveys
  FOR ALL
  USING (
    cmd_is_professional_plus()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- cmd_enps_responses ──────────────────────────────────────────────────────────
ALTER TABLE cmd_enps_responses ENABLE ROW LEVEL SECURITY;

-- ADMIN+ (hierarchy ≥ 80) may read responses (aggregate only via view)
CREATE POLICY "cmd_enps_responses_admin_select" ON cmd_enps_responses
  FOR SELECT
  USING (
    cmd_is_professional_plus()
    AND org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- Any org member may submit a response to an ACTIVE survey (anonymous)
CREATE POLICY "cmd_enps_responses_insert" ON cmd_enps_responses
  FOR INSERT
  WITH CHECK (
    cmd_is_professional_plus()
    AND org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM cmd_enps_surveys sv
      WHERE sv.id = survey_id
        AND sv.status = 'ACTIVE'
        AND (sv.closes_at IS NULL OR sv.closes_at > NOW())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cmd_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cmd_metric_definitions_updated_at
  BEFORE UPDATE ON cmd_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION cmd_set_updated_at();

CREATE TRIGGER cmd_enps_surveys_updated_at
  BEFORE UPDATE ON cmd_enps_surveys
  FOR EACH ROW EXECUTE FUNCTION cmd_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA — system metric definitions (is_system = TRUE)
-- Seeded for all orgs on first tenant setup via separate onboarding script;
-- here we document the canonical 6 system metrics.
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: system metric seeds are injected per-org by the onboarding RPC
-- (insert_default_culture_metrics), not in this migration, to preserve
-- multi-tenancy (each org gets its own copy with its own org_id).

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTION BLOCK
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'cmd_metric_definitions',
    'cmd_metric_snapshots',
    'cmd_enps_surveys',
    'cmd_enps_responses'
  ];
  v_views TEXT[] := ARRAY[
    'cmd_org_health_v',
    'cmd_enps_results_v'
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

  RAISE NOTICE 'Culture Metrics Dashboard schema assertions passed (4 tables, 2 views, RLS enabled)';
END;
$$;

COMMIT;
