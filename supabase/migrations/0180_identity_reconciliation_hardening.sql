-- =============================================================================
-- Migration: 0180_identity_reconciliation_hardening.sql
-- Author:    Security Audit 2026-08-28
-- Purpose:   Implement fn_verify_org_claim() and fn_get_verified_org_id() guards
--            to reconcile the JWT org_id claim against org_members on every
--            sensitive RPC call.
--
-- Background (issue #37):
--   All org-scoped RLS policies use auth.jwt()->>'org_id' for row filtering.
--   A JWT with a manually crafted org_id claim is not cross-checked against
--   org_members, meaning a user who obtains (or forges) a JWT with someone
--   else's org_id could bypass RLS isolation on tables that rely solely on
--   the JWT claim.
--
--   This migration adds fn_verify_org_claim() — a SECURITY INVOKER helper
--   that verifies auth.uid() is an active member of the JWT org_id claim —
--   and patches all 6 high-risk RPCs from migrations 0173–0176 to call it
--   at the start of each execution.
--
-- Findings addressed: Issue #37 — identity reconciliation (P1, security)
-- Related issues:     #53 (migration 0179 retrospective), #42 (F1+F2, closed)
--
-- PRE-REQUISITES:
--   0173_rls_isolation_hardening.sql
--   0174_secdef_rpc_hardening.sql
--   0176_secdef_medium_risk_hardening.sql
--
-- PR Gate: Must pass CI (pg_prove + supabase db lint) before merge to main.
--          Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0 — Pre-flight safety checks
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist — run base schema first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_members'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.org_members does not exist — run base schema first';
  END IF;

  -- Confirm prerequisite RPCs exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'rpc_record_payment'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.rpc_record_payment not found — run 0173 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'get_user_org_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.get_user_org_id not found — run base schema first';
  END IF;

  RAISE NOTICE '0180 pre-flight checks passed';
END $$;

-- =============================================================================
-- SECTION 1 — fn_verify_org_claim()
--
-- Raises an exception if the calling user's JWT org_id claim does not match
-- an active org_members record for auth.uid().
--
-- This is the core identity reconciliation guard (issue #37):
--
--   JWT org_id ──→ org_members JOIN ──→ verified?
--                                         YES → return (no-op)
--                                         NO  → RAISE insufficient_privilege
--
-- Callers insert `PERFORM public.fn_verify_org_claim();` as the FIRST statement
-- in any RPC that uses auth.jwt()->>'org_id' for tenant scoping.
--
-- SECURITY INVOKER: this function runs as the calling user.  It reads only
-- org_members (which is RLS-protected) and auth.jwt() (caller-visible).
-- No privilege escalation is possible.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_verify_org_claim()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
BEGIN
  -- ── 1. Caller must be authenticated ────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'identity-reconciliation: caller is not authenticated'
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'A valid Supabase session is required';
  END IF;

  -- ── 2. JWT must carry a well-formed org_id claim ───────────────────────────
  BEGIN
    v_org_id := (auth.jwt() ->> 'org_id')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'identity-reconciliation: org_id JWT claim is not a valid UUID (value: %)',
                    auth.jwt() ->> 'org_id'
      USING ERRCODE = 'invalid_parameter_value',
            HINT    = 'Re-authenticate to refresh the JWT';
  END;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'identity-reconciliation: org_id JWT claim is absent or null'
      USING ERRCODE = 'invalid_parameter_value',
            HINT    = 'Re-authenticate to refresh the JWT with an org_id claim';
  END IF;

  -- ── 3. Reconcile: auth.uid() must be an active org_members record for v_org_id
  --   This cross-check prevents a forged or stale JWT org_id from bypassing RLS.
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    JOIN public.organizations o ON o.org_id = om.org_id
    WHERE om.user_id   = v_user_id
      AND om.org_id    = v_org_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION
      'identity-reconciliation: JWT org_id claim (%) does not match any active org_members record for user %',
      v_org_id, v_user_id
      USING ERRCODE = 'insufficient_privilege',
            HINT    = 'Session org_id is stale or tampered — re-authenticate to get a fresh JWT';
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_verify_org_claim() IS
  'Identity reconciliation guard (issue #37). '
  'Raises insufficient_privilege if auth.uid() does not have an active org_members '
  'record matching the JWT org_id claim. '
  'MUST be called at the start of every org-scoped RPC. '
  'SECURITY INVOKER — reads only caller-visible JWT and org_members; no privilege escalation. '
  'Added in 0180_identity_reconciliation_hardening.sql (2026-08-28).';

-- =============================================================================
-- SECTION 2 — fn_get_verified_org_id()
--
-- Convenience wrapper: calls fn_verify_org_claim() then returns the verified
-- org_id UUID.  RPCs can replace `public.get_user_org_id()` with this function
-- to combine reconciliation + org_id resolution in a single call.
--
-- Usage:
--   v_org_id := public.fn_get_verified_org_id();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_verified_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Delegate all validation to fn_verify_org_claim(); raises on failure.
  PERFORM public.fn_verify_org_claim();
  v_org_id := (auth.jwt() ->> 'org_id')::UUID;
  RETURN v_org_id;
END $$;

COMMENT ON FUNCTION public.fn_get_verified_org_id() IS
  'Returns the JWT org_id claim after identity reconciliation. '
  'Raises insufficient_privilege if the claim is absent, malformed, or does not '
  'match an active org_members record. '
  'Drop-in replacement for get_user_org_id() in org-scoped RPCs. '
  'Added in 0180_identity_reconciliation_hardening.sql (2026-08-28).';

-- =============================================================================
-- SECTION 3 — Patch rpc_record_payment (0173 → 0180)
--
-- Change: add PERFORM public.fn_verify_org_claim() as the first statement.
-- The rest of the body is unchanged from 0173_rls_isolation_hardening.sql.
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
  v_invoice       invoices%ROWTYPE;
  v_new_remaining NUMERIC;
  v_payment_id    UUID := gen_random_uuid();
BEGIN
  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  PERFORM public.fn_verify_org_claim();

  -- ── Resolve org_id: prefer explicit parameter, fall back to caller's membership.
  v_org_id := COALESCE(p_org_id, public.get_user_org_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_record_payment: caller has no active org membership';
  END IF;

  -- ── Auth guard: caller must be FINANCE or ADMIN in this org. ───────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id  = auth.uid()
      AND org_id   = v_org_id
      AND role     IN ('FINANCE', 'ADMIN', 'OWNER')
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'rpc_record_payment: insufficient privileges for org %', v_org_id;
  END IF;

  -- ── Scoped invoices read — will raise NO_DATA_FOUND if wrong org. ───────────
  SELECT * INTO STRICT v_invoice
    FROM invoices
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  v_new_remaining := v_invoice.remaining_amount - p_amount;

  -- ── Scoped INSERT into invoice_payments. ────────────────────────────────────
  INSERT INTO invoice_payments (
    payment_id, invoice_id, org_id, amount, payment_method, reference, paid_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_org_id, p_amount, p_method, p_reference, now()
  );

  -- ── Scoped UPDATE on invoices. ───────────────────────────────────────────────
  UPDATE invoices
     SET remaining_amount = v_new_remaining,
         status = CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  -- ── Scoped UPDATE on jobs. ───────────────────────────────────────────────────
  UPDATE jobs
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
  'Records a payment against an invoices. '
  'Caller must be FINANCE, ADMIN, or OWNER in the resolved org. '
  'Identity reconciliation guard added in 0180 (issue #37): '
  'JWT org_id claim is verified against org_members before org resolution.';

-- =============================================================================
-- SECTION 4 — Patch rpc_job_board (0173 → 0180)
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
  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  PERFORM public.fn_verify_org_claim();

  -- ── Role guard: any active member of the org. ─────────────────────────────
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
          FROM jobs j
          JOIN customers c ON c.customer_id = j.customer_id
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
  'Returns paginated jobs list for the caller''s org. '
  'Identity reconciliation guard added in 0180 (issue #37): '
  'JWT org_id claim is verified against org_members before org resolution.';

-- =============================================================================
-- SECTION 5 — Patch rpc_approve_quotation (0174 → 0180)
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
  v_qt       quotations%ROWTYPE;
  v_inv_id   UUID;
  v_inv_code TEXT;
  v_due      DATE;
  v_org_id   UUID;
BEGIN
  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  PERFORM public.fn_verify_org_claim();

  -- ── Authorization check ───────────────────────────────────────────────────
  IF NOT (
    public.has_app_role('finance')
    OR public.has_app_role('admin')
    OR public.is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role';
  END IF;

  -- ── Resolve caller org (once) ─────────────────────────────────────────────
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: caller is not a member of any organisation';
  END IF;

  -- ── Fetch quotations scoped to caller org (SD-R3 fix) ─────────────────────
  SELECT * INTO v_qt
  FROM public.quotations
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_qt.status NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'Cannot approve quotations in % status', v_qt.status;
  END IF;

  -- ── Derive invoices code ───────────────────────────────────────────────────
  v_due    := CURRENT_DATE + p_due_days;
  v_inv_id := gen_random_uuid();
  v_inv_code := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((
    SELECT COALESCE(MAX(SUBSTRING(invoice_code FROM '[0-9]+$')::INT), 0) + 1
    FROM public.invoices
    WHERE org_id = v_org_id
  )::TEXT, 4, '0');

  -- ── Update quotations status ───────────────────────────────────────────────
  UPDATE public.quotations
  SET
    status      = 'APPROVED',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at  = now()
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;

  -- ── Create invoices ────────────────────────────────────────────────────────
  INSERT INTO public.invoices (
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

  -- ── Update jobs status if linked ───────────────────────────────────────────
  IF v_qt.job_id IS NOT NULL THEN
    UPDATE public.jobs
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
  'Approves a quotations and auto-creates a linked invoices. '
  'Requires FINANCE or ADMIN role. '
  'Identity reconciliation guard added in 0180 (issue #37): '
  'JWT org_id claim is verified against org_members before org resolution.';

-- =============================================================================
-- SECTION 6 — Patch rpc_ledger_entries (0176 → 0180)
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
  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  PERFORM public.fn_verify_org_claim();

  -- ── Auth check (unchanged from 0176) ───────────────────────────────────────
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rpc_ledger_entries: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Role check (unchanged from 0176) ───────────────────────────────────────
  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_ledger_entries: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Result (RLS on journal_entry enforces org isolation) ───────────────────
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
  'Returns ledger journal entries. Requires FINANCE or ADMIN role. '
  'SECURITY INVOKER — RLS on journal_entry enforces org isolation. '
  'Identity reconciliation guard added in 0180 (issue #37).';

-- =============================================================================
-- SECTION 7 — Patch rpc_ledger_summary (0176 → 0180)
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
  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  PERFORM public.fn_verify_org_claim();

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
  'Returns ledger KPI summary. Requires FINANCE or ADMIN role. '
  'SECURITY INVOKER — RLS on journal_entry enforces org isolation. '
  'Identity reconciliation guard added in 0180 (issue #37).';

-- =============================================================================
-- SECTION 8 — Patch get_org_usage (0176 → 0180)
--
-- This RPC takes an explicit p_org_id parameter rather than using the JWT claim.
-- The identity reconciliation guard adds a JWT claim vs parameter check:
--   - If caller is not a super-admin, the JWT org_id claim MUST equal p_org_id.
--   - This prevents a legitimate admin of org A from calling get_org_usage(org_B)
--     by constructing a direct API call with a different UUID parameter.
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
  v_jwt_org_id    UUID;
BEGIN
  -- ── Authentication guard ───────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_org_usage: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Identity reconciliation guard (issue #37) ──────────────────────────────
  -- Verify JWT org_id claim before any data access.
  PERFORM public.fn_verify_org_claim();

  -- ── JWT claim vs parameter reconciliation ─────────────────────────────────
  -- Non-super-admin callers must request only their own org.
  -- This prevents parameter manipulation (e.g., passing a different org's UUID
  -- while holding a valid JWT for their own org).
  IF NOT public.is_platform_super_admin() THEN
    BEGIN
      v_jwt_org_id := (auth.jwt() ->> 'org_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_jwt_org_id := NULL;
    END;

    IF v_jwt_org_id IS DISTINCT FROM p_org_id THEN
      RAISE EXCEPTION 'get_org_usage: p_org_id (%) does not match JWT org_id claim (%)',
                      p_org_id, v_jwt_org_id
        USING ERRCODE = 'insufficient_privilege',
              HINT    = 'Non-super-admin callers may only query their own org';
    END IF;
  END IF;

  -- ── Authorization guard: caller must be OWNER/ADMIN or super-admin ─────────
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

  -- ── Compute usage metrics ──────────────────────────────────────────────────
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
  'Returns jobs count, member count, and storage usage for p_org_id. '
  'Caller must be OWNER or ADMIN of that org, or a platform super-admin. '
  'Identity reconciliation guard + JWT claim vs parameter check added in 0180 (issue #37): '
  'non-super-admin callers may only query their own JWT org_id.';

-- =============================================================================
-- SECTION 9 — REVOKE / GRANT for new guard functions
-- =============================================================================

-- fn_verify_org_claim: callable by authenticated users only.
-- Service role bypasses RLS and does not need this guard.
REVOKE ALL     ON FUNCTION public.fn_verify_org_claim()     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_verify_org_claim()     TO authenticated;

-- fn_get_verified_org_id: same access as fn_verify_org_claim.
REVOKE ALL     ON FUNCTION public.fn_get_verified_org_id()  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_verified_org_id()  TO authenticated;

-- Re-confirm REVOKE for all patched RPCs (belt-and-suspenders over 0173/0174/0176)
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
-- SECTION 10 — Post-migration assertions
-- =============================================================================

DO $$
BEGIN
  -- fn_verify_org_claim must exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'fn_verify_org_claim'
  ) THEN
    RAISE WARNING '0180 ASSERTION FAILED: fn_verify_org_claim not found';
  ELSE
    RAISE NOTICE '0180 ✅ fn_verify_org_claim deployed';
  END IF;

  -- fn_get_verified_org_id must exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'fn_get_verified_org_id'
  ) THEN
    RAISE WARNING '0180 ASSERTION FAILED: fn_get_verified_org_id not found';
  ELSE
    RAISE NOTICE '0180 ✅ fn_get_verified_org_id deployed';
  END IF;

  -- All patched RPCs must still exist
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
        RAISE WARNING '0180 ASSERTION FAILED: % not found after patching', v_rpc;
      ELSE
        RAISE NOTICE '0180 ✅ % re-deployed with identity reconciliation guard', v_rpc;
      END IF;
    END LOOP;
  END;

  RAISE NOTICE '0180 all assertions complete';
END $$;

-- =============================================================================
-- END OF MIGRATION 0180
-- =============================================================================
-- Remediation status after this migration:
--
-- | Finding   | Status    | Migration | Notes                                    |
-- |-----------|-----------|-----------|------------------------------------------|
-- | Issue #37 | ✅ FIXED  | 0180      | JWT claim reconciled via org_members     |
-- | R1        | ✅ Updated| 0180      | fn_verify_org_claim added to rpc_record_payment |
-- | R2        | ✅ Updated| 0180      | fn_verify_org_claim added to rpc_job_board |
-- | R3        | ✅ Updated| 0180      | fn_verify_org_claim added to rpc_approve_quotation |
-- | M1        | ✅ Updated| 0180      | JWT claim vs p_org_id check added to get_org_usage |
-- | M2        | ✅ Updated| 0180      | fn_verify_org_claim added to rpc_ledger_entries/summary |
--
-- Closure criteria for issue #37:
--   [ ] fn_verify_org_claim() raises for a JWT with a crafted (wrong) org_id claim
--   [ ] fn_verify_org_claim() passes for a JWT with a valid org_id claim
--   [ ] rpc_record_payment rejects callers with mismatched JWT org_id
--   [ ] rpc_approve_quotation rejects callers with mismatched JWT org_id
--   [ ] get_org_usage rejects non-super-admin callers with p_org_id ≠ JWT org_id
--   [ ] All 6 patched RPCs pass existing pgTAP tests after applying this migration
--   [ ] CI migration tests pass on a fresh database (forward + rollback + forward)
-- =============================================================================

COMMIT;
