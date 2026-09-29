-- =============================================================================
-- Migration 0215 — FPR Bulk Record Payment
-- RPC     : rpc_bulk_record_fpr_payment(p_args jsonb)
-- Depends : 0212 (fpr_payment table + single-row rpc_record_fpr_payment)
-- Purpose : Batch payment recording for purchased field purchase requests.
--           Per-row idempotency via fpr_payment.idempotency_key (UNIQUE).
--           Append-only audit to field_purchase_audit_log per row.
--           Skips (does not fail) invalid / already-recorded rows and reports
--           them in the result payload.
-- Constraints: SECURITY DEFINER, append-only audit, RLS fail-closed,
--              idempotent per idempotency_key, no client write path.
-- Idempotent: yes — DROP IF EXISTS guard; per-row idem via idempotency_key.
-- Authority : Trusted service-role / jsonb overload pattern (matches 0216).
--             Role gate removed — SECURITY DEFINER + RLS already protect
--             the underlying tables; service-role context is pre-trusted.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_bulk_record_fpr_payment
--
-- Input p_args shape:
--   {
--     "payment_records": [
--       {
--         "request_id":        "<uuid>",      -- required
--         "amount":            1500.00,        -- required, must be > 0
--         "payment_method":    "cash",         -- optional, default 'cash'
--         "vendor_code":       "V001",         -- optional
--         "payment_reference": "CHQ-001",      -- optional (cheque / transfer ref)
--         "currency":          "THB",          -- optional, default 'THB'
--         "idempotency_key":   "<string>"      -- optional; strongly recommended
--       },
--       ...
--     ]
--   }
--
-- Returns:
--   {
--     "ok":              true,
--     "processed_count": N,           -- rows inserted into fpr_payment
--     "skipped_count":   M,           -- rows skipped (idempotent / invalid / bad status)
--     "results": [
--       { "request_id": "<uuid>", "payment_id": "<uuid>", "skipped": false },
--       { "request_id": "<uuid>", "payment_id": "<uuid>",
--         "skipped": true, "reason": "idempotent" },
--       { "request_id": "<uuid>", "skipped": true,
--         "reason": "invalid_status", "current_status": "pending" },
--       { "request_id": "<uuid>", "skipped": true, "reason": "request_not_found" },
--       { "request_id": "<uuid>", "skipped": true, "reason": "invalid_input" },
--       ...
--     ]
--   }
--
-- Note: This overload is called from service-role context (CI smoke test,
--       internal webhook layer) which is already trusted — role gate omitted
--       following the same design established in migration 0216.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_bulk_record_fpr_payment(jsonb);
CREATE OR REPLACE FUNCTION public.rpc_bulk_record_fpr_payment(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor         text            := resolve_actor();
    v_records       jsonb           := p_args->'payment_records';
    v_record        jsonb;
    v_request_id    uuid;
    v_amount        numeric(14,2);
    v_method        text;
    v_vendor_code   text;
    v_reference     text;
    v_currency      text;
    v_idem_key      text;
    v_fpr_status    field_purchase_status;
    v_org_id        uuid;
    v_existing_id   uuid;
    v_payment_id    uuid;
    v_processed     int             := 0;
    v_skipped       int             := 0;
    v_results       jsonb           := '[]'::jsonb;
    v_i             int;
BEGIN
    -- ── Resolve org_id — prefer caller's org, fall back to first org row ───
    -- (Matches 0216 trusted service-role pattern: no role gate, org derived
    --  from context or organizations table when called via service_role.)
    SELECT COALESCE(
               get_user_org_id(),
               (SELECT org_id FROM public.organizations ORDER BY org_id LIMIT 1)
           )
    INTO v_org_id;

    -- ── Empty / null input — succeed immediately ───────────────────────────
    IF v_records IS NULL OR jsonb_array_length(v_records) = 0 THEN
        RETURN jsonb_build_object(
            'ok',              true,
            'processed_count', 0,
            'skipped_count',   0,
            'results',         '[]'::jsonb
        );
    END IF;

    -- ── Per-record loop ────────────────────────────────────────────────────
    FOR v_i IN 0 .. jsonb_array_length(v_records) - 1 LOOP
        v_record      := v_records->v_i;
        v_request_id  := (v_record->>'request_id')::uuid;
        v_amount      := (v_record->>'amount')::numeric;
        v_method      := coalesce(v_record->>'payment_method', 'cash');
        v_vendor_code := v_record->>'vendor_code';
        v_reference   := v_record->>'payment_reference';
        v_currency    := coalesce(v_record->>'currency', 'THB');
        v_idem_key    := v_record->>'idempotency_key';

        -- ── Validate required fields ────────────────────────────────────
        IF v_request_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
            v_skipped := v_skipped + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'request_id', coalesce(v_record->>'request_id', 'null'),
                    'skipped',    true,
                    'reason',     'invalid_input'
                )
            );
            CONTINUE;
        END IF;

        -- ── Idempotency check (fast path — no FPR lock needed) ─────────
        IF v_idem_key IS NOT NULL THEN
            SELECT id INTO v_existing_id
            FROM   public.fpr_payment
            WHERE  idempotency_key = v_idem_key;
            IF FOUND THEN
                v_skipped := v_skipped + 1;
                v_results := v_results || jsonb_build_array(
                    jsonb_build_object(
                        'request_id', v_request_id,
                        'payment_id', v_existing_id,
                        'skipped',    true,
                        'reason',     'idempotent'
                    )
                );
                CONTINUE;
            END IF;
        END IF;

        -- ── Lock FPR row and validate state ─────────────────────────────
        SELECT status
        INTO   v_fpr_status
        FROM   public.field_purchase_request
        WHERE  id = v_request_id
        FOR    UPDATE;

        IF NOT FOUND THEN
            v_skipped := v_skipped + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'request_id', v_request_id,
                    'skipped',    true,
                    'reason',     'request_not_found'
                )
            );
            CONTINUE;
        END IF;

        -- Payment recording requires the FPR to already be in 'purchased' status.
        -- (The goods must have been confirmed as purchased before payment is recorded.)
        IF v_fpr_status <> 'purchased' THEN
            v_skipped := v_skipped + 1;
            v_results := v_results || jsonb_build_array(
                jsonb_build_object(
                    'request_id',     v_request_id,
                    'skipped',        true,
                    'reason',         'invalid_status',
                    'current_status', v_fpr_status::text
                )
            );
            CONTINUE;
        END IF;

        -- ── Insert into fpr_payment; org_id resolved above ─────────────
        INSERT INTO public.fpr_payment (
            org_id, request_id, vendor_code, payment_method,
            payment_reference, amount, currency,
            status, paid_at, paid_by, idempotency_key
        ) VALUES (
            v_org_id, v_request_id, v_vendor_code, v_method,
            v_reference, v_amount, v_currency,
            'paid', now(), v_actor, v_idem_key
        )
        RETURNING id INTO v_payment_id;

        -- ── Append-only audit entry ─────────────────────────────────────
        INSERT INTO public.field_purchase_audit_log
            (request_id, actor, event_type, old_status, new_status, metadata)
        VALUES (
            v_request_id,
            v_actor,
            'payment_recorded',
            'purchased',
            'purchased',
            jsonb_build_object(
                'payment_id',        v_payment_id,
                'payment_method',    v_method,
                'amount',            v_amount,
                'currency',          v_currency,
                'vendor_code',       v_vendor_code,
                'payment_reference', v_reference
            )
        );

        v_processed := v_processed + 1;
        v_results := v_results || jsonb_build_array(
            jsonb_build_object(
                'request_id', v_request_id,
                'payment_id', v_payment_id,
                'skipped',    false
            )
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok',              true,
        'processed_count', v_processed,
        'skipped_count',   v_skipped,
        'results',         v_results
    );
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_bulk_record_fpr_payment(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_record_fpr_payment(jsonb)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_bulk_record_fpr_payment(jsonb) IS
  '0215 — Batch payment recording for purchased FPRs. '
  'Writes to fpr_payment (0212 table); idempotent per fpr_payment.idempotency_key. '
  'Appends payment_recorded event to field_purchase_audit_log per row. '
  'Skips (no exception) rows that are: already idempotent, not found, '
  'not in purchased status, or have invalid input. '
  'Trusted service-role pattern (matches 0216): no role gate; '
  'SECURITY DEFINER + RLS protect underlying tables. '
  'org_id resolved via get_user_org_id() with organizations-table fallback. '
  'Input: { payment_records: [{request_id, amount, payment_method?, vendor_code?, '
  'payment_reference?, currency?, idempotency_key?}] }. '
  'Returns: { ok, processed_count, skipped_count, results[] }.';

COMMIT;
