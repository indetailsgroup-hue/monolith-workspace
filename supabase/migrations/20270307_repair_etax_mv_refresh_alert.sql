-- =============================================================================
-- Repair the system-level eTax materialized-view refresh-lag alert contract.
--
-- Migration 0188 intentionally writes alert rows without an organization,
-- submission, or status transition.  The audit table still required org_id and
-- new_status, so every critical alert raised a NOT NULL violation.  The alert
-- function caught that exception and the cron invocation appeared successful
-- even though no alert was persisted.
--
-- Keep ordinary audit rows tenant-scoped and transition-scoped with CHECK
-- constraints, while allowing only trigger_source = 'system' to use NULL for
-- the three fields that do not apply to infrastructure alerts.
-- =============================================================================

BEGIN;

ALTER TABLE public.etax_submission_audit_log
  ALTER COLUMN org_id DROP NOT NULL,
  ALTER COLUMN new_status DROP NOT NULL;

ALTER TABLE public.etax_submission_audit_log
  DROP CONSTRAINT IF EXISTS chk_etax_audit_org_or_system,
  ADD CONSTRAINT chk_etax_audit_org_or_system
    CHECK (org_id IS NOT NULL OR trigger_source = 'system'),
  DROP CONSTRAINT IF EXISTS chk_etax_audit_status_or_system,
  ADD CONSTRAINT chk_etax_audit_status_or_system
    CHECK (new_status IS NOT NULL OR trigger_source = 'system');

CREATE OR REPLACE FUNCTION public.fn_mv_refresh_lag_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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

  IF v_freshness IS NULL THEN
    v_lag_seconds  := EXTRACT(EPOCH FROM (now() - '1970-01-01'::timestamptz));
    v_freshness    := 'critical';
    v_last_refresh := NULL;
    v_duration_ms  := NULL;
    v_row_count    := NULL;
    v_triggered_by := 'none';
  END IF;

  IF v_freshness <> 'critical' THEN
    RETURN;
  END IF;

  -- Serialize concurrent cron/manual invocations before the dedup lookup.
  -- The transaction-scoped lock is released automatically on return.
  PERFORM pg_advisory_xact_lock(hashtext('etax:mv_refresh_lag_alert'));

  SELECT max(changed_at)
    INTO v_recent_alert
    FROM public.etax_submission_audit_log
   WHERE trigger_source = 'system'
     AND metadata->>'alert_type' = 'mv_refresh_critical'
     AND changed_at > now() - v_dedup_window;

  IF v_recent_alert IS NOT NULL THEN
    RETURN;
  END IF;

  v_alert_metadata := jsonb_build_object(
    'alert_type',        'mv_refresh_critical',
    'lag_seconds',       v_lag_seconds,
    'freshness_status',  v_freshness,
    'last_refreshed_at', COALESCE(v_last_refresh::text, 'never'),
    'duration_ms',       v_duration_ms,
    'row_count',         v_row_count,
    'triggered_by',      COALESCE(v_triggered_by, 'unknown'),
    'detected_at',       now()::text,
    'threshold_seconds', 1800,
    'cron_job',          'check-mv-refresh-lag'
  );

  INSERT INTO public.etax_submission_audit_log (
    submission_id,
    org_id,
    actor_id,
    actor_role,
    old_status,
    new_status,
    old_pdf_status,
    new_pdf_status,
    trigger_source,
    rd_ref_no,
    attempt_count,
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
    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mv_refresh_lag_alert()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mv_refresh_lag_alert()
  TO postgres, service_role;

COMMENT ON FUNCTION public.fn_mv_refresh_lag_alert() IS
  'Persists a system audit alert when the eTax compliance MV refresh lag is '
  'critical. Concurrent calls are serialized for a strict 30-minute dedup '
  'window. Schema or persistence errors remain observable to pg_cron. Repaired '
  '20270307.';

COMMIT;
