-- ============================================================
-- Migration 0190: v_etax_submission_health — Per-Org Submission Health View
-- ============================================================
-- Purpose:
--   Creates a view that joins etax_submissions (per-org metrics) with
--   v_mv_alert_history (system-level alert metrics) to surface a
--   comprehensive health snapshot per organisation:
--
--   Per-org (from etax_submissions):
--     • total_submissions, successful_submissions, failed_submissions
--     • exhausted_submissions  — attempt_count >= 5 AND status = 'failed'
--     • retry_exhaustion_rate_pct — % of total that are exhausted
--     • success_rate_pct
--     • avg_attempt_count
--     • pending_submissions  — status IN ('queued','submitting')
--     • last_submission_at
--
--   System-level (from v_mv_alert_history — same for all org rows):
--     • total_alerts_in_window   — alerts in the last 10-event window
--     • resolved_alerts          — how many resolved
--     • unresolved_alerts
--     • alert_resolution_rate_pct
--     • avg_seconds_to_resolve   — avg across resolved alerts
--     • latest_alert_at          — most recent alert timestamp
--     • current_freshness_status — from v_mv_refresh_lag (LATERAL)
--
-- Design notes:
--   • v_mv_alert_history has no org_id — system-level metrics are
--     CROSS JOINed so every org row carries identical system context.
--   • View access via SECURITY DEFINER RPCs only; direct SELECT revoked.
--   • rpc_etax_submission_health()       — authenticated, FINANCE/ADMIN/OWNER
--   • rpc_etax_submission_health_admin() — service_role only
--
-- Prerequisite migrations: 0181, 0185, 0186, 0189
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Prerequisite guards
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'etax_submissions'
  ) THEN
    RAISE EXCEPTION '0190: etax_submissions table not found. Run migration 0181 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_mv_alert_history'
  ) THEN
    RAISE EXCEPTION '0190: v_mv_alert_history view not found. Run migration 0189 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_mv_refresh_lag'
  ) THEN
    RAISE EXCEPTION '0190: v_mv_refresh_lag view not found. Run migration 0187 first.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Drop existing objects (idempotent)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_etax_submission_health();
DROP FUNCTION IF EXISTS public.rpc_etax_submission_health_admin();
DROP VIEW  IF EXISTS public.v_etax_submission_health;

-- ─────────────────────────────────────────────────────────────
-- 2. v_etax_submission_health
-- ─────────────────────────────────────────────────────────────
CREATE VIEW public.v_etax_submission_health AS
WITH

-- ── 2a. Per-org submission metrics ──────────────────────────
org_stats AS (
  SELECT
    es.org_id,

    -- Volume
    COUNT(*)                                                          AS total_submissions,
    COUNT(*) FILTER (WHERE es.status = 'submitted')                  AS successful_submissions,
    COUNT(*) FILTER (WHERE es.status = 'failed')                     AS failed_submissions,
    COUNT(*) FILTER (WHERE es.status IN ('queued', 'submitting'))    AS pending_submissions,
    COUNT(*) FILTER (WHERE es.status = 'cancelled')                  AS cancelled_submissions,

    -- Retry exhaustion: failed submissions that have used all 5 attempts
    COUNT(*) FILTER (
      WHERE es.status = 'failed' AND es.attempt_count >= 5
    )                                                                 AS exhausted_submissions,

    -- Rates (NULL-safe via NULLIF to avoid divide-by-zero)
    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE es.status = 'failed' AND es.attempt_count >= 5)::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS retry_exhaustion_rate_pct,

    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE es.status = 'submitted')::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS success_rate_pct,

    -- Attempt-count health
    ROUND(AVG(es.attempt_count)::NUMERIC, 2)                         AS avg_attempt_count,
    MAX(es.attempt_count)                                             AS max_attempt_count,

    -- PDF pipeline
    COUNT(*) FILTER (WHERE es.pdf_status = 'downloaded')             AS pdfs_downloaded,
    COUNT(*) FILTER (WHERE es.pdf_status = 'failed')                 AS pdfs_failed,

    -- Recency
    MAX(es.updated_at)                                               AS last_submission_at,
    MIN(es.created_at)                                               AS first_submission_at
  FROM public.etax_submissions es
  GROUP BY es.org_id
),

-- ── 2b. System-level alert health (from v_mv_alert_history) ─
-- No org_id in this CTE — CROSS JOINed so every org row inherits
-- the same system context snapshot.
alert_health AS (
  SELECT
    COUNT(*)                                                          AS total_alerts_in_window,
    COUNT(*) FILTER (WHERE ah.was_resolved)                          AS resolved_alerts,
    COUNT(*) FILTER (WHERE NOT ah.was_resolved)                      AS unresolved_alerts,

    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE ah.was_resolved)::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS alert_resolution_rate_pct,

    -- avg seconds to resolve across all resolved alerts in the window
    ROUND(AVG(ah.seconds_to_resolve) FILTER (WHERE ah.was_resolved), 2)
                                                                      AS avg_seconds_to_resolve,

    MIN(ah.alerted_at)                                               AS oldest_alert_in_window,
    MAX(ah.alerted_at)                                               AS latest_alert_at,

    -- Current system lag context (from the most recent alert row)
    (ARRAY_AGG(ah.current_freshness_status  ORDER BY ah.alert_rank))[1]
                                                                      AS current_freshness_status,
    (ARRAY_AGG(ah.current_lag_seconds       ORDER BY ah.alert_rank))[1]
                                                                      AS current_lag_seconds,
    (ARRAY_AGG(ah.current_last_refreshed_at ORDER BY ah.alert_rank))[1]
                                                                      AS current_last_refreshed_at
  FROM public.v_mv_alert_history ah
)

-- ── 2c. Final SELECT ─────────────────────────────────────────
SELECT
  -- Org identity
  os.org_id,

  -- Submission volume
  os.total_submissions,
  os.successful_submissions,
  os.failed_submissions,
  os.pending_submissions,
  os.cancelled_submissions,
  os.exhausted_submissions,

  -- Rates
  os.retry_exhaustion_rate_pct,
  os.success_rate_pct,

  -- Attempt-count health
  os.avg_attempt_count,
  os.max_attempt_count,

  -- PDF pipeline
  os.pdfs_downloaded,
  os.pdfs_failed,

  -- Recency
  os.last_submission_at,
  os.first_submission_at,

  -- System alert health (same value for every org row — snapshot at query time)
  COALESCE(ah.total_alerts_in_window,      0)                        AS total_alerts_in_window,
  COALESCE(ah.resolved_alerts,             0)                        AS resolved_alerts,
  COALESCE(ah.unresolved_alerts,           0)                        AS unresolved_alerts,
  ah.alert_resolution_rate_pct,
  ah.avg_seconds_to_resolve,
  ah.oldest_alert_in_window,
  ah.latest_alert_at,

  -- Current system lag (from v_mv_alert_history → v_mv_refresh_lag passthrough)
  COALESCE(ah.current_freshness_status,    'unknown')                AS current_freshness_status,
  COALESCE(ah.current_lag_seconds,         -1)                       AS current_lag_seconds,
  ah.current_last_refreshed_at

FROM org_stats os
-- CROSS JOIN because alert_health is a single-row aggregate (system-wide)
CROSS JOIN alert_health ah

ORDER BY os.retry_exhaustion_rate_pct DESC NULLS LAST,
         os.failed_submissions         DESC;

COMMENT ON VIEW public.v_etax_submission_health IS
  'Per-org eTax submission health view. Joins etax_submissions (per-org metrics) '
  'with v_mv_alert_history (system alert stats) via CROSS JOIN. '
  'Per-org metrics: total/successful/failed/pending/exhausted submissions, '
  'retry_exhaustion_rate_pct, success_rate_pct, avg_attempt_count, pdf pipeline stats. '
  'System metrics (same for all orgs): alert window stats, avg_seconds_to_resolve, '
  'current MV freshness status. '
  'All access via SECURITY DEFINER RPCs. Added by migration 0190.';

-- ─────────────────────────────────────────────────────────────
-- 3. Revoke direct access
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON public.v_etax_submission_health FROM PUBLIC;
REVOKE ALL ON public.v_etax_submission_health FROM authenticated;
GRANT  SELECT ON public.v_etax_submission_health TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. rpc_etax_submission_health() — authenticated, org-scoped
--    Returns health row for the caller's org only.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_submission_health()
RETURNS TABLE (
  org_id                      UUID,
  total_submissions           BIGINT,
  successful_submissions      BIGINT,
  failed_submissions          BIGINT,
  pending_submissions         BIGINT,
  cancelled_submissions       BIGINT,
  exhausted_submissions       BIGINT,
  retry_exhaustion_rate_pct   NUMERIC,
  success_rate_pct            NUMERIC,
  avg_attempt_count           NUMERIC,
  max_attempt_count           INT,
  pdfs_downloaded             BIGINT,
  pdfs_failed                 BIGINT,
  last_submission_at          TIMESTAMPTZ,
  first_submission_at         TIMESTAMPTZ,
  total_alerts_in_window      BIGINT,
  resolved_alerts             BIGINT,
  unresolved_alerts           BIGINT,
  alert_resolution_rate_pct   NUMERIC,
  avg_seconds_to_resolve      NUMERIC,
  oldest_alert_in_window      TIMESTAMPTZ,
  latest_alert_at             TIMESTAMPTZ,
  current_freshness_status    TEXT,
  current_lag_seconds         NUMERIC,
  current_last_refreshed_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Resolve caller org
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_etax_submission_health: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role guard: FINANCE, ADMIN, OWNER
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id  = v_org_id
      AND user_id = auth.uid()
      AND role    IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_etax_submission_health: insufficient role — FINANCE, ADMIN, or OWNER required'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.v_etax_submission_health
    WHERE org_id = v_org_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_submission_health() IS
  'Returns the submission health row for the authenticated caller''s organisation. '
  'Includes per-org retry exhaustion stats and system-wide alert health context. '
  'Accessible by FINANCE, ADMIN, or OWNER roles. Added by migration 0190.';

-- ─────────────────────────────────────────────────────────────
-- 5. rpc_etax_submission_health_admin() — service_role only
--    Returns health rows for ALL organisations.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_submission_health_admin()
RETURNS TABLE (
  org_id                      UUID,
  total_submissions           BIGINT,
  successful_submissions      BIGINT,
  failed_submissions          BIGINT,
  pending_submissions         BIGINT,
  cancelled_submissions       BIGINT,
  exhausted_submissions       BIGINT,
  retry_exhaustion_rate_pct   NUMERIC,
  success_rate_pct            NUMERIC,
  avg_attempt_count           NUMERIC,
  max_attempt_count           INT,
  pdfs_downloaded             BIGINT,
  pdfs_failed                 BIGINT,
  last_submission_at          TIMESTAMPTZ,
  first_submission_at         TIMESTAMPTZ,
  total_alerts_in_window      BIGINT,
  resolved_alerts             BIGINT,
  unresolved_alerts           BIGINT,
  alert_resolution_rate_pct   NUMERIC,
  avg_seconds_to_resolve      NUMERIC,
  oldest_alert_in_window      TIMESTAMPTZ,
  latest_alert_at             TIMESTAMPTZ,
  current_freshness_status    TEXT,
  current_lag_seconds         NUMERIC,
  current_last_refreshed_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth.uid() — safe for pg_cron / service workers
  RETURN QUERY
    SELECT * FROM public.v_etax_submission_health;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_submission_health_admin() IS
  'Service-role variant of rpc_etax_submission_health. Returns health rows for ALL orgs. '
  'No auth.uid() call — safe for cron jobs and admin tooling. Added by migration 0190.';

-- ─────────────────────────────────────────────────────────────
-- 6. Grant / Revoke on RPCs
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rpc_etax_submission_health()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_etax_submission_health_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_health()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_health_admin()  TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_etax_submission_health_admin()  TO postgres;

-- ─────────────────────────────────────────────────────────────
-- 7. Post-migration verification
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- View exists
  SELECT COUNT(*) INTO v_count
    FROM information_schema.views
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_submission_health';
  IF v_count = 0 THEN
    RAISE EXCEPTION '0190: v_etax_submission_health view was NOT created';
  END IF;

  -- Both RPCs exist
  SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('rpc_etax_submission_health', 'rpc_etax_submission_health_admin');
  IF v_count < 2 THEN
    RAISE EXCEPTION '0190: expected 2 RPCs, found %', v_count;
  END IF;

  -- Key columns present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_submission_health'
      AND column_name  = 'retry_exhaustion_rate_pct'
  ) THEN
    RAISE EXCEPTION '0190: retry_exhaustion_rate_pct column missing from view';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_submission_health'
      AND column_name  = 'avg_seconds_to_resolve'
  ) THEN
    RAISE EXCEPTION '0190: avg_seconds_to_resolve column missing from view';
  END IF;

  RAISE NOTICE '0190: v_etax_submission_health + 2 RPCs created successfully';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Rollback instructions
-- ─────────────────────────────────────────────────────────────
-- To roll back:
--   DROP FUNCTION IF EXISTS public.rpc_etax_submission_health();
--   DROP FUNCTION IF EXISTS public.rpc_etax_submission_health_admin();
--   DROP VIEW  IF EXISTS public.v_etax_submission_health;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Migration 0190 complete.
-- New objects:
--   VIEW     : v_etax_submission_health
--   FUNCTION : rpc_etax_submission_health()       — authenticated
--   FUNCTION : rpc_etax_submission_health_admin() — service_role
--
-- Key metrics surfaced:
--   retry_exhaustion_rate_pct — % failed submissions with attempt_count >= 5
--   success_rate_pct          — % submitted / total
--   avg_seconds_to_resolve    — avg MV alert resolution time (system-level)
--   current_freshness_status  — current MV lag state from v_mv_refresh_lag
-- ─────────────────────────────────────────────────────────────
