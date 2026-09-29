-- ============================================================
-- Migration 0189: v_mv_alert_history — MV Refresh Alert History View
-- ============================================================
-- Purpose:
--   Creates a read-only VIEW that joins etax_submission_audit_log
--   (system alert rows where alert_type = 'mv_refresh_critical') with
--   v_mv_refresh_lag to surface the last 10 critical alert events,
--   enriched with current lag state and per-org MV impact metrics.
--
-- Design:
--   • v_mv_alert_history  — base view, last 10 system alerts (window fn)
--   • rpc_list_mv_alert_history(p_limit)    — org-authenticated read
--   • rpc_list_mv_alert_history_admin(p_limit) — service-role full read
--   • No RLS on the view itself (all access via SECURITY DEFINER RPCs)
--
-- Key fields:
--   alert_id, alerted_at, alert_rank (1 = most recent)
--   lag_seconds_at_alert, freshness_status_at_alert
--   time_since_prev_alert (interval between consecutive alerts — dedup health)
--   current_lag_seconds, current_freshness_status (from v_mv_refresh_lag)
--   affected_org_count, total_submissions_in_mv (snapshot of MV scope)
--   resolved_at, was_resolved (NULL if still critical, timestamp when next
--     refresh occurred after the alert)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Prerequisite guards
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name   = 'v_mv_refresh_lag'
  ) THEN
    RAISE EXCEPTION '0189: v_mv_refresh_lag view not found. Run migration 0187 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'etax_submission_audit_log'
  ) THEN
    RAISE EXCEPTION '0189: etax_submission_audit_log not found. Run migration 0185 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'etax_compliance_mv_refresh_log'
  ) THEN
    RAISE EXCEPTION '0189: etax_compliance_mv_refresh_log not found. Run migration 0187 first.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Drop existing view/RPCs (idempotent)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_list_mv_alert_history(INT);
DROP FUNCTION IF EXISTS public.rpc_list_mv_alert_history_admin(INT);
DROP VIEW  IF EXISTS public.v_mv_alert_history;

-- ─────────────────────────────────────────────────────────────
-- 2. v_mv_alert_history
-- ─────────────────────────────────────────────────────────────
CREATE VIEW public.v_mv_alert_history AS
WITH

-- ── 2a. ranked alert rows ───────────────────────────────────
ranked_alerts AS (
  SELECT
    eal.id                                          AS alert_id,
    eal.changed_at                                  AS alerted_at,
    eal.metadata->>'alert_type'                     AS alert_type,
    (eal.metadata->>'lag_seconds')::numeric         AS lag_seconds_at_alert,
    (eal.metadata->>'threshold_seconds')::int       AS threshold_seconds,
    eal.metadata->>'freshness_status'               AS freshness_status_at_alert,
    eal.metadata->>'last_refreshed_at'              AS mv_last_refreshed_at_at_alert,
    eal.metadata->>'detected_at'                    AS detected_at,
    eal.metadata->>'cron_job'                       AS cron_job,
    eal.metadata->>'triggered_by'                   AS triggered_by_at_alert,
    (eal.metadata->>'duration_ms')::numeric         AS refresh_duration_ms_at_alert,
    (eal.metadata->>'row_count')::bigint            AS row_count_at_alert,
    -- Time gap between consecutive alert events (helpful to spot dedup failures)
    eal.changed_at - LAG(eal.changed_at) OVER (
      PARTITION BY eal.metadata->>'alert_type'
      ORDER BY eal.changed_at
    )                                               AS time_since_prev_alert,
    -- Rank: 1 = most recent alert
    ROW_NUMBER() OVER (
      ORDER BY eal.changed_at DESC
    )                                               AS alert_rank
  FROM public.etax_submission_audit_log eal
  WHERE eal.trigger_source = 'system'
    AND eal.metadata->>'alert_type' = 'mv_refresh_critical'
),

-- ── 2b. next refresh after each alert (resolution detection) ─
-- A "resolved" alert is one where a refresh occurred AFTER alerted_at.
next_refresh AS (
  SELECT
    ra.alert_id,
    ra.alerted_at,
    MIN(rl.refreshed_at)                            AS resolved_at
  FROM ranked_alerts ra
  LEFT JOIN public.etax_compliance_mv_refresh_log rl
         ON rl.refreshed_at > ra.alerted_at
  GROUP BY ra.alert_id, ra.alerted_at
),

-- ── 2c. current system state (single row LATERAL) ────────────
current_lag AS (
  SELECT
    COALESCE(lag.lag_seconds, -1)                   AS current_lag_seconds,
    COALESCE(lag.freshness_status, 'unknown')       AS current_freshness_status,
    lag.last_refreshed_at                           AS current_last_refreshed_at,
    COALESCE(lag.duration_ms, 0)                    AS current_refresh_duration_ms,
    COALESCE(lag.row_count, 0)                      AS current_row_count,
    lag.triggered_by                                AS current_triggered_by
  FROM public.v_mv_refresh_lag lag
  LIMIT 1
),

-- ── 2d. per-org MV impact snapshot ───────────────────────────
mv_impact AS (
  SELECT
    COUNT(*)                                        AS affected_org_count,
    COALESCE(SUM(total_submissions), 0)             AS total_submissions_in_mv,
    COALESCE(MAX(failed_last_24h), 0)               AS max_failed_last_24h_in_mv
  FROM public.mv_etax_compliance_dashboard
)

-- ── 2e. Final SELECT ─────────────────────────────────────────
SELECT
  -- Alert identity
  ra.alert_id,
  ra.alerted_at,
  ra.alert_type,
  ra.alert_rank,

  -- Lag context at time of alert
  ra.lag_seconds_at_alert,
  ra.threshold_seconds,
  ra.freshness_status_at_alert,
  ra.mv_last_refreshed_at_at_alert,
  ra.detected_at::TIMESTAMPTZ                       AS detected_at,
  ra.cron_job,
  ra.triggered_by_at_alert,
  ra.refresh_duration_ms_at_alert,
  ra.row_count_at_alert,

  -- Inter-alert timing (NULL for first alert ever)
  ra.time_since_prev_alert,

  -- Resolution
  nr.resolved_at,
  CASE
    WHEN nr.resolved_at IS NOT NULL THEN TRUE
    ELSE FALSE
  END                                               AS was_resolved,
  CASE
    WHEN nr.resolved_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (nr.resolved_at - ra.alerted_at))
    ELSE NULL
  END                                               AS seconds_to_resolve,

  -- Current system state (same for all rows — latest lag snapshot)
  cl.current_lag_seconds,
  cl.current_freshness_status,
  cl.current_last_refreshed_at,
  cl.current_refresh_duration_ms,
  cl.current_row_count,
  cl.current_triggered_by,

  -- Per-org MV impact at query time
  mi.affected_org_count,
  mi.total_submissions_in_mv,
  mi.max_failed_last_24h_in_mv

FROM ranked_alerts ra
CROSS JOIN current_lag cl
CROSS JOIN mv_impact   mi
LEFT  JOIN next_refresh nr ON nr.alert_id = ra.alert_id

-- Default: last 10 alerts only (full history via RPC p_limit)
WHERE ra.alert_rank <= 10

ORDER BY ra.alert_rank;

COMMENT ON VIEW public.v_mv_alert_history IS
  'Read-only view of the last 10 mv_refresh_critical system alert events. '
  'Joins etax_submission_audit_log (system rows) with v_mv_refresh_lag and '
  'mv_etax_compliance_dashboard. Exposes lag at time of alert, resolution status, '
  'time-since-prev-alert for dedup health monitoring, and current system lag. '
  'All access via SECURITY DEFINER RPCs — do not grant direct SELECT to authenticated. '
  'Added by migration 0189.';

-- ─────────────────────────────────────────────────────────────
-- 3. Revoke direct SELECT access from authenticated users
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON public.v_mv_alert_history FROM PUBLIC;
REVOKE ALL ON public.v_mv_alert_history FROM authenticated;
GRANT  SELECT ON public.v_mv_alert_history TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. rpc_list_mv_alert_history(p_limit) — authenticated, org-scoped
--    Finance/Admin/Owner roles can view alert history for their org.
--    The view is system-level (no org_id), so this RPC simply exposes
--    the last p_limit events to any authenticated org member.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_mv_alert_history(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  alert_id                        UUID,
  alerted_at                      TIMESTAMPTZ,
  alert_type                      TEXT,
  alert_rank                      BIGINT,
  lag_seconds_at_alert            NUMERIC,
  threshold_seconds               INT,
  freshness_status_at_alert       TEXT,
  mv_last_refreshed_at_at_alert   TEXT,
  detected_at                     TIMESTAMPTZ,
  cron_job                        TEXT,
  triggered_by_at_alert           TEXT,
  refresh_duration_ms_at_alert    NUMERIC,
  row_count_at_alert              BIGINT,
  time_since_prev_alert           INTERVAL,
  resolved_at                     TIMESTAMPTZ,
  was_resolved                    BOOLEAN,
  seconds_to_resolve              NUMERIC,
  current_lag_seconds             NUMERIC,
  current_freshness_status        TEXT,
  current_last_refreshed_at       TIMESTAMPTZ,
  current_refresh_duration_ms     NUMERIC,
  current_row_count               BIGINT,
  current_triggered_by            TEXT,
  affected_org_count              BIGINT,
  total_submissions_in_mv         NUMERIC,
  max_failed_last_24h_in_mv       NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org_id UUID;
BEGIN
  -- Ensure caller is an authenticated org member
  v_caller_org_id := public.get_user_org_id();
  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_list_mv_alert_history: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role guard: only FINANCE, ADMIN, OWNER may view alert history
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id  = v_caller_org_id
      AND user_id = auth.uid()
      AND role    IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_list_mv_alert_history: insufficient role — FINANCE, ADMIN, or OWNER required'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT * FROM public.v_mv_alert_history
    WHERE alert_rank <= LEAST(GREATEST(p_limit, 1), 50)  -- cap at 50
    ORDER BY alert_rank;
END;
$$;

COMMENT ON FUNCTION public.rpc_list_mv_alert_history(INT) IS
  'Returns up to p_limit (default 10, max 50) MV refresh-lag critical alert events. '
  'Accessible by authenticated users with FINANCE, ADMIN, or OWNER role. '
  'Data is system-level (shared across all orgs); no org filtering applied. '
  'Added by migration 0189.';

-- ─────────────────────────────────────────────────────────────
-- 5. rpc_list_mv_alert_history_admin(p_limit) — service-role only
--    Same as above but callable by the service role (pg_cron, admin tooling).
--    No auth.uid() call — safe to call from cron/workers.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_mv_alert_history_admin(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  alert_id                        UUID,
  alerted_at                      TIMESTAMPTZ,
  alert_type                      TEXT,
  alert_rank                      BIGINT,
  lag_seconds_at_alert            NUMERIC,
  threshold_seconds               INT,
  freshness_status_at_alert       TEXT,
  mv_last_refreshed_at_at_alert   TEXT,
  detected_at                     TIMESTAMPTZ,
  cron_job                        TEXT,
  triggered_by_at_alert           TEXT,
  refresh_duration_ms_at_alert    NUMERIC,
  row_count_at_alert              BIGINT,
  time_since_prev_alert           INTERVAL,
  resolved_at                     TIMESTAMPTZ,
  was_resolved                    BOOLEAN,
  seconds_to_resolve              NUMERIC,
  current_lag_seconds             NUMERIC,
  current_freshness_status        TEXT,
  current_last_refreshed_at       TIMESTAMPTZ,
  current_refresh_duration_ms     NUMERIC,
  current_row_count               BIGINT,
  current_triggered_by            TEXT,
  affected_org_count              BIGINT,
  total_submissions_in_mv         NUMERIC,
  max_failed_last_24h_in_mv       NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM public.v_mv_alert_history
    WHERE alert_rank <= LEAST(GREATEST(p_limit, 1), 200)  -- admin cap at 200
    ORDER BY alert_rank;
END;
$$;

COMMENT ON FUNCTION public.rpc_list_mv_alert_history_admin(INT) IS
  'Service-role variant of rpc_list_mv_alert_history. No auth.uid() required. '
  'Callable by pg_cron, admin tooling, and monitoring scripts. '
  'Cap: 200 rows. Added by migration 0189.';

-- ─────────────────────────────────────────────────────────────
-- 6. Grant / Revoke on RPCs
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rpc_list_mv_alert_history(INT)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_list_mv_alert_history_admin(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_list_mv_alert_history(INT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_mv_alert_history_admin(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_list_mv_alert_history_admin(INT) TO postgres;

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
     AND table_name   = 'v_mv_alert_history';
  IF v_count = 0 THEN
    RAISE EXCEPTION '0189: v_mv_alert_history view was NOT created';
  END IF;

  -- Both RPCs exist
  SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('rpc_list_mv_alert_history', 'rpc_list_mv_alert_history_admin');
  IF v_count < 2 THEN
    RAISE EXCEPTION '0189: expected 2 RPCs, found %', v_count;
  END IF;

  RAISE NOTICE '0189: v_mv_alert_history + 2 RPCs created successfully';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Rollback instructions
-- ─────────────────────────────────────────────────────────────
-- To roll back:
--   DROP FUNCTION IF EXISTS public.rpc_list_mv_alert_history(INT);
--   DROP FUNCTION IF EXISTS public.rpc_list_mv_alert_history_admin(INT);
--   DROP VIEW IF EXISTS public.v_mv_alert_history;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Migration 0189 complete.
-- New objects:
--   VIEW      : v_mv_alert_history
--   FUNCTION  : rpc_list_mv_alert_history(p_limit INT)     — authenticated
--   FUNCTION  : rpc_list_mv_alert_history_admin(p_limit INT) — service-role
-- ─────────────────────────────────────────────────────────────
