-- =============================================================================
-- Rollback: 0180_rollback.sql
-- Author:   Security Audit 2026-08-28
-- Purpose:  Revert 0180_identity_reconciliation_hardening.sql
--           FOR CI IDEMPOTENCY TESTING ONLY.
--           ⚠️  NEVER apply to production.
--
-- Reverts:
--   • DROP fn_verify_org_claim()          (new in 0180)
--   • DROP fn_get_verified_org_id()        (new in 0180)
--   • Restore rpc_record_payment           (to 0173 body — without guard)
--   • Restore rpc_job_board                (to 0173 body — without guard)
--   • Restore rpc_approve_quotation        (to 0174 body — without guard)
--   • Restore rpc_ledger_entries           (to 0176 body — without guard)
--   • Restore rpc_ledger_summary           (to 0176 body — without guard)
--   • Restore get_org_usage                (to 0176 body — without JWT param check)
--
-- CI usage:
--   psql $DB_URL -f 0180_identity_reconciliation_hardening.sql
--   psql $DB_URL -f 0180_rollback.sql
--   psql $DB_URL -f 0180_identity_reconciliation_hardening.sql   -- must succeed again
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1 — Drop guard functions introduced in 0180
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_get_verified_org_id();
DROP FUNCTION IF EXISTS public.fn_verify_org_claim();

-- =============================================================================
-- STEP 2 — Restore rpc_record_payment to 0173 body (no identity guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_record_payment(
  p_invoice_id   UUID,
  p_amount       NUMERIC,
  p_method       TEXT,
  p_reference    TEXT DEFAULT NULL,
  p_org_id       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id        UUID;
  v_invoice       invoice%ROWTYPE;
  v_new_remaining NUMERIC;
  v_payment_id    UUID := gen_random_uuid();
BEGIN
  -- Resolve org_id: prefer explicit parameter, fall back to caller's membership.
  v_org_id := COALESCE(p_org_id, public.get_user_org_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_record_payment: caller has no active org membership';
  END IF;

  -- Auth guard: caller must be FINANCE or ADMIN in this org.
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id  = auth.uid()
      AND org_id   = v_org_id
      AND role     IN ('FINANCE', 'ADMIN', 'OWNER')
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'rpc_record_payment: insufficient privileges for org %', v_org_id;
  END IF;

  SELECT * INTO STRICT v_invoice
    FROM invoice
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  v_new_remaining := v_invoice.remaining_amount - p_amount;

  INSERT INTO invoice_payment (
    payment_id, invoice_id, org_id, amount, payment_method, reference, paid_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_org_id, p_amount, p_method, p_reference, now()
  );

  UPDATE invoice
     SET remaining_amount = v_new_remaining,
         status = CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  UPDATE job
     SET updated_at = now()
   WHERE job_id = v_invoice.job_id
     AND org_id = v_org_id;

  RETURN jsonb_build_object(
    'payment_id',     v_payment_id,
    'new_remaining',  v_new_remaining,
    'invoice_status', CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) IS
  'ROLLBACK RESTORE (0180_rollback): records a payment against an invoice. '
  'Identity reconciliation guard removed — this is the 0173 body.';

-- =============================================================================
-- STEP 3 — Restore rpc_job_board to 0173 body (no identity guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_job_board(
  p_status   TEXT DEFAULT NULL,
  p_limit    INT  DEFAULT 50,
  p_offset   INT  DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_job_board: caller has no active org membership';
  END IF;

  RETURN (
    SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT j.job_id, j.job_code, j.status, j.due_date,
               c.name AS customer_name,
               j.created_at
          FROM job j
          JOIN customer c ON c.customer_id = j.customer_id
                          AND c.org_id     = v_org_id
         WHERE j.org_id = v_org_id
           AND (p_status IS NULL OR j.status = p_status)
         ORDER BY j.created_at DESC
         LIMIT  p_limit
         OFFSET p_offset
      ) t
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_job_board(TEXT, INT, INT) IS
  'ROLLBACK RESTORE (0180_rollback): returns paginated job list. '
  'Identity reconciliation guard removed — this is the 0173 body.';

-- =============================================================================
-- STEP 4 — Restore rpc_approve_quotation to 0174 body (no identity guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_approve_quotation(
  p_quotation_id UUID,
  p_due_days     INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qt       quotation%ROWTYPE;
  v_inv_id   UUID;
  v_inv_code TEXT;
  v_due      DATE;
  v_org_id   UUID;
BEGIN
  -- Authorization check
  IF NOT (
    public.has_app_role('finance')
    OR public.has_app_role('admin')
    OR public.is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role';
  END IF;

  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: caller is not a member of any organisation';
  END IF;

  SELECT * INTO v_qt
  FROM public.quotation
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_qt.status NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'Cannot approve quotation in % status', v_qt.status;
  END IF;

  v_due    := CURRENT_DATE + p_due_days;
  v_inv_id := gen_random_uuid();
  v_inv_code := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((
    SELECT COALESCE(MAX(SUBSTRING(invoice_code FROM '[0-9]+$')::INT), 0) + 1
    FROM public.invoice
    WHERE org_id = v_org_id
  )::TEXT, 4, '0');

  UPDATE public.quotation
  SET
    status      = 'APPROVED',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at  = now()
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;

  INSERT INTO public.invoice (
    invoice_id, invoice_code, quotation_id, job_id,
    customer_id, org_id,
    subtotal, vat_rate, vat_amount, discount,
    total, remaining_amount, due_date, created_by
  )
  SELECT
    v_inv_id, v_inv_code, p_quotation_id, v_qt.job_id,
    v_qt.customer_id, v_org_id,
    v_qt.subtotal, v_qt.vat_rate, v_qt.vat_amount, v_qt.discount,
    v_qt.total, v_qt.total, v_due, auth.uid();

  IF v_qt.job_id IS NOT NULL THEN
    UPDATE public.job
    SET
      status       = 'QUOTED',
      quotation_id = p_quotation_id,
      invoice_id   = v_inv_id,
      updated_at   = now()
    WHERE job_id = v_qt.job_id
      AND org_id  = v_org_id
      AND status  = 'DRAFT';
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',   v_inv_id,
    'invoice_code', v_inv_code,
    'due_date',     v_due,
    'total',        v_qt.total
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_approve_quotation(UUID, INT) IS
  'ROLLBACK RESTORE (0180_rollback): approves quotation, creates invoice. '
  'Identity reconciliation guard removed — this is the 0174 body.';

-- =============================================================================
-- STEP 5 — Restore rpc_ledger_entries to 0176 body (no identity guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_ledger_entries(
  p_book_id   TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date   DATE DEFAULT NULL,
  p_status    TEXT DEFAULT 'posted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor  TEXT;
  v_result JSONB;
BEGIN
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rpc_ledger_entries: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_ledger_entries: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(
    jsonb_agg(entry_row ORDER BY entry_row->>'book_id', entry_row->>'entry_date'),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'entry_id',    je.id::text,
      'book_id',     je.book_id,
      'entry_date',  je.entry_date::text,
      'description', je.description,
      'lines', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'account_code', jl.account_code,
            'debit',        jl.base_debit,
            'credit',       jl.base_credit
          )
        ), '[]'::jsonb)
          FROM public.journal_line jl
         WHERE jl.journal_entry_id = je.id
      )
    ) AS entry_row
      FROM public.journal_entry je
     WHERE je.status::text = COALESCE(p_status, 'posted')
       AND (p_book_id   IS NULL OR je.book_id    = p_book_id)
       AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
       AND (p_to_date   IS NULL OR je.entry_date <= p_to_date)
  ) sub;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) IS
  'ROLLBACK RESTORE (0180_rollback): returns ledger journal entries. '
  'Identity reconciliation guard removed — this is the 0176 body.';

-- =============================================================================
-- STEP 6 — Restore rpc_ledger_summary to 0176 body (no identity guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_ledger_summary(
  p_book_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor  TEXT;
  v_result JSONB;
BEGIN
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rpc_ledger_summary: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_ledger_summary: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      je.book_id,
      COUNT(DISTINCT je.id)::INT                      AS entry_count,
      COALESCE(SUM(jl.base_debit),  0)::NUMERIC(15,2) AS total_debit,
      COALESCE(SUM(jl.base_credit), 0)::NUMERIC(15,2) AS total_credit
      FROM public.journal_entry je
      JOIN public.journal_line  jl ON jl.journal_entry_id = je.id
     WHERE je.status = 'posted'
       AND (p_book_id IS NULL OR je.book_id = p_book_id)
     GROUP BY je.book_id
  ) sub;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_ledger_summary(TEXT) IS
  'ROLLBACK RESTORE (0180_rollback): returns ledger KPI summary. '
  'Identity reconciliation guard removed — this is the 0176 body.';

-- =============================================================================
-- STEP 7 — Restore get_org_usage to 0176 body (no JWT param reconciliation)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_usage(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_count     INTEGER;
  v_member_count  INTEGER;
  v_storage_bytes BIGINT;
  v_period_start  TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_org_usage: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.org_members om
       WHERE om.user_id   = auth.uid()
         AND om.org_id    = p_org_id
         AND om.role      IN ('OWNER', 'ADMIN')
         AND om.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'get_org_usage: caller is not an OWNER or ADMIN of org %', p_org_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_period_start := date_trunc('month', NOW());

  SELECT COUNT(*) INTO v_job_count
    FROM public.jobs
   WHERE org_id    = p_org_id
     AND created_at >= v_period_start;

  SELECT COUNT(*) INTO v_member_count
    FROM public.org_members
   WHERE org_id = p_org_id
     AND status = 'active';

  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO v_storage_bytes
    FROM storage.objects
   WHERE bucket_id = 'org-files'
     AND (storage.foldername(name))[1] = p_org_id::TEXT;

  RETURN json_build_object(
    'jobs_created',    v_job_count,
    'members_count',   v_member_count,
    'storage_used_mb', ROUND(v_storage_bytes / 1048576.0, 2),
    'period',          to_char(v_period_start, 'YYYY-MM')
  );
END;
$$;

COMMENT ON FUNCTION public.get_org_usage(UUID) IS
  'ROLLBACK RESTORE (0180_rollback): returns org usage metrics. '
  'Identity reconciliation guard + JWT param check removed — this is the 0176 body.';

-- =============================================================================
-- STEP 8 — Re-grant EXECUTE for restored RPCs (back to 0173/0174/0176 state)
-- =============================================================================

REVOKE ALL     ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL     ON FUNCTION public.rpc_job_board(TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_job_board(TEXT, INT, INT) TO authenticated;

REVOKE ALL     ON FUNCTION public.rpc_approve_quotation(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_approve_quotation(UUID, INT) TO authenticated;

REVOKE ALL     ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) TO authenticated;

REVOKE ALL     ON FUNCTION public.rpc_ledger_summary(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_summary(TEXT) TO authenticated;

REVOKE ALL     ON FUNCTION public.get_org_usage(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_org_usage(UUID) TO authenticated;

-- =============================================================================
-- STEP 9 — Post-rollback assertions
-- =============================================================================

DO $$
BEGIN
  -- Guard functions must be gone
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'fn_verify_org_claim'
  ) THEN
    RAISE WARNING '0180_rollback ASSERTION FAILED: fn_verify_org_claim still exists';
  ELSE
    RAISE NOTICE '0180_rollback ✅ fn_verify_org_claim dropped';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'fn_get_verified_org_id'
  ) THEN
    RAISE WARNING '0180_rollback ASSERTION FAILED: fn_get_verified_org_id still exists';
  ELSE
    RAISE NOTICE '0180_rollback ✅ fn_get_verified_org_id dropped';
  END IF;

  -- Patched RPCs must still be present (restored, not dropped)
  DECLARE
    v_rpcs TEXT[] := ARRAY[
      'rpc_record_payment', 'rpc_job_board', 'rpc_approve_quotation',
      'rpc_ledger_entries', 'rpc_ledger_summary', 'get_org_usage'
    ];
    v_rpc TEXT;
  BEGIN
    FOREACH v_rpc IN ARRAY v_rpcs LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name = v_rpc
      ) THEN
        RAISE WARNING '0180_rollback ASSERTION FAILED: % missing after rollback', v_rpc;
      ELSE
        RAISE NOTICE '0180_rollback ✅ % restored to pre-0180 body', v_rpc;
      END IF;
    END LOOP;
  END;

  RAISE NOTICE '0180_rollback complete';
END $$;

-- =============================================================================
-- END OF ROLLBACK 0180
-- ⚠️  FOR CI IDEMPOTENCY TESTING ONLY — NEVER APPLY TO PRODUCTION
-- =============================================================================

COMMIT;
