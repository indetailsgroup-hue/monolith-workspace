-- =============================================================================
-- Repair two dashboard scope defects exposed after the partition rebind.
--
-- 1. The compliance view was anchored only on submissions, hiding overdue
--    invoices that did not yet have an eTax row.
-- 2. The full-health summary treated day_rank = 1 as "today". Day rank means
--    most recent active day, which may be yesterday or older.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_etax_compliance_dashboard AS
WITH sub_agg AS (
  SELECT
    org_id,
    COUNT(*) AS total_submissions,
    COUNT(*) FILTER (WHERE status = 'submitted') AS submitted_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COUNT(*) FILTER (WHERE status = 'queued') AS queued_count,
    COUNT(*) FILTER (WHERE status = 'submitting') AS submitting_count,
    ROUND(AVG(attempt_count)::NUMERIC, 2) AS avg_attempt_count,
    MAX(attempt_count) AS max_attempt_count,
    COUNT(*) FILTER (
      WHERE pdf_status IN ('ready', 'downloaded')
    ) AS submissions_with_pdf_downloaded,
    MAX(submitted_at) AS last_submission_at,
    MAX(last_attempt_at) FILTER (WHERE status = 'failed') AS last_failed_at,
    MIN(created_at) FILTER (
      WHERE status = 'failed' AND submitted_at IS NULL
    ) AS oldest_unresolved_failed_at,
    COUNT(*) FILTER (
      WHERE status = 'failed'
        AND last_attempt_at >= NOW() - INTERVAL '24 hours'
    ) AS failed_last_24h
  FROM public.etax_submissions
  GROUP BY org_id
),
audit_agg AS (
  SELECT org_id, MAX(changed_at) AS last_audit_event_at
  FROM public.etax_submission_audit_log
  GROUP BY org_id
),
notif_agg AS (
  SELECT
    notification.org_id,
    COUNT(DISTINCT notification.invoice_id) FILTER (
      WHERE notification.notification_type IN (
        'overdue_1d', 'overdue_7d', 'overdue_30d', 'overdue_90d'
      )
        AND notification.status <> 'dismissed'
        AND (
          notification.snoozed_until IS NULL
          OR notification.snoozed_until < CURRENT_DATE
        )
    ) AS overdue_invoice_count,
    COUNT(DISTINCT notification.invoice_id) FILTER (
      WHERE notification.notification_type IN (
        'overdue_1d', 'overdue_7d', 'overdue_30d', 'overdue_90d'
      )
        AND notification.status <> 'dismissed'
        AND (
          notification.snoozed_until IS NULL
          OR notification.snoozed_until < CURRENT_DATE
        )
        AND EXISTS (
          SELECT 1
          FROM public.etax_submissions AS submission
          WHERE submission.invoice_id = notification.invoice_id
            AND submission.org_id = notification.org_id
            AND submission.status NOT IN ('submitted', 'cancelled')
        )
    ) AS overdue_with_pending_etax
  FROM public.invoice_notifications AS notification
  GROUP BY notification.org_id
),
org_scope AS (
  SELECT org_id FROM sub_agg
  UNION
  SELECT org_id FROM notif_agg
)
SELECT
  scope.org_id,
  COALESCE(submission.total_submissions, 0::BIGINT) AS total_submissions,
  COALESCE(submission.submitted_count, 0::BIGINT) AS submitted_count,
  COALESCE(submission.failed_count, 0::BIGINT) AS failed_count,
  COALESCE(submission.cancelled_count, 0::BIGINT) AS cancelled_count,
  COALESCE(submission.queued_count, 0::BIGINT) AS queued_count,
  COALESCE(submission.submitting_count, 0::BIGINT) AS submitting_count,
  CASE
    WHEN COALESCE(
      submission.submitted_count
      + submission.failed_count
      + submission.cancelled_count,
      0
    ) = 0 THEN NULL
    ELSE ROUND(
      submission.submitted_count::NUMERIC * 100
      / (
        submission.submitted_count
        + submission.failed_count
        + submission.cancelled_count
      ),
      2
    )
  END AS success_rate,
  submission.avg_attempt_count,
  submission.max_attempt_count,
  COALESCE(
    submission.submissions_with_pdf_downloaded,
    0::BIGINT
  ) AS submissions_with_pdf_downloaded,
  CASE
    WHEN COALESCE(submission.submitted_count, 0) = 0 THEN NULL
    ELSE ROUND(
      submission.submissions_with_pdf_downloaded::NUMERIC
      * 100 / submission.submitted_count,
      2
    )
  END AS pdf_success_rate,
  submission.last_submission_at,
  submission.last_failed_at,
  submission.oldest_unresolved_failed_at,
  COALESCE(submission.failed_last_24h, 0::BIGINT) AS failed_last_24h,
  audit.last_audit_event_at,
  COALESCE(notification.overdue_invoice_count, 0::BIGINT)
    AS overdue_invoice_count,
  COALESCE(notification.overdue_with_pending_etax, 0::BIGINT)
    AS overdue_with_pending_etax
FROM org_scope AS scope
LEFT JOIN sub_agg AS submission
  ON submission.org_id = scope.org_id
LEFT JOIN audit_agg AS audit
  ON audit.org_id = scope.org_id
LEFT JOIN notif_agg AS notification
  ON notification.org_id = scope.org_id;

COMMENT ON VIEW public.v_etax_compliance_dashboard IS
  'Per-org eTax metrics over the partitioned submission table. Includes '
  'overdue-notification orgs even before an eTax row exists. Repaired 20270312.';

REVOKE ALL ON public.v_etax_compliance_dashboard FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_etax_compliance_dashboard TO postgres;

DO $refresh_compliance$
DECLARE
  refresh_result JSONB;
BEGIN
  refresh_result := public.fn_refresh_etax_compliance_mv('migration_rebind');
  IF NOT COALESCE((refresh_result ->> 'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION '20270312: compliance MV refresh failed: %', refresh_result;
  END IF;
END;
$refresh_compliance$;

CREATE OR REPLACE VIEW public.v_etax_full_health_summary AS
WITH compliance_refresh AS (
  SELECT
    refreshed_at AS last_refreshed_at,
    EXTRACT(EPOCH FROM (NOW() - refreshed_at))::INT AS age_seconds
  FROM public.etax_compliance_mv_refresh_log
  ORDER BY id DESC
  LIMIT 1
),
trend_refresh AS (
  SELECT
    refreshed_at AS last_refreshed_at,
    EXTRACT(EPOCH FROM (NOW() - refreshed_at))::INT AS age_seconds
  FROM public.etax_health_trend_mv_refresh_log
  ORDER BY id DESC
  LIMIT 1
),
joined AS (
  SELECT
    compliance.org_id,
    organization.name AS org_name,
    compliance.total_submissions,
    compliance.submitted_count,
    compliance.failed_count,
    compliance.cancelled_count,
    compliance.queued_count,
    compliance.submitting_count,
    compliance.success_rate AS compliance_success_rate,
    compliance.avg_attempt_count AS compliance_avg_attempt_count,
    compliance.max_attempt_count AS compliance_max_attempt_count,
    compliance.submissions_with_pdf_downloaded,
    compliance.pdf_success_rate AS compliance_pdf_success_rate,
    compliance.last_submission_at,
    compliance.last_failed_at,
    compliance.oldest_unresolved_failed_at,
    compliance.failed_last_24h,
    compliance.last_audit_event_at,
    compliance.overdue_invoice_count,
    compliance.overdue_with_pending_etax,
    trend.submission_day AS today_submission_day,
    COALESCE(trend.daily_total, 0::BIGINT) AS today_total,
    COALESCE(trend.daily_submitted, 0::BIGINT) AS today_submitted,
    COALESCE(trend.daily_failed, 0::BIGINT) AS today_failed,
    COALESCE(trend.daily_exhausted, 0::BIGINT) AS today_exhausted,
    COALESCE(trend.daily_queued, 0::BIGINT) AS today_queued,
    COALESCE(trend.daily_pdf_ok, 0::BIGINT) AS today_pdf_ok,
    COALESCE(trend.daily_pdf_fail, 0::BIGINT) AS today_pdf_fail,
    COALESCE(trend.retry_exhaustion_rate_pct, 0::NUMERIC)
      AS today_retry_exhaustion_rate_pct,
    COALESCE(trend.success_rate_pct, 0::NUMERIC) AS today_success_rate_pct,
    COALESCE(trend.pdf_success_rate_pct, 0::NUMERIC)
      AS today_pdf_success_rate_pct,
    trend.avg_attempt_count AS today_avg_attempt_count,
    trend.max_attempt_count AS today_max_attempt_count,
    compliance_log.last_refreshed_at AS compliance_mv_last_refreshed_at,
    compliance_log.age_seconds AS compliance_mv_age_seconds,
    trend_log.last_refreshed_at AS trend_mv_last_refreshed_at,
    trend_log.age_seconds AS trend_mv_age_seconds
  FROM public.mv_etax_compliance_dashboard AS compliance
  JOIN public.organizations AS organization
    ON organization.org_id = compliance.org_id
  LEFT JOIN public.mv_etax_health_trend AS trend
    ON trend.org_id = compliance.org_id
   AND trend.submission_day = (NOW() AT TIME ZONE 'UTC')::DATE
  CROSS JOIN compliance_refresh AS compliance_log
  CROSS JOIN trend_refresh AS trend_log
),
scored AS (
  SELECT
    joined.*,
    GREATEST(
      0,
      LEAST(
        100,
        100
        - ROUND((100 - COALESCE(compliance_success_rate, 0)) * 0.40)
        - ROUND(COALESCE(today_retry_exhaustion_rate_pct, 0) * 0.30)
        - LEAST(COALESCE(overdue_with_pending_etax, 0) * 2, 20)
        - LEAST(COALESCE(failed_last_24h, 0)::INT, 10)
      )
    )::INT AS health_score
  FROM joined
)
SELECT
  scored.*,
  CASE
    WHEN health_score >= 80 THEN 'healthy'
    WHEN health_score >= 50 THEN 'warning'
    ELSE 'critical'
  END AS health_status
FROM scored
ORDER BY health_score ASC;

COMMENT ON VIEW public.v_etax_full_health_summary IS
  'Per-org eTax health snapshot. Today metrics match the current UTC date '
  'instead of the most recent active trend day. Repaired 20270312.';

REVOKE ALL ON public.v_etax_full_health_summary FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_etax_full_health_summary TO service_role;

COMMIT;
