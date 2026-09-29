-- ============================================================
-- Migration 0181 — v_field_purchase_request_summary
--
-- Read-optimised view joining field_purchase_request with
-- journal_entry, journal_line (G-4 double-entry legs), and
-- ledger_account (COA name lookup).
--
-- Depends:
--   0176_field_purchase_core   — field_purchase_request, ENUMs
--   0066_ledger_engine         — journal_entry, journal_line,
--                                ledger_account
--
-- Security model:
--   • security_invoker = true (PG 15+)
--     Underlying table-level RLS from field_purchase_request,
--     journal_entry, and journal_line is inherited automatically;
--     no policy duplication required.
--   • View body adds an explicit role gate so that even if an
--     unprivileged caller somehow passes the underlying RLS they
--     still see zero rows — fail-closed by design.
--   • Technicians use field_purchase_request directly (they own
--     their own rows). This view is for PM / MD oversight only.
-- ============================================================

BEGIN;

-- ── Drop prior version if re-running idempotently ──────────
DROP VIEW IF EXISTS public.v_field_purchase_request_summary;

-- ── View ───────────────────────────────────────────────────
CREATE VIEW public.v_field_purchase_request_summary
WITH (security_invoker = true)
AS
SELECT
    -- ── Core request fields ────────────────────────────────
    r.id                                    AS request_id,
    r.project_id,
    r.work_item_id,
    r.site_code,
    r.requester,
    r.amount,
    r.reason,
    r.item_hint,
    r.photo_refs,
    r.status,
    r.approval_level,
    r.approver,
    r.approved_at,
    r.rejection_note,
    r.line_message_id,
    r.idempotency_key,
    r.created_at,
    r.updated_at,

    -- ── Journal entry header ───────────────────────────────
    -- NULL when request has not yet been marked purchased
    je.id                                   AS journal_entry_id,
    je.entry_date                           AS journal_entry_date,
    je.description                          AS journal_description,

    -- ── Debit leg — 5050 ค่าวัสดุสิ้นเปลือง (Expense) ────
    jl_dr.account_code                      AS debit_account_code,
    la_dr.name                              AS debit_account_name,
    jl_dr.debit                             AS debit_amount,

    -- ── Credit leg — 1010 เงินสดและเงินฝากธนาคาร (Asset) ─
    jl_cr.account_code                      AS credit_account_code,
    la_cr.name                              AS credit_account_name,
    jl_cr.credit                            AS credit_amount

FROM public.field_purchase_request r

-- ── Journal entry linked via source_ref JSONB pointer ─────
-- rpc_mark_field_purchase_purchased (0180) writes:
--   source_ref = jsonb_build_object('field_purchase_request_id', p_request_id)
LEFT JOIN public.journal_entry je
    ON  je.source_ref->>'field_purchase_request_id' = r.id::text

-- ── Debit leg: Expense 5050 ────────────────────────────────
LEFT JOIN public.journal_line jl_dr
    ON  jl_dr.journal_entry_id = je.id
    AND jl_dr.account_code     = '5050'

-- ── Credit leg: Cash/Bank 1010 ────────────────────────────
LEFT JOIN public.journal_line jl_cr
    ON  jl_cr.journal_entry_id = je.id
    AND jl_cr.account_code     = '1010'

-- ── COA name lookup (static — two rows, no RLS overhead) ──
LEFT JOIN public.ledger_account la_dr ON la_dr.code = '5050'
LEFT JOIN public.ledger_account la_cr ON la_cr.code = '1010'

-- ── Role gate ─────────────────────────────────────────────
-- Fail-closed: only project_manager, managing_director, and
-- governance roles can read summary rows.  Technicians must
-- query field_purchase_request (their own rows) directly.
WHERE
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director']);

-- ── Object documentation ───────────────────────────────────
COMMENT ON VIEW public.v_field_purchase_request_summary IS
'Read-optimised summary of field purchase requests joined to G-4 double-entry ledger data (Dr 5050 ค่าวัสดุสิ้นเปลือง / Cr 1010 เงินสดและเงินฝากธนาคาร). '
'Requests that have not yet been marked purchased appear with NULL ledger columns (LEFT JOINs). '
'Access is restricted to project_manager, managing_director, and governance roles. '
'Uses security_invoker = true so underlying table-level RLS is inherited without duplication. '
'Depends on 0176_field_purchase_core and 0066_ledger_engine.';

-- ── Privileges ────────────────────────────────────────────
-- Revoke any prior over-broad grants before re-granting.
REVOKE ALL ON public.v_field_purchase_request_summary
    FROM PUBLIC, anon, authenticated;

-- Authenticated role — row visibility is still enforced by
-- the view's WHERE clause and the underlying table RLS.
GRANT SELECT ON public.v_field_purchase_request_summary
    TO authenticated;

COMMIT;
