-- ============================================================
-- Migration 0188: Materialized View Refresh-Lag Alert Trigger
-- ============================================================
-- Purpose:
--   Monitors v_mv_refresh_lag every 5 minutes via pg_cron.
--   When freshness_status becomes 'critical' (lag > 1800 s / 30 min),
--   inserts a system-level alert row into etax_submission_audit_log.
--   Includes dedup guard: at most one alert per 30-minute window.
--
-- Design decisions:
--   1. ALTER etax_submission_audit_log.submission_id → nullable,
--      with CHECK: submission_id IS NOT NULL OR trigger_source = 'system'
--   2. fn_mv_refresh_lag_alert() — SECURITY DEFINER, no RLS bypass needed
--      because it inserts with a fixed org_id sentinel (NULL) and
--      trigger_source = 'system'.
--   3. pg_cron job: check-mv-refresh-lag, */5 * * * *
--   4. Idempotent: DROP/recreate function; unschedule-before-schedule.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Prerequisite guard
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Ensure extensions are available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron extension is required but not installed. Run: CREATE EXTENSION pg_cron;';
  END IF;

  -- Ensure etax_submission_audit_log exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'etax_submission_audit_log'
  ) THEN
    RAISE EXCEPTION 'etax_submission_audit_log table not found. Run migration 0185 first.';
  END IF;

  -- Ensure v_mv_refresh_lag exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name   = 'v_mv_refresh_lag'
  ) THEN
    RAISE EXCEPTION 'v_mv_refresh_lag view not found. Run migration 0187 first.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. ALTER etax_submission_audit_log.submission_id → nullable
--    Add CHECK: submission_id IS NOT NULL OR trigger_source = 'system'
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_nullable TEXT;
BEGIN
  SELECT is_nullable
    INTO col_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'etax_submission_audit_log'
     AND column_name  = 'submission_id';

  IF col_nullable = 'NO' THEN
    ALTER TABLE public.etax_submission_audit_log
      ALTER COLUMN submission_id DROP NOT NULL;

    RAISE NOTICE '0188: submission_id made nullable on etax_submission_audit_log';
  ELSE
    RAISE NOTICE '0188: submission_id already nullable — skipping ALTER';
  END IF;
END $$;

-- Add CHECK constraint (idempotent via named constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name         = 'etax_submission_audit_log'
      AND constraint_name    = 'chk_submission_id_or_system'
  ) THEN
    ALTER TABLE public.etax_submission_audit_log
      ADD CONSTRAINT chk_submission_id_or_system
      CHECK (
        submission_id IS NOT NULL
        OR trigger_source::TEXT = 'system'
      );
    RAISE NOTICE '0188: CHECK constraint chk_submission_id_or_system added';
  ELSE
    RAISE NOTICE '0188: CHECK constraint chk_submission_id_or_system already exists — skipping';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Helper index: fast dedup lookup on system alert rows
--    (partial index on system rows with recent changed_at)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_etax_audit_log_system_alerts
  ON public.etax_submission_audit_log (changed_at DESC)
  WHERE trigger_source = 'system';

COMMENT ON INDEX public.idx_etax_audit_log_system_alerts IS
  'Speeds up dedup guard query in fn_mv_refresh_lag_alert()';

-- ─────────────────────────────────────────────────────────────
-- 3. Alert function: fn_mv_refresh_lag_alert()
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mv_refresh_lag_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lag_seconds     NUMERIC;
  v_freshness       TEXT;
  v_last_refresh    TIMESTAMPTZ;
  v_duration_ms     NUMERIC;
  v_row_count       BIGINT;
  v_triggered_by    TEXT;
  v_recent_alert    TIMESTAMPTZ;
  v_dedup_window    INTERVAL := INTERVAL '30 minutes';
  v_alert_metadata  JSONB;
BEGIN
  -- ── 3a. Read current lag from view ────────────────────────
  SELECT
      lag_seconds,
      freshness_status,
      last_refreshed_at,
      duration_ms,
      row_count,
      triggered_by
    INTO
      v_lag_seconds,
      v_freshness,
      v_last_refresh,
      v_duration_ms,
      v_row_count,
      v_triggered_by
    FROM public.v_mv_refresh_lag
   LIMIT 1;

  -- If view returns no row (never refreshed yet), treat as critical
  IF v_freshness IS NULL THEN
    v_lag_seconds  := EXTRACT(EPOCH FROM (NOW() - '1970-01-01'::TIMESTAMPTZ));
    v_freshness    := 'critical';
    v_last_refresh := NULL;
    v_duration_ms  := NULL;
    v_row_count    := NULL;
    v_triggered_by := 'none';
    RAISE WARNING '0188: v_mv_refresh_lag returned no row — treating as critical';
  END IF;

  -- ── 3b. Only proceed if critical ──────────────────────────
  IF v_freshness <> 'critical' THEN
    RETURN;  -- fresh or stale — no alert needed
  END IF;

  -- ── 3c. Dedup guard: skip if a system alert already exists
  --         within the past 30 minutes for the same alert type ─
  SELECT MAX(changed_at)
    INTO v_recent_alert
    FROM public.etax_submission_audit_log
   WHERE trigger_source = 'system'
     AND metadata->>'alert_type' = 'mv_refresh_critical'
     AND changed_at > NOW() - v_dedup_window;

  IF v_recent_alert IS NOT NULL THEN
    RAISE NOTICE '0188: dedup guard — alert already fired at %; skipping', v_recent_alert;
    RETURN;
  END IF;

  -- ── 3d. Build metadata payload ────────────────────────────
  v_alert_metadata := jsonb_build_object(
    'alert_type',       'mv_refresh_critical',
    'lag_seconds',      v_lag_seconds,
    'freshness_status', v_freshness,
    'last_refreshed_at', COALESCE(v_last_refresh::TEXT, 'never'),
    'duration_ms',      v_duration_ms,
    'row_count',        v_row_count,
    'triggered_by',     COALESCE(v_triggered_by, 'unknown'),
    'detected_at',      NOW()::TEXT,
    'threshold_seconds', 1800,
    'cron_job',         'check-mv-refresh-lag'
  );

  -- ── 3e. Insert alert row ───────────────────────────────────
  INSERT INTO public.etax_submission_audit_log (
    submission_id,    -- NULL is allowed for system rows (0188 ALTER)
    org_id,           -- NULL: system-level, not org-scoped
    actor_id,         -- NULL: no human actor
    actor_role,       -- 'system'
    old_status,       -- NULL: no submission context
    new_status,       -- NULL: no submission context
    old_pdf_status,   -- NULL
    new_pdf_status,   -- NULL
    trigger_source,   -- 'system'
    rd_ref_no,        -- NULL
    attempt_count,    -- 0
    metadata,
    changed_at
  ) VALUES (
    NULL,
    NULL,
    NULL,
    'system',
    NULL,
    NULL,
    NULL,
    NULL,
    'system',
    NULL,
    0,
    v_alert_metadata,
    NOW()
  );

  RAISE WARNING '0188: MV refresh lag CRITICAL — lag=% seconds; alert row inserted',
    v_lag_seconds;

EXCEPTION WHEN OTHERS THEN
  -- Never crash the cron job; log and continue
  RAISE WARNING '0188: fn_mv_refresh_lag_alert() unhandled error: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.fn_mv_refresh_lag_alert() IS
  'Checks v_mv_refresh_lag every 5 min via pg_cron. '
  'Inserts a system alert row into etax_submission_audit_log when '
  'freshness_status = critical (lag > 1800 s). '
  'Dedup guard: at most one alert per 30-minute window. '
  'submission_id is NULL for system rows (see CHECK constraint in 0188). '
  'Called by pg_cron job: check-mv-refresh-lag.';

-- ─────────────────────────────────────────────────────────────
-- 4. Revoke public EXECUTE on the alert function
--    (only superuser / pg_cron should call it)
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_mv_refresh_lag_alert() FROM PUBLIC;

-- Grant to postgres role (pg_cron runs as postgres)
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.fn_mv_refresh_lag_alert() TO postgres;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '0188: Could not GRANT EXECUTE to postgres (role may not exist in this env): %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. pg_cron: schedule check-mv-refresh-lag (idempotent)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Unschedule any existing job with this name first (idempotent)
  PERFORM cron.unschedule('check-mv-refresh-lag');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist — that's fine
  NULL;
END $$;

SELECT cron.schedule(
  'check-mv-refresh-lag',       -- job name
  '*/5 * * * *',                -- every 5 minutes
  $$SELECT public.fn_mv_refresh_lag_alert();$$
);

-- ─────────────────────────────────────────────────────────────
-- 6. Verify pg_cron job was registered
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_job_count INT;
BEGIN
  SELECT COUNT(*) INTO v_job_count
    FROM cron.job
   WHERE jobname = 'check-mv-refresh-lag';

  IF v_job_count = 0 THEN
    RAISE EXCEPTION '0188: pg_cron job check-mv-refresh-lag was NOT registered successfully';
  ELSE
    RAISE NOTICE '0188: pg_cron job check-mv-refresh-lag registered OK';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Verify the CHECK constraint is in place
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_constraint_count INT;
BEGIN
  SELECT COUNT(*) INTO v_constraint_count
    FROM information_schema.table_constraints
   WHERE constraint_schema = 'public'
     AND table_name         = 'etax_submission_audit_log'
     AND constraint_name    = 'chk_submission_id_or_system';

  IF v_constraint_count = 0 THEN
    RAISE EXCEPTION '0188: CHECK constraint chk_submission_id_or_system was NOT created';
  ELSE
    RAISE NOTICE '0188: CHECK constraint chk_submission_id_or_system verified OK';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Rollback safety annotation
-- ─────────────────────────────────────────────────────────────
-- To roll back this migration manually:
--
--   SELECT cron.unschedule('check-mv-refresh-lag');
--
--   DROP FUNCTION IF EXISTS public.fn_mv_refresh_lag_alert();
--
--   ALTER TABLE public.etax_submission_audit_log
--     DROP CONSTRAINT IF EXISTS chk_submission_id_or_system;
--
--   -- NOTE: Do NOT re-add NOT NULL to submission_id if other system
--   -- rows already exist with NULL submission_id.
--
--   DROP INDEX IF EXISTS public.idx_etax_audit_log_system_alerts;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Migration 0188 complete.
-- New objects:
--   TABLE CHANGE  : etax_submission_audit_log.submission_id → nullable
--   CONSTRAINT    : chk_submission_id_or_system
--   INDEX         : idx_etax_audit_log_system_alerts (partial)
--   FUNCTION      : fn_mv_refresh_lag_alert()
--   pg_cron JOB   : check-mv-refresh-lag (*/5 * * * *)
-- ─────────────────────────────────────────────────────────────
