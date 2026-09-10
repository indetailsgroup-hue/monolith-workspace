-- =============================================================================
-- Rebind the compliance dashboard to the partitioned eTax submission parent.
--
-- Migration 0196 renamed the original table to etax_submissions_pre_partition
-- before creating the partitioned parent with the original name. PostgreSQL
-- views follow relation OIDs across renames, so the 0186 dashboard continued
-- reading the backup table and ignored every new partitioned submission.
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
        AND last_attempt_at >= now() - INTERVAL '24 hours'
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
)
SELECT
  submission.org_id,
  submission.total_submissions,
  submission.submitted_count,
  submission.failed_count,
  submission.cancelled_count,
  submission.queued_count,
  submission.submitting_count,
  CASE
    WHEN (
      submission.submitted_count
      + submission.failed_count
      + submission.cancelled_count
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
  submission.submissions_with_pdf_downloaded,
  CASE
    WHEN submission.submitted_count = 0 THEN NULL
    ELSE ROUND(
      submission.submissions_with_pdf_downloaded::NUMERIC
      * 100 / submission.submitted_count,
      2
    )
  END AS pdf_success_rate,
  submission.last_submission_at,
  submission.last_failed_at,
  submission.oldest_unresolved_failed_at,
  submission.failed_last_24h,
  audit.last_audit_event_at,
  COALESCE(notification.overdue_invoice_count, 0) AS overdue_invoice_count,
  COALESCE(notification.overdue_with_pending_etax, 0) AS overdue_with_pending_etax
FROM sub_agg AS submission
LEFT JOIN audit_agg AS audit
  ON audit.org_id = submission.org_id
LEFT JOIN notif_agg AS notification
  ON notification.org_id = submission.org_id;

COMMENT ON VIEW public.v_etax_compliance_dashboard IS
  'Per-org e-Tax compliance metrics bound to the partitioned '
  'etax_submissions parent. Repaired 20270309.';

REVOKE ALL ON public.v_etax_compliance_dashboard FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_etax_compliance_dashboard TO postgres;

DO $migration$
DECLARE
  refresh_result JSONB;
  is_populated BOOLEAN;
BEGIN
  SELECT relation.relispopulated
    INTO is_populated
    FROM pg_catalog.pg_class AS relation
   WHERE relation.oid = 'public.mv_etax_compliance_dashboard'::REGCLASS;

  IF COALESCE(is_populated, FALSE) THEN
    refresh_result := public.fn_refresh_etax_compliance_mv('migration_rebind');
    IF NOT COALESCE((refresh_result ->> 'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION '20270309: compliance MV refresh failed: %', refresh_result;
    END IF;
  ELSE
    -- pg_dump --schema-only restores materialized views WITH NO DATA.
    -- CONCURRENTLY cannot perform that first population, and logging the
    -- failure would invoke the risk-ranking trigger while its input MVs are
    -- still unpopulated. Populate directly; 20270310 logs the coordinated
    -- refresh after both compliance and trend MVs are ready.
    REFRESH MATERIALIZED VIEW public.mv_etax_compliance_dashboard;
  END IF;
END;
$migration$;

COMMIT;
