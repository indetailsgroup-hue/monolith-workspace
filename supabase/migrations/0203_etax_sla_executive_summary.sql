-- =============================================================================
-- Migration 0203 — v_etax_sla_executive_summary
-- Executive SLA dashboard view combining long-term archive (0202) with
-- live materialized-view data (0199) for a single-query KPI panel.
--
-- Views created:
--   v_etax_sla_executive_summary      — per-org executive KPI row
--
-- RPCs created:
--   rpc_etax_sla_executive_summary    — filtered RPC (SECURITY DEFINER)
--
-- Dependencies:
--   v_etax_sla_archive_org_rollup     (Migration 0202)
--   mv_etax_submission_sla            (Migration 0199)
--   v_etax_submission_sla             (Migration 0198)
--   organizations                     (0000_multi_tenant_schema)
--   get_user_org_id()
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Executive summary view
--     Joins mv_etax_submission_sla (live/cached) LEFT JOIN archive rollup so
--     every org with live submissions appears even before the first archive run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_etax_sla_executive_summary
  WITH (security_invoker = true)
AS
WITH live AS (
  -- Aggregate the cached MV to one row per org
  SELECT
    mv.org_id,
    o.name                                                      AS org_name,
    COUNT(*)                                                    AS live_total_submissions,
    COUNT(*) FILTER (WHERE mv.sla_breach_flag = true)           AS live_breach_count,
    ROUND(
      (COUNT(*) FILTER (WHERE mv.sla_breach_flag = true))::numeric
      / NULLIF(COUNT(*), 0) * 100,
      2
    )                                                           AS live_breach_rate_pct,
    MAX(mv.severity_tier)                                       AS live_worst_severity,
    AVG(mv.avg_processing_hours)                                AS live_avg_processing_hours,
    MAX(mv.sla_threshold_hours)                                 AS live_sla_threshold_hours,
    MAX(mv.last_submission_at)                                  AS live_last_submission_at
  FROM mv_etax_submission_sla mv
  JOIN organizations o ON o.org_id = mv.org_id
  GROUP BY mv.org_id, o.name
),
archive AS (
  SELECT
    ar.org_id,
    ar.org_name,
    ar.first_archived_date,
    ar.last_archived_date,
    ar.total_archive_days,
    ar.total_created                                            AS archive_total_created,
    ar.total_breached                                           AS archive_total_breached,
    ar.overall_breach_rate                                      AS archive_breach_rate_pct,
    ar.worst_severity_tier                                      AS archive_worst_severity,
    ar.peak_cumulative                                          AS archive_peak_cumulative,
    ar.breached_document_types,
    ar.sla_threshold_hours                                      AS archive_sla_threshold_hours,
    ar.last_archived_at
  FROM v_etax_sla_archive_org_rollup ar
)
SELECT
  -- Identity
  COALESCE(l.org_id, a.org_id)                                 AS org_id,
  COALESCE(l.org_name, a.org_name)                             AS org_name,

  -- Live (from mv_etax_submission_sla)
  COALESCE(l.live_total_submissions, 0)                        AS live_total_submissions,
  COALESCE(l.live_breach_count, 0)                             AS live_breach_count,
  l.live_breach_rate_pct,
  l.live_worst_severity,
  ROUND(l.live_avg_processing_hours::numeric, 2)               AS live_avg_processing_hours,
  COALESCE(l.live_sla_threshold_hours,
           a.archive_sla_threshold_hours, 24)                  AS sla_threshold_hours,
  l.live_last_submission_at,

  -- Archive long-term (from v_etax_sla_archive_org_rollup)
  a.first_archived_date,
  a.last_archived_date,
  COALESCE(a.total_archive_days, 0)                            AS archive_total_days,
  COALESCE(a.archive_total_created, 0)                         AS archive_total_created,
  COALESCE(a.archive_total_breached, 0)                        AS archive_total_breached,
  a.archive_breach_rate_pct,
  a.archive_worst_severity,
  COALESCE(a.archive_peak_cumulative, 0)                       AS archive_peak_cumulative,
  a.breached_document_types,
  a.last_archived_at,

  -- Combined executive KPIs
  GREATEST(
    COALESCE(l.live_breach_rate_pct, 0),
    COALESCE(a.archive_breach_rate_pct, 0)
  )                                                            AS peak_breach_rate_pct,

  -- Worst severity across live + archive
  CASE
    WHEN 'CRITICAL' IN (l.live_worst_severity, a.archive_worst_severity) THEN 'CRITICAL'
    WHEN 'WARNING'  IN (l.live_worst_severity, a.archive_worst_severity) THEN 'WARNING'
    WHEN 'ELEVATED' IN (l.live_worst_severity, a.archive_worst_severity) THEN 'ELEVATED'
    WHEN 'NORMAL'   IN (l.live_worst_severity, a.archive_worst_severity) THEN 'NORMAL'
    ELSE 'HEALTHY'
  END                                                          AS combined_worst_severity,

  -- Risk signal: TRUE when live or archive worst tier is WARNING or CRITICAL
  (
    l.live_worst_severity IN ('CRITICAL','WARNING')
    OR a.archive_worst_severity IN ('CRITICAL','WARNING')
  )                                                            AS requires_attention,

  -- Data availability flags
  (l.org_id IS NOT NULL)                                       AS has_live_data,
  (a.org_id IS NOT NULL)                                       AS has_archive_data

FROM live l
FULL OUTER JOIN archive a ON a.org_id = l.org_id;

COMMENT ON VIEW v_etax_sla_executive_summary IS
  'Executive SLA KPI view — joins mv_etax_submission_sla (live, Migration 0199) '
  'with v_etax_sla_archive_org_rollup (long-term, Migration 0202) for a '
  'single-query executive dashboard. One row per org. RLS via security_invoker.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  RPC: rpc_etax_sla_executive_summary
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_etax_sla_executive_summary(
  p_org_id              UUID    DEFAULT NULL,
  p_requires_attention  BOOLEAN DEFAULT NULL,
  p_has_archive_data    BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  org_id                      UUID,
  org_name                    TEXT,
  live_total_submissions      BIGINT,
  live_breach_count           BIGINT,
  live_breach_rate_pct        NUMERIC,
  live_worst_severity         TEXT,
  live_avg_processing_hours   NUMERIC,
  sla_threshold_hours         NUMERIC,
  live_last_submission_at     TIMESTAMPTZ,
  first_archived_date         DATE,
  last_archived_date          DATE,
  archive_total_days          BIGINT,
  archive_total_created       BIGINT,
  archive_total_breached      BIGINT,
  archive_breach_rate_pct     NUMERIC,
  archive_worst_severity      TEXT,
  archive_peak_cumulative     BIGINT,
  breached_document_types     TEXT[],
  last_archived_at            TIMESTAMPTZ,
  peak_breach_rate_pct        NUMERIC,
  combined_worst_severity     TEXT,
  requires_attention          BOOLEAN,
  has_live_data               BOOLEAN,
  has_archive_data            BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.org_id,
    v.org_name,
    v.live_total_submissions,
    v.live_breach_count,
    v.live_breach_rate_pct,
    v.live_worst_severity,
    v.live_avg_processing_hours,
    v.sla_threshold_hours,
    v.live_last_submission_at,
    v.first_archived_date,
    v.last_archived_date,
    v.archive_total_days,
    v.archive_total_created,
    v.archive_total_breached,
    v.archive_breach_rate_pct,
    v.archive_worst_severity,
    v.archive_peak_cumulative,
    v.breached_document_types,
    v.last_archived_at,
    v.peak_breach_rate_pct,
    v.combined_worst_severity,
    v.requires_attention,
    v.has_live_data,
    v.has_archive_data
  FROM v_etax_sla_executive_summary v
  WHERE
    -- Tenant isolation: non-service_role sees only their org
    (
      (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
      OR v.org_id = get_user_org_id()
    )
    -- Optional filters
    AND (p_org_id IS NULL              OR v.org_id = p_org_id)
    AND (p_requires_attention IS NULL  OR v.requires_attention = p_requires_attention)
    AND (p_has_archive_data IS NULL    OR v.has_archive_data   = p_has_archive_data)
  ORDER BY v.combined_worst_severity DESC, v.peak_breach_rate_pct DESC NULLS LAST;
$$;

-- Permissions
REVOKE ALL ON FUNCTION rpc_etax_sla_executive_summary(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_etax_sla_executive_summary(UUID, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION rpc_etax_sla_executive_summary(UUID, BOOLEAN, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION rpc_etax_sla_executive_summary IS
  'Executive SLA summary combining live mv_etax_submission_sla data with '
  'long-term v_etax_sla_archive_org_rollup for a single-query dashboard panel. '
  'Filters: p_org_id, p_requires_attention, p_has_archive_data. '
  'SECURITY DEFINER — RLS enforced via get_user_org_id() for non-service_role callers. '
  'Migration 0203.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Register in platform_config
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform_config (key, value, updated_at)
VALUES (
  'migration_0203_applied',
  jsonb_build_object(
    'version',     '0203',
    'description', 'v_etax_sla_executive_summary + rpc_etax_sla_executive_summary',
    'applied_at',  now()
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;

COMMIT;
