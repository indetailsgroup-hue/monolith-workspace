-- =============================================================================
-- MONOLITH v18.5 Sprint 15 — Team Pulse Check (TPC) module
-- Migration: 20270322_team_pulse_check.sql
-- =============================================================================
-- Tables  : tpc_pulse_configs, tpc_pulse_sessions, tpc_pulse_responses
-- View    : tpc_pulse_summary_v  (aggregated per session / topic)
-- RLS     : responses INSERT=org-members, SELECT=ADMIN+;
--           sessions ADMIN+ write, org-members SELECT (ACTIVE/CLOSED only);
--           configs ADMIN+ all
-- Plan gate: PROFESSIONAL or ENTERPRISE  (app layer + helper fn)
-- Anonymous model: no user_id on tpc_pulse_responses (mirrors est_sentiment_entries)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PLAN GATE HELPER
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_tpc_plan_gate(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan INTO v_plan FROM public.organizations WHERE org_id = p_org_id;
  IF v_plan NOT IN ('PROFESSIONAL', 'ENTERPRISE') THEN
    RAISE EXCEPTION 'TPC module requires PROFESSIONAL or ENTERPRISE plan (org: %)', p_org_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-org per-topic configuration (mirrors est_timeline_configs)
-- Topics: WORKLOAD | COMMUNICATION | DIRECTION | SUPPORT | RECOGNITION
CREATE TABLE IF NOT EXISTS tpc_pulse_configs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  topic       TEXT        NOT NULL CHECK (topic IN (
                            'WORKLOAD','COMMUNICATION','DIRECTION','SUPPORT','RECOGNITION'
                          )),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  -- scale_max = 5 → 1-5 Likert scale (TPC uses 5-point scale for quick pulse)
  scale_max   INT         NOT NULL DEFAULT 5 CHECK (scale_max = 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, topic)
);

-- Org-level pulse sessions (admin creates / activates / closes)
CREATE TABLE IF NOT EXISTS tpc_pulse_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','CLOSED')),
  period_label TEXT        NOT NULL,   -- e.g. '2027-W12', '2027-03', '2027-Q1'
  opened_at    TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anonymous pulse responses per session / topic (no user_id — same anonymity as EST)
CREATE TABLE IF NOT EXISTS tpc_pulse_responses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  session_id   UUID        NOT NULL REFERENCES tpc_pulse_sessions(id) ON DELETE CASCADE,
  topic        TEXT        NOT NULL CHECK (topic IN (
                             'WORKLOAD','COMMUNICATION','DIRECTION','SUPPORT','RECOGNITION'
                           )),
  score        INT         NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment      TEXT,                   -- optional free-text (anonymous)
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: intentionally no user_id — anonymous submission model
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tpc_responses_session
  ON tpc_pulse_responses(session_id);

CREATE INDEX IF NOT EXISTS idx_tpc_responses_org_topic
  ON tpc_pulse_responses(org_id, topic);

CREATE INDEX IF NOT EXISTS idx_tpc_sessions_org_status
  ON tpc_pulse_sessions(org_id, status);

CREATE INDEX IF NOT EXISTS idx_tpc_configs_org
  ON tpc_pulse_configs(org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VIEW: aggregated summary per session / topic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW tpc_pulse_summary_v AS
SELECT
  r.org_id,
  r.session_id,
  s.title        AS session_title,
  s.period_label,
  s.status       AS session_status,
  r.topic,
  ROUND(AVG(r.score)::NUMERIC, 2) AS avg_score,
  COUNT(*)::INT                   AS response_count,
  CASE
    -- suppress until minimum 3 responses
    WHEN COUNT(*) < 3               THEN NULL
    -- 1-5 scale health thresholds
    WHEN AVG(r.score) < 2.5         THEN 'CRITICAL'
    WHEN AVG(r.score) < 3.5         THEN 'WARNING'
    ELSE                                 'NORMAL'
  END                             AS health_status
FROM tpc_pulse_responses r
JOIN tpc_pulse_sessions   s ON s.id = r.session_id
GROUP BY
  r.org_id,
  r.session_id,
  s.title,
  s.period_label,
  s.status,
  r.topic;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tpc_pulse_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpc_pulse_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpc_pulse_responses  ENABLE ROW LEVEL SECURITY;

-- tpc_pulse_configs: ADMIN+ full access
CREATE POLICY tpc_configs_admin ON tpc_pulse_configs
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

-- tpc_pulse_sessions: any authenticated org-member can SELECT (ACTIVE or CLOSED)
CREATE POLICY tpc_sessions_select_member ON tpc_pulse_sessions
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
       WHERE user_id = auth.uid() AND is_active = true
    )
    AND status IN ('ACTIVE', 'CLOSED')
  );

-- tpc_pulse_sessions: ADMIN+ can INSERT / UPDATE / DELETE (manage lifecycle)
CREATE POLICY tpc_sessions_write_admin ON tpc_pulse_sessions
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

-- tpc_pulse_responses: any authenticated org-member can INSERT (anonymous submit)
CREATE POLICY tpc_responses_insert_member ON tpc_pulse_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
       WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- tpc_pulse_responses: only ADMIN+ can SELECT (results are admin-only)
CREATE POLICY tpc_responses_select_admin ON tpc_pulse_responses
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid()
         AND om.role IN ('OWNER', 'ADMIN') AND om.is_active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ASSERTIONS (applied at migration time)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'tpc_pulse_configs'
  ), 'tpc_pulse_configs table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'tpc_pulse_sessions'
  ), 'tpc_pulse_sessions table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'tpc_pulse_responses'
  ), 'tpc_pulse_responses table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_name = 'tpc_pulse_summary_v'
  ), 'tpc_pulse_summary_v view missing';
END;
$$;

COMMIT;
