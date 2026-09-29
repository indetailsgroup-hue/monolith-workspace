-- =============================================================================
-- Migration 0202 — v_etax_sla_archive_summary
-- Long-term SLA breach summary aggregated from etax_sla_breach_archive
-- =============================================================================
-- Purpose:
--   Provides a stable, aggregated view of long-term SLA breach data for each
--   organisation and severity tier.  Unlike v_etax_sla_breach_timeline (which
--   is limited to 90 days and uses the live submissions table), this view reads
--   from etax_sla_breach_archive — the permanent retention table — making it
--   suitable for year-over-year trend reports, org-level health scorecards, and
--   compliance audits.
--
-- Aggregations per (org_id, severity_tier):
--   • total_archive_days   — number of distinct breach_date entries archived
--   • total_created        — sum of total_created across all archived days
--   • total_breached        — sum of breached_count across all archived days
--   • avg_breach_rate       — average daily breach_rate (2 d.p.)
--   • max_breach_rate       — worst single-day breach_rate recorded
--   • max_cumulative        — peak cumulative_breached reached
--   • first_archived_date  — earliest breach_date in the archive for this org/tier
--   • last_archived_date   — most recent breach_date in the archive for this org/tier
--   • last_archived_at     — most recent archived_at timestamp (last write)
--   • sla_threshold_hours  — SLA threshold sourced from platform_config
--
-- Also provides a cross-tier rollup view (v_etax_sla_archive_org_rollup) for
-- one-row-per-org summaries across all tiers combined.
--
-- RPC:
--   rpc_etax_sla_archive_summary(p_org_id, p_severity_tier, p_from_date, p_to_date)
--   rpc_etax_sla_archive_org_rollup(p_org_id, p_from_date, p_to_date)
--
-- RLS:
--   Both RPCs are SECURITY DEFINER; authenticated callers are filtered via
--   get_user_org_id() — same pattern as all SLA RPCs.
--
-- Dependencies: etax_sla_breach_archive (Migration 0201), organizations,
--               platform_config
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. v_etax_sla_archive_summary
--    Per (org_id, severity_tier) aggregate over the full archive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_etax_sla_archive_summary
WITH (security_invoker = false)
AS
SELECT
    a.org_id,
    o.name                                              AS org_name,
    a.severity_tier,

    -- date/time bounds
    MIN(a.breach_date)                                  AS first_archived_date,
    MAX(a.breach_date)                                  AS last_archived_date,
    MAX(a.archived_at)                                  AS last_archived_at,

    -- volume metrics
    COUNT(DISTINCT a.breach_date)::int                  AS total_archive_days,
    SUM(a.total_created)::bigint                        AS total_created,
    SUM(a.breached_count)::bigint                       AS total_breached,

    -- rate metrics
    ROUND(AVG(a.breach_rate)::numeric, 2)               AS avg_breach_rate,
    ROUND(MAX(a.breach_rate)::numeric, 2)               AS max_breach_rate,

    -- cumulative peak
    MAX(a.cumulative_breached)::bigint                  AS max_cumulative,

    -- config
    COALESCE(
        (SELECT value::int FROM public.platform_config
         WHERE key = 'etax_sla_hours'
         LIMIT 1),
        24
    )                                                   AS sla_threshold_hours

FROM public.etax_sla_breach_archive  a
JOIN public.organizations            o ON o.org_id = a.org_id
GROUP BY
    a.org_id,
    o.name,
    a.severity_tier;

COMMENT ON VIEW public.v_etax_sla_archive_summary IS
    'Per-(org, severity_tier) aggregation over etax_sla_breach_archive for '
    'long-term trend reporting (Migration 0202).';

-- ---------------------------------------------------------------------------
-- 2. v_etax_sla_archive_org_rollup
--    One row per org: cross-tier rollup for high-level scorecards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_etax_sla_archive_org_rollup
WITH (security_invoker = false)
AS
SELECT
    a.org_id,
    o.name                                              AS org_name,

    -- date/time bounds
    MIN(a.breach_date)                                  AS first_archived_date,
    MAX(a.breach_date)                                  AS last_archived_date,
    MAX(a.archived_at)                                  AS last_archived_at,

    -- volume metrics
    COUNT(DISTINCT a.breach_date)::int                  AS total_archive_days,
    SUM(a.total_created)::bigint                        AS total_created,
    SUM(a.breached_count)::bigint                       AS total_breached,

    -- rate metrics
    ROUND(
        CASE WHEN SUM(a.total_created) > 0
             THEN (SUM(a.breached_count)::numeric / SUM(a.total_created)::numeric) * 100
             ELSE 0
        END, 2
    )                                                   AS overall_breach_rate,
    ROUND(AVG(a.breach_rate)::numeric, 2)               AS avg_daily_breach_rate,
    ROUND(MAX(a.breach_rate)::numeric, 2)               AS peak_daily_breach_rate,

    -- cumulative peak across all document types
    MAX(a.cumulative_breached)::bigint                  AS peak_cumulative,

    -- worst severity tier ever seen (ordered: CRITICAL > WARNING > ELEVATED > NORMAL > HEALTHY)
    (
        SELECT severity_tier
        FROM public.etax_sla_breach_archive ia
        WHERE ia.org_id = a.org_id
        ORDER BY
            CASE severity_tier
                WHEN 'CRITICAL' THEN 5
                WHEN 'WARNING'  THEN 4
                WHEN 'ELEVATED' THEN 3
                WHEN 'NORMAL'   THEN 2
                ELSE 1
            END DESC
        LIMIT 1
    )                                                   AS worst_severity_tier,

    -- distinct document types with at least one breach
    ARRAY(
        SELECT DISTINCT ia.document_type
        FROM public.etax_sla_breach_archive ia
        WHERE ia.org_id = a.org_id
          AND ia.breached_count > 0
        ORDER BY ia.document_type
    )                                                   AS breached_document_types,

    -- config
    COALESCE(
        (SELECT value::int FROM public.platform_config
         WHERE key = 'etax_sla_hours'
         LIMIT 1),
        24
    )                                                   AS sla_threshold_hours

FROM public.etax_sla_breach_archive  a
JOIN public.organizations            o ON o.org_id = a.org_id
GROUP BY
    a.org_id,
    o.name;

COMMENT ON VIEW public.v_etax_sla_archive_org_rollup IS
    'One-row-per-org cross-tier rollup over etax_sla_breach_archive for '
    'high-level health scorecards (Migration 0202).';

-- ---------------------------------------------------------------------------
-- 3. rpc_etax_sla_archive_summary
--    Filtered query over v_etax_sla_archive_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_sla_archive_summary(
    p_org_id        uuid    DEFAULT NULL,
    p_severity_tier text    DEFAULT NULL,
    p_from_date     date    DEFAULT NULL,
    p_to_date       date    DEFAULT NULL
)
RETURNS TABLE (
    org_id               uuid,
    org_name             text,
    severity_tier        text,
    first_archived_date  date,
    last_archived_date   date,
    last_archived_at     timestamptz,
    total_archive_days   int,
    total_created        bigint,
    total_breached       bigint,
    avg_breach_rate      numeric,
    max_breach_rate      numeric,
    max_cumulative       bigint,
    sla_threshold_hours  int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        s.org_id,
        s.org_name,
        s.severity_tier,
        s.first_archived_date,
        s.last_archived_date,
        s.last_archived_at,
        s.total_archive_days,
        s.total_created,
        s.total_breached,
        s.avg_breach_rate,
        s.max_breach_rate,
        s.max_cumulative,
        s.sla_threshold_hours
    FROM public.v_etax_sla_archive_summary s
    WHERE
        -- RLS: authenticated callers see only their org
        s.org_id = public.get_user_org_id()
        -- optional caller-supplied filters
        AND (p_org_id        IS NULL OR s.org_id        = p_org_id)
        AND (p_severity_tier IS NULL OR s.severity_tier = p_severity_tier)
        AND (p_from_date     IS NULL OR s.last_archived_date >= p_from_date)
        AND (p_to_date       IS NULL OR s.first_archived_date <= p_to_date)
    ORDER BY
        CASE s.severity_tier
            WHEN 'CRITICAL' THEN 5
            WHEN 'WARNING'  THEN 4
            WHEN 'ELEVATED' THEN 3
            WHEN 'NORMAL'   THEN 2
            ELSE 1
        END DESC,
        s.total_breached DESC;
$$;

COMMENT ON FUNCTION public.rpc_etax_sla_archive_summary IS
    'Returns per-(org, severity_tier) aggregate breach metrics from '
    'etax_sla_breach_archive. RLS-enforced: callers see only their own org '
    '(Migration 0202).';

-- Grant
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_archive_summary(uuid, text, date, date)
    TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_sla_archive_summary(uuid, text, date, date)
    FROM anon;

-- ---------------------------------------------------------------------------
-- 4. rpc_etax_sla_archive_org_rollup
--    Filtered query over v_etax_sla_archive_org_rollup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_sla_archive_org_rollup(
    p_org_id    uuid DEFAULT NULL,
    p_from_date date DEFAULT NULL,
    p_to_date   date DEFAULT NULL
)
RETURNS TABLE (
    org_id                   uuid,
    org_name                 text,
    first_archived_date      date,
    last_archived_date       date,
    last_archived_at         timestamptz,
    total_archive_days       int,
    total_created            bigint,
    total_breached           bigint,
    overall_breach_rate      numeric,
    avg_daily_breach_rate    numeric,
    peak_daily_breach_rate   numeric,
    peak_cumulative          bigint,
    worst_severity_tier      text,
    breached_document_types  TEXT[],
    sla_threshold_hours      int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        r.org_id,
        r.org_name,
        r.first_archived_date,
        r.last_archived_date,
        r.last_archived_at,
        r.total_archive_days,
        r.total_created,
        r.total_breached,
        r.overall_breach_rate,
        r.avg_daily_breach_rate,
        r.peak_daily_breach_rate,
        r.peak_cumulative,
        r.worst_severity_tier,
        r.breached_document_types,
        r.sla_threshold_hours
    FROM public.v_etax_sla_archive_org_rollup r
    WHERE
        -- RLS: authenticated callers see only their org
        r.org_id = public.get_user_org_id()
        -- optional caller-supplied filters
        AND (p_org_id    IS NULL OR r.org_id              = p_org_id)
        AND (p_from_date IS NULL OR r.last_archived_date  >= p_from_date)
        AND (p_to_date   IS NULL OR r.first_archived_date <= p_to_date)
    ORDER BY
        CASE r.worst_severity_tier
            WHEN 'CRITICAL' THEN 5
            WHEN 'WARNING'  THEN 4
            WHEN 'ELEVATED' THEN 3
            WHEN 'NORMAL'   THEN 2
            ELSE 1
        END DESC,
        r.overall_breach_rate DESC;
$$;

COMMENT ON FUNCTION public.rpc_etax_sla_archive_org_rollup IS
    'Returns one-row-per-org aggregate breach metrics from etax_sla_breach_archive. '
    'Includes overall_breach_rate, worst_severity_tier, and peak_cumulative. '
    'RLS-enforced (Migration 0202).';

-- Grant
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_archive_org_rollup(uuid, date, date)
    TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_sla_archive_org_rollup(uuid, date, date)
    FROM anon;

-- ---------------------------------------------------------------------------
-- 5. Smoke-test assertions (run at migration time, rolled back on failure)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_view_summary  int;
    v_view_rollup   int;
    v_fn_summary    int;
    v_fn_rollup     int;
BEGIN
    SELECT COUNT(*)::int INTO v_view_summary
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_sla_archive_summary';

    SELECT COUNT(*)::int INTO v_view_rollup
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_sla_archive_org_rollup';

    SELECT COUNT(*)::int INTO v_fn_summary
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_sla_archive_summary';

    SELECT COUNT(*)::int INTO v_fn_rollup
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_sla_archive_org_rollup';

    IF v_view_summary = 0 THEN
        RAISE EXCEPTION 'Migration 0202: v_etax_sla_archive_summary not created';
    END IF;
    IF v_view_rollup = 0 THEN
        RAISE EXCEPTION 'Migration 0202: v_etax_sla_archive_org_rollup not created';
    END IF;
    IF v_fn_summary = 0 THEN
        RAISE EXCEPTION 'Migration 0202: rpc_etax_sla_archive_summary not created';
    END IF;
    IF v_fn_rollup = 0 THEN
        RAISE EXCEPTION 'Migration 0202: rpc_etax_sla_archive_org_rollup not created';
    END IF;

    RAISE NOTICE 'Migration 0202 smoke-test: all objects verified OK';
END;
$$;

COMMIT;

-- =============================================================================
-- Migration 0202 complete
--
-- Objects created:
--   VIEW  public.v_etax_sla_archive_summary       — per-(org, severity_tier) aggregate
--   VIEW  public.v_etax_sla_archive_org_rollup     — one-row-per-org cross-tier rollup
--   FUNC  public.rpc_etax_sla_archive_summary      — filtered RPC, authenticated
--   FUNC  public.rpc_etax_sla_archive_org_rollup   — filtered RPC, authenticated
--
-- Key columns in v_etax_sla_archive_summary:
--   org_id, org_name, severity_tier, first_archived_date, last_archived_date,
--   last_archived_at, total_archive_days, total_created, total_breached,
--   avg_breach_rate, max_breach_rate, max_cumulative, sla_threshold_hours
--
-- Key columns in v_etax_sla_archive_org_rollup:
--   org_id, org_name, first_archived_date, last_archived_date, last_archived_at,
--   total_archive_days, total_created, total_breached, overall_breach_rate,
--   avg_daily_breach_rate, peak_daily_breach_rate, peak_cumulative,
--   worst_severity_tier, breached_document_types, sla_threshold_hours
--
-- Depends on: etax_sla_breach_archive (0201), organizations, platform_config,
--             get_user_org_id()
-- =============================================================================
