-- =============================================================================
-- Rebind the eTax worker claim function to the partitioned table composite.
--
-- The 0182 function returned SETOF etax_submissions before migration 0196
-- renamed that relation. Its return type therefore remained bound to the
-- backup-table OID and every worker claim failed with SQLSTATE 42P13.
-- Also make the health-trend refresh log record the actual materialized-view
-- row count instead of GET DIAGNOSTICS after REFRESH (which reports zero).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public._etax_claim_batch(INT);

CREATE FUNCTION public._etax_claim_batch(p_limit INT DEFAULT 10)
RETURNS SETOF public.etax_submissions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH candidates AS (
    SELECT submission.id, submission.created_at
    FROM public.etax_submissions AS submission
    WHERE submission.status = 'queued'
    ORDER BY submission.created_at ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.etax_submissions AS submission
     SET status = 'submitting',
         last_attempt_at = NOW(),
         attempt_count = submission.attempt_count + 1,
         updated_at = NOW()
    FROM candidates
   WHERE submission.id = candidates.id
     AND submission.created_at = candidates.created_at
  RETURNING submission.*;
$function$;

REVOKE ALL ON FUNCTION public._etax_claim_batch(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._etax_claim_batch(INT) TO service_role;

COMMENT ON FUNCTION public._etax_claim_batch(INT) IS
  'Atomically claims queued rows from the partitioned eTax table using the '
  'partition-aware (id, created_at) key. Rebound 20270313.';

CREATE OR REPLACE FUNCTION public.fn_refresh_etax_health_trend_mv(
  p_triggered_by TEXT DEFAULT 'pg_cron'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  started_at TIMESTAMPTZ := clock_timestamp();
  row_total INTEGER;
  duration_ms INTEGER;
BEGIN
  IF p_triggered_by NOT IN ('pg_cron', 'manual', 'migration', 'test') THEN
    RAISE EXCEPTION 'Invalid triggered_by value: %', p_triggered_by;
  END IF;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_etax_health_trend;
  EXCEPTION
    WHEN object_not_in_prerequisite_state THEN
      REFRESH MATERIALIZED VIEW public.mv_etax_health_trend;
  END;

  SELECT count(*)::INT
    INTO row_total
    FROM public.mv_etax_health_trend;

  duration_ms := EXTRACT(
    EPOCH FROM (clock_timestamp() - started_at)
  ) * 1000;

  INSERT INTO public.etax_health_trend_mv_refresh_log (
    refreshed_at,
    duration_ms,
    row_count,
    triggered_by
  ) VALUES (
    NOW(),
    duration_ms,
    row_total,
    p_triggered_by
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'refreshed_at', NOW(),
    'duration_ms', duration_ms,
    'row_count', row_total,
    'triggered_by', p_triggered_by
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_refresh_etax_health_trend_mv(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_etax_health_trend_mv(TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.rpc_etax_compliance_dashboard()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_compliance_dashboard()
  TO authenticated;

COMMIT;
