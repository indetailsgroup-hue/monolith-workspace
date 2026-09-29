-- =============================================================================
-- Migration 0186: pg_cron hourly refresh of mv_fpr_summary_raw
--
-- Creates fn_cron_refresh_fpr_summary() — a system-level SECURITY DEFINER
-- wrapper that calls REFRESH MATERIALIZED VIEW CONCURRENTLY directly, bypassing
-- the authority gate on rpc_refresh_fpr_summary() which is designed for
-- authenticated user calls. pg_cron runs as the database owner with no JWT
-- context, so the user-facing RPC's role check cannot be satisfied from cron.
--
-- Schedule: 0 * * * * (top of every hour)
-- Job name : fpr-summary-refresh
--
-- Pattern: mirrors 0179_field_purchase_cron.sql (extension guard, idempotent
--          unschedule-before-schedule, DO $$ block, RAISE NOTICE).
-- Prerequisite: 0184 (mv_fpr_summary_raw, uix_mv_fpr_summary_raw_request_id)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- (1) fn_cron_refresh_fpr_summary
--
--     System-level wrapper for pg_cron. SECURITY DEFINER so it runs as
--     the function owner (postgres / db owner) who has access to the MV.
--
--     Distinct from rpc_refresh_fpr_summary() which enforces role gates
--     for interactive user calls. Callers via the REST API should always
--     use rpc_refresh_fpr_summary(); this function is CRON ONLY.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cron_refresh_fpr_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- CONCURRENTLY does not acquire AccessExclusiveLock on the MV;
  -- reads via v_field_purchase_request_summary are uninterrupted.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_fpr_summary_raw;
END;
$$;

-- Intentionally NOT granted to anon / authenticated — only postgres/owner
-- may invoke this function. The schedule below is the sole caller.
REVOKE ALL ON FUNCTION public.fn_cron_refresh_fpr_summary()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_cron_refresh_fpr_summary() IS
  'pg_cron system wrapper: refreshes mv_fpr_summary_raw CONCURRENTLY. '
  'No authority gate — designed for cron invocation only. '
  'For interactive refresh use rpc_refresh_fpr_summary() instead. '
  'Migration 0186.';

-- ---------------------------------------------------------------------------
-- (2) pg_cron schedule — idempotent (unschedule existing job before re-add)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule any previous version of this job (idempotent re-run safety)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'fpr-summary-refresh';

    -- Refresh the FPR summary materialised view at the top of every hour.
    -- CONCURRENTLY keeps the view readable by dashboard users during refresh.
    PERFORM cron.schedule(
      'fpr-summary-refresh',
      '0 * * * *',
      $job$SELECT public.fn_cron_refresh_fpr_summary()$job$
    );

    RAISE NOTICE
      'fpr-summary-refresh cron job registered (0 * * * * — top of every hour)';

  ELSE
    RAISE NOTICE
      'pg_cron not installed — fpr-summary-refresh schedule not created. '
      'Run this migration again after enabling pg_cron.';
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- Verify (run manually after applying):
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job
--    WHERE jobname = 'fpr-summary-refresh';
--   -- Expected:
--   --   fpr-summary-refresh  | 0 * * * *  | SELECT public.fn_cron_refresh_fpr_summary()  | t
-- =============================================================================
