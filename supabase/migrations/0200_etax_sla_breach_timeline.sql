-- =============================================================================
-- Migration 0200: v_etax_sla_breach_timeline
-- Daily SLA breach trend view — last 30 days, per org, per document type
-- =============================================================================
--
-- This migration adds:
--   1. v_etax_sla_breach_timeline   — calendar-spine view (generate_series ensures
--                                     every day in the 30-day window appears, even
--                                     days with no submissions)
--   2. rpc_etax_sla_breach_timeline(p_org_id, p_document_type, p_days)
--                                   — SECURITY DEFINER RPC wrapping the view;
--                                     p_days defaults to 30 (max 90)
--   3. Grants: authenticated EXECUTE on RPC; anon REVOKED
--   4. COMMENTs on all new objects
--
-- View columns:
--   breach_date          date        — calendar day (UTC truncated)
--   org_id               uuid        — organisation
--   org_name             text        — organisation display name
--   document_type        text        — T01 / T02 / T03 / T04 (NULL row = all types)
--   total_created        bigint      — submissions created on this day
--   breached_count       bigint      — of those, how many exceed the SLA threshold
--   breach_rate          numeric     — breached_count / total_created (0–1), NULL if 0 total
--   severity_tier        text        — HEALTHY / NORMAL / ELEVATED / WARNING / CRITICAL
--   cumulative_breached  bigint      — running total of breaches up to and including this day
--   sla_threshold_hours  numeric     — SLA threshold in force (from platform_config)
--
-- Design notes:
--   • generate_series produces one row per (day, org, document_type) regardless of
--     whether any submissions were created that day — prevents gaps in trend charts.
--   • The 30-day window is anchored to CURRENT_DATE UTC (not NOW()) so the boundary
--     does not shift mid-query.
--   • Severity tier on the timeline row reflects THAT DAY's breach rate, allowing
--     colour-coding of trend charts.
--   • cumulative_breached uses SUM(...) OVER (PARTITION BY org_id, document_type
--     ORDER BY breach_date ROWS UNBOUNDED PRECEDING) — monotonically increasing
--     within each (org, doc_type) series.
--
-- Dependencies:
--   0198_etax_submission_sla.sql  (etax_submissions plural, platform_config,
--                                  get_user_org_id(), severity tier logic)
--   0199_mv_etax_submission_sla.sql (mv_etax_submission_sla)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. View: v_etax_sla_breach_timeline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_etax_sla_breach_timeline AS
WITH

-- ── 1a. Resolve SLA threshold ────────────────────────────────────────────────
sla_cfg AS (
  SELECT
    COALESCE(
      (SELECT value::numeric FROM public.platform_config WHERE key = 'etax_sla_hours'),
      24
    ) AS sla_hours
),

-- ── 1b. All (org, document_type) combinations with submissions in 90 days ────
-- We extend the lookback to 90 days here so the RPC p_days parameter can go
-- up to 90 without missing combinations.
active_combos AS (
  SELECT DISTINCT
    es.org_id,
    es.document_type
  FROM public.etax_submissions es
  WHERE es.created_at >= (CURRENT_DATE - INTERVAL '90 days')
),

-- ── 1c. Calendar spine: last 90 days × all active (org, doc_type) combos ─────
calendar AS (
  SELECT
    c.org_id,
    c.document_type,
    d.breach_date::date
  FROM active_combos c
  CROSS JOIN LATERAL (
    SELECT generate_series(
      (CURRENT_DATE - INTERVAL '89 days'),
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS breach_date
  ) d
),

-- ── 1d. Per-submission SLA classification ─────────────────────────────────
submission_stats AS (
  SELECT
    es.org_id,
    es.document_type,
    date_trunc('day', es.created_at AT TIME ZONE 'UTC')::date AS sub_date,
    es.id                                                       AS submission_id,
    CASE
      WHEN es.status = 'submitted'  THEN
        EXTRACT(EPOCH FROM (es.updated_at - es.created_at)) / 3600.0
      WHEN es.status = 'cancelled' THEN
        0
      ELSE
        EXTRACT(EPOCH FROM (now() - es.created_at)) / 3600.0
    END                                                         AS processing_hours,
    CASE
      WHEN es.status IN ('submitted', 'cancelled') THEN
        CASE
          WHEN EXTRACT(EPOCH FROM (
            CASE WHEN es.status = 'submitted' THEN es.updated_at ELSE es.created_at END
            - es.created_at)) / 3600.0 > (SELECT sla_hours FROM sla_cfg)
          THEN TRUE
          ELSE FALSE
        END
      ELSE
        CASE
          WHEN EXTRACT(EPOCH FROM (now() - es.created_at)) / 3600.0
               > (SELECT sla_hours FROM sla_cfg)
          THEN TRUE
          ELSE FALSE
        END
    END                                                         AS is_breach
  FROM public.etax_submissions es
  WHERE es.created_at >= (CURRENT_DATE - INTERVAL '90 days')
),

-- ── 1e. Aggregate by (org, doc_type, day) ─────────────────────────────────
daily_agg AS (
  SELECT
    org_id,
    document_type,
    sub_date,
    COUNT(*)                             AS total_created,
    COUNT(*) FILTER (WHERE is_breach)    AS breached_count
  FROM submission_stats
  GROUP BY org_id, document_type, sub_date
),

-- ── 1f. Join calendar spine with daily aggregates (LEFT to keep zero-days) ──
timeline_base AS (
  SELECT
    cal.breach_date,
    cal.org_id,
    cal.document_type,
    COALESCE(agg.total_created,  0)                             AS total_created,
    COALESCE(agg.breached_count, 0)                             AS breached_count,
    CASE
      WHEN COALESCE(agg.total_created, 0) = 0 THEN NULL
      ELSE ROUND(
        COALESCE(agg.breached_count, 0)::numeric /
        COALESCE(agg.total_created,  1)::numeric,
        4
      )
    END                                                          AS breach_rate
  FROM calendar cal
  LEFT JOIN daily_agg agg
    ON  agg.org_id        = cal.org_id
    AND agg.document_type = cal.document_type
    AND agg.sub_date      = cal.breach_date
)

-- ── 1g. Final select: add severity tier, cumulative window, org name ─────────
SELECT
  tb.breach_date,
  tb.org_id,
  o.name                                                         AS org_name,
  tb.document_type,
  tb.total_created,
  tb.breached_count,
  tb.breach_rate,

  -- Severity tier reflects that day's breach rate
  CASE
    WHEN tb.breach_rate IS NULL OR tb.breach_rate = 0              THEN 'HEALTHY'
    WHEN tb.breach_rate >= 0.50                                    THEN 'CRITICAL'
    WHEN tb.breach_rate >= 0.25                                    THEN 'WARNING'
    WHEN tb.breach_rate >= 0.10                                    THEN 'ELEVATED'
    ELSE                                                                'NORMAL'
  END                                                            AS severity_tier,

  -- Running total of breaches per (org, document_type) series
  SUM(tb.breached_count) OVER (
    PARTITION BY tb.org_id, tb.document_type
    ORDER BY tb.breach_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                              AS cumulative_breached,

  (SELECT sla_hours FROM sla_cfg)                                AS sla_threshold_hours

FROM timeline_base tb
JOIN public.organizations o ON o.org_id = tb.org_id

ORDER BY tb.org_id, tb.document_type, tb.breach_date;

COMMENT ON VIEW public.v_etax_sla_breach_timeline IS
  'Daily SLA breach trend view spanning the last 90 days (configurable via '
  'rpc_etax_sla_breach_timeline p_days, max 90). '
  'Uses generate_series calendar spine so every day appears even with zero '
  'submissions. Severity tier reflects that day''s breach_rate. '
  'cumulative_breached is a monotonically increasing running total within each '
  '(org_id, document_type) partition. '
  'Created by Migration 0200.';

-- ---------------------------------------------------------------------------
-- 2. RPC: rpc_etax_sla_breach_timeline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_sla_breach_timeline(
  p_org_id        uuid    DEFAULT NULL,
  p_document_type text    DEFAULT NULL,
  p_days          integer DEFAULT 30
)
RETURNS TABLE (
  breach_date          date,
  org_id               uuid,
  org_name             text,
  document_type        text,
  total_created        bigint,
  breached_count       bigint,
  breach_rate          numeric,
  severity_tier        text,
  cumulative_breached  bigint,
  sla_threshold_hours  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_cutoff date   := CURRENT_DATE - (v_days - 1);
BEGIN
  RETURN QUERY
  SELECT
    tl.breach_date,
    tl.org_id,
    tl.org_name,
    tl.document_type,
    tl.total_created,
    tl.breached_count,
    tl.breach_rate,
    tl.severity_tier,
    tl.cumulative_breached,
    tl.sla_threshold_hours
  FROM public.v_etax_sla_breach_timeline tl
  WHERE
    -- RLS: authenticated users see only their org; service_role sees all
    (
      tl.org_id = public.get_user_org_id()
      OR current_setting('role', true) = 'service_role'
    )
    AND tl.breach_date >= v_cutoff
    AND (p_org_id        IS NULL OR tl.org_id        = p_org_id)
    AND (p_document_type IS NULL OR tl.document_type = p_document_type)
  ORDER BY tl.org_id, tl.document_type, tl.breach_date;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_sla_breach_timeline(uuid, text, integer) IS
  'Returns daily SLA breach trend data for the last p_days days (default 30, max 90). '
  'Optional filters: p_org_id (UUID), p_document_type (T01|T02|T03|T04). '
  'RLS-enforced: authenticated users see only their own org_id. '
  'Results ordered by org_id, document_type, breach_date ASC. '
  'Created by Migration 0200.';

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
-- View: service_role and authenticated may SELECT; anon REVOKED
GRANT SELECT ON public.v_etax_sla_breach_timeline TO authenticated;
REVOKE SELECT ON public.v_etax_sla_breach_timeline FROM anon;

-- RPC: authenticated only
GRANT  EXECUTE ON FUNCTION public.rpc_etax_sla_breach_timeline(uuid, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_sla_breach_timeline(uuid, text, integer) FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Rollback notes (manual)
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.rpc_etax_sla_breach_timeline(uuid, text, integer);
-- DROP VIEW IF EXISTS public.v_etax_sla_breach_timeline;
