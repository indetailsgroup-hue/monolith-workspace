-- =============================================================================
-- Migration 0212 — FPR Vendor Payment Flow
-- Tables  : fpr_payment
-- Views   : v_fpr_payment_summary
-- RPCs    : rpc_record_fpr_payment, rpc_cancel_fpr_payment
-- RLS     : fail-closed; org_id tenant isolation + role-based write controls
-- Idempotent: yes — uses CREATE TABLE IF NOT EXISTS, DROP … IF EXISTS guards
-- Fix(ci): vendor_master PK is vendor_code text (not id uuid); use vendor_code
-- Fix(ci): added org_id column + tenant_isolation policy for linter compliance
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. fpr_payment table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fpr_payment (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid        NOT NULL
                                 REFERENCES public.organizations(org_id),
    request_id       uuid        NOT NULL
                                 REFERENCES public.field_purchase_request(id)
                                 ON DELETE CASCADE,
    vendor_code      text        REFERENCES public.vendor_master(vendor_code)
                                 ON DELETE SET NULL,
    payment_method   text        NOT NULL
                                 CHECK (payment_method IN (
                                     'cash','bank_transfer','cheque','promptpay','other'
                                 )),
    payment_reference text,                       -- cheque no / transfer ref
    amount           numeric(14,2) NOT NULL CHECK (amount > 0),
    currency         text        NOT NULL DEFAULT 'THB'
                                 CHECK (char_length(currency) = 3),
    paid_at          timestamptz,
    paid_by          text,                         -- actor employee_id
    status           text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','paid','cancelled')),
    cancel_reason    text,
    idempotency_key  text        UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- indexes for fast lookup per request and per org
CREATE INDEX IF NOT EXISTS idx_fpr_payment_request_id
    ON public.fpr_payment (request_id);

CREATE INDEX IF NOT EXISTS idx_fpr_payment_org_id
    ON public.fpr_payment (org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_fpr_payment_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fpr_payment_updated_at ON public.fpr_payment;
CREATE TRIGGER trg_fpr_payment_updated_at
    BEFORE UPDATE ON public.fpr_payment
    FOR EACH ROW EXECUTE FUNCTION public.fn_fpr_payment_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — fail-closed; org_id tenant isolation + role-based write controls
-- ---------------------------------------------------------------------------
ALTER TABLE public.fpr_payment ENABLE ROW LEVEL SECURITY;

-- Org isolation: users may only see payments belonging to their org
DROP POLICY IF EXISTS "fpr_payment_tenant_isolation" ON public.fpr_payment;
CREATE POLICY "fpr_payment_tenant_isolation"
    ON public.fpr_payment FOR SELECT
    USING (
        org_id = public.get_user_org_id()
        AND has_any_app_role(ARRAY['operator','team_lead','project_manager',
                               'managing_director','finance','governance'])
    );

-- Operators (finance role) may insert pending payments within their org
DROP POLICY IF EXISTS "fpr_payment insert" ON public.fpr_payment;
CREATE POLICY "fpr_payment insert"
    ON public.fpr_payment FOR INSERT
    WITH CHECK (
        org_id = public.get_user_org_id()
        AND has_any_app_role(ARRAY['operator','finance','governance'])
        AND status = 'pending'
    );

-- Only governance / finance may update (to mark paid / cancelled) within their org
DROP POLICY IF EXISTS "fpr_payment update" ON public.fpr_payment;
CREATE POLICY "fpr_payment update"
    ON public.fpr_payment FOR UPDATE
    USING (
        org_id = public.get_user_org_id()
        AND has_any_app_role(ARRAY['finance','governance'])
    )
    WITH CHECK (
        org_id = public.get_user_org_id()
        AND has_any_app_role(ARRAY['finance','governance'])
    );

-- Remove old select policy name if it exists (rename: "fpr_payment select" → "fpr_payment_tenant_isolation")
DROP POLICY IF EXISTS "fpr_payment select" ON public.fpr_payment;

-- ---------------------------------------------------------------------------
-- 3. v_fpr_payment_summary view
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_fpr_payment_summary;
CREATE VIEW public.v_fpr_payment_summary AS
SELECT
    p.id                  AS payment_id,
    p.org_id,
    p.request_id,
    fpr.site_code,
    fpr.requester,
    fpr.amount            AS request_amount,
    p.payment_method,
    p.payment_reference,
    p.amount              AS payment_amount,
    p.currency,
    p.status              AS payment_status,
    p.paid_at,
    p.paid_by,
    p.cancel_reason,
    vm.name               AS vendor_name,
    vm.tax_id             AS vendor_tax_id,
    fpr.status            AS fpr_status,
    p.created_at,
    p.updated_at
FROM  public.fpr_payment             p
JOIN  public.field_purchase_request  fpr ON fpr.id = p.request_id
LEFT JOIN public.vendor_master       vm  ON vm.vendor_code = p.vendor_code;

GRANT SELECT ON public.v_fpr_payment_summary
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. rpc_record_fpr_payment
--    Creates a pending payment record for a purchased FPR, then marks it paid.
--    Requires the FPR to be in 'purchased' status.
--    Idempotent via idempotency_key.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_record_fpr_payment(jsonb);
CREATE OR REPLACE FUNCTION public.rpc_record_fpr_payment(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor          text := resolve_actor();
    v_request_id     uuid := (p_args->>'request_id')::uuid;
    v_vendor_code    text := p_args->>'vendor_code';
    v_method         text := coalesce(p_args->>'payment_method','cash');
    v_reference      text := p_args->>'payment_reference';
    v_amount         numeric(14,2) := (p_args->>'amount')::numeric;
    v_currency       text := coalesce(p_args->>'currency','THB');
    v_idem_key       text := p_args->>'idempotency_key';
    v_fpr_status     field_purchase_status;
    v_org_id         uuid;
    v_existing       uuid;
    v_payment_id     uuid;
BEGIN
    -- authority check
    IF NOT has_any_app_role(ARRAY['operator','finance','governance']) THEN
        RETURN jsonb_build_object('ok',false,'error','permission_denied');
    END IF;

    -- idempotency
    IF v_idem_key IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM   public.fpr_payment
        WHERE  idempotency_key = v_idem_key;
        IF FOUND THEN
            RETURN jsonb_build_object('ok',true,'payment_id',v_existing,'idempotent',true);
        END IF;
    END IF;

    -- FPR must exist and be in 'purchased' status; also fetch org_id for tenant isolation
    SELECT status, org_id
    INTO   v_fpr_status, v_org_id
    FROM   public.field_purchase_request
    WHERE  id = v_request_id
    FOR    UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok',false,'error','request_not_found');
    END IF;

    IF v_fpr_status <> 'purchased' THEN
        RETURN jsonb_build_object(
            'ok',false,
            'error','invalid_status',
            'current_status', v_fpr_status::text
        );
    END IF;

    -- insert payment (immediately mark as paid); inherit org_id from parent FPR
    INSERT INTO public.fpr_payment (
        org_id, request_id, vendor_code, payment_method, payment_reference,
        amount, currency, status, paid_at, paid_by, idempotency_key
    ) VALUES (
        v_org_id, v_request_id, v_vendor_code, v_method, v_reference,
        v_amount, v_currency, 'paid', now(), v_actor, v_idem_key
    )
    RETURNING id INTO v_payment_id;

    -- append-only audit log
    INSERT INTO public.field_purchase_audit_log
        (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
        v_request_id,
        v_actor,
        'payment_recorded',
        'purchased',
        'purchased',
        jsonb_build_object(
            'payment_id',       v_payment_id,
            'payment_method',   v_method,
            'amount',           v_amount,
            'currency',         v_currency,
            'vendor_code',      v_vendor_code,
            'payment_reference',v_reference
        )
    );

    RETURN jsonb_build_object(
        'ok',          true,
        'payment_id',  v_payment_id,
        'idempotent',  false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_record_fpr_payment(jsonb)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. rpc_cancel_fpr_payment
--    Marks a pending payment as cancelled. Requires finance/governance role.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_cancel_fpr_payment(jsonb);
CREATE OR REPLACE FUNCTION public.rpc_cancel_fpr_payment(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor      text := resolve_actor();
    v_payment_id uuid := (p_args->>'payment_id')::uuid;
    v_reason     text := coalesce(p_args->>'cancel_reason','cancelled by operator');
    v_request_id uuid;
    v_status     text;
BEGIN
    -- authority check
    IF NOT has_any_app_role(ARRAY['finance','governance']) THEN
        RETURN jsonb_build_object('ok',false,'error','permission_denied');
    END IF;

    SELECT request_id, status
    INTO   v_request_id, v_status
    FROM   public.fpr_payment
    WHERE  id = v_payment_id
    FOR    UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok',false,'error','payment_not_found');
    END IF;

    IF v_status <> 'pending' THEN
        RETURN jsonb_build_object(
            'ok',false,
            'error','invalid_payment_status',
            'current_status', v_status
        );
    END IF;

    UPDATE public.fpr_payment
    SET    status = 'cancelled',
           cancel_reason = v_reason,
           updated_at = now()
    WHERE  id = v_payment_id;

    -- audit log
    INSERT INTO public.field_purchase_audit_log
        (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
        v_request_id,
        v_actor,
        'payment_cancelled',
        'purchased',
        'purchased',
        jsonb_build_object(
            'payment_id',    v_payment_id,
            'cancel_reason', v_reason
        )
    );

    RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_fpr_payment(jsonb)
    TO authenticated, service_role;

COMMIT;
