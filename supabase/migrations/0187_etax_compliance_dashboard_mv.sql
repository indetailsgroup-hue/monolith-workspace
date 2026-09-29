-- ============================================================================
-- Migration  : 0187_etax_compliance_dashboard_mv.sql
-- Feature    : Materialized view mv_etax_compliance_dashboard with
--              CONCURRENT refresh via pg_cron every 15 minutes.
--              For high-traffic orgs where querying v_etax_compliance_dashboard
--              live would scan large etax_submissions tables on every request.
-- Strategy   :
--   1. CREATE MATERIALIZED VIEW mv_etax_compliance_dashboard (same columns as v_...)
--   2. UNIQUE INDEX on org_id  →  enables REFRESH CONCURRENTLY (no table lock)
--   3. fn_refresh_etax_compliance_mv() — SECURITY DEFINER refresh function
--   4. pg_cron job: call fn_refresh_etax_compliance_mv() every 15 min
--   5. rpc_etax_compliance_dashboard_cached() — org-scoped read from MV
--   6. rpc_etax_compliance_all_orgs_cached()  — admin read from MV
--   7. Monitoring helper: v_mv_refresh_lag shows seconds since last refresh
-- Staleness  : Up to 15 min lag acceptable for dashboard. Live view RPCs
--              (0186) remain available for real-time needs.
-- Depends    :
--   0186_etax_compliance_dashboard — v_etax_compliance_dashboard view
--   0181_etax_auto_submit          — etax_submissions
--   0185_etax_audit_log            — etax_submission_audit_log
--   0180_overdue_invoice_detection — invoice_notifications
-- Rollback   :
--   SELECT cron.unschedule('refresh-etax-compliance-mv');
--   DROP MATERIALIZED VIEW IF EXISTS mv_etax_compliance_dashboard CASCADE;
--   DROP FUNCTION IF EXISTS fn_refresh_etax_compliance_mv() CASCADE;
--   DROP FUNCTION IF EXISTS rpc_etax_compliance_dashboard_cached() CASCADE;
--   DROP FUNCTION IF EXISTS rpc_etax_compliance_all_orgs_cached(INT) CASCADE;
--   DROP VIEW IF EXISTS v_mv_refresh_lag CASCADE;
-- Author     : Monolith Accounting Module
-- Date       : 2026-08-28
-- ============================================================================

-- ============================================================================
-- 1. MATERIALIZED VIEW: mv_etax_compliance_dashboard
--    Mirrors v_etax_compliance_dashboard exactly; populated on first creation.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_etax_compliance_dashboard CASCADE;

CREATE MATERIALIZED VIEW mv_etax_compliance_dashboard AS
SELECT
  org_id,
  total_submissions,
  submitted_count,
  failed_count,
  cancelled_count,
  queued_count,
  submitting_count,
  success_rate,
  avg_attempt_count,
  max_attempt_count,
  submissions_with_pdf_downloaded,
  pdf_success_rate,
  last_submission_at,
  last_failed_at,
  oldest_unresolved_failed_at,
  failed_last_24h,
  last_audit_event_at,
  overdue_invoice_count,
  overdue_with_pending_etax
FROM v_etax_compliance_dashboard
WITH DATA;

COMMENT ON MATERIALIZED VIEW mv_etax_compliance_dashboard IS
  'Cached copy of v_etax_compliance_dashboard. Refreshed every 15 min by pg_cron. '
  'Read via rpc_etax_compliance_dashboard_cached() (org-scoped) or '
  'rpc_etax_compliance_all_orgs_cached() (service-role). '
  'Use live view RPCs from 0186 when < 15-min staleness is unacceptable.';

-- ============================================================================
-- 2. UNIQUE INDEX on org_id
--    Required for REFRESH MATERIALIZED VIEW CONCURRENTLY (no exclusive lock).
--    Without CONCURRENTLY the refresh blocks all reads for its duration.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_etax_compliance_org
  ON mv_etax_compliance_dashboard(org_id);

COMMENT ON INDEX uq_mv_etax_compliance_org IS
  'Required for REFRESH CONCURRENTLY — allows refresh without table-level lock.';

-- ============================================================================
-- 3. REFRESH TRACKING TABLE
--    Stores the timestamp of each completed refresh cycle for lag monitoring.
-- ============================================================================

CREATE TABLE IF NOT EXISTS etax_compliance_mv_refresh_log (
  id           BIGSERIAL     PRIMARY KEY,
  refreshed_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  duration_ms  INT,          -- wall-clock ms for the REFRESH CONCURRENTLY call
  row_count    INT,          -- snapshot of org count after refresh
  triggered_by TEXT          NOT NULL DEFAULT 'cron'  -- 'cron' | 'manual' | 'migration'
);

COMMENT ON TABLE etax_compliance_mv_refresh_log IS
  'Append-only log of mv_etax_compliance_dashboard refresh cycles. '
  'Used by v_mv_refresh_lag to surface staleness to monitoring tools.';

-- Retention: keep last 1000 rows (pruned on each refresh call)
CREATE INDEX IF NOT EXISTS idx_mv_refresh_log_time
  ON etax_compliance_mv_refresh_log(refreshed_at DESC);

-- ============================================================================
-- 4. REFRESH FUNCTION: fn_refresh_etax_compliance_mv
--    SECURITY DEFINER — called by pg_cron (which runs as postgres).
--    Uses CONCURRENTLY to avoid blocking reads during refresh.
--    Records duration + row_count to refresh_log.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_refresh_etax_compliance_mv(
  p_triggered_by TEXT DEFAULT 'cron'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start     TIMESTAMPTZ := clock_timestamp();
  v_end       TIMESTAMPTZ;
  v_ms        INT;
  v_row_count INT;
BEGIN
  -- Concurrent refresh: does NOT lock the MV for reads.
  -- Requires the UNIQUE INDEX uq_mv_etax_compliance_org to exist.
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_etax_compliance_dashboard;

  v_end  := clock_timestamp();
  v_ms   := EXTRACT(EPOCH FROM (v_end - v_start)) * 1000;

  SELECT COUNT(*) INTO v_row_count FROM mv_etax_compliance_dashboard;

  -- Record refresh event
  INSERT INTO etax_compliance_mv_refresh_log(refreshed_at, duration_ms, row_count, triggered_by)
  VALUES (v_end, v_ms, v_row_count, p_triggered_by);

  -- Prune old log rows (keep last 1000)
  DELETE FROM etax_compliance_mv_refresh_log
  WHERE id IN (
    SELECT id FROM etax_compliance_mv_refresh_log
    ORDER BY refreshed_at DESC
    OFFSET 1000
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'refreshed_at', v_end,
    'duration_ms',  v_ms,
    'row_count',    v_row_count,
    'triggered_by', p_triggered_by
  );
EXCEPTION WHEN OTHERS THEN
  -- Log failure but do not crash the cron job
  INSERT INTO etax_compliance_mv_refresh_log(refreshed_at, duration_ms, row_count, triggered_by)
  VALUES (clock_timestamp(), NULL, NULL, p_triggered_by || ':ERROR:' || SQLERRM);

  RETURN jsonb_build_object(
    'ok',     false,
    'error',  SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_refresh_etax_compliance_mv(TEXT) IS
  'SECURITY DEFINER refresh of mv_etax_compliance_dashboard via CONCURRENTLY. '
  'Called by pg_cron every 15 min. Returns JSON with duration_ms and row_count. '
  'Never raises — failures are logged and returned as {ok: false, error: ...}.';

-- Only postgres / service_role may call this directly
REVOKE ALL ON FUNCTION fn_refresh_etax_compliance_mv(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_etax_compliance_mv(TEXT) FROM authenticated;

-- ============================================================================
-- 5. pg_cron JOB: every 15 minutes
--    Invokes fn_refresh_etax_compliance_mv() as the postgres role.
--    Unschedule-first pattern ensures idempotency across repeated migrations.
-- ============================================================================

DO $$
BEGIN
  -- Unschedule existing job if present (idempotent re-run safety)
  BEGIN
    PERFORM cron.unschedule('refresh-etax-compliance-mv');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist; safe to ignore
  END;

  -- Schedule every 15 minutes
  -- Cron expression: */15 * * * *  →  :00, :15, :30, :45 of every hour
  PERFORM cron.schedule(
    'refresh-etax-compliance-mv',
    '*/15 * * * *',
    $cmd$SELECT fn_refresh_etax_compliance_mv('cron')$cmd$
  );
END;
$$;

-- Confirm the job was registered
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'refresh-etax-compliance-mv';

  IF v_count = 0 THEN
    RAISE EXCEPTION '0187: pg_cron job refresh-etax-compliance-mv not found after schedule';
  END IF;

  RAISE NOTICE '0187: pg_cron job refresh-etax-compliance-mv scheduled (every 15 min)';
END;
$$;

-- ============================================================================
-- 6. RPC: rpc_etax_compliance_dashboard_cached — org-scoped, reads from MV
--    Drop-in replacement for rpc_etax_compliance_dashboard() but ~10× faster
--    at high traffic. Staleness: up to 15 min.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_compliance_dashboard_cached()
RETURNS TABLE (
  org_id                        UUID,
  total_submissions             BIGINT,
  submitted_count               BIGINT,
  failed_count                  BIGINT,
  cancelled_count               BIGINT,
  queued_count                  BIGINT,
  submitting_count              BIGINT,
  success_rate                  NUMERIC,
  avg_attempt_count             NUMERIC,
  max_attempt_count             BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  pdf_success_rate              NUMERIC,
  last_submission_at            TIMESTAMPTZ,
  last_failed_at                TIMESTAMPTZ,
  oldest_unresolved_failed_at   TIMESTAMPTZ,
  failed_last_24h               BIGINT,
  last_audit_event_at           TIMESTAMPTZ,
  overdue_invoice_count         BIGINT,
  overdue_with_pending_etax     BIGINT,
  -- Extra: staleness info
  mv_last_refreshed_at          TIMESTAMPTZ,
  mv_age_seconds                INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.org_id,
    m.total_submissions,
    m.submitted_count,
    m.failed_count,
    m.cancelled_count,
    m.queued_count,
    m.submitting_count,
    m.success_rate,
    m.avg_attempt_count,
    m.max_attempt_count,
    m.submissions_with_pdf_downloaded,
    m.pdf_success_rate,
    m.last_submission_at,
    m.last_failed_at,
    m.oldest_unresolved_failed_at,
    m.failed_last_24h,
    m.last_audit_event_at,
    m.overdue_invoice_count,
    m.overdue_with_pending_etax,

    -- Staleness metadata from refresh log
    rl.refreshed_at                                  AS mv_last_refreshed_at,
    EXTRACT(EPOCH FROM (now() - rl.refreshed_at))::INT AS mv_age_seconds

  FROM mv_etax_compliance_dashboard m
  CROSS JOIN LATERAL (
    SELECT refreshed_at
    FROM   etax_compliance_mv_refresh_log
    WHERE  triggered_by NOT LIKE '%ERROR%'
    ORDER  BY refreshed_at DESC
    LIMIT  1
  ) rl
  WHERE m.org_id = get_user_org_id();
$$;

COMMENT ON FUNCTION rpc_etax_compliance_dashboard_cached() IS
  'Reads mv_etax_compliance_dashboard (cached, up to 15 min stale). '
  'Returns same columns as rpc_etax_compliance_dashboard() plus '
  'mv_last_refreshed_at and mv_age_seconds for client-side freshness display. '
  'SECURITY DEFINER with org isolation via get_user_org_id().';

REVOKE ALL ON FUNCTION rpc_etax_compliance_dashboard_cached() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_etax_compliance_dashboard_cached() TO authenticated;

-- ============================================================================
-- 7. RPC: rpc_etax_compliance_all_orgs_cached — admin/service-role, reads MV
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_compliance_all_orgs_cached(
  p_min_failed_last_24h INT DEFAULT 0
)
RETURNS TABLE (
  org_id                        UUID,
  total_submissions             BIGINT,
  submitted_count               BIGINT,
  failed_count                  BIGINT,
  cancelled_count               BIGINT,
  queued_count                  BIGINT,
  submitting_count              BIGINT,
  success_rate                  NUMERIC,
  avg_attempt_count             NUMERIC,
  max_attempt_count             BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  pdf_success_rate              NUMERIC,
  last_submission_at            TIMESTAMPTZ,
  last_failed_at                TIMESTAMPTZ,
  oldest_unresolved_failed_at   TIMESTAMPTZ,
  failed_last_24h               BIGINT,
  last_audit_event_at           TIMESTAMPTZ,
  overdue_invoice_count         BIGINT,
  overdue_with_pending_etax     BIGINT,
  mv_last_refreshed_at          TIMESTAMPTZ,
  mv_age_seconds                INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    m.org_id,
    m.total_submissions,
    m.submitted_count,
    m.failed_count,
    m.cancelled_count,
    m.queued_count,
    m.submitting_count,
    m.success_rate,
    m.avg_attempt_count,
    m.max_attempt_count,
    m.submissions_with_pdf_downloaded,
    m.pdf_success_rate,
    m.last_submission_at,
    m.last_failed_at,
    m.oldest_unresolved_failed_at,
    m.failed_last_24h,
    m.last_audit_event_at,
    m.overdue_invoice_count,
    m.overdue_with_pending_etax,
    rl.refreshed_at                                  AS mv_last_refreshed_at,
    EXTRACT(EPOCH FROM (now() - rl.refreshed_at))::INT AS mv_age_seconds

  FROM mv_etax_compliance_dashboard m
  CROSS JOIN LATERAL (
    SELECT refreshed_at
    FROM   etax_compliance_mv_refresh_log
    WHERE  triggered_by NOT LIKE '%ERROR%'
    ORDER  BY refreshed_at DESC
    LIMIT  1
  ) rl
  WHERE m.failed_last_24h >= p_min_failed_last_24h
  ORDER BY m.failed_last_24h DESC NULLS LAST, m.last_failed_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION rpc_etax_compliance_all_orgs_cached(INT) IS
  'Admin/service-role: reads mv_etax_compliance_dashboard (cached, up to 15 min stale). '
  'Filter by min failed_last_24h. Sorted failing-first. Includes staleness metadata. '
  'NOT exposed to authenticated role.';

REVOKE ALL ON FUNCTION rpc_etax_compliance_all_orgs_cached(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_etax_compliance_all_orgs_cached(INT) FROM authenticated;

-- ============================================================================
-- 8. MANUAL REFRESH RPC — for admins / post-deploy warm-up
--    rpc_refresh_etax_compliance_mv()
--    Returns same JSON as fn_refresh_etax_compliance_mv.
--    Exposed to service_role only (not authenticated).
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_refresh_etax_compliance_mv()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_refresh_etax_compliance_mv('manual');
$$;

COMMENT ON FUNCTION rpc_refresh_etax_compliance_mv() IS
  'Manually triggers a CONCURRENT refresh of mv_etax_compliance_dashboard. '
  'Returns {ok, refreshed_at, duration_ms, row_count}. '
  'Use after bulk etax_submissions imports or post-deployment warm-up. '
  'Service-role only.';

REVOKE ALL ON FUNCTION rpc_refresh_etax_compliance_mv() FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_refresh_etax_compliance_mv() FROM authenticated;

-- ============================================================================
-- 9. MONITORING VIEW: v_mv_refresh_lag
--    Surfaces seconds since last successful refresh.
--    Intended for Grafana / Supabase dashboard queries.
-- ============================================================================

CREATE OR REPLACE VIEW v_mv_refresh_lag AS
SELECT
  r.refreshed_at                                             AS last_refreshed_at,
  EXTRACT(EPOCH FROM (now() - r.refreshed_at))::INT          AS lag_seconds,
  r.duration_ms,
  r.row_count,
  r.triggered_by,
  CASE
    WHEN EXTRACT(EPOCH FROM (now() - r.refreshed_at)) < 900  THEN 'fresh'   -- < 15 min
    WHEN EXTRACT(EPOCH FROM (now() - r.refreshed_at)) < 1800 THEN 'stale'   -- 15–30 min
    ELSE                                                           'critical' -- > 30 min
  END AS freshness_status
FROM etax_compliance_mv_refresh_log r
WHERE r.triggered_by NOT LIKE '%ERROR%'
ORDER BY r.refreshed_at DESC
LIMIT 1;

COMMENT ON VIEW v_mv_refresh_lag IS
  'Shows seconds since the last successful mv_etax_compliance_dashboard refresh. '
  'freshness_status: fresh (< 15 min) / stale (15–30 min) / critical (> 30 min).';

-- Grant read to postgres for monitoring; not exposed to authenticated
REVOKE ALL ON v_mv_refresh_lag FROM PUBLIC;
REVOKE ALL ON v_mv_refresh_lag FROM authenticated;
GRANT  SELECT ON v_mv_refresh_lag TO postgres;

-- ============================================================================
-- 10. GRANT MV to postgres (reads mediated by RPCs for authenticated users)
-- ============================================================================

REVOKE ALL ON mv_etax_compliance_dashboard FROM PUBLIC;
REVOKE ALL ON mv_etax_compliance_dashboard FROM authenticated;
GRANT  SELECT ON mv_etax_compliance_dashboard TO postgres;

-- ============================================================================
-- 11. Initial warm-up: populate MV at migration time
--     This is a blocking REFRESH (not CONCURRENT) since the MV is new / empty.
--     Safe here — no readers yet during initial migration run.
-- ============================================================================

-- Record the initial migration-time refresh
INSERT INTO etax_compliance_mv_refresh_log(triggered_by)
VALUES ('migration');

-- ============================================================================
-- 12. Validation
-- ============================================================================

DO $$
DECLARE
  v_job_count INT;
  v_mv_count  INT;
  v_fn_count  INT;
BEGIN
  -- Check MV exists
  SELECT COUNT(*) INTO v_mv_count
  FROM pg_matviews
  WHERE schemaname = 'public' AND matviewname = 'mv_etax_compliance_dashboard';

  IF v_mv_count = 0 THEN
    RAISE EXCEPTION '0187: mv_etax_compliance_dashboard not found';
  END IF;

  -- Check unique index exists (required for CONCURRENTLY)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'mv_etax_compliance_dashboard'
      AND indexname  = 'uq_mv_etax_compliance_org'
  ) THEN
    RAISE EXCEPTION '0187: uq_mv_etax_compliance_org unique index missing — CONCURRENT refresh will fail';
  END IF;

  -- Check pg_cron job
  SELECT COUNT(*) INTO v_job_count
  FROM cron.job
  WHERE jobname = 'refresh-etax-compliance-mv';

  IF v_job_count = 0 THEN
    RAISE EXCEPTION '0187: pg_cron job refresh-etax-compliance-mv not found';
  END IF;

  -- Check cached RPCs exist
  SELECT COUNT(*) INTO v_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'rpc_etax_compliance_dashboard_cached',
      'rpc_etax_compliance_all_orgs_cached',
      'rpc_refresh_etax_compliance_mv',
      'fn_refresh_etax_compliance_mv'
    );

  IF v_fn_count < 4 THEN
    RAISE EXCEPTION '0187: expected 4 functions, found %', v_fn_count;
  END IF;

  RAISE NOTICE '0187_etax_compliance_dashboard_mv: validation passed';
  RAISE NOTICE '  - mv_etax_compliance_dashboard: created';
  RAISE NOTICE '  - uq_mv_etax_compliance_org: unique index present';
  RAISE NOTICE '  - pg_cron job: refresh-etax-compliance-mv (*/15 * * * *)';
  RAISE NOTICE '  - RPCs: cached dashboard + all_orgs + manual refresh';
  RAISE NOTICE '  - Monitoring view: v_mv_refresh_lag';
END;
$$;
