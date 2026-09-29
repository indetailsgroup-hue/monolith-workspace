-- =============================================================================
-- Migration 0210: FPR outbound dead-letter monitoring view + pg_cron alert
--
-- Changes:
--   1. CREATE OR REPLACE VIEW v_fpr_outbound_dead_letter
--        Joins line_oa_outbound_messages (status='dead') with
--        field_purchase_request via slot_values->>'request_id'.
--        Columns: message id, request_id, site_code, requester, template_key,
--                 retried_count, slot_values, message_created_at, request_status.
--   2. GRANT SELECT on the view to authenticated role (dashboard read-only).
--   3. CREATE fn_cron_alert_dead_letter_fpr() — SECURITY DEFINER pg_cron callback
--        that logs a WARNING/NOTIFY for each dead-letter row found, suitable for
--        alerting via Supabase log drains or pg_cron job monitoring.
--   4. Schedule pg_cron job 'fpr-dead-letter-alert' — runs every hour, calls
--        fn_cron_alert_dead_letter_fpr().
--
-- View design notes:
--   * slot_values jsonb is owned by line_oa_outbound_messages (set by the
--     dispatch worker before enqueue). The 'request_id' key is the standard
--     slot inserted by rpc_bulk_approve/cancel/uncancel/force_close helpers
--     (established in migrations 0193, 0201, 0204, 0206).
--   * LEFT JOIN on field_purchase_request so dead-letter rows that reference
--     a deleted or not-yet-visible request still appear in the view with NULLs.
--   * RLS not applicable to views; underlying table RLS is bypassed inside
--     SECURITY DEFINER functions only. The view is safe because it surfaces
--     only dead rows and contains no PII beyond what the approver already sees.
--
-- Prerequisite migrations: 0176 (field_purchase_request),
--                          0208 (retried_count, fn_outbound_mark_failed).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Dead-letter monitoring view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_fpr_outbound_dead_letter AS
SELECT
  m.id                                         AS message_id,
  (m.slot_values ->> 'request_id')::uuid       AS request_id,
  fpr.site_code,
  fpr.requester,
  m.template_key,
  m.retried_count,
  m.slot_values,
  m.send_type,
  NULL::text                                   AS target_type,   -- column not on line_oa_outbound_messages (iter 25t)
  NULL::uuid                                   AS target_id,      -- column not on line_oa_outbound_messages (iter 25t)
  NULL::text                                   AS reply_token,    -- column not on line_oa_outbound_messages (iter 25t)
  m.sent_at                                 AS message_created_at,
  fpr.status                                   AS request_status,
  fpr.amount,
  fpr.reason,
  fpr.item_hint,
  fpr.approval_level,
  fpr.updated_at                               AS request_updated_at,
  -- Age helpers for alert triage
  now() - m.sent_at                         AS message_age,
  EXTRACT(EPOCH FROM (now() - m.sent_at)) / 3600.0 AS message_age_hours
FROM public.line_oa_outbound_messages AS m
LEFT JOIN public.field_purchase_request AS fpr
       ON fpr.id = (m.slot_values ->> 'request_id')::uuid
WHERE m.status = 'dead'
ORDER BY m.sent_at DESC;

COMMENT ON VIEW public.v_fpr_outbound_dead_letter IS
  'Dead-letter LINE outbound messages (retried_count >= 3, status=dead) joined '
  'with their originating field_purchase_request. Used by the pg_cron alert job '
  'and the FPR dashboard for operator triage. See migration 0210.';

-- ---------------------------------------------------------------------------
-- 2. GRANT — dashboard authenticated users may read the view
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.v_fpr_outbound_dead_letter TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_cron_alert_dead_letter_fpr — pg_cron callback
--
--    * Counts dead-letter rows that have appeared since the last hour.
--    * Raises a WARNING for each row (captured by Supabase log drain / Logflare).
--    * pg_notify('fpr_dead_letter_alert', payload_json) for any Realtime
--      subscriber or external alerting bridge.
--    * Returns void — pg_cron ignores return values.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cron_alert_dead_letter_fpr()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row       record;
  v_count     int4 := 0;
  v_payload   jsonb;
  v_summary   jsonb;
BEGIN
  -- Collect rows that became dead in the last hour (avoid re-alerting old rows
  -- on every hourly run; operators should clear dead rows after remediation).
  FOR v_row IN
    SELECT
      dl.message_id,
      dl.request_id,
      dl.site_code,
      dl.requester,
      dl.template_key,
      dl.retried_count,
      dl.message_age_hours,
      dl.request_status
    FROM public.v_fpr_outbound_dead_letter AS dl
    WHERE dl.message_created_at >= now() - INTERVAL '1 hour'
    ORDER BY dl.message_created_at ASC
  LOOP
    v_count := v_count + 1;

    v_payload := jsonb_build_object(
      'alert',           'fpr_dead_letter',
      'message_id',      v_row.message_id,
      'request_id',      v_row.request_id,
      'site_code',       v_row.site_code,
      'requester',       v_row.requester,
      'template_key',    v_row.template_key,
      'retried_count',   v_row.retried_count,
      'age_hours',       round(v_row.message_age_hours::numeric, 2),
      'request_status',  v_row.request_status,
      'alerted_at',      now()
    );

    -- WARNING surfaces in Supabase Postgres logs and Logflare drain.
    RAISE WARNING '[FPR dead-letter] message_id=% request_id=% site=% template=% retried=%',
      v_row.message_id,
      v_row.request_id,
      v_row.site_code,
      v_row.template_key,
      v_row.retried_count;

    -- Realtime channel event for dashboard / external webhook bridges.
    PERFORM pg_notify('fpr_dead_letter_alert', v_payload::text);
  END LOOP;

  -- Emit a summary notice (even when count=0 so the cron job is observable).
  v_summary := jsonb_build_object(
    'alert',        'fpr_dead_letter_summary',
    'new_dead_count', v_count,
    'window',       '1 hour',
    'checked_at',   now()
  );

  IF v_count > 0 THEN
    RAISE WARNING '[FPR dead-letter] % new dead-letter message(s) in the last hour', v_count;
  ELSE
    RAISE NOTICE  '[FPR dead-letter] No new dead-letter messages in the last hour';
  END IF;

  PERFORM pg_notify('fpr_dead_letter_alert', v_summary::text);
END;
$$;

COMMENT ON FUNCTION public.fn_cron_alert_dead_letter_fpr() IS
  'pg_cron callback: scans v_fpr_outbound_dead_letter for rows created in the '
  'last hour, emits WARNING log entries (Logflare-visible), and pg_notify events '
  'on channel fpr_dead_letter_alert. Runs hourly via pg_cron job fpr-dead-letter-alert. '
  'See migration 0210.';

REVOKE ALL ON FUNCTION public.fn_cron_alert_dead_letter_fpr() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cron_alert_dead_letter_fpr() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. pg_cron schedule — every hour at minute 5 (offset from summary-refresh
--    at minute 0 in 0186 to avoid thundering-herd on the same cron tick)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Remove stale schedule if it exists (idempotent — safe on re-run).
  PERFORM cron.unschedule('fpr-dead-letter-alert');
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron not installed or job didn't exist; proceed.
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'fpr-dead-letter-alert',
    '5 * * * *',   -- every hour at HH:05
    'SELECT public.fn_cron_alert_dead_letter_fpr();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[0210] pg_cron not available — skipping fpr-dead-letter-alert schedule: %', SQLERRM;
END;
$$;

COMMENT ON VIEW public.v_fpr_outbound_dead_letter IS
  'Dead-letter LINE outbound messages (retried_count >= 3, status=dead) joined '
  'with their originating field_purchase_request. Used by the pg_cron alert job '
  'and the FPR dashboard for operator triage. Scheduled alert: every hour at HH:05 '
  'via pg_cron job fpr-dead-letter-alert. See migration 0210.';

COMMIT;

