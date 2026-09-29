-- =============================================================================
-- Migration 0198: v_etax_submission_sla
-- SLA breach tracking view — flags etax_submissions exceeding the 24-hour
-- processing SLA threshold, aggregated per organisation and document type.
--
-- Depends on: 0178 (etax_submissions, org_id RLS), 0196 (partitioned table)
-- View type : non-materialized (live; use mv_etax_health_trend for caching)
-- RLS policy: org_id isolation via get_user_org_id() — same pattern as all
--             other etax observability views (0186, 0190, 0193, 0194)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- §1  SLA constants (stored in platform_config, defaulting here to 24 h)
-- ---------------------------------------------------------------------------
-- The view hard-codes the 24-hour threshold inline. If you want a configurable
-- threshold, insert a row into platform_config:
--
--   INSERT INTO platform_config (key, value)
--   VALUES ('etax_sla_hours', '24')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- The view reads that value with COALESCE so it degrades gracefully when the
-- key is absent (falls back to 24).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §2  Drop previous version if any
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_etax_submission_sla CASCADE;

-- ---------------------------------------------------------------------------
-- §3  Create view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_etax_submission_sla
WITH (security_invoker = true)
AS
WITH

  -- ── 3a. Resolve SLA threshold from platform_config (default 24 h) ───────
  sla_cfg AS (
    SELECT COALESCE(
      (SELECT value::numeric FROM platform_config WHERE key = 'etax_sla_hours'),
      24
    ) AS sla_hours
  ),

  -- ── 3b. Per-submission timing ────────────────────────────────────────────
  --
  -- Processing time is measured as:
  --   • For status = 'submitted' : submitted_at  - created_at
  --   • For status IN ('failed', 'cancelled', 'submitting', 'queued')
  --                              : now()          - created_at
  --     (these are still "in flight" or permanently stuck; either way the
  --      clock keeps running until the submission closes successfully)
  --
  submission_timing AS (
    SELECT
      es.id                                                      AS submission_id,
      es.org_id,
      es.invoice_id,
      es.document_type,
      es.status,
      es.attempt_count,
      es.created_at,
      -- resolved end timestamp
      CASE
        WHEN es.status = 'submitted'
          THEN es.updated_at           -- proxy for submitted_at
        ELSE NOW()
      END                                                        AS closed_at,
      -- processing hours
      EXTRACT(EPOCH FROM (
        CASE
          WHEN es.status = 'submitted' THEN es.updated_at
          ELSE NOW()
        END - es.created_at
      )) / 3600.0                                                AS processing_hours,
      -- SLA threshold from config
      (SELECT sla_hours FROM sla_cfg)                            AS sla_threshold_hours,
      -- breach flag
      (
        EXTRACT(EPOCH FROM (
          CASE
            WHEN es.status = 'submitted' THEN es.updated_at
            ELSE NOW()
          END - es.created_at
        )) / 3600.0
      ) > (SELECT sla_hours FROM sla_cfg)                        AS is_sla_breach
    FROM etax_submissions es
    -- RLS: only rows belonging to the caller's organisation
    WHERE es.org_id = get_user_org_id()
  ),

  -- ── 3c. Aggregate per org + document_type ────────────────────────────────
  org_doc_agg AS (
    SELECT
      st.org_id,
      st.document_type,
      COUNT(*)                                                   AS total_submissions,
      COUNT(*) FILTER (WHERE st.is_sla_breach)                   AS breached_count,
      COUNT(*) FILTER (WHERE st.is_sla_breach AND st.status NOT IN ('submitted','cancelled'))
                                                                 AS active_breach_count,
      ROUND(
        (COUNT(*) FILTER (WHERE st.is_sla_breach))::numeric /
        NULLIF(COUNT(*), 0) * 100,
        2
      )                                                          AS breach_rate_pct,
      ROUND(AVG(st.processing_hours)::numeric, 2)                AS avg_processing_hours,
      ROUND(MAX(st.processing_hours)::numeric, 2)                AS max_processing_hours,
      ROUND(
        AVG(st.processing_hours) FILTER (WHERE st.is_sla_breach)::numeric,
        2
      )                                                          AS avg_breach_overage_hours,
      MIN(st.created_at) FILTER (WHERE st.is_sla_breach)        AS oldest_breach_created_at,
      MAX(st.created_at) FILTER (WHERE st.is_sla_breach)        AS newest_breach_created_at,
      -- status breakdown of breached submissions
      COUNT(*) FILTER (WHERE st.is_sla_breach AND st.status = 'failed')
                                                                 AS breach_failed_count,
      COUNT(*) FILTER (WHERE st.is_sla_breach AND st.status = 'queued')
                                                                 AS breach_queued_count,
      COUNT(*) FILTER (WHERE st.is_sla_breach AND st.status = 'submitting')
                                                                 AS breach_submitting_count,
      COUNT(*) FILTER (WHERE st.is_sla_breach AND st.status = 'submitted')
                                                                 AS breach_submitted_count,
      MAX(st.attempt_count) FILTER (WHERE st.is_sla_breach)     AS max_breach_attempts,
      st.sla_threshold_hours
    FROM submission_timing st
    GROUP BY st.org_id, st.document_type, st.sla_threshold_hours
  )

-- ── 3d. Final select with derived severity ───────────────────────────────
SELECT
  o.name                                                         AS org_name,
  a.org_id,
  a.document_type,
  a.sla_threshold_hours,
  a.total_submissions,
  a.breached_count,
  a.active_breach_count,
  a.breach_rate_pct,

  -- Severity tier based on breach rate
  CASE
    WHEN a.breach_rate_pct >= 50                                 THEN 'CRITICAL'
    WHEN a.breach_rate_pct >= 25                                 THEN 'WARNING'
    WHEN a.breach_rate_pct >= 10                                 THEN 'ELEVATED'
    WHEN a.breach_rate_pct >  0                                  THEN 'NORMAL'
    ELSE                                                              'HEALTHY'
  END                                                            AS sla_severity,

  a.avg_processing_hours,
  a.max_processing_hours,
  a.avg_breach_overage_hours,
  a.oldest_breach_created_at,
  a.newest_breach_created_at,

  -- Status breakdown within breached submissions
  a.breach_failed_count,
  a.breach_queued_count,
  a.breach_submitting_count,
  a.breach_submitted_count,   -- historic breaches that eventually resolved
  a.max_breach_attempts,

  NOW()                                                          AS snapshot_at

FROM org_doc_agg   a
JOIN organizations o ON o.org_id = a.org_id
ORDER BY
  a.breach_rate_pct DESC NULLS LAST,
  a.active_breach_count DESC,
  a.org_id,
  a.document_type;

-- ---------------------------------------------------------------------------
-- §4  RLS grant — read-only for authenticated users (org-scoped by view)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.v_etax_submission_sla TO authenticated;
REVOKE ALL    ON public.v_etax_submission_sla FROM anon;

-- ---------------------------------------------------------------------------
-- §5  RPC wrapper — rpc_etax_submission_sla
--     Lets the frontend call via supabase.rpc('rpc_etax_submission_sla')
--     with optional document_type filter and severity filter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_submission_sla(
  p_document_type  text    DEFAULT NULL,  -- T01 / T02 / T03 / T04 or NULL = all
  p_severity       text    DEFAULT NULL   -- CRITICAL/WARNING/ELEVATED/NORMAL/HEALTHY or NULL
)
RETURNS TABLE (
  org_name                 text,
  org_id                   uuid,
  document_type            text,
  sla_threshold_hours      numeric,
  total_submissions        bigint,
  breached_count           bigint,
  active_breach_count      bigint,
  breach_rate_pct          numeric,
  sla_severity             text,
  avg_processing_hours     numeric,
  max_processing_hours     numeric,
  avg_breach_overage_hours numeric,
  oldest_breach_created_at timestamptz,
  newest_breach_created_at timestamptz,
  breach_failed_count      bigint,
  breach_queued_count      bigint,
  breach_submitting_count  bigint,
  breach_submitted_count   bigint,
  max_breach_attempts      integer,
  snapshot_at              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM v_etax_submission_sla
  WHERE (p_document_type IS NULL OR document_type = p_document_type)
    AND (p_severity       IS NULL OR sla_severity  = p_severity)
  ORDER BY breach_rate_pct DESC NULLS LAST, active_breach_count DESC;
$$;

COMMENT ON FUNCTION public.rpc_etax_submission_sla IS
  'Returns SLA breach statistics from v_etax_submission_sla. '
  'Filter by document_type (T01–T04) and/or severity (CRITICAL/WARNING/ELEVATED/NORMAL/HEALTHY). '
  'Results are scoped to the caller''s organisation via get_user_org_id() inside the view.';

GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_sla(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_submission_sla(text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- §6  RPC — rpc_etax_sla_summary
--     Aggregates across all document types for a single org-level health card.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_sla_summary()
RETURNS TABLE (
  org_id                   uuid,
  org_name                 text,
  sla_threshold_hours      numeric,
  total_submissions        bigint,
  total_breached           bigint,
  total_active_breach      bigint,
  overall_breach_rate_pct  numeric,
  overall_severity         text,
  worst_document_type      text,
  avg_processing_hours     numeric,
  max_processing_hours     numeric,
  oldest_breach_created_at timestamptz,
  snapshot_at              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    org_id,
    org_name,
    MAX(sla_threshold_hours)                                     AS sla_threshold_hours,
    SUM(total_submissions)                                       AS total_submissions,
    SUM(breached_count)                                          AS total_breached,
    SUM(active_breach_count)                                     AS total_active_breach,
    ROUND(
      SUM(breached_count)::numeric / NULLIF(SUM(total_submissions),0) * 100,
      2
    )                                                            AS overall_breach_rate_pct,
    -- derive overall severity from combined breach rate
    CASE
      WHEN ROUND(SUM(breached_count)::numeric /
           NULLIF(SUM(total_submissions),0) * 100, 2) >= 50      THEN 'CRITICAL'
      WHEN ROUND(SUM(breached_count)::numeric /
           NULLIF(SUM(total_submissions),0) * 100, 2) >= 25      THEN 'WARNING'
      WHEN ROUND(SUM(breached_count)::numeric /
           NULLIF(SUM(total_submissions),0) * 100, 2) >= 10      THEN 'ELEVATED'
      WHEN ROUND(SUM(breached_count)::numeric /
           NULLIF(SUM(total_submissions),0) * 100, 2) > 0        THEN 'NORMAL'
      ELSE                                                             'HEALTHY'
    END                                                          AS overall_severity,
    -- worst performing document type (highest breach rate)
    (
      SELECT document_type
      FROM v_etax_submission_sla s2
      WHERE s2.org_id = s.org_id
      ORDER BY s2.breach_rate_pct DESC NULLS LAST
      LIMIT 1
    )                                                            AS worst_document_type,
    ROUND(AVG(avg_processing_hours)::numeric, 2)                 AS avg_processing_hours,
    MAX(max_processing_hours)                                    AS max_processing_hours,
    MIN(oldest_breach_created_at)                                AS oldest_breach_created_at,
    NOW()                                                        AS snapshot_at
  FROM v_etax_submission_sla s
  GROUP BY org_id, org_name;
$$;

COMMENT ON FUNCTION public.rpc_etax_sla_summary IS
  'Returns a single-row org-level SLA health card aggregated across all document types. '
  'Scoped to the caller''s organisation.';

GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_summary() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_sla_summary() FROM anon;

-- ---------------------------------------------------------------------------
-- §7  Comment the view
-- ---------------------------------------------------------------------------
COMMENT ON VIEW public.v_etax_submission_sla IS
  'Live SLA breach tracking for etax_submissions. '
  'Rows where processing time (created_at → submitted_at or NOW()) exceeds the '
  'configurable threshold (platform_config.etax_sla_hours, default 24 h) are '
  'flagged as SLA breaches. Aggregated per org × document_type. '
  'RLS-scoped to the caller''s organisation via get_user_org_id(). '
  'Severity tiers: HEALTHY / NORMAL (>0%) / ELEVATED (≥10%) / WARNING (≥25%) / CRITICAL (≥50%).';

-- ---------------------------------------------------------------------------
-- §8  Optional platform_config default (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value)
VALUES ('etax_sla_hours', '24')
ON CONFLICT (key) DO NOTHING;

