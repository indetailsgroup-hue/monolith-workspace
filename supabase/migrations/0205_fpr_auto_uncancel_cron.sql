-- =============================================================================
-- Migration 0205: fn_cron_auto_uncancel_stale_fpr + pg_cron daily schedule
--
-- Automatically returns stale cancelled field purchase requests to the pending
-- state so they can re-enter the approval workflow without manual intervention.
-- A "stale" cancelled request is one whose updated_at is older than
-- p_older_than_days days (default 7).
--
-- Design decisions:
--   • SECURITY DEFINER system function that bypasses resolve_actor() / JWT
--     checks — pg_cron runs as the database owner with no JWT context.
--     This follows the 0186 fn_cron_refresh_fpr_summary pattern exactly.
--   • Sets app.actor = 'system:auto_uncancel_cron' (session-level) so
--     fn_fpr_audit_transition records the correct actor on the batch UPDATE.
--   • Reads p_older_than_days from the postgres GUC
--     app.fpr_auto_uncancel_days when not supplied (falls back to 7).
--     Operators can tune the threshold without changing code:
--       ALTER DATABASE <db> SET app.fpr_auto_uncancel_days = '14';
--   • No-op return (ok=true, uncancelled_count=0) when there are no stale rows.
--   • Supplementary audit rows carry metadata.auto=true,
--     metadata.older_than_days, and metadata.cutoff so the audit trail is
--     transparent.
--   • NOT granted to authenticated / anon — the pg_cron job is the sole caller.
--   • Schedule: 0 2 * * * (02:00 UTC = 09:00 Bangkok) — runs once daily.
--   • Job name: fpr-auto-uncancel-stale
--   • Idempotent: unschedules existing job before re-scheduling.
--   • pg_cron extension guard: RAISE NOTICE and skip on local dev where
--     pg_cron may not be installed.
--
-- Operators can override the threshold for the cron job by changing the
-- schedule command:
--   UPDATE cron.job
--      SET command = 'SELECT public.fn_cron_auto_uncancel_stale_fpr(14)'
--    WHERE jobname = 'fpr-auto-uncancel-stale';
--
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0199 — rpc_cancel_field_purchase_request (introduces 'cancelled' status)
--   0202 — rpc_uncancel_field_purchase_request (single-row reference)
--   0204 — rpc_bulk_uncancel_field_purchase_request (batch reference)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- fn_cron_auto_uncancel_stale_fpr
--
-- System-level wrapper for pg_cron. SECURITY DEFINER so it runs as the
-- function owner (postgres / db owner) who can write to all FPR tables.
--
-- Distinct from rpc_uncancel_field_purchase_request (0202) and
-- rpc_bulk_uncancel_field_purchase_request (0204) which enforce JWT authority
-- gates for interactive user calls. THIS FUNCTION IS CRON ONLY.
--
-- Parameters:
--   p_older_than_days  int  — threshold in days (default 7).
--                             Set to NULL to read from the GUC
--                             app.fpr_auto_uncancel_days (also defaulting to 7).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cron_auto_uncancel_stale_fpr(
  p_older_than_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold  int;
  v_cutoff     timestamptz;
  v_now        timestamptz := now();
  v_ids        uuid[];
  v_count      int;
  v_guc        text;
BEGIN
  -- ── 1. Resolve threshold ──────────────────────────────────────────────────
  --    Caller may pass an explicit value; otherwise read the GUC
  --    app.fpr_auto_uncancel_days (silent fallback to 7).
  IF p_older_than_days IS NOT NULL THEN
    v_threshold := p_older_than_days;
  ELSE
    v_guc := current_setting('app.fpr_auto_uncancel_days', true);
    v_threshold := coalesce(nullif(v_guc, '')::int, 7);
  END IF;

  -- Safety: threshold must be at least 1 day
  IF v_threshold < 1 THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'invalid_parameter',
      'hint', format(
        'p_older_than_days must be >= 1; received %s', v_threshold
      )
    );
  END IF;

  v_cutoff := v_now - (v_threshold || ' days')::interval;

  -- ── 2. Set system actor so fn_fpr_audit_transition records correctly ───────
  --    Session-level (false) because pg_cron runs each job in its own
  --    connection/session; there is no parent transaction to reset to.
  PERFORM set_config('app.actor', 'system:auto_uncancel_cron', false);

  -- ── 3. Collect stale cancelled request IDs ────────────────────────────────
  --    "Stale" = cancelled AND updated_at < cutoff.
  --    FOR UPDATE is omitted here because there is no concurrent cron run
  --    risk when the schedule is once-daily; the batch UPDATE below uses
  --    the WHERE id = ANY(v_ids) predicate which is safe.
  SELECT array_agg(id ORDER BY id) INTO v_ids
    FROM public.field_purchase_request
   WHERE status    = 'cancelled'
     AND updated_at < v_cutoff;

  -- ── 4. No-op when no stale rows ───────────────────────────────────────────
  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok',                true,
      'uncancelled_count', 0,
      'older_than_days',   v_threshold,
      'cutoff',            v_cutoff,
      'message',           format(
        'No cancelled requests with updated_at < %s (older_than_days=%s)',
        v_cutoff, v_threshold
      )
    );
  END IF;

  -- ── 5. Batch transition: cancelled → pending ──────────────────────────────
  --    fn_fpr_audit_transition fires here via the UPDATE trigger,
  --    writing 'status_changed' rows. Approval fields are cleared so each
  --    request re-enters the queue as a fresh pending submission.
  UPDATE public.field_purchase_request
     SET status         = 'pending'::field_purchase_status,
         approver       = NULL,
         approved_at    = NULL,
         rejection_note = NULL,
         updated_at     = v_now
   WHERE id = ANY(v_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ── 6. Supplementary audit entries (event_type = 'uncancelled') ───────────
  --    fn_fpr_audit_transition already inserted 'status_changed' rows above.
  --    These supplementary rows tag the event as automated and record the
  --    threshold so the audit trail is fully transparent.
  INSERT INTO public.field_purchase_audit_log (
    request_id,
    actor,
    event_type,
    old_status,
    new_status,
    metadata
  )
  SELECT req_id,
         'system:auto_uncancel_cron',
         'uncancelled',
         'cancelled'::field_purchase_status,
         'pending'::field_purchase_status,
         jsonb_build_object(
           'auto',            true,
           'older_than_days', v_threshold,
           'cutoff',          v_cutoff,
           'uncancelled_at',  v_now
         )
    FROM unnest(v_ids) AS t(req_id);

  -- ── 7. Return summary ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                true,
    'uncancelled_count', v_count,
    'older_than_days',   v_threshold,
    'cutoff',            v_cutoff,
    'uncancelled_at',    v_now
  );
END;
$$;

-- Intentionally NOT granted to anon / authenticated — pg_cron job is the
-- sole caller. Operators with superuser access may invoke manually.
REVOKE ALL ON FUNCTION public.fn_cron_auto_uncancel_stale_fpr(int)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_cron_auto_uncancel_stale_fpr(int) IS
'pg_cron system function: automatically uncancels stale cancelled field purchase
requests by transitioning cancelled → pending for all rows where updated_at is
older than p_older_than_days days (default 7; configurable via GUC
app.fpr_auto_uncancel_days).

Clears approver, approved_at, and rejection_note so each request re-enters the
approval queue as a fresh pending submission.

Sets app.actor = ''system:auto_uncancel_cron'' so fn_fpr_audit_transition records
the correct actor.  Also writes a supplementary audit entry per row with
event_type=''uncancelled'' and metadata.auto=true.

No-op (ok=true, uncancelled_count=0) when no stale rows exist.
NOT granted to authenticated/anon — CRON ONLY.
For interactive bulk-uncancel use rpc_bulk_uncancel_field_purchase_request (0204).

Override threshold for a specific cron run:
  SELECT public.fn_cron_auto_uncancel_stale_fpr(14);

Override the default permanently:
  ALTER DATABASE <db> SET app.fpr_auto_uncancel_days = ''14'';
  SELECT pg_reload_conf();

Migration 0205.';

-- ---------------------------------------------------------------------------
-- pg_cron schedule — idempotent (unschedule existing before re-registering)
-- Schedule: 0 2 * * * = 02:00 UTC = 09:00 Asia/Bangkok
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Extension guard: hosted Supabase has pg_cron; local dev may not.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron unavailable (%) — fpr-auto-uncancel-stale schedule skipped', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule any previous version of this job (idempotent re-run safety)
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'fpr-auto-uncancel-stale';

    -- Auto-uncancel stale cancelled FPR rows daily at 02:00 UTC (09:00 Bangkok).
    -- The default threshold is 7 days; change by passing an argument or by
    -- setting the GUC app.fpr_auto_uncancel_days on the database.
    PERFORM cron.schedule(
      'fpr-auto-uncancel-stale',
      '0 2 * * *',
      $job$SELECT public.fn_cron_auto_uncancel_stale_fpr()$job$
    );

    RAISE NOTICE
      'fpr-auto-uncancel-stale cron job registered '
      '(0 2 * * * — 02:00 UTC = 09:00 Asia/Bangkok, default threshold 7 days)';

  ELSE
    RAISE NOTICE
      'pg_cron not installed — fpr-auto-uncancel-stale schedule not created. '
      'Run this migration again after enabling pg_cron on hosted Supabase.';
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- Verify after applying:
--
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job
--    WHERE jobname = 'fpr-auto-uncancel-stale';
--
--   -- Expected:
--   -- fpr-auto-uncancel-stale | 0 2 * * * | SELECT public.fn_cron_auto_uncancel_stale_fpr() | t
--
-- Manual dry-run (no rows touched unless stale cancelled rows exist):
--   SELECT public.fn_cron_auto_uncancel_stale_fpr(7);
--
-- Override threshold to 14 days permanently:
--   ALTER DATABASE <db> SET app.fpr_auto_uncancel_days = '14';
--   SELECT pg_reload_conf();
-- =============================================================================
