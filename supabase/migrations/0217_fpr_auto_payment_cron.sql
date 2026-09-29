-- =============================================================================
-- Migration 0217 — FPR Auto-Payment pg_cron Schedule
-- Function : rpc_auto_record_fpr_payments()
-- Schedule : nightly at 01:00 Asia/Bangkok (18:00 UTC)
-- Purpose  : Find all purchased FPRs older than 24 h with no fpr_payment row
--            and auto-record a cash payment using the FPR's own amount.
--            Delegates to rpc_bulk_record_fpr_payment for idempotency/audit.
-- Constraints: SECURITY DEFINER, idempotent (idem_key = 'auto-pay-<request_id>'),
--              append-only audit via rpc_bulk_record_fpr_payment, no client path.
-- Idempotent migration: yes — DROP IF EXISTS + cron.schedule upsert via unschedule.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. rpc_auto_record_fpr_payments
--    Called by pg_cron. Builds the payment_records batch from all
--    purchased FPRs older than 24 h that have no fpr_payment row yet,
--    then calls rpc_bulk_record_fpr_payment once per org to avoid
--    cross-tenant data in a single batch.
--
--    Returns a summary payload suitable for audit / cron log inspection.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_auto_record_fpr_payments();
CREATE OR REPLACE FUNCTION public.rpc_auto_record_fpr_payments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff       timestamptz := now() - interval '24 hours';
    v_batch        jsonb;
    v_result       jsonb;
    v_total_proc   int := 0;
    v_total_skip   int := 0;
    v_org_ids      uuid[];
    v_org_id       uuid;
BEGIN
    -- Collect distinct orgs that have eligible FPRs
    SELECT array_agg(DISTINCT fpr.org_id)
    INTO   v_org_ids
    FROM   public.field_purchase_request fpr
    WHERE  fpr.status     = 'purchased'
      AND  fpr.created_at < v_cutoff
      AND  NOT EXISTS (
               SELECT 1
               FROM   public.fpr_payment fp
               WHERE  fp.request_id = fpr.id
           );

    IF v_org_ids IS NULL THEN
        RETURN jsonb_build_object(
            'ok',              true,
            'processed_count', 0,
            'skipped_count',   0,
            'orgs_processed',  0,
            'run_at',          now()
        );
    END IF;

    -- Process one org at a time to keep batches tenant-scoped
    FOREACH v_org_id IN ARRAY v_org_ids LOOP
        SELECT jsonb_agg(
            jsonb_build_object(
                'request_id',      fpr.id,
                'amount',          fpr.amount,
                'payment_method',  'cash',
                'currency',        'THB',
                -- deterministic idempotency key prevents duplicate runs
                'idempotency_key', 'auto-pay-' || fpr.id::text
            )
        )
        INTO v_batch
        FROM public.field_purchase_request fpr
        WHERE fpr.org_id    = v_org_id
          AND fpr.status    = 'purchased'
          AND fpr.created_at < v_cutoff
          AND NOT EXISTS (
              SELECT 1
              FROM   public.fpr_payment fp
              WHERE  fp.request_id = fpr.id
          );

        IF v_batch IS NULL THEN CONTINUE; END IF;

        v_result := public.rpc_bulk_record_fpr_payment(
            jsonb_build_object('payment_records', v_batch)
        );

        v_total_proc := v_total_proc + coalesce((v_result->>'processed_count')::int, 0);
        v_total_skip := v_total_skip + coalesce((v_result->>'skipped_count')::int, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'ok',              true,
        'processed_count', v_total_proc,
        'skipped_count',   v_total_skip,
        'orgs_processed',  array_length(v_org_ids, 1),
        'run_at',          now()
    );
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_auto_record_fpr_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_auto_record_fpr_payments()
    TO service_role;

COMMENT ON FUNCTION public.rpc_auto_record_fpr_payments() IS
  '0217 — pg_cron nightly job: auto-record cash payment for purchased FPRs '
  'older than 24 h with no fpr_payment row. '
  'Idempotent: uses deterministic key auto-pay-<request_id>. '
  'Delegates to rpc_bulk_record_fpr_payment (0215) for audit + idempotency.';

-- ---------------------------------------------------------------------------
-- 2. pg_cron schedule — nightly at 01:00 Asia/Bangkok = 18:00 UTC
--    Uses cron.unschedule() first so re-running the migration is safe.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Remove any existing schedule with this name (idempotent)
    PERFORM cron.unschedule('fpr-auto-payment-nightly')
    WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'fpr-auto-payment-nightly'
    );
EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE '0217: pg_cron extension not available — skipping schedule registration';
    RETURN;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'fpr-auto-payment-nightly',   -- job name
            '0 18 * * *',                 -- 18:00 UTC = 01:00 Asia/Bangkok
            'SELECT public.rpc_auto_record_fpr_payments()'
        );
        RAISE NOTICE '0217: pg_cron job "fpr-auto-payment-nightly" registered (18:00 UTC)';
    ELSE
        RAISE NOTICE '0217: pg_cron not installed — job not scheduled; function is cron-ready';
    END IF;
END;
$$;

COMMIT;
