-- Resolve the remaining release-blocking database contracts against the final
-- multi-tenant schema.  This migration is forward-only for hosted databases;
-- clean databases receive the same repairs after all historical migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Journal posting
-- ---------------------------------------------------------------------------
-- Migration 0066 and Migration 0179 published overloads whose named arguments
-- overlap. PostgREST cannot choose between them when p_lines is supplied. Keep
-- the modern JSON response as the public API and retain a positional legacy
-- adapter for the capture functions authored against Migration 0066.

CREATE OR REPLACE FUNCTION public.rpc_post_journal_entry(
  p_book_id TEXT,
  p_entry_date DATE,
  p_description TEXT,
  p_currency TEXT,
  p_source_ref JSONB DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_actor TEXT;
  v_entry_id UUID;
  v_total_dr NUMERIC := 0;
  v_total_cr NUMERIC := 0;
  v_line JSONB;
  v_debit NUMERIC;
  v_credit NUMERIC;
BEGIN
  v_org_id := public.get_user_org_id();
  v_actor := public.resolve_actor();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.book_registry registry
    WHERE registry.org_id = v_org_id
      AND registry.book_id = p_book_id
      AND registry.is_active
  ) THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: book "%" is missing or inactive',
      p_book_id;
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: at least two lines are required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((v_line ->> 'debit')::NUMERIC, 0);
    v_credit := COALESCE((v_line ->> 'credit')::NUMERIC, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.ledger_account account
      WHERE account.code = v_line ->> 'account_code'
        AND account.active
    ) THEN
      RAISE EXCEPTION 'rpc_post_journal_entry: account_code "%" is missing or inactive',
        v_line ->> 'account_code';
    END IF;
    IF v_debit < 0 OR v_credit < 0 OR (v_debit > 0 AND v_credit > 0) THEN
      RAISE EXCEPTION 'rpc_post_journal_entry: each line must use one non-negative side'
        USING ERRCODE = 'check_violation';
    END IF;

    v_total_dr := v_total_dr + v_debit;
    v_total_cr := v_total_cr + v_credit;
  END LOOP;

  IF ROUND(v_total_dr, 2) <> ROUND(v_total_cr, 2) THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: balance violation debit % <> credit %',
      v_total_dr, v_total_cr
      USING ERRCODE = 'check_violation';
  END IF;
  IF ROUND(v_total_dr, 2) = 0 THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: total is zero'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.journal_entry (
    book_id, org_id, entry_date, description, status,
    currency, source_ref, created_by
  )
  VALUES (
    p_book_id,
    v_org_id,
    COALESCE(p_entry_date, CURRENT_DATE),
    p_description,
    'posted',
    UPPER(COALESCE(p_currency, 'THB')),
    p_source_ref,
    COALESCE(v_actor, 'system')
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_debit := COALESCE((v_line ->> 'debit')::NUMERIC, 0);
    v_credit := COALESCE((v_line ->> 'credit')::NUMERIC, 0);

    INSERT INTO public.journal_line (
      journal_entry_id, org_id, account_code, account_id,
      debit, credit, base_debit, base_credit
    )
    VALUES (
      v_entry_id,
      v_org_id,
      v_line ->> 'account_code',
      (
        SELECT account.id
        FROM public.chart_of_accounts account
        WHERE account.org_id = v_org_id
          AND account.code = v_line ->> 'account_code'
        LIMIT 1
      ),
      v_debit,
      v_credit,
      v_debit,
      v_credit
    );
  END LOOP;

  RETURN jsonb_build_object(
    'entry_id', v_entry_id,
    'book_id', p_book_id,
    'org_id', v_org_id,
    'entry_date', p_entry_date,
    'total_debit', v_total_dr,
    'total_credit', v_total_cr,
    'status', 'posted'
  );
END;
$$;

DO $migration$
BEGIN
  IF to_regprocedure(
    'public.rpc_post_journal_entry(text,date,text,jsonb,text,public.ledger_entry_status,text,jsonb)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.rpc_post_journal_entry_legacy(text,date,text,jsonb,text,public.ledger_entry_status,text,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.rpc_post_journal_entry(
      TEXT, DATE, TEXT, JSONB, TEXT, public.ledger_entry_status, TEXT, JSONB
    ) RENAME TO rpc_post_journal_entry_legacy;
  END IF;
END;
$migration$;

CREATE FUNCTION public.rpc_post_journal_entry(
  p_book_id TEXT,
  p_entry_date DATE,
  p_description TEXT,
  p_legacy_lines JSONB,
  p_currency TEXT DEFAULT 'THB',
  p_status public.ledger_entry_status DEFAULT 'posted',
  p_site_code TEXT DEFAULT NULL,
  p_source_ref JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_entry_id UUID;
BEGIN
  v_result := public.rpc_post_journal_entry(
    p_book_id,
    p_entry_date,
    p_description,
    p_currency,
    p_source_ref,
    p_legacy_lines
  );
  v_entry_id := (v_result ->> 'entry_id')::UUID;

  UPDATE public.journal_entry
  SET status = COALESCE(p_status, 'posted'),
      site_code = p_site_code
  WHERE id = v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_post_journal_entry_legacy(
  TEXT, DATE, TEXT, JSONB, TEXT, public.ledger_entry_status, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_post_journal_entry(
  TEXT, DATE, TEXT, JSONB, TEXT, public.ledger_entry_status, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_post_journal_entry(
  TEXT, DATE, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_post_journal_entry(
  TEXT, DATE, TEXT, TEXT, JSONB, JSONB
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Overdue invoice scanning
-- ---------------------------------------------------------------------------
-- invoice_status contains historical uppercase values and newer lowercase
-- workflow values. Compare normalized text so paid/cancelled/voided invoices
-- can never be re-enqueued.

CREATE OR REPLACE FUNCTION public.rpc_check_overdue_invoices(
  p_org_id UUID DEFAULT NULL,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_is_service_role BOOLEAN;
  v_invoice RECORD;
  v_days_overdue INT;
  v_notif_type public.notification_type;
  v_inserted INT := 0;
  v_skipped INT := 0;
  v_dry_results JSONB := '[]'::JSONB;
  v_today DATE := CURRENT_DATE;
BEGIN
  v_is_service_role := COALESCE(
    current_setting('request.jwt.claims', TRUE), '{}'
  )::JSONB ->> 'role' = 'service_role';

  IF NOT v_is_service_role THEN
    IF NOT (
      public.has_app_role('finance')
      OR public.has_app_role('admin')
      OR public.is_governance_role()
    ) THEN
      RAISE EXCEPTION 'Forbidden: rpc_check_overdue_invoices requires FINANCE or ADMIN role';
    END IF;
    v_org_id := COALESCE(p_org_id, public.get_user_org_id());
    IF v_org_id IS NULL OR v_org_id IS DISTINCT FROM public.get_user_org_id() THEN
      RAISE EXCEPTION 'Forbidden: organization is missing or outside caller scope';
    END IF;
  ELSE
    v_org_id := p_org_id;
  END IF;

  FOR v_invoice IN
    SELECT
      invoice.invoice_id,
      invoice.org_id,
      invoice.invoice_code,
      invoice.due_date,
      invoice.remaining_amount,
      COALESCE(customer.name, 'Unknown') AS customer_name,
      (v_today - invoice.due_date::DATE)::INT AS days_overdue_calc
    FROM public.invoices invoice
    LEFT JOIN public.customers customer
      ON customer.customer_id = invoice.customer_id
    WHERE (v_org_id IS NULL OR invoice.org_id = v_org_id)
      AND invoice.remaining_amount > 0
      AND lower(invoice.status::TEXT) NOT IN ('paid', 'cancelled', 'voided')
      AND (
        invoice.due_date < v_today
        OR invoice.due_date BETWEEN v_today AND v_today + 7
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.invoice_notifications notification
        WHERE notification.invoice_id = invoice.invoice_id
          AND notification.status = 'snoozed'
          AND notification.snoozed_until >= v_today
      )
  LOOP
    v_days_overdue := v_invoice.days_overdue_calc;
    v_notif_type := public._classify_overdue_type(
      v_days_overdue,
      v_invoice.due_date::DATE
    );
    CONTINUE WHEN v_notif_type IS NULL;

    IF p_dry_run THEN
      v_dry_results := v_dry_results || jsonb_build_object(
        'invoice_id', v_invoice.invoice_id,
        'invoice_code', v_invoice.invoice_code,
        'org_id', v_invoice.org_id,
        'customer_name', v_invoice.customer_name,
        'due_date', v_invoice.due_date,
        'days_overdue', v_days_overdue,
        'remaining_amount', v_invoice.remaining_amount,
        'notification_type', v_notif_type
      );
      v_inserted := v_inserted + 1;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.invoice_notifications (
        org_id, invoice_id, notification_type, status, days_overdue,
        amount_remaining, invoice_code, customer_name, notification_date
      )
      VALUES (
        v_invoice.org_id,
        v_invoice.invoice_id,
        v_notif_type,
        'pending',
        v_days_overdue,
        v_invoice.remaining_amount,
        v_invoice.invoice_code,
        v_invoice.customer_name,
        CURRENT_DATE
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'scanned_org_id', v_org_id,
    'notifications_created', v_inserted,
    'notifications_skipped', v_skipped,
    'dry_run_results', CASE WHEN p_dry_run THEN v_dry_results ELSE NULL END,
    'run_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_overdue_invoices(UUID, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_check_overdue_invoices(UUID, BOOLEAN)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_check_invoice_overdue_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_overdue INT;
  v_notif_type public.notification_type;
BEGIN
  IF NEW.remaining_amount <= 0
     OR lower(NEW.status::TEXT) IN ('paid', 'cancelled', 'voided') THEN
    RETURN NEW;
  END IF;

  v_days_overdue := (CURRENT_DATE - NEW.due_date::DATE)::INT;
  IF v_days_overdue < -7 THEN
    RETURN NEW;
  END IF;

  v_notif_type := public._classify_overdue_type(v_days_overdue, NEW.due_date::DATE);
  IF v_notif_type IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.invoice_notifications (
    org_id, invoice_id, notification_type, status, days_overdue,
    amount_remaining, invoice_code, customer_name, notification_date
  )
  SELECT
    NEW.org_id,
    NEW.invoice_id,
    v_notif_type,
    'pending',
    v_days_overdue,
    NEW.remaining_amount,
    NEW.invoice_code,
    customer.name,
    CURRENT_DATE
  FROM public.customers customer
  WHERE customer.customer_id = NEW.customer_id
  ON CONFLICT (invoice_id, notification_type, notification_date) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_overdue ON public.invoices;
CREATE TRIGGER trg_check_invoice_overdue
  AFTER UPDATE OF remaining_amount, due_date, status
  ON public.invoices
  FOR EACH ROW
  WHEN (
    NEW.remaining_amount > 0
    AND lower(NEW.status::TEXT) NOT IN ('paid', 'cancelled', 'voided')
  )
  EXECUTE FUNCTION public.fn_check_invoice_overdue_on_update();

-- ---------------------------------------------------------------------------
-- Executive SLA severity semantics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_etax_sla_executive_summary
WITH (security_invoker = true)
AS
WITH live AS (
  SELECT
    cached.org_id,
    COALESCE(organization.name, '[deleted organization]') AS org_name,
    COUNT(*) AS live_total_submissions,
    COUNT(*) FILTER (WHERE cached.sla_breach_flag) AS live_breach_count,
    ROUND(
      COUNT(*) FILTER (WHERE cached.sla_breach_flag)::NUMERIC
      / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS live_breach_rate_pct,
    (
      ARRAY_AGG(
        cached.severity_tier
        ORDER BY CASE cached.severity_tier
          WHEN 'CRITICAL' THEN 1
          WHEN 'WARNING' THEN 2
          WHEN 'ELEVATED' THEN 3
          WHEN 'NORMAL' THEN 4
          WHEN 'HEALTHY' THEN 5
          ELSE 6
        END
      ) FILTER (WHERE cached.severity_tier IS NOT NULL)
    )[1] AS live_worst_severity,
    AVG(cached.avg_processing_hours) AS live_avg_processing_hours,
    MAX(cached.sla_threshold_hours) AS live_sla_threshold_hours,
    MAX(cached.last_submission_at) AS live_last_submission_at
  FROM public.mv_etax_submission_sla cached
  LEFT JOIN public.organizations organization
    ON organization.org_id = cached.org_id
  GROUP BY cached.org_id, organization.name
),
archive AS (
  SELECT
    rollup.org_id,
    rollup.org_name,
    rollup.first_archived_date,
    rollup.last_archived_date,
    rollup.total_archive_days,
    rollup.total_created AS archive_total_created,
    rollup.total_breached AS archive_total_breached,
    rollup.overall_breach_rate AS archive_breach_rate_pct,
    rollup.worst_severity_tier AS archive_worst_severity,
    rollup.peak_cumulative AS archive_peak_cumulative,
    rollup.breached_document_types,
    rollup.sla_threshold_hours AS archive_sla_threshold_hours,
    rollup.last_archived_at
  FROM public.v_etax_sla_archive_org_rollup rollup
)
SELECT
  COALESCE(live.org_id, archive.org_id) AS org_id,
  COALESCE(live.org_name, archive.org_name) AS org_name,
  COALESCE(live.live_total_submissions, 0) AS live_total_submissions,
  COALESCE(live.live_breach_count, 0) AS live_breach_count,
  live.live_breach_rate_pct,
  live.live_worst_severity,
  ROUND(live.live_avg_processing_hours::NUMERIC, 2) AS live_avg_processing_hours,
  COALESCE(
    live.live_sla_threshold_hours,
    archive.archive_sla_threshold_hours,
    24
  ) AS sla_threshold_hours,
  live.live_last_submission_at,
  archive.first_archived_date,
  archive.last_archived_date,
  COALESCE(archive.total_archive_days, 0) AS archive_total_days,
  COALESCE(archive.archive_total_created, 0) AS archive_total_created,
  COALESCE(archive.archive_total_breached, 0) AS archive_total_breached,
  archive.archive_breach_rate_pct,
  archive.archive_worst_severity,
  COALESCE(archive.archive_peak_cumulative, 0) AS archive_peak_cumulative,
  archive.breached_document_types,
  archive.last_archived_at,
  GREATEST(
    COALESCE(live.live_breach_rate_pct, 0),
    COALESCE(archive.archive_breach_rate_pct, 0)
  ) AS peak_breach_rate_pct,
  CASE
    WHEN 'CRITICAL' IN (live.live_worst_severity, archive.archive_worst_severity)
      THEN 'CRITICAL'
    WHEN 'WARNING' IN (live.live_worst_severity, archive.archive_worst_severity)
      THEN 'WARNING'
    WHEN 'ELEVATED' IN (live.live_worst_severity, archive.archive_worst_severity)
      THEN 'ELEVATED'
    WHEN 'NORMAL' IN (live.live_worst_severity, archive.archive_worst_severity)
      THEN 'NORMAL'
    ELSE 'HEALTHY'
  END AS combined_worst_severity,
  COALESCE(live.live_worst_severity IN ('CRITICAL', 'WARNING'), FALSE)
    OR COALESCE(archive.archive_worst_severity IN ('CRITICAL', 'WARNING'), FALSE)
    AS requires_attention,
  live.org_id IS NOT NULL AS has_live_data,
  archive.org_id IS NOT NULL AS has_archive_data
FROM live
FULL OUTER JOIN archive ON archive.org_id = live.org_id;

REVOKE ALL ON public.v_etax_sla_executive_summary
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_etax_sla_executive_summary
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.rpc_etax_sla_executive_summary(
  p_org_id UUID DEFAULT NULL,
  p_requires_attention BOOLEAN DEFAULT NULL,
  p_has_archive_data BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  live_total_submissions BIGINT,
  live_breach_count BIGINT,
  live_breach_rate_pct NUMERIC,
  live_worst_severity TEXT,
  live_avg_processing_hours NUMERIC,
  sla_threshold_hours NUMERIC,
  live_last_submission_at TIMESTAMPTZ,
  first_archived_date DATE,
  last_archived_date DATE,
  archive_total_days BIGINT,
  archive_total_created BIGINT,
  archive_total_breached BIGINT,
  archive_breach_rate_pct NUMERIC,
  archive_worst_severity TEXT,
  archive_peak_cumulative BIGINT,
  breached_document_types TEXT[],
  last_archived_at TIMESTAMPTZ,
  peak_breach_rate_pct NUMERIC,
  combined_worst_severity TEXT,
  requires_attention BOOLEAN,
  has_live_data BOOLEAN,
  has_archive_data BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT summary.*
  FROM public.v_etax_sla_executive_summary summary
  WHERE (
      COALESCE(current_setting('request.jwt.claims', TRUE), '{}')::JSONB
        ->> 'role' = 'service_role'
      OR summary.org_id = public.get_user_org_id()
    )
    AND (p_org_id IS NULL OR summary.org_id = p_org_id)
    AND (
      p_requires_attention IS NULL
      OR summary.requires_attention = p_requires_attention
    )
    AND (p_has_archive_data IS NULL OR summary.has_archive_data = p_has_archive_data)
  ORDER BY CASE summary.combined_worst_severity
      WHEN 'CRITICAL' THEN 5
      WHEN 'WARNING' THEN 4
      WHEN 'ELEVATED' THEN 3
      WHEN 'NORMAL' THEN 2
      WHEN 'HEALTHY' THEN 1
      ELSE 0
    END DESC,
    summary.peak_breach_rate_pct DESC NULLS LAST,
    summary.org_id;
$$;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_executive_summary(
  UUID, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_executive_summary(
  UUID, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_post_journal_entry(
  TEXT, DATE, TEXT, TEXT, JSONB, JSONB
) IS 'Canonical tenant-aware journal posting API with an unambiguous PostgREST contract.';

COMMENT ON VIEW public.v_etax_sla_executive_summary IS
  'Executive SLA KPI view with explicit severity ranking and live/archive coverage.';

COMMIT;
