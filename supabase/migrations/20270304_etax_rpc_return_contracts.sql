-- =============================================================================
-- Migration: eTax RPC return-contract alignment
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_etax_full_health_summary()
RETURNS TABLE (
  org_id UUID, org_name TEXT, total_submissions BIGINT,
  submitted_count BIGINT, failed_count BIGINT, cancelled_count BIGINT,
  queued_count BIGINT, submitting_count BIGINT,
  compliance_success_rate NUMERIC, compliance_avg_attempt_count NUMERIC,
  compliance_max_attempt_count BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  compliance_pdf_success_rate NUMERIC, last_submission_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ, oldest_unresolved_failed_at TIMESTAMPTZ,
  failed_last_24h BIGINT, last_audit_event_at TIMESTAMPTZ,
  overdue_invoice_count BIGINT, overdue_with_pending_etax BIGINT,
  today_submission_day DATE, today_total BIGINT, today_submitted BIGINT,
  today_failed BIGINT, today_exhausted BIGINT, today_queued BIGINT,
  today_pdf_ok BIGINT, today_pdf_fail BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC, today_success_rate_pct NUMERIC,
  today_pdf_success_rate_pct NUMERIC, today_avg_attempt_count NUMERIC,
  today_max_attempt_count INTEGER,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  compliance_mv_age_seconds INTEGER, trend_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_age_seconds INTEGER, health_score INTEGER, health_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_role TEXT;
BEGIN
  SELECT om.org_id, om.role INTO v_org_id, v_role
  FROM public.org_members om WHERE om.user_id = auth.uid() LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not a member of any organization';
  END IF;
  IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION 'Insufficient permissions — OWNER, ADMIN, or FINANCE required';
  END IF;

  RETURN QUERY
  SELECT s.org_id, s.org_name, s.total_submissions, s.submitted_count,
    s.failed_count, s.cancelled_count, s.queued_count, s.submitting_count,
    s.compliance_success_rate, s.compliance_avg_attempt_count,
    s.compliance_max_attempt_count::BIGINT,
    s.submissions_with_pdf_downloaded, s.compliance_pdf_success_rate,
    s.last_submission_at, s.last_failed_at, s.oldest_unresolved_failed_at,
    s.failed_last_24h, s.last_audit_event_at, s.overdue_invoice_count,
    s.overdue_with_pending_etax, s.today_submission_day, s.today_total,
    s.today_submitted, s.today_failed, s.today_exhausted, s.today_queued,
    s.today_pdf_ok, s.today_pdf_fail, s.today_retry_exhaustion_rate_pct,
    s.today_success_rate_pct, s.today_pdf_success_rate_pct,
    s.today_avg_attempt_count, s.today_max_attempt_count,
    s.compliance_mv_last_refreshed_at, s.compliance_mv_age_seconds,
    s.trend_mv_last_refreshed_at, s.trend_mv_age_seconds,
    s.health_score, s.health_status
  FROM public.v_etax_full_health_summary s WHERE s.org_id = v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_full_health_summary_admin(
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID, org_name TEXT, total_submissions BIGINT,
  submitted_count BIGINT, failed_count BIGINT, cancelled_count BIGINT,
  queued_count BIGINT, submitting_count BIGINT,
  compliance_success_rate NUMERIC, compliance_avg_attempt_count NUMERIC,
  compliance_max_attempt_count BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  compliance_pdf_success_rate NUMERIC, last_submission_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ, oldest_unresolved_failed_at TIMESTAMPTZ,
  failed_last_24h BIGINT, last_audit_event_at TIMESTAMPTZ,
  overdue_invoice_count BIGINT, overdue_with_pending_etax BIGINT,
  today_submission_day DATE, today_total BIGINT, today_submitted BIGINT,
  today_failed BIGINT, today_exhausted BIGINT, today_queued BIGINT,
  today_pdf_ok BIGINT, today_pdf_fail BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC, today_success_rate_pct NUMERIC,
  today_pdf_success_rate_pct NUMERIC, today_avg_attempt_count NUMERIC,
  today_max_attempt_count INTEGER,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  compliance_mv_age_seconds INTEGER, trend_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_age_seconds INTEGER, health_score INTEGER, health_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_setting('role', TRUE) NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'rpc_etax_full_health_summary_admin requires service_role';
  END IF;
  RETURN QUERY
  SELECT s.org_id, s.org_name, s.total_submissions, s.submitted_count,
    s.failed_count, s.cancelled_count, s.queued_count, s.submitting_count,
    s.compliance_success_rate, s.compliance_avg_attempt_count,
    s.compliance_max_attempt_count::BIGINT,
    s.submissions_with_pdf_downloaded, s.compliance_pdf_success_rate,
    s.last_submission_at, s.last_failed_at, s.oldest_unresolved_failed_at,
    s.failed_last_24h, s.last_audit_event_at, s.overdue_invoice_count,
    s.overdue_with_pending_etax, s.today_submission_day, s.today_total,
    s.today_submitted, s.today_failed, s.today_exhausted, s.today_queued,
    s.today_pdf_ok, s.today_pdf_fail, s.today_retry_exhaustion_rate_pct,
    s.today_success_rate_pct, s.today_pdf_success_rate_pct,
    s.today_avg_attempt_count, s.today_max_attempt_count,
    s.compliance_mv_last_refreshed_at, s.compliance_mv_age_seconds,
    s.trend_mv_last_refreshed_at, s.trend_mv_age_seconds,
    s.health_score, s.health_status
  FROM public.v_etax_full_health_summary s
  WHERE p_org_id IS NULL OR s.org_id = p_org_id
  ORDER BY s.health_score ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_org_risk_ranking()
RETURNS TABLE (
  org_id UUID, org_name TEXT, health_score NUMERIC, health_status TEXT,
  risk_rank BIGINT, is_priority_review BOOLEAN, risk_tier TEXT,
  total_submissions BIGINT, submitted_count BIGINT, failed_count BIGINT,
  compliance_success_rate NUMERIC, overdue_with_pending_etax BIGINT,
  failed_last_24h BIGINT, today_daily_total BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_last_refreshed_at TIMESTAMPTZ, ranked_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_role TEXT;
BEGIN
  SELECT om.org_id, om.role INTO v_org_id, v_role
  FROM public.org_members om WHERE om.user_id = auth.uid() LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION 'rpc_etax_org_risk_ranking: OWNER, ADMIN, or FINANCE required'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT r.org_id, r.org_name, r.health_score::NUMERIC, r.health_status,
    r.risk_rank, r.is_priority_review, r.risk_tier, r.total_submissions,
    r.submitted_count, r.failed_count, r.compliance_success_rate,
    r.overdue_with_pending_etax, r.failed_last_24h, r.today_daily_total,
    r.today_retry_exhaustion_rate_pct, r.compliance_mv_last_refreshed_at,
    r.trend_mv_last_refreshed_at, r.ranked_at
  FROM public.v_etax_org_risk_ranking r WHERE r.org_id = v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_org_risk_ranking_admin(
  p_org_id UUID DEFAULT NULL,
  p_critical_only BOOLEAN DEFAULT FALSE,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  org_id UUID, org_name TEXT, health_score NUMERIC, health_status TEXT,
  risk_rank BIGINT, is_priority_review BOOLEAN, risk_tier TEXT,
  total_submissions BIGINT, submitted_count BIGINT, failed_count BIGINT,
  compliance_success_rate NUMERIC, overdue_with_pending_etax BIGINT,
  failed_last_24h BIGINT, today_daily_total BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_last_refreshed_at TIMESTAMPTZ, ranked_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', TRUE)::JSONB ->> 'role', '')
     <> 'service_role' THEN
    RAISE EXCEPTION 'service_role JWT required to call rpc_etax_org_risk_ranking_admin'
      USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT r.org_id, r.org_name, r.health_score::NUMERIC, r.health_status,
    r.risk_rank, r.is_priority_review, r.risk_tier, r.total_submissions,
    r.submitted_count, r.failed_count, r.compliance_success_rate,
    r.overdue_with_pending_etax, r.failed_last_24h, r.today_daily_total,
    r.today_retry_exhaustion_rate_pct, r.compliance_mv_last_refreshed_at,
    r.trend_mv_last_refreshed_at, r.ranked_at
  FROM public.v_etax_org_risk_ranking r
  WHERE (p_org_id IS NULL OR r.org_id = p_org_id)
    AND (NOT p_critical_only OR r.is_priority_review)
  ORDER BY r.risk_rank, r.org_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_sla_breach_timeline(
  p_org_id UUID DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  breach_date DATE, org_id UUID, org_name TEXT, document_type TEXT,
  total_created BIGINT, breached_count BIGINT, breach_rate NUMERIC,
  severity_tier TEXT, cumulative_breached BIGINT,
  sla_threshold_hours NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_cutoff DATE := CURRENT_DATE - (v_days - 1);
BEGIN
  RETURN QUERY
  SELECT tl.breach_date, tl.org_id, tl.org_name, tl.document_type,
    tl.total_created, tl.breached_count, tl.breach_rate, tl.severity_tier,
    tl.cumulative_breached::BIGINT, tl.sla_threshold_hours
  FROM public.v_etax_sla_breach_timeline tl
  WHERE (tl.org_id = public.get_user_org_id()
         OR current_setting('role', true) = 'service_role')
    AND tl.breach_date >= v_cutoff
    AND (p_org_id IS NULL OR tl.org_id = p_org_id)
    AND (p_document_type IS NULL OR tl.document_type = p_document_type)
  ORDER BY tl.org_id, tl.document_type, tl.breach_date;
END;
$$;

COMMIT;
