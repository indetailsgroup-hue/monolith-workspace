-- =============================================================================
-- Migration: stored-function contract and lint repairs
--
-- Replaces only the broken definitions reported by `supabase db lint --level
-- error`. Signatures and grants remain unchanged so API clients do not need to
-- migrate. Every query now qualifies output-column names and casts view values
-- to the RPC's published return contract.
-- =============================================================================

BEGIN;

-- Two historical overloads are still public API. Keep both, using the canonical
-- jobs.deadline column and PostgreSQL's to_jsonb(record) function.
CREATE OR REPLACE FUNCTION public.rpc_job_board(
  p_status public.job_status DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_app_role('designer') OR public.has_app_role('factory')
       OR public.has_app_role('finance')  OR public.has_app_role('admin')
       OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(board_row) ORDER BY board_row.updated_at DESC),
      '[]'::jsonb
    )
    FROM (
      SELECT j.*, c.name AS customer_name
      FROM public.jobs j
      JOIN public.customers c ON c.customer_id = j.customer_id
      WHERE j.org_id = v_org_id
        AND (p_status IS NULL OR j.status = p_status)
      ORDER BY j.updated_at DESC
      LIMIT p_limit
    ) AS board_row
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_job_board(
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  PERFORM public.fn_verify_org_claim();
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_job_board: caller has no active org membership';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(board_row))
    FROM (
      SELECT j.job_id, j.job_code, j.status, j.deadline,
             c.name AS customer_name, j.created_at
      FROM public.jobs j
      JOIN public.customers c
        ON c.customer_id = j.customer_id
       AND c.org_id = v_org_id
      WHERE j.org_id = v_org_id
        AND (p_status IS NULL OR j.status::text = p_status)
      ORDER BY j.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) AS board_row
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_ledger_summary(p_book_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_result JSONB;
BEGIN
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

  SELECT COALESCE(jsonb_agg(to_jsonb(summary_row)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT je.book_id,
           COUNT(DISTINCT je.id)::INT AS entry_count,
           COALESCE(SUM(jl.base_debit), 0)::NUMERIC(15,2) AS total_debit,
           COALESCE(SUM(jl.base_credit), 0)::NUMERIC(15,2) AS total_credit
    FROM public.journal_entry je
    JOIN public.journal_line jl ON jl.journal_entry_id = je.id
    WHERE je.status = 'posted'
      AND (p_book_id IS NULL OR je.book_id = p_book_id)
    GROUP BY je.book_id
  ) AS summary_row;
  RETURN v_result;
END;
$$;

-- Qualifying the view alias removes PL/pgSQL output-parameter ambiguity.
CREATE OR REPLACE FUNCTION public.rpc_list_mv_alert_history(p_limit INT DEFAULT 10)
RETURNS TABLE (
  alert_id UUID, alerted_at TIMESTAMPTZ, alert_type TEXT, alert_rank BIGINT,
  lag_seconds_at_alert NUMERIC, threshold_seconds INT,
  freshness_status_at_alert TEXT, mv_last_refreshed_at_at_alert TEXT,
  detected_at TIMESTAMPTZ, cron_job TEXT, triggered_by_at_alert TEXT,
  refresh_duration_ms_at_alert NUMERIC, row_count_at_alert BIGINT,
  time_since_prev_alert INTERVAL, resolved_at TIMESTAMPTZ,
  was_resolved BOOLEAN, seconds_to_resolve NUMERIC,
  current_lag_seconds NUMERIC, current_freshness_status TEXT,
  current_last_refreshed_at TIMESTAMPTZ,
  current_refresh_duration_ms NUMERIC, current_row_count BIGINT,
  current_triggered_by TEXT, affected_org_count BIGINT,
  total_submissions_in_mv NUMERIC, max_failed_last_24h_in_mv NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org_id UUID;
BEGIN
  v_caller_org_id := public.get_user_org_id();
  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_list_mv_alert_history: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.org_id = v_caller_org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_list_mv_alert_history: insufficient role'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT h.alert_id, h.alerted_at, h.alert_type, h.alert_rank,
    h.lag_seconds_at_alert, h.threshold_seconds,
    h.freshness_status_at_alert, h.mv_last_refreshed_at_at_alert,
    h.detected_at, h.cron_job, h.triggered_by_at_alert,
    h.refresh_duration_ms_at_alert, h.row_count_at_alert,
    h.time_since_prev_alert, h.resolved_at, h.was_resolved,
    h.seconds_to_resolve, h.current_lag_seconds::NUMERIC,
    h.current_freshness_status, h.current_last_refreshed_at,
    h.current_refresh_duration_ms::NUMERIC, h.current_row_count::BIGINT,
    h.current_triggered_by, h.affected_org_count,
    h.total_submissions_in_mv, h.max_failed_last_24h_in_mv::NUMERIC
  FROM public.v_mv_alert_history h
  WHERE h.alert_rank <= LEAST(GREATEST(p_limit, 1), 50)
  ORDER BY h.alert_rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_list_mv_alert_history_admin(p_limit INT DEFAULT 10)
RETURNS TABLE (
  alert_id UUID, alerted_at TIMESTAMPTZ, alert_type TEXT, alert_rank BIGINT,
  lag_seconds_at_alert NUMERIC, threshold_seconds INT,
  freshness_status_at_alert TEXT, mv_last_refreshed_at_at_alert TEXT,
  detected_at TIMESTAMPTZ, cron_job TEXT, triggered_by_at_alert TEXT,
  refresh_duration_ms_at_alert NUMERIC, row_count_at_alert BIGINT,
  time_since_prev_alert INTERVAL, resolved_at TIMESTAMPTZ,
  was_resolved BOOLEAN, seconds_to_resolve NUMERIC,
  current_lag_seconds NUMERIC, current_freshness_status TEXT,
  current_last_refreshed_at TIMESTAMPTZ,
  current_refresh_duration_ms NUMERIC, current_row_count BIGINT,
  current_triggered_by TEXT, affected_org_count BIGINT,
  total_submissions_in_mv NUMERIC, max_failed_last_24h_in_mv NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.*
  FROM public.v_mv_alert_history h
  WHERE h.alert_rank <= LEAST(GREATEST(p_limit, 1), 200)
  ORDER BY h.alert_rank
$$;

-- eTax health RPCs: qualify org_id and make the published numeric lag type
-- explicit instead of relying on COALESCE's inferred integer type.
CREATE OR REPLACE FUNCTION public.rpc_etax_submission_health()
RETURNS TABLE (
  org_id UUID, total_submissions BIGINT, successful_submissions BIGINT,
  failed_submissions BIGINT, pending_submissions BIGINT,
  cancelled_submissions BIGINT, exhausted_submissions BIGINT,
  retry_exhaustion_rate_pct NUMERIC, success_rate_pct NUMERIC,
  avg_attempt_count NUMERIC, max_attempt_count INT,
  pdfs_downloaded BIGINT, pdfs_failed BIGINT,
  last_submission_at TIMESTAMPTZ, first_submission_at TIMESTAMPTZ,
  total_alerts_in_window BIGINT, resolved_alerts BIGINT,
  unresolved_alerts BIGINT, alert_resolution_rate_pct NUMERIC,
  avg_seconds_to_resolve NUMERIC, oldest_alert_in_window TIMESTAMPTZ,
  latest_alert_at TIMESTAMPTZ, current_freshness_status TEXT,
  current_lag_seconds NUMERIC, current_last_refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_etax_submission_health: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
      AND om.role IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_etax_submission_health: insufficient role'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT h.org_id, h.total_submissions, h.successful_submissions,
         h.failed_submissions, h.pending_submissions, h.cancelled_submissions,
         h.exhausted_submissions, h.retry_exhaustion_rate_pct,
         h.success_rate_pct, h.avg_attempt_count, h.max_attempt_count,
         h.pdfs_downloaded, h.pdfs_failed, h.last_submission_at,
         h.first_submission_at, h.total_alerts_in_window, h.resolved_alerts,
         h.unresolved_alerts, h.alert_resolution_rate_pct,
         h.avg_seconds_to_resolve, h.oldest_alert_in_window, h.latest_alert_at,
         h.current_freshness_status, h.current_lag_seconds::NUMERIC,
         h.current_last_refreshed_at
  FROM public.v_etax_submission_health h
  WHERE h.org_id = v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_submission_health_admin()
RETURNS TABLE (
  org_id UUID, total_submissions BIGINT, successful_submissions BIGINT,
  failed_submissions BIGINT, pending_submissions BIGINT,
  cancelled_submissions BIGINT, exhausted_submissions BIGINT,
  retry_exhaustion_rate_pct NUMERIC, success_rate_pct NUMERIC,
  avg_attempt_count NUMERIC, max_attempt_count INT,
  pdfs_downloaded BIGINT, pdfs_failed BIGINT,
  last_submission_at TIMESTAMPTZ, first_submission_at TIMESTAMPTZ,
  total_alerts_in_window BIGINT, resolved_alerts BIGINT,
  unresolved_alerts BIGINT, alert_resolution_rate_pct NUMERIC,
  avg_seconds_to_resolve NUMERIC, oldest_alert_in_window TIMESTAMPTZ,
  latest_alert_at TIMESTAMPTZ, current_freshness_status TEXT,
  current_lag_seconds NUMERIC, current_last_refreshed_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT h.org_id, h.total_submissions, h.successful_submissions,
         h.failed_submissions, h.pending_submissions, h.cancelled_submissions,
         h.exhausted_submissions, h.retry_exhaustion_rate_pct,
         h.success_rate_pct, h.avg_attempt_count, h.max_attempt_count,
         h.pdfs_downloaded, h.pdfs_failed, h.last_submission_at,
         h.first_submission_at, h.total_alerts_in_window, h.resolved_alerts,
         h.unresolved_alerts, h.alert_resolution_rate_pct,
         h.avg_seconds_to_resolve, h.oldest_alert_in_window, h.latest_alert_at,
         h.current_freshness_status, h.current_lag_seconds::NUMERIC,
         h.current_last_refreshed_at
  FROM public.v_etax_submission_health h
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_health_trend()
RETURNS TABLE (
  org_id UUID, submission_day DATE, day_rank BIGINT, daily_total BIGINT,
  daily_successful BIGINT, daily_failed BIGINT, daily_pending BIGINT,
  daily_cancelled BIGINT, daily_exhausted BIGINT,
  retry_exhaustion_rate_pct NUMERIC, success_rate_pct NUMERIC,
  avg_attempt_count NUMERIC, max_attempt_count INT,
  daily_pdfs_downloaded BIGINT, daily_pdfs_failed BIGINT,
  pdf_success_rate_pct NUMERIC, snapshot_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_etax_health_trend: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
      AND om.role IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_etax_health_trend: insufficient role'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT h.* FROM public.v_etax_health_trend h
  WHERE h.org_id = v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_health_trend_admin(p_org_id UUID)
RETURNS TABLE (
  org_id UUID, submission_day DATE, day_rank BIGINT, daily_total BIGINT,
  daily_successful BIGINT, daily_failed BIGINT, daily_pending BIGINT,
  daily_cancelled BIGINT, daily_exhausted BIGINT,
  retry_exhaustion_rate_pct NUMERIC, success_rate_pct NUMERIC,
  avg_attempt_count NUMERIC, max_attempt_count INT,
  daily_pdfs_downloaded BIGINT, daily_pdfs_failed BIGINT,
  pdf_success_rate_pct NUMERIC, snapshot_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT h.* FROM public.v_etax_health_trend h WHERE h.org_id = p_org_id
$$;

COMMIT;
