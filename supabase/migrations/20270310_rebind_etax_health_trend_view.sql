-- =============================================================================
-- Rebind the 30-day eTax health trend to the partitioned submission parent.
--
-- Like the compliance view repaired on 20270309, the 0191 trend view followed
-- the original relation OID when migration 0196 renamed that table. Replacing
-- the view preserves its public contract and downstream materialized-view
-- dependency while resolving etax_submissions to the partitioned parent.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_etax_health_trend AS
WITH windowed AS (
  SELECT
    submission.org_id,
    DATE(submission.created_at AT TIME ZONE 'UTC') AS submission_day,
    submission.status,
    submission.attempt_count,
    submission.pdf_status
  FROM public.etax_submissions AS submission
  WHERE submission.created_at
          >= (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '29 days'
    AND submission.created_at
          < (NOW() AT TIME ZONE 'UTC')::DATE + INTERVAL '1 day'
),
daily AS (
  SELECT
    windowed.org_id,
    windowed.submission_day,
    COUNT(*) AS daily_total,
    COUNT(*) FILTER (
      WHERE windowed.status = 'submitted'
    ) AS daily_successful,
    COUNT(*) FILTER (
      WHERE windowed.status = 'failed'
    ) AS daily_failed,
    COUNT(*) FILTER (
      WHERE windowed.status IN ('queued', 'submitting')
    ) AS daily_pending,
    COUNT(*) FILTER (
      WHERE windowed.status = 'cancelled'
    ) AS daily_cancelled,
    COUNT(*) FILTER (
      WHERE windowed.status = 'failed'
        AND windowed.attempt_count >= 5
    ) AS daily_exhausted,
    ROUND(
      100.0
      * COUNT(*) FILTER (
          WHERE windowed.status = 'failed'
            AND windowed.attempt_count >= 5
        )::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    ) AS retry_exhaustion_rate_pct,
    ROUND(
      100.0
      * COUNT(*) FILTER (
          WHERE windowed.status = 'submitted'
        )::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    ) AS success_rate_pct,
    ROUND(AVG(windowed.attempt_count)::NUMERIC, 2) AS avg_attempt_count,
    MAX(windowed.attempt_count) AS max_attempt_count,
    COUNT(*) FILTER (
      WHERE windowed.pdf_status IN ('ready', 'downloaded')
    ) AS daily_pdfs_downloaded,
    COUNT(*) FILTER (
      WHERE windowed.pdf_status = 'failed'
    ) AS daily_pdfs_failed,
    ROUND(
      100.0
      * COUNT(*) FILTER (
          WHERE windowed.pdf_status IN ('ready', 'downloaded')
        )::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    ) AS pdf_success_rate_pct,
    ROW_NUMBER() OVER (
      PARTITION BY windowed.org_id
      ORDER BY windowed.submission_day DESC
    ) AS day_rank
  FROM windowed
  GROUP BY windowed.org_id, windowed.submission_day
)
SELECT
  daily.org_id,
  daily.submission_day,
  daily.day_rank,
  daily.daily_total,
  daily.daily_successful,
  daily.daily_failed,
  daily.daily_pending,
  daily.daily_cancelled,
  daily.daily_exhausted,
  daily.retry_exhaustion_rate_pct,
  daily.success_rate_pct,
  daily.avg_attempt_count,
  daily.max_attempt_count,
  daily.daily_pdfs_downloaded,
  daily.daily_pdfs_failed,
  daily.pdf_success_rate_pct,
  NOW() AS snapshot_at
FROM daily
ORDER BY daily.org_id, daily.submission_day DESC;

COMMENT ON VIEW public.v_etax_health_trend IS
  '30-day daily eTax submission health trend bound to the partitioned '
  'etax_submissions parent. Repaired 20270310.';

REVOKE ALL ON public.v_etax_health_trend FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_etax_health_trend TO service_role;

DO $migration$
DECLARE
  refresh_result JSONB;
BEGIN
  refresh_result := public.fn_refresh_etax_health_trend_mv('migration');
  IF refresh_result ->> 'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION '20270310: health-trend MV refresh failed: %', refresh_result;
  END IF;
END;
$migration$;

COMMIT;
