-- =============================================================================
-- Migration 0184: v_field_purchase_request_summary v2
--   1. Materialised view  mv_fpr_summary_raw     — raw FPR + ledger join, no gate
--   2. Unique index                               — required for CONCURRENTLY refresh
--   3. Recreates v_field_purchase_request_summary — security_invoker=false,
--      reads from MV, adds computed age_days (always fresh)
--   4. rpc_refresh_fpr_summary()                 — SECURITY DEFINER, MD/governance only
--
-- Supersedes: 0181 (view dropped and recreated below)
-- Prerequisite migrations: 0176 (core), 0180 (ledger), 0181 (prior view), 0182 (queue RPC)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the 0181 view so we can recreate it pointing to the materialised view
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_field_purchase_request_summary;

-- ---------------------------------------------------------------------------
-- 2. Materialised view: mv_fpr_summary_raw
--
--    Contains all FPR rows joined to journal_entry, journal_line, and
--    ledger_account. No role gate here — access is via the view only.
--    age_days is NOT included; it is computed dynamically in the view so it
--    is always current between refreshes (no stale-date problem).
--
--    journal_line join pattern confirmed from 0066 / 0180:
--      jl_dr  — debit  side (debit > 0)  → account 5050 (expense)
--      jl_cr  — credit side (credit > 0) → account 1010 (cash/bank)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_fpr_summary_raw AS
SELECT
  -- ── Field Purchase Request ──────────────────────────────────────────────
  fpr.id                    AS request_id,
  fpr.project_id,
  fpr.work_item_id,
  fpr.site_code,
  fpr.requester,
  fpr.amount,
  fpr.reason,
  fpr.item_hint,
  fpr.photo_refs,
  fpr.status,
  fpr.approval_level,
  fpr.approver,
  fpr.approved_at,
  fpr.rejection_note,
  fpr.idempotency_key,
  fpr.line_message_id,
  fpr.created_at,
  fpr.updated_at,
  -- ── Journal Entry (written by rpc_mark_field_purchase_purchased) ────────
  je.id                     AS journal_entry_id,
  je.source_ref->>'ref_code' AS journal_ref_code,
  je.description            AS journal_description,
  je.created_at             AS journal_posted_at,
  -- ── Debit line: account 5050 ค่าวัสดุสิ้นเปลือง (expense) ────────────
  jl_dr.account_code        AS debit_account_code,
  la_dr.name                AS debit_account_name,
  jl_dr.debit               AS debit_amount,
  -- ── Credit line: account 1010 เงินสดและเงินฝากธนาคาร (asset) ─────────
  jl_cr.account_code        AS credit_account_code,
  la_cr.name                AS credit_account_name,
  jl_cr.credit              AS credit_amount

FROM public.field_purchase_request fpr

-- Journal entry linked by source_table / source_id (0066 ledger_engine pattern)
LEFT JOIN public.journal_entry je
       ON je.source_ref->>'source_table' = 'field_purchase_request'
      AND je.source_ref->>'source_id'   = fpr.id::text

-- Debit side of the double-entry
LEFT JOIN public.journal_line jl_dr
       ON jl_dr.journal_entry_id = je.id
      AND jl_dr.debit > 0

LEFT JOIN public.ledger_account la_dr
       ON la_dr.code = jl_dr.account_code

-- Credit side of the double-entry
LEFT JOIN public.journal_line jl_cr
       ON jl_cr.journal_entry_id = je.id
      AND jl_cr.credit > 0

LEFT JOIN public.ledger_account la_cr
       ON la_cr.code = jl_cr.account_code

WITH DATA;

COMMENT ON MATERIALIZED VIEW public.mv_fpr_summary_raw IS
  'Raw materialized cache of field_purchase_request joined to ledger data. '
  'No role gate — sole access path is v_field_purchase_request_summary. '
  'Refresh via rpc_refresh_fpr_summary(). '
  'NOTE: no pg_cron schedule added here (not in scope); function is '
  'cron-compatible if a later migration adds a schedule. Migration 0184.';

-- ---------------------------------------------------------------------------
-- 3. Unique index — required for REFRESH MATERIALIZED VIEW CONCURRENTLY
--    (CONCURRENTLY does not acquire an AccessExclusiveLock; reads stay live)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uix_mv_fpr_summary_raw_request_id
  ON public.mv_fpr_summary_raw (request_id);

-- ---------------------------------------------------------------------------
-- 4. Lock down direct access to the materialised view.
--    v_field_purchase_request_summary is the only sanctioned read path.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.mv_fpr_summary_raw
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recreate v_field_purchase_request_summary
--
--    Changes from 0181:
--      • security_invoker = false  (view owner executes; not the calling user,
--        so the role gate in the WHERE clause is the single control point)
--      • Backed by mv_fpr_summary_raw instead of live JOIN chain
--      • Adds computed age_days = CURRENT_DATE − created_at::date
--        Computed dynamically from live CURRENT_DATE, so it is always current
--        regardless of when the materialised view was last refreshed.
--      • Role gate (WHERE clause) is identical to 0181.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_field_purchase_request_summary
  WITH (security_invoker = false)
AS
SELECT
  mv.*,
  -- age_days is intentionally NOT stored in the MV — computing it here
  -- against CURRENT_DATE means it is always fresh even between refreshes.
  (CURRENT_DATE - mv.created_at::date)::integer AS age_days
FROM public.mv_fpr_summary_raw mv
WHERE
  public.is_governance_role()
  OR public.has_any_app_role(ARRAY['project_manager', 'managing_director']);

COMMENT ON VIEW public.v_field_purchase_request_summary IS
  'FPR summary with ledger join and computed age_days (always current). '
  'Role-gated: project_manager, managing_director, or governance. '
  'Backed by mv_fpr_summary_raw; refresh via rpc_refresh_fpr_summary(). '
  'security_invoker=false: role gate enforced by WHERE clause only. Migration 0184.';

-- Permissions (unchanged from 0181)
REVOKE ALL ON public.v_field_purchase_request_summary FROM PUBLIC, anon;
GRANT  SELECT ON public.v_field_purchase_request_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. rpc_refresh_fpr_summary — SECURITY DEFINER materialised view refresher
--
--    Authority: managing_director or governance only.
--    Executes REFRESH MATERIALIZED VIEW CONCURRENTLY (no AccessExclusiveLock;
--    concurrent reads on v_field_purchase_request_summary are uninterrupted).
--
--    NOTE: No pg_cron auto-refresh schedule is added here (not requested).
--    This function is cron-compatible; a future migration may add:
--      SELECT cron.schedule('fpr-summary-refresh', '0 * * * *',
--        'SELECT rpc_refresh_fpr_summary()');
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_refresh_fpr_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor     text;
  v_refreshed timestamptz;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Resolve calling actor (fail-closed)
  -- ------------------------------------------------------------------
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Authority gate: managing_director or governance only
  --    (project_manager reads the view but may not refresh the cache)
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['managing_director'])
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires managing_director role to refresh summary';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Concurrent refresh — does not block reads on the view
  -- ------------------------------------------------------------------
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_fpr_summary_raw;

  v_refreshed := now();

  -- ------------------------------------------------------------------
  -- 4. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',           true,
    'refreshed_at', v_refreshed,
    'refreshed_by', v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_refresh_fpr_summary()
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_refresh_fpr_summary()
    TO authenticated;

COMMENT ON FUNCTION public.rpc_refresh_fpr_summary() IS
  'Refreshes mv_fpr_summary_raw CONCURRENTLY (does not block reads). '
  'Authority: managing_director or governance. '
  'NOTE: no pg_cron schedule added; cron-compatible for later addition. '
  'Migration 0184.';

COMMIT;
