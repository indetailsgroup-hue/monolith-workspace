-- =============================================================================
-- Migration 0192: Materialized View — mv_etax_health_trend
-- =============================================================================
-- Purpose:
--   Snapshots v_etax_health_trend daily so that dashboard queries read from a
--   pre-aggregated, indexed table rather than scanning etax_submissions live.
--
-- Objects created:
--   TABLE  etax_health_trend_mv_refresh_log    — refresh audit trail
--   MATVIEW mv_etax_health_trend               — daily trend snapshot per org
--   INDEX  uq_mv_etax_health_trend_org_day     — unique (org_id, submission_day)
--   INDEX  idx_mv_etax_health_trend_rank       — fast day_rank lookup
--   VIEW   v_mv_health_trend_lag               — staleness / freshness status
--   FUNC   fn_refresh_etax_health_trend_mv()   — SECURITY DEFINER refresh proc
--   RPC    rpc_etax_health_trend_cached()       — org-scoped cached read
--   RPC    rpc_etax_health_trend_cached_admin() — cross-org admin read
--   CRON   refresh-etax-health-trend-mv        — daily 00:00 UTC
--
-- Prerequisites:
--   0191_etax_health_trend.sql  (v_etax_health_trend, v_etax_health_trend_admin)
--
-- Rollback:
--   SELECT cron.unschedule('refresh-etax-health-trend-mv');
--   DROP FUNCTION IF EXISTS rpc_etax_health_trend_cached_admin(UUID) CASCADE;
--   DROP FUNCTION IF EXISTS rpc_etax_health_trend_cached_admin() CASCADE;
--   DROP FUNCTION IF EXISTS rpc_etax_health_trend_cached() CASCADE;
--   DROP FUNCTION IF EXISTS fn_refresh_etax_health_trend_mv() CASCADE;
--   DROP VIEW  IF EXISTS v_mv_health_trend_lag CASCADE;
--   DROP INDEX IF EXISTS idx_mv_etax_health_trend_rank;
--   DROP INDEX IF EXISTS uq_mv_etax_health_trend_org_day;
--   DROP MATERIALIZED VIEW IF EXISTS mv_etax_health_trend CASCADE;
--   DROP TABLE IF EXISTS etax_health_trend_mv_refresh_log CASCADE;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refresh audit log table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS etax_health_trend_mv_refresh_log (
    id             BIGSERIAL    PRIMARY KEY,
    refreshed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    duration_ms    INTEGER,
    row_count      INTEGER,
    triggered_by   TEXT         NOT NULL DEFAULT 'pg_cron',
    CONSTRAINT chk_trend_log_triggered_by
        CHECK (triggered_by IN ('pg_cron', 'manual', 'migration', 'test'))
);

COMMENT ON TABLE etax_health_trend_mv_refresh_log IS
    'Audit trail for every mv_etax_health_trend materialized-view refresh.';

-- Only superuser / service_role should write; service_role reads for the lag view
REVOKE ALL ON etax_health_trend_mv_refresh_log FROM PUBLIC, authenticated;
GRANT SELECT ON etax_health_trend_mv_refresh_log TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Materialized view
-- ---------------------------------------------------------------------------
-- Snapshots v_etax_health_trend in full. Refreshed daily at midnight UTC.
-- The unique index on (org_id, submission_day) enables CONCURRENT refresh so
-- reads are never blocked during the nightly rebuild.
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_etax_health_trend AS
SELECT
    org_id,
    submission_day,
    day_rank,
    daily_total,
    daily_successful            AS daily_submitted,
    daily_failed,
    daily_exhausted,
    daily_pending               AS daily_queued,
    daily_pdfs_downloaded       AS daily_pdf_ok,
    daily_pdfs_failed           AS daily_pdf_fail,
    retry_exhaustion_rate_pct,
    success_rate_pct,
    pdf_success_rate_pct,
    avg_attempt_count,
    max_attempt_count
FROM v_etax_health_trend
WITH NO DATA;

COMMENT ON MATERIALIZED VIEW mv_etax_health_trend IS
    'Daily 30-day eTax submission trend per org, refreshed every midnight UTC.
     Source: v_etax_health_trend. Use rpc_etax_health_trend_cached() to query.';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_etax_health_trend_org_day
    ON mv_etax_health_trend (org_id, submission_day);

-- Fast access by org + rank for dashboard "most recent N days" queries
CREATE INDEX IF NOT EXISTS idx_mv_etax_health_trend_rank
    ON mv_etax_health_trend (org_id, day_rank);

-- ---------------------------------------------------------------------------
-- 4. Permissions on materialized view
-- ---------------------------------------------------------------------------

REVOKE ALL ON mv_etax_health_trend FROM PUBLIC, authenticated;
GRANT SELECT ON mv_etax_health_trend TO service_role;
-- authenticated reads via RPC only (SECURITY DEFINER)

-- ---------------------------------------------------------------------------
-- 5. Staleness / freshness view
-- ---------------------------------------------------------------------------
-- Thresholds (daily MV — coarser than the 15-min compliance MV):
--   fresh    < 86400 s   (within last 24 h)
--   stale    86400–172800 s (24–48 h)
--   critical > 172800 s  (> 48 h)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_mv_health_trend_lag AS
SELECT
    l.refreshed_at                                     AS last_refreshed_at,
    EXTRACT(EPOCH FROM (NOW() - l.refreshed_at))::INT  AS lag_seconds,
    l.duration_ms,
    l.row_count,
    l.triggered_by,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - l.refreshed_at)) < 86400   THEN 'fresh'
        WHEN EXTRACT(EPOCH FROM (NOW() - l.refreshed_at)) < 172800  THEN 'stale'
        ELSE                                                               'critical'
    END                                                AS freshness_status
FROM etax_health_trend_mv_refresh_log l
WHERE l.id = (
    SELECT MAX(id) FROM etax_health_trend_mv_refresh_log
);

COMMENT ON VIEW v_mv_health_trend_lag IS
    'Current staleness of mv_etax_health_trend.
     fresh < 86400 s | stale 86400–172800 s | critical > 172800 s.';

REVOKE ALL ON v_mv_health_trend_lag FROM PUBLIC, authenticated;
GRANT SELECT ON v_mv_health_trend_lag TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Refresh function (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_refresh_etax_health_trend_mv(
    p_triggered_by TEXT DEFAULT 'pg_cron'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start   TIMESTAMPTZ := clock_timestamp();
    v_rows    INTEGER;
    v_ms      INTEGER;
BEGIN
    -- Validate caller
    IF p_triggered_by NOT IN ('pg_cron', 'manual', 'migration', 'test') THEN
        RAISE EXCEPTION 'Invalid triggered_by value: %', p_triggered_by;
    END IF;

    -- Populate on first run (MV created WITH NO DATA)
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_health_trend;
    EXCEPTION WHEN OTHERS THEN
        -- CONCURRENTLY requires at least one row in the unique index.
        -- Fall back to a blocking refresh on the very first run.
        REFRESH MATERIALIZED VIEW mv_etax_health_trend;
    END;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

    INSERT INTO etax_health_trend_mv_refresh_log
        (refreshed_at, duration_ms, row_count, triggered_by)
    VALUES
        (NOW(), v_ms, v_rows, p_triggered_by);

    RETURN jsonb_build_object(
        'status',        'ok',
        'refreshed_at',  NOW(),
        'duration_ms',   v_ms,
        'row_count',     v_rows,
        'triggered_by',  p_triggered_by
    );
END;
$$;

COMMENT ON FUNCTION fn_refresh_etax_health_trend_mv(TEXT) IS
    'Refreshes mv_etax_health_trend concurrently and writes an audit row.
     Called by pg_cron daily at 00:00 UTC.';

REVOKE ALL ON FUNCTION fn_refresh_etax_health_trend_mv(TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION fn_refresh_etax_health_trend_mv(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Initial population
-- ---------------------------------------------------------------------------

SELECT fn_refresh_etax_health_trend_mv('migration');

-- ---------------------------------------------------------------------------
-- 8. pg_cron — daily refresh at midnight UTC
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove stale schedule if re-running migration
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-etax-health-trend-mv') THEN
          PERFORM cron.unschedule('refresh-etax-health-trend-mv');
        END IF;

        PERFORM cron.schedule(
            'refresh-etax-health-trend-mv',   -- job name
            '0 0 * * *',                       -- daily at 00:00 UTC
            $cmd$SELECT fn_refresh_etax_health_trend_mv('pg_cron')$cmd$
        );

        RAISE NOTICE 'pg_cron job refresh-etax-health-trend-mv scheduled (0 0 * * *).';
    ELSE
        RAISE WARNING 'pg_cron extension not found — cron job NOT scheduled. '
                      'Schedule manually: SELECT cron.schedule(''refresh-etax-health-trend-mv'', ''0 0 * * *'', ''SELECT fn_refresh_etax_health_trend_mv(''''pg_cron'''')'');';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC — rpc_etax_health_trend_cached()  (org-scoped, authenticated)
-- ---------------------------------------------------------------------------
-- Roles allowed: OWNER, ADMIN, FINANCE
-- Returns rows from mv_etax_health_trend for the caller's org, plus MV
-- freshness metadata (mv_last_refreshed_at, mv_age_seconds) appended to
-- every row so the client can decide whether to warn about stale data.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_etax_health_trend_cached(
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    org_id                      UUID,
    submission_day              DATE,
    day_rank                    BIGINT,
    daily_total                 BIGINT,
    daily_submitted             BIGINT,
    daily_failed                BIGINT,
    daily_exhausted             BIGINT,
    daily_queued                BIGINT,
    daily_pdf_ok                BIGINT,
    daily_pdf_fail              BIGINT,
    retry_exhaustion_rate_pct   NUMERIC,
    success_rate_pct            NUMERIC,
    pdf_success_rate_pct        NUMERIC,
    avg_attempt_count           NUMERIC,
    max_attempt_count           INTEGER,
    mv_last_refreshed_at        TIMESTAMPTZ,
    mv_age_seconds              INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id  UUID;
    v_role    TEXT;
    v_lag     RECORD;
BEGIN
    -- Resolve caller's org
    SELECT om.org_id, om.role
    INTO   v_org_id, v_role
    FROM   org_members om
    WHERE  om.user_id = auth.uid()
    LIMIT  1;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'User is not a member of any organization';
    END IF;

    -- Enforce role gate
    IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
        RAISE EXCEPTION 'Insufficient permissions — OWNER, ADMIN, or FINANCE required';
    END IF;

    -- Clamp p_days
    p_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 30);

    -- Fetch freshness metadata
    SELECT
        lag.last_refreshed_at,
        lag.lag_seconds
    INTO v_lag
    FROM v_mv_health_trend_lag lag;

    RETURN QUERY
    SELECT
        m.org_id,
        m.submission_day,
        m.day_rank,
        m.daily_total,
        m.daily_submitted,
        m.daily_failed,
        m.daily_exhausted,
        m.daily_queued,
        m.daily_pdf_ok,
        m.daily_pdf_fail,
        m.retry_exhaustion_rate_pct,
        m.success_rate_pct,
        m.pdf_success_rate_pct,
        m.avg_attempt_count,
        m.max_attempt_count,
        v_lag.last_refreshed_at  AS mv_last_refreshed_at,
        v_lag.lag_seconds        AS mv_age_seconds
    FROM mv_etax_health_trend m
    WHERE m.org_id   = v_org_id
      AND m.day_rank <= p_days
    ORDER BY m.day_rank ASC;
END;
$$;

COMMENT ON FUNCTION rpc_etax_health_trend_cached(INTEGER) IS
    'Returns up to p_days rows from the daily-cached mv_etax_health_trend
     for the caller''s org. Includes mv_last_refreshed_at and mv_age_seconds.
     Roles: OWNER, ADMIN, FINANCE.';

REVOKE ALL ON FUNCTION rpc_etax_health_trend_cached(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_etax_health_trend_cached(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. RPC — rpc_etax_health_trend_cached_admin()  (cross-org, service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_etax_health_trend_cached_admin(
    p_org_id UUID    DEFAULT NULL,
    p_days   INTEGER DEFAULT 30
)
RETURNS TABLE (
    org_id                      UUID,
    submission_day              DATE,
    day_rank                    BIGINT,
    daily_total                 BIGINT,
    daily_submitted             BIGINT,
    daily_failed                BIGINT,
    daily_exhausted             BIGINT,
    daily_queued                BIGINT,
    daily_pdf_ok                BIGINT,
    daily_pdf_fail              BIGINT,
    retry_exhaustion_rate_pct   NUMERIC,
    success_rate_pct            NUMERIC,
    pdf_success_rate_pct        NUMERIC,
    avg_attempt_count           NUMERIC,
    max_attempt_count           INTEGER,
    mv_last_refreshed_at        TIMESTAMPTZ,
    mv_age_seconds              INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lag RECORD;
BEGIN
    -- Restrict to service_role
    IF current_setting('role', TRUE) NOT IN ('service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'rpc_etax_health_trend_cached_admin requires service_role';
    END IF;

    p_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 30);

    SELECT
        lag.last_refreshed_at,
        lag.lag_seconds
    INTO v_lag
    FROM v_mv_health_trend_lag lag;

    RETURN QUERY
    SELECT
        m.org_id,
        m.submission_day,
        m.day_rank,
        m.daily_total,
        m.daily_submitted,
        m.daily_failed,
        m.daily_exhausted,
        m.daily_queued,
        m.daily_pdf_ok,
        m.daily_pdf_fail,
        m.retry_exhaustion_rate_pct,
        m.success_rate_pct,
        m.pdf_success_rate_pct,
        m.avg_attempt_count,
        m.max_attempt_count,
        v_lag.last_refreshed_at  AS mv_last_refreshed_at,
        v_lag.lag_seconds        AS mv_age_seconds
    FROM mv_etax_health_trend m
    WHERE (p_org_id IS NULL OR m.org_id = p_org_id)
      AND m.day_rank <= p_days
    ORDER BY m.org_id ASC, m.day_rank ASC;
END;
$$;

COMMENT ON FUNCTION rpc_etax_health_trend_cached_admin(UUID, INTEGER) IS
    'Cross-org read of mv_etax_health_trend. Restricted to service_role.
     Pass p_org_id to filter to one org; omit for all orgs.';

REVOKE ALL ON FUNCTION rpc_etax_health_trend_cached_admin(UUID, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION rpc_etax_health_trend_cached_admin(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Update supabase/config.toml cron registry comment (advisory only)
-- ---------------------------------------------------------------------------
-- Add to config.toml under [db.cron]:
--
--   # ┌──────────────────────────────────────┬────────────────────────┬──────────────────────────────────────────────────────┐
--   # │ Job name                             │ Schedule               │ SQL                                                  │
--   # ├──────────────────────────────────────┼────────────────────────┼──────────────────────────────────────────────────────┤
--   # │ etax-submit-worker                   │ */5 * * * *            │ SELECT net.http_post(...)                            │
--   # │ notify-overdue                       │ 0 1 * * *              │ SELECT net.http_post(...)                            │
--   # │ refresh-etax-compliance-mv           │ */15 * * * *           │ SELECT fn_refresh_etax_compliance_mv('pg_cron')      │
--   # │ check-mv-refresh-lag                 │ */5 * * * *            │ SELECT fn_check_mv_refresh_lag()                     │
--   # │ refresh-etax-health-trend-mv         │ 0 0 * * *              │ SELECT fn_refresh_etax_health_trend_mv('pg_cron')    │
--   # └──────────────────────────────────────┴────────────────────────┴──────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_mv_exists    BOOLEAN;
    v_rpc1_exists  BOOLEAN;
    v_rpc2_exists  BOOLEAN;
    v_lag_view     BOOLEAN;
    v_log_table    BOOLEAN;
    v_row_count    INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'public' AND matviewname = 'mv_etax_health_trend'
    ) INTO v_mv_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
          AND  p.proname = 'rpc_etax_health_trend_cached'
    ) INTO v_rpc1_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
          AND  p.proname = 'rpc_etax_health_trend_cached_admin'
    ) INTO v_rpc2_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_views
        WHERE schemaname = 'public' AND viewname = 'v_mv_health_trend_lag'
    ) INTO v_lag_view;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'etax_health_trend_mv_refresh_log'
    ) INTO v_log_table;

    SELECT COUNT(*) INTO v_row_count FROM mv_etax_health_trend;

    ASSERT v_mv_exists,   'mv_etax_health_trend does not exist';
    ASSERT v_rpc1_exists, 'rpc_etax_health_trend_cached does not exist';
    ASSERT v_rpc2_exists, 'rpc_etax_health_trend_cached_admin does not exist';
    ASSERT v_lag_view,    'v_mv_health_trend_lag does not exist';
    ASSERT v_log_table,   'etax_health_trend_mv_refresh_log does not exist';

    RAISE NOTICE '0192 verification passed — MV has % rows, all objects present.', v_row_count;
END;
$$;

COMMIT;
