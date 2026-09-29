-- =============================================================================
-- Migration  : 0179_field_purchase_cron.sql
-- Description: pg_cron schedule — expire stale fpr_line_session rows every 15 min
-- Depends on : 0177_field_purchase_line_flow.sql (fn_expire_fpr_sessions)
--              pg_cron extension (Supabase hosted: pre-installed; local dev: may be absent)
-- Pattern    : mirrors 0089_cron_schedules.sql (mติ grill-with-docs 2026-07-06)
--              — extension guard, idempotent unschedule-before-schedule, notice on skip.
-- Notes      : fn_expire_fpr_sessions is pure-SQL (no pg_net needed; no Edge Function call).
--              No Vault secrets required. Job is safe to run concurrently (fn uses
--              SELECT … FOR UPDATE SKIP LOCKED–equivalent via status CTE filter).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (1) Extension guard — hosted Supabase has pg_cron; local dev may not
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron unavailable (%) — fpr-expire-sessions schedule will be skipped', SQLERRM;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- (2) Schedule — idempotent: unschedule existing job before re-scheduling
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule any previous version of this job (idempotent re-run safety)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'fpr-expire-sessions';

    -- Expire stale fpr_line_session rows every 15 minutes.
    -- fn_expire_fpr_sessions() sets state = 'done' for any row where
    -- expires_at < now() and state is not already terminal.
    PERFORM cron.schedule(
      'fpr-expire-sessions',
      '*/15 * * * *',
      $job$SELECT public.fn_expire_fpr_sessions()$job$
    );

    RAISE NOTICE 'fpr-expire-sessions cron job registered (*/15 * * * *)';

  ELSE
    RAISE NOTICE 'pg_cron not installed — fpr-expire-sessions schedule not created '
                 '(expected on local dev; will be created on hosted db push)';
  END IF;
END
$$;

-- =============================================================================
-- Verification query (run manually after deploy):
--
--   SELECT jobname, schedule, command, active
--   FROM cron.job
--   WHERE jobname = 'fpr-expire-sessions';
--
-- Expected row:
--   jobname              | schedule       | command                                       | active
--   fpr-expire-sessions  | */15 * * * *   | SELECT public.fn_expire_fpr_sessions()        | t
-- =============================================================================
