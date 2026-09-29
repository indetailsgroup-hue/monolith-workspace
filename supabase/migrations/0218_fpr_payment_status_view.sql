-- =============================================================================
-- Migration 0218 — v_fpr_payment_status
-- View     : v_fpr_payment_status
-- Purpose  : Finance dashboard view — per-request payment and receiving state.
--            Joins field_purchase_request, fpr_payment (latest paid row),
--            and field_purchase_audit_log (payment_recorded event timestamp).
-- RLS      : security_invoker=false; role gate in WHERE clause (fail-closed).
-- Roles    : finance, governance, managing_director, project_manager
-- Idempotent: yes — CREATE OR REPLACE
-- Note     : org_id sourced from fpr_payment (NULL for unpaid FPRs).
--            field_purchase_request does not carry an org_id column.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- v_fpr_payment_status
--
-- Columns:
--   request_id          — FPR primary key
--   org_id              — tenant (from fpr_payment; NULL if no payment recorded)
--   site_code           — site reference
--   requester           — employee_id who submitted
--   fpr_amount          — original requested amount
--   fpr_status          — current FPR status
--   created_at          — FPR creation timestamp
--   received_at         — goods-received timestamp (NULL if not yet confirmed)
--   received_by         — actor who confirmed receipt
--   payment_id          — fpr_payment.id of the most recent paid payment (NULL = unpaid)
--   payment_status      — paid / pending / cancelled / NULL
--   payment_method      — cash / bank_transfer / cheque / promptpay / other / NULL
--   payment_reference   — cheque no / transfer ref / NULL
--   payment_amount      — amount recorded in fpr_payment (NULL if no payment)
--   paid_at             — timestamp payment was marked paid
--   paid_by             — actor who recorded the payment
--   vendor_code         — vendor reference (NULL if not specified)
--   payment_recorded_at — timestamp of the payment_recorded audit event
--   days_since_purchase — days elapsed since FPR created_at (for SLA monitoring)
--   is_paid             — boolean convenience flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fpr_payment_status
  WITH (security_invoker = false)
AS
SELECT
    fpr.id                      AS request_id,

    -- org_id lives on fpr_payment (NOT NULL there); NULL for unpaid FPRs
    pay.org_id,

    fpr.site_code,
    fpr.requester,
    fpr.amount                  AS fpr_amount,
    fpr.status                  AS fpr_status,
    fpr.created_at,
    fpr.received_at,
    fpr.received_by,

    -- Latest paid fpr_payment row for this request (NULL = no payment recorded)
    pay.id                      AS payment_id,
    pay.status                  AS payment_status,
    pay.payment_method,
    pay.payment_reference,
    pay.amount                  AS payment_amount,
    pay.paid_at,
    pay.paid_by,
    pay.vendor_code,

    -- Timestamp of the first payment_recorded audit event (chronological)
    aud.payment_recorded_at,

    -- SLA convenience: days since FPR was created
    (CURRENT_DATE - fpr.created_at::date)::integer AS days_since_purchase,

    -- Boolean flag for quick WHERE-clause filtering
    (pay.id IS NOT NULL AND pay.status = 'paid') AS is_paid

FROM public.field_purchase_request fpr

-- Latest paid payment for each FPR (ORDER BY paid_at DESC keeps most recent)
LEFT JOIN LATERAL (
    SELECT *
    FROM   public.fpr_payment fp
    WHERE  fp.request_id = fpr.id
      AND  fp.status = 'paid'
    ORDER BY fp.paid_at DESC NULLS LAST
    LIMIT 1
) pay ON true

-- Earliest payment_recorded audit event timestamp
LEFT JOIN LATERAL (
    SELECT min(al.created_at) AS payment_recorded_at
    FROM   public.field_purchase_audit_log al
    WHERE  al.request_id = fpr.id
      AND  al.event_type = 'payment_recorded'
) aud ON true

-- Role gate: finance / governance / managing_director / project_manager
WHERE
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY[
        'finance', 'managing_director', 'project_manager'
    ]);

COMMENT ON VIEW public.v_fpr_payment_status IS
  '0218 — Finance dashboard: per-FPR payment and receiving state. '
  'Joins field_purchase_request, fpr_payment (latest paid row), '
  'and field_purchase_audit_log (payment_recorded timestamp). '
  'Role-gated: finance, governance, managing_director, project_manager. '
  'security_invoker=false; role gate enforced by WHERE clause only. '
  'org_id sourced from fpr_payment (NULL for unpaid FPRs).';

-- Permissions
REVOKE ALL ON public.v_fpr_payment_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_fpr_payment_status TO authenticated;

COMMIT;
