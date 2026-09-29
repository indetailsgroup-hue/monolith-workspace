-- supabase/migrations/20270227_org_health_score.sql
-- MONOLITH v18.5 — 2S2P1C Org Health Score (OHS) module
--
-- Tables:
--   ohs_scoring_configs    — per-org, per-dimension weight overrides
--   ohs_health_snapshots   — composite score snapshots per org per date
--   ohs_dimension_scores   — per-dimension scores linked to a snapshot
--
-- View:
--   ohs_current_score_v    — latest snapshot with jsonb-aggregated dimension scores
--
-- Function:
--   ohs_compute_health_score(p_org_id uuid, p_snapshot_date date) — triggers
--   scoring from live data (QCA events, eNPS, culture metrics) and upserts
--   snapshot + dimension rows.
--
-- Plan gate:
--   All tables / the view / the function are ENTERPRISE-only via JWT claim.
--
-- 2S2P1C dimensions (weight 20% each by default):
--   SAFETY      — derived from open QCA critical/other anomalies (penalty model)
--   SATISFACTION — derived from eNPS scores
--   PERFORMANCE — placeholder 75.0 (Capacity Planning AI feeds this in v19.0)
--   PROCESS     — derived from QCA anomaly resolution rate
--   CULTURE     — derived from culture metric averages
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: plan-gate function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ohs_is_enterprise() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(auth.jwt() ->> 'org_plan', '') = 'ENTERPRISE'
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE ohs_dimension AS ENUM (
  'SAFETY',
  'SATISFACTION',
  'PERFORMANCE',
  'PROCESS',
  'CULTURE'
);

CREATE TYPE ohs_score_grade AS ENUM (
  'A',  -- ≥ 90
  'B',  -- ≥ 75
  'C',  -- ≥ 60
  'D',  -- ≥ 40
  'F'   -- < 40
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: ohs_scoring_configs
-- Per-org, per-dimension weight override (0.0 – 1.0; weights must sum to 1.0
-- across all 5 dimensions for a given org).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE ohs_scoring_configs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL,
  dimension    ohs_dimension NOT NULL,
  weight       numeric(5,4) NOT NULL DEFAULT 0.2
                CHECK (weight >= 0 AND weight <= 1),
  description  text,
  created_by   uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ohs_scoring_configs_org_dimension_unique UNIQUE (org_id, dimension)
);

ALTER TABLE ohs_scoring_configs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: ohs_health_snapshots
-- Composite health score snapshot per org per date (one per calendar day).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE ohs_health_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL,
  snapshot_date   date          NOT NULL,
  composite_score numeric(5,2)  NOT NULL
                  CHECK (composite_score >= 0 AND composite_score <= 100),
  grade           ohs_score_grade NOT NULL,
  computed_by     uuid          NOT NULL,
  computed_at     timestamptz   NOT NULL DEFAULT now(),
  notes           text,

  CONSTRAINT ohs_health_snapshots_org_date_unique UNIQUE (org_id, snapshot_date)
);

ALTER TABLE ohs_health_snapshots ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: ohs_dimension_scores
-- Per-dimension score linked to a snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE ohs_dimension_scores (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  uuid          NOT NULL REFERENCES ohs_health_snapshots(id) ON DELETE CASCADE,
  org_id       uuid          NOT NULL,
  dimension    ohs_dimension NOT NULL,
  raw_score    numeric(5,2)  NOT NULL
               CHECK (raw_score >= 0 AND raw_score <= 100),
  weight       numeric(5,4)  NOT NULL,
  weighted_contribution numeric(6,4) GENERATED ALWAYS AS (raw_score * weight) STORED,
  detail       jsonb,        -- source data snapshot for audit trail

  CONSTRAINT ohs_dimension_scores_snapshot_dimension_unique
    UNIQUE (snapshot_id, dimension)
);

ALTER TABLE ohs_dimension_scores ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: ohs_current_score_v
-- Latest snapshot per org with dimension scores aggregated as jsonb.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW ohs_current_score_v AS
WITH latest AS (
  SELECT DISTINCT ON (org_id)
    id             AS snapshot_id,
    org_id,
    snapshot_date,
    composite_score,
    grade,
    computed_at
  FROM ohs_health_snapshots
  ORDER BY org_id, snapshot_date DESC, computed_at DESC
)
SELECT
  l.snapshot_id,
  l.org_id,
  l.snapshot_date,
  l.composite_score,
  l.grade,
  l.computed_at,
  jsonb_agg(
    jsonb_build_object(
      'dimension',              d.dimension,
      'raw_score',              d.raw_score,
      'weight',                 d.weight,
      'weighted_contribution',  d.weighted_contribution,
      'detail',                 d.detail
    )
    ORDER BY d.dimension
  ) AS dimensions
FROM latest l
JOIN ohs_dimension_scores d ON d.snapshot_id = l.snapshot_id
GROUP BY
  l.snapshot_id, l.org_id, l.snapshot_date,
  l.composite_score, l.grade, l.computed_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: ohs_compute_health_score
-- Reads live data for p_snapshot_date, scores each dimension, upserts the
-- snapshot + dimension rows, and returns the composite score.
--
-- Scoring model:
--   SAFETY       — starts at 100, −15 per open CRITICAL anomaly, −5 per other open
--                  Clamped to [0, 100].
--   PROCESS      — resolution_rate = resolved / (open + acknowledged + resolved)
--                  raw_score = LEAST(100, resolution_rate * 100)
--   SATISFACTION — raw_score = COALESCE(avg eNPS ×10 + 50 clamped to [0,100], 75.0)
--                  (eNPS −10..+10 mapped → 0..100 via *5+50)
--   CULTURE      — avg of culture_metrics scores for org on snapshot_date, or 75.0
--   PERFORMANCE  — placeholder 75.0 (replaced by Capacity Planning AI in v19.0)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ohs_compute_health_score(
  p_org_id       uuid,
  p_snapshot_date date,
  p_computed_by  uuid DEFAULT auth.uid()
)
RETURNS numeric(5,2)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- scoring config weights (default 0.2 each)
  w_safety       numeric(5,4) := 0.2;
  w_satisfaction numeric(5,4) := 0.2;
  w_performance  numeric(5,4) := 0.2;
  w_process      numeric(5,4) := 0.2;
  w_culture      numeric(5,4) := 0.2;

  -- raw scores per dimension
  v_safety_score       numeric(5,2);
  v_satisfaction_score numeric(5,2);
  v_performance_score  numeric(5,2) := 75.0;  -- placeholder until v19.0
  v_process_score      numeric(5,2);
  v_culture_score      numeric(5,2);

  -- source data for detail jsonb
  v_open_critical    int;
  v_open_others      int;
  v_resolved_count   int;
  v_total_anomalies  int;
  v_resolution_rate  numeric(6,4);
  v_avg_enps         numeric(6,4);
  v_avg_culture      numeric(6,4);

  -- composite
  v_composite        numeric(5,2);
  v_grade            ohs_score_grade;
  v_snapshot_id      uuid;
BEGIN
  -- ── Enforce ENTERPRISE gate ───────────────────────────────────────────────
  IF NOT ohs_is_enterprise() THEN
    RAISE EXCEPTION 'Org Health Score requires an ENTERPRISE plan'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load per-dimension weight overrides ───────────────────────────────────
  SELECT
    COALESCE(MAX(weight) FILTER (WHERE dimension = 'SAFETY'),       0.2),
    COALESCE(MAX(weight) FILTER (WHERE dimension = 'SATISFACTION'),  0.2),
    COALESCE(MAX(weight) FILTER (WHERE dimension = 'PERFORMANCE'),   0.2),
    COALESCE(MAX(weight) FILTER (WHERE dimension = 'PROCESS'),       0.2),
    COALESCE(MAX(weight) FILTER (WHERE dimension = 'CULTURE'),       0.2)
  INTO w_safety, w_satisfaction, w_performance, w_process, w_culture
  FROM ohs_scoring_configs
  WHERE org_id = p_org_id;

  -- ── SAFETY score ─────────────────────────────────────────────────────────
  -- Count open QCA anomaly events on or before snapshot_date
  SELECT
    COUNT(*) FILTER (WHERE severity = 'CRITICAL'),
    COUNT(*) FILTER (WHERE severity <> 'CRITICAL')
  INTO v_open_critical, v_open_others
  FROM qca_anomaly_events
  WHERE org_id  = p_org_id
    AND status  = 'OPEN'
    AND created_at::date <= p_snapshot_date;

  v_safety_score := GREATEST(0.0,
    100.0 - (v_open_critical * 15.0) - (v_open_others * 5.0)
  );

  -- ── PROCESS score ────────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'ACKNOWLEDGED')),
    COUNT(*) FILTER (WHERE status = 'RESOLVED'),
    COUNT(*)
  INTO v_open_others, v_resolved_count, v_total_anomalies
  FROM qca_anomaly_events
  WHERE org_id      = p_org_id
    AND created_at::date <= p_snapshot_date;

  IF v_total_anomalies > 0 THEN
    v_resolution_rate := v_resolved_count::numeric / v_total_anomalies;
  ELSE
    v_resolution_rate := 1.0;  -- no anomalies → perfect process score
  END IF;
  v_process_score := LEAST(100.0, ROUND(v_resolution_rate * 100.0, 2));

  -- ── SATISFACTION score ───────────────────────────────────────────────────
  -- eNPS is stored in enps_responses.score (−10..+10).
  -- Map → 0..100: raw_score = CLAMP(score * 5 + 50, 0, 100)
  SELECT AVG(score)
  INTO   v_avg_enps
  FROM   enps_responses
  WHERE  org_id       = p_org_id
    AND  responded_at::date = p_snapshot_date;

  IF v_avg_enps IS NOT NULL THEN
    v_satisfaction_score := GREATEST(0.0, LEAST(100.0, v_avg_enps * 5.0 + 50.0));
  ELSE
    v_satisfaction_score := 75.0;  -- default when no eNPS data for the day
  END IF;

  -- ── CULTURE score ────────────────────────────────────────────────────────
  -- culture_metrics stores 0-100 scores per dimension per day.
  SELECT AVG(score)
  INTO   v_avg_culture
  FROM   culture_metrics
  WHERE  org_id      = p_org_id
    AND  metric_date = p_snapshot_date;

  v_culture_score := COALESCE(ROUND(v_avg_culture, 2), 75.0);

  -- ── Composite score ──────────────────────────────────────────────────────
  v_composite := ROUND(
    v_safety_score       * w_safety       +
    v_satisfaction_score * w_satisfaction +
    v_performance_score  * w_performance  +
    v_process_score      * w_process      +
    v_culture_score      * w_culture,
    2
  );

  -- ── Grade ────────────────────────────────────────────────────────────────
  v_grade := CASE
    WHEN v_composite >= 90 THEN 'A'::ohs_score_grade
    WHEN v_composite >= 75 THEN 'B'::ohs_score_grade
    WHEN v_composite >= 60 THEN 'C'::ohs_score_grade
    WHEN v_composite >= 40 THEN 'D'::ohs_score_grade
    ELSE                        'F'::ohs_score_grade
  END;

  -- ── Upsert snapshot ──────────────────────────────────────────────────────
  INSERT INTO ohs_health_snapshots (
    org_id, snapshot_date, composite_score, grade, computed_by, computed_at
  )
  VALUES (
    p_org_id, p_snapshot_date, v_composite, v_grade, p_computed_by, now()
  )
  ON CONFLICT (org_id, snapshot_date) DO UPDATE
    SET composite_score = EXCLUDED.composite_score,
        grade           = EXCLUDED.grade,
        computed_by     = EXCLUDED.computed_by,
        computed_at     = EXCLUDED.computed_at
  RETURNING id INTO v_snapshot_id;

  -- ── Upsert dimension scores ───────────────────────────────────────────────
  INSERT INTO ohs_dimension_scores (
    snapshot_id, org_id, dimension, raw_score, weight, detail
  ) VALUES
    (v_snapshot_id, p_org_id, 'SAFETY',       v_safety_score,       w_safety,
      jsonb_build_object('open_critical', v_open_critical, 'open_others', v_open_others)),
    (v_snapshot_id, p_org_id, 'SATISFACTION', v_satisfaction_score, w_satisfaction,
      jsonb_build_object('avg_enps_score', v_avg_enps)),
    (v_snapshot_id, p_org_id, 'PERFORMANCE',  v_performance_score,  w_performance,
      jsonb_build_object('source', 'placeholder_v18.5')),
    (v_snapshot_id, p_org_id, 'PROCESS',      v_process_score,      w_process,
      jsonb_build_object('total_anomalies', v_total_anomalies, 'resolved', v_resolved_count,
                         'resolution_rate', v_resolution_rate)),
    (v_snapshot_id, p_org_id, 'CULTURE',      v_culture_score,      w_culture,
      jsonb_build_object('avg_culture_score', v_avg_culture))
  ON CONFLICT (snapshot_id, dimension) DO UPDATE
    SET raw_score = EXCLUDED.raw_score,
        weight    = EXCLUDED.weight,
        detail    = EXCLUDED.detail;

  RETURN v_composite;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- ohs_scoring_configs
CREATE POLICY ohs_configs_select ON ohs_scoring_configs
  FOR SELECT USING (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

CREATE POLICY ohs_configs_insert ON ohs_scoring_configs
  FOR INSERT WITH CHECK (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

CREATE POLICY ohs_configs_update ON ohs_scoring_configs
  FOR UPDATE USING (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

CREATE POLICY ohs_configs_delete ON ohs_scoring_configs
  FOR DELETE USING (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- ohs_health_snapshots
CREATE POLICY ohs_snapshots_select ON ohs_health_snapshots
  FOR SELECT USING (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- Snapshots are written only by the compute function (SECURITY DEFINER).
-- Direct INSERT/UPDATE from clients is intentionally blocked.

-- ohs_dimension_scores
CREATE POLICY ohs_dim_scores_select ON ohs_dimension_scores
  FOR SELECT USING (
    ohs_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- Dimension scores are written only by the compute function (SECURITY DEFINER).

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX ohs_scoring_configs_org_id_idx      ON ohs_scoring_configs(org_id);
CREATE INDEX ohs_health_snapshots_org_id_idx     ON ohs_health_snapshots(org_id);
CREATE INDEX ohs_health_snapshots_org_date_idx   ON ohs_health_snapshots(org_id, snapshot_date DESC);
CREATE INDEX ohs_health_snapshots_grade_idx      ON ohs_health_snapshots(grade);
CREATE INDEX ohs_dimension_scores_snapshot_idx   ON ohs_dimension_scores(snapshot_id);
CREATE INDEX ohs_dimension_scores_org_id_idx     ON ohs_dimension_scores(org_id);
CREATE INDEX ohs_dimension_scores_dimension_idx  ON ohs_dimension_scores(dimension);

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTION BLOCK (runs at migration time)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_dim_count   int;
  v_grade_count int;
BEGIN
  SELECT COUNT(*) INTO v_dim_count
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'ohs_dimension';
  ASSERT v_dim_count = 5, 'ohs_dimension must have 5 values (SAFETY/SATISFACTION/PERFORMANCE/PROCESS/CULTURE)';

  SELECT COUNT(*) INTO v_grade_count
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'ohs_score_grade';
  ASSERT v_grade_count = 5, 'ohs_score_grade must have 5 values (A/B/C/D/F)';

  ASSERT to_regclass('ohs_scoring_configs')   IS NOT NULL, 'ohs_scoring_configs table missing';
  ASSERT to_regclass('ohs_health_snapshots')  IS NOT NULL, 'ohs_health_snapshots table missing';
  ASSERT to_regclass('ohs_dimension_scores')  IS NOT NULL, 'ohs_dimension_scores table missing';
  ASSERT to_regclass('ohs_current_score_v')   IS NOT NULL, 'ohs_current_score_v view missing';

  RAISE NOTICE 'OHS migration assertions passed.';
END;
$$;
