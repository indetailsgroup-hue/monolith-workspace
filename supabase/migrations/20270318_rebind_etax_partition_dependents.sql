-- Rebind objects created before Migration 0196 to the current partitioned
-- etax_submissions parent.  PostgreSQL keeps dependencies attached to the
-- original relation when it is renamed, so the old functions/views continued
-- to read etax_submissions_pre_partition after the table swap.

-- PDF lifecycle trigger ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_queue_pdf_on_submitted ON public.etax_submissions;
CREATE TRIGGER trg_queue_pdf_on_submitted
  BEFORE UPDATE ON public.etax_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_queue_pdf_on_submitted();

-- Audit lifecycle trigger ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_etax_audit_on_status_change ON public.etax_submissions;
CREATE TRIGGER trg_etax_audit_on_status_change
  AFTER INSERT OR UPDATE OF status, pdf_status ON public.etax_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_etax_record_audit_entry();

-- PDF worker functions must be recreated because their composite return/record
-- type was the renamed pre-partition table type.
DROP FUNCTION IF EXISTS public._etax_claim_pdf_batch(INT);
CREATE FUNCTION public._etax_claim_pdf_batch(p_limit INT DEFAULT 10)
RETURNS SETOF public.etax_submissions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.etax_submissions
  SET pdf_status = 'downloading', updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.etax_submissions
    WHERE pdf_status = 'pending'
      AND status = 'submitted'
    ORDER BY created_at, id
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public._etax_claim_pdf_batch(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._etax_claim_pdf_batch(INT) TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.rpc_etax_mark_pdf_downloaded(
  p_id UUID,
  p_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.etax_submissions%ROWTYPE;
BEGIN
  UPDATE public.etax_submissions
  SET pdf_path = p_path,
      pdf_status = 'downloaded',
      pdf_downloaded_at = NOW(),
      pdf_error = NULL,
      updated_at = NOW()
  WHERE id = p_id
    AND pdf_status = 'downloading'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.etax_submissions WHERE id = p_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'etax_submission % not found', p_id;
    END IF;
    IF v_row.pdf_status = 'downloaded' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'pdf_path', v_row.pdf_path
      );
    END IF;
    RAISE EXCEPTION 'etax_submission % not in downloading state (current: %)',
      p_id, v_row.pdf_status;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'pdf_path', v_row.pdf_path,
    'pdf_downloaded_at', v_row.pdf_downloaded_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_etax_mark_pdf_downloaded(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_downloaded(UUID, TEXT)
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.rpc_etax_mark_pdf_failed(
  p_id UUID,
  p_error TEXT DEFAULT 'unknown error'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.etax_submissions%ROWTYPE;
BEGIN
  UPDATE public.etax_submissions
  SET pdf_status = 'failed',
      pdf_error = p_error,
      updated_at = NOW()
  WHERE id = p_id
    AND pdf_status IN ('pending', 'downloading')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.etax_submissions WHERE id = p_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'etax_submission % not found', p_id;
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'warning', 'row not in pending or downloading state',
      'pdf_status', v_row.pdf_status
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'pdf_status', v_row.pdf_status,
    'pdf_error', v_row.pdf_error
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_etax_mark_pdf_failed(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_failed(UUID, TEXT)
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.rpc_etax_retry_pdf(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.etax_submissions%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_role TEXT;
BEGIN
  SELECT submission.*
  INTO v_row
  FROM public.etax_submissions submission
  JOIN public.org_members member
    ON member.org_id = submission.org_id
   AND member.user_id = v_user_id
  WHERE submission.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or access denied';
  END IF;

  SELECT member.role
  INTO v_role
  FROM public.org_members member
  WHERE member.org_id = v_row.org_id
    AND member.user_id = v_user_id;

  IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION 'Only OWNER, ADMIN, or FINANCE may retry PDF downloads';
  END IF;

  IF v_row.pdf_status NOT IN ('failed', 'downloading') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('pdf_status is %s, nothing to retry', v_row.pdf_status)
    );
  END IF;

  UPDATE public.etax_submissions
  SET pdf_status = 'pending', pdf_error = NULL, updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'pdf_status', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_etax_retry_pdf(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_retry_pdf(UUID) TO authenticated;

-- Rebind the health view to the partitioned parent ---------------------------
CREATE OR REPLACE VIEW public.v_etax_submission_health AS
WITH org_stats AS (
  SELECT
    submission.org_id,
    COUNT(*) AS total_submissions,
    COUNT(*) FILTER (WHERE submission.status = 'submitted') AS successful_submissions,
    COUNT(*) FILTER (WHERE submission.status = 'failed') AS failed_submissions,
    COUNT(*) FILTER (WHERE submission.status IN ('queued', 'submitting')) AS pending_submissions,
    COUNT(*) FILTER (WHERE submission.status = 'cancelled') AS cancelled_submissions,
    COUNT(*) FILTER (
      WHERE submission.status = 'failed' AND submission.attempt_count >= 5
    ) AS exhausted_submissions,
    ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE submission.status = 'failed' AND submission.attempt_count >= 5
      )::NUMERIC / NULLIF(COUNT(*), 0),
      2
    ) AS retry_exhaustion_rate_pct,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE submission.status = 'submitted')::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    ) AS success_rate_pct,
    ROUND(AVG(submission.attempt_count)::NUMERIC, 2) AS avg_attempt_count,
    MAX(submission.attempt_count) AS max_attempt_count,
    COUNT(*) FILTER (WHERE submission.pdf_status IN ('ready', 'downloaded')) AS pdfs_downloaded,
    COUNT(*) FILTER (WHERE submission.pdf_status = 'failed') AS pdfs_failed,
    MAX(submission.updated_at) AS last_submission_at,
    MIN(submission.created_at) AS first_submission_at
  FROM public.etax_submissions submission
  GROUP BY submission.org_id
),
alert_health AS (
  SELECT
    COUNT(*) AS total_alerts_in_window,
    COUNT(*) FILTER (WHERE history.was_resolved) AS resolved_alerts,
    COUNT(*) FILTER (WHERE NOT history.was_resolved) AS unresolved_alerts,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE history.was_resolved)::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    ) AS alert_resolution_rate_pct,
    ROUND(AVG(history.seconds_to_resolve) FILTER (WHERE history.was_resolved), 2)
      AS avg_seconds_to_resolve,
    MIN(history.alerted_at) AS oldest_alert_in_window,
    MAX(history.alerted_at) AS latest_alert_at,
    (ARRAY_AGG(history.current_freshness_status ORDER BY history.alert_rank))[1]
      AS current_freshness_status,
    (ARRAY_AGG(history.current_lag_seconds ORDER BY history.alert_rank))[1]
      AS current_lag_seconds,
    (ARRAY_AGG(history.current_last_refreshed_at ORDER BY history.alert_rank))[1]
      AS current_last_refreshed_at
  FROM public.v_mv_alert_history history
)
SELECT
  stats.org_id,
  stats.total_submissions,
  stats.successful_submissions,
  stats.failed_submissions,
  stats.pending_submissions,
  stats.cancelled_submissions,
  stats.exhausted_submissions,
  stats.retry_exhaustion_rate_pct,
  stats.success_rate_pct,
  stats.avg_attempt_count,
  stats.max_attempt_count,
  stats.pdfs_downloaded,
  stats.pdfs_failed,
  stats.last_submission_at,
  stats.first_submission_at,
  COALESCE(alerts.total_alerts_in_window, 0) AS total_alerts_in_window,
  COALESCE(alerts.resolved_alerts, 0) AS resolved_alerts,
  COALESCE(alerts.unresolved_alerts, 0) AS unresolved_alerts,
  alerts.alert_resolution_rate_pct,
  alerts.avg_seconds_to_resolve,
  alerts.oldest_alert_in_window,
  alerts.latest_alert_at,
  COALESCE(alerts.current_freshness_status, 'unknown') AS current_freshness_status,
  COALESCE(alerts.current_lag_seconds, -1) AS current_lag_seconds,
  alerts.current_last_refreshed_at
FROM org_stats stats
CROSS JOIN alert_health alerts
ORDER BY stats.retry_exhaustion_rate_pct DESC NULLS LAST,
         stats.failed_submissions DESC,
         stats.org_id;

REVOKE ALL ON public.v_etax_submission_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_etax_submission_health TO service_role, postgres;

-- Rebind the live SLA view and allow the service role to populate its cache. --
CREATE OR REPLACE VIEW public.v_etax_submission_sla
WITH (security_invoker = true)
AS
WITH sla_cfg AS (
  SELECT COALESCE(
    (SELECT value::NUMERIC FROM public.platform_config WHERE key = 'etax_sla_hours'),
    24
  ) AS sla_hours
),
submission_timing AS (
  SELECT
    submission.id AS submission_id,
    submission.org_id,
    submission.invoice_id,
    submission.document_type,
    submission.status,
    submission.attempt_count,
    submission.created_at,
    CASE
      WHEN submission.status = 'submitted' THEN submission.updated_at
      ELSE NOW()
    END AS closed_at,
    EXTRACT(EPOCH FROM (
      CASE
        WHEN submission.status = 'submitted' THEN submission.updated_at
        ELSE NOW()
      END - submission.created_at
    )) / 3600.0 AS processing_hours,
    (SELECT sla_hours FROM sla_cfg) AS sla_threshold_hours,
    EXTRACT(EPOCH FROM (
      CASE
        WHEN submission.status = 'submitted' THEN submission.updated_at
        ELSE NOW()
      END - submission.created_at
    )) / 3600.0 > (SELECT sla_hours FROM sla_cfg) AS is_sla_breach
  FROM public.etax_submissions submission
  WHERE submission.org_id = public.get_user_org_id()
     OR auth.role() = 'service_role'
),
org_doc_agg AS (
  SELECT
    timing.org_id,
    timing.document_type,
    COUNT(*) AS total_submissions,
    COUNT(*) FILTER (WHERE timing.is_sla_breach) AS breached_count,
    COUNT(*) FILTER (
      WHERE timing.is_sla_breach
        AND timing.status NOT IN ('submitted', 'cancelled')
    ) AS active_breach_count,
    ROUND(
      COUNT(*) FILTER (WHERE timing.is_sla_breach)::NUMERIC
      / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS breach_rate_pct,
    ROUND(AVG(timing.processing_hours)::NUMERIC, 2) AS avg_processing_hours,
    ROUND(MAX(timing.processing_hours)::NUMERIC, 2) AS max_processing_hours,
    ROUND(
      AVG(timing.processing_hours) FILTER (WHERE timing.is_sla_breach)::NUMERIC,
      2
    ) AS avg_breach_overage_hours,
    MIN(timing.created_at) FILTER (WHERE timing.is_sla_breach)
      AS oldest_breach_created_at,
    MAX(timing.created_at) FILTER (WHERE timing.is_sla_breach)
      AS newest_breach_created_at,
    COUNT(*) FILTER (
      WHERE timing.is_sla_breach AND timing.status = 'failed'
    ) AS breach_failed_count,
    COUNT(*) FILTER (
      WHERE timing.is_sla_breach AND timing.status = 'queued'
    ) AS breach_queued_count,
    COUNT(*) FILTER (
      WHERE timing.is_sla_breach AND timing.status = 'submitting'
    ) AS breach_submitting_count,
    COUNT(*) FILTER (
      WHERE timing.is_sla_breach AND timing.status = 'submitted'
    ) AS breach_submitted_count,
    MAX(timing.attempt_count) FILTER (WHERE timing.is_sla_breach)
      AS max_breach_attempts,
    timing.sla_threshold_hours
  FROM submission_timing timing
  GROUP BY timing.org_id, timing.document_type, timing.sla_threshold_hours
)
SELECT
  organization.name AS org_name,
  aggregate.org_id,
  aggregate.document_type,
  aggregate.sla_threshold_hours,
  aggregate.total_submissions,
  aggregate.breached_count,
  aggregate.active_breach_count,
  aggregate.breach_rate_pct,
  CASE
    WHEN aggregate.breach_rate_pct >= 50 THEN 'CRITICAL'
    WHEN aggregate.breach_rate_pct >= 25 THEN 'WARNING'
    WHEN aggregate.breach_rate_pct >= 10 THEN 'ELEVATED'
    WHEN aggregate.breach_rate_pct > 0 THEN 'NORMAL'
    ELSE 'HEALTHY'
  END AS sla_severity,
  aggregate.avg_processing_hours,
  aggregate.max_processing_hours,
  aggregate.avg_breach_overage_hours,
  aggregate.oldest_breach_created_at,
  aggregate.newest_breach_created_at,
  aggregate.breach_failed_count,
  aggregate.breach_queued_count,
  aggregate.breach_submitting_count,
  aggregate.breach_submitted_count,
  aggregate.max_breach_attempts,
  NOW() AS snapshot_at
FROM org_doc_agg aggregate
JOIN public.organizations organization ON organization.org_id = aggregate.org_id;

GRANT SELECT ON public.v_etax_submission_sla TO authenticated, service_role;
REVOKE ALL ON public.v_etax_submission_sla FROM anon;

-- Direct timeline reads must use the caller's RLS context.  The service role
-- keeps BYPASSRLS access for refresh/diagnostic jobs.
ALTER VIEW public.v_etax_sla_breach_timeline SET (security_invoker = true);

-- Explicitly revoke direct grants installed by Supabase default privileges.
-- Revoking PUBLIC alone is insufficient when anon/authenticated were granted
-- EXECUTE directly at function creation time.
REVOKE ALL ON FUNCTION public.rpc_etax_submission_health_admin()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_health_admin()
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_etax_health_trend_admin()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin()
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_etax_health_trend_admin(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin(UUID)
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_list_mv_alert_history_admin(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_mv_alert_history_admin(INT)
  TO service_role, postgres;

REVOKE ALL ON public.v_mv_alert_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_mv_alert_history TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_etax_submission_sla_cached(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_sla_cached(TEXT, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON public.mv_etax_submission_sla FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mv_etax_submission_sla TO service_role, postgres;

REVOKE ALL ON FUNCTION public.rpc_etax_submission_sla(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_sla(TEXT, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_summary()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_summary()
  TO authenticated, service_role;
