-- ============================================================
-- Migration 0191: v_etax_health_trend — Daily Submission Health Trend (30 days)
-- ============================================================
-- Purpose:
--   Creates a view that buckets etax_submissions by day (UTC) over the
--   last 30 days and computes per-org, per-day health metrics including:
--
--   Per-day per-org:
--     • submission_day           — date bucket (DATE, UTC)
--     • daily_total              — submissions created on this day
--     • daily_successful         — status = 'submitted'
--     • daily_failed             — status = 'failed'
--     • daily_exhausted          — failed AND attempt_count >= 5
--     • retry_exhaustion_rate_pct — % of daily_total that are exhausted (ROUND 2dp)
--     • success_rate_pct          — % of daily_total that are successful (ROUND 2dp)
--     • avg_attempt_count         — avg attempt_count for the day
--     • pdf_success_rate_pct      — % of rows with pdf_status = 'downloaded' (ROUND 2dp)
--
--   Window:
--     • Covers the 30 days ending at current_date (inclusive, UTC).
--     • Days with no submissions produce no row (LEFT JOIN over a day series
--       would produce NULLs and is explicitly excluded for signal clarity).
--
-- Design notes:
--   • The 30-day window uses:
--         created_at >= (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '29 days'
--       so "today" is day 1 and 30 days ago is day 30.
--   • submission_day = DATE(created_at AT TIME ZONE 'UTC')
--   • All rates use NULLIF to guard against divide-by-zero on zero-submission days.
--   • Direct view access REVOKED; all access via SECURITY DEFINER RPCs.
--   • rpc_etax_health_trend()        — authenticated, FINANCE/ADMIN/OWNER, org-scoped
--   • rpc_etax_health_trend_admin()  — service_role only, all orgs
--   • rpc_etax_health_trend_admin(p_org_id UUID) — service_role, single-org override
--
-- Prerequisite migrations: 0181 (etax_submissions)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Prerequisite guard
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'etax_submissions'
  ) THEN
    RAISE EXCEPTION '0191: etax_submissions table not found. Run migration 0181 first.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Drop existing objects (idempotent)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_etax_health_trend();
DROP FUNCTION IF EXISTS public.rpc_etax_health_trend_admin();
DROP FUNCTION IF EXISTS public.rpc_etax_health_trend_admin(UUID);
DROP VIEW  IF EXISTS public.v_etax_health_trend;

-- ─────────────────────────────────────────────────────────────
-- 2. Supporting index (avoid full-scan on large etax_submissions tables)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_etaxsub_org_created_at
  ON public.etax_submissions (org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. v_etax_health_trend
-- ─────────────────────────────────────────────────────────────
CREATE VIEW public.v_etax_health_trend AS
WITH

-- ── 3a. 30-day submission window ─────────────────────────────
-- Only include rows created in the last 30 days (UTC).
-- Day 1 = today, Day 30 = 29 days ago.
windowed AS (
  SELECT
    es.org_id,
    DATE(es.created_at AT TIME ZONE 'UTC')                           AS submission_day,
    es.status,
    es.attempt_count,
    es.pdf_status
  FROM public.etax_submissions es
  WHERE es.created_at >= (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '29 days'
    AND es.created_at <  (NOW() AT TIME ZONE 'UTC')::DATE + INTERVAL '1 day'
),

-- ── 3b. Daily aggregation per org ────────────────────────────
daily AS (
  SELECT
    w.org_id,
    w.submission_day,

    -- Volume
    COUNT(*)                                                          AS daily_total,
    COUNT(*) FILTER (WHERE w.status = 'submitted')                   AS daily_successful,
    COUNT(*) FILTER (WHERE w.status = 'failed')                      AS daily_failed,
    COUNT(*) FILTER (WHERE w.status IN ('queued', 'submitting'))     AS daily_pending,
    COUNT(*) FILTER (WHERE w.status = 'cancelled')                   AS daily_cancelled,

    -- Retry exhaustion: failed AND attempt_count >= 5
    COUNT(*) FILTER (
      WHERE w.status = 'failed' AND w.attempt_count >= 5
    )                                                                 AS daily_exhausted,

    -- Rates (ROUND 2dp, NULLIF guard)
    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE w.status = 'failed' AND w.attempt_count >= 5)::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS retry_exhaustion_rate_pct,

    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE w.status = 'submitted')::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS success_rate_pct,

    -- Attempt-count stats
    ROUND(AVG(w.attempt_count)::NUMERIC, 2)                          AS avg_attempt_count,
    MAX(w.attempt_count)                                              AS max_attempt_count,

    -- PDF pipeline
    COUNT(*) FILTER (WHERE w.pdf_status = 'downloaded')              AS daily_pdfs_downloaded,
    COUNT(*) FILTER (WHERE w.pdf_status = 'failed')                  AS daily_pdfs_failed,

    ROUND(
      100.0
      * COUNT(*) FILTER (WHERE w.pdf_status = 'downloaded')::NUMERIC
      / NULLIF(COUNT(*), 0),
      2
    )                                                                 AS pdf_success_rate_pct,

    -- Day-over-day context helpers
    -- These allow the caller to compute trend deltas without a window function
    -- in application code.
    ROW_NUMBER() OVER (
      PARTITION BY w.org_id
      ORDER BY DATE(w.submission_day) DESC
    )                                                                 AS day_rank

  FROM windowed w
  GROUP BY w.org_id, w.submission_day
)

-- ── 3c. Final SELECT ─────────────────────────────────────────
SELECT
  d.org_id,
  d.submission_day,
  d.day_rank,

  -- Volume
  d.daily_total,
  d.daily_successful,
  d.daily_failed,
  d.daily_pending,
  d.daily_cancelled,
  d.daily_exhausted,

  -- Rates
  d.retry_exhaustion_rate_pct,
  d.success_rate_pct,

  -- Attempt-count health
  d.avg_attempt_count,
  d.max_attempt_count,

  -- PDF pipeline
  d.daily_pdfs_downloaded,
  d.daily_pdfs_failed,
  d.pdf_success_rate_pct,

  -- Metadata
  NOW()                                                               AS snapshot_at

FROM daily d

ORDER BY d.org_id,
         d.submission_day DESC;

COMMENT ON VIEW public.v_etax_health_trend IS
  '30-day daily eTax submission health trend per organisation. '
  'Buckets etax_submissions by DATE(created_at AT TIME ZONE UTC). '
  'Key trend metrics: retry_exhaustion_rate_pct and success_rate_pct per day. '
  'Does not emit zero-submission days — only days with at least one submission row appear. '
  'All access via SECURITY DEFINER RPCs. Added by migration 0191.';

-- ─────────────────────────────────────────────────────────────
-- 4. Revoke direct access
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON public.v_etax_health_trend FROM PUBLIC;
REVOKE ALL ON public.v_etax_health_trend FROM authenticated;
GRANT  SELECT ON public.v_etax_health_trend TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. rpc_etax_health_trend() — authenticated, org-scoped
--    Returns daily trend rows for the caller's org over last 30 days.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_health_trend()
RETURNS TABLE (
  org_id                      UUID,
  submission_day              DATE,
  day_rank                    BIGINT,
  daily_total                 BIGINT,
  daily_successful            BIGINT,
  daily_failed                BIGINT,
  daily_pending               BIGINT,
  daily_cancelled             BIGINT,
  daily_exhausted             BIGINT,
  retry_exhaustion_rate_pct   NUMERIC,
  success_rate_pct            NUMERIC,
  avg_attempt_count           NUMERIC,
  max_attempt_count           INT,
  daily_pdfs_downloaded       BIGINT,
  daily_pdfs_failed           BIGINT,
  pdf_success_rate_pct        NUMERIC,
  snapshot_at                 TIMESTAMPTZ
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
    RAISE EXCEPTION 'rpc_etax_health_trend: caller is not a member of any organisation'
      USING ERRCODE = 'P0001';
  END IF;

  -- Role guard: FINANCE, ADMIN, OWNER
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id  = v_org_id
      AND user_id = auth.uid()
      AND role    IN ('FINANCE', 'ADMIN', 'OWNER')
  ) THEN
    RAISE EXCEPTION 'rpc_etax_health_trend: insufficient role — FINANCE, ADMIN, or OWNER required'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.v_etax_health_trend
    WHERE org_id = v_org_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_health_trend() IS
  'Returns 30-day daily eTax submission health trend for the authenticated '
  'caller''s organisation. Accessible by FINANCE, ADMIN, or OWNER roles. '
  'Added by migration 0191.';

-- ─────────────────────────────────────────────────────────────
-- 6. rpc_etax_health_trend_admin() — service_role, all orgs
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_health_trend_admin()
RETURNS TABLE (
  org_id                      UUID,
  submission_day              DATE,
  day_rank                    BIGINT,
  daily_total                 BIGINT,
  daily_successful            BIGINT,
  daily_failed                BIGINT,
  daily_pending               BIGINT,
  daily_cancelled             BIGINT,
  daily_exhausted             BIGINT,
  retry_exhaustion_rate_pct   NUMERIC,
  success_rate_pct            NUMERIC,
  avg_attempt_count           NUMERIC,
  max_attempt_count           INT,
  daily_pdfs_downloaded       BIGINT,
  daily_pdfs_failed           BIGINT,
  pdf_success_rate_pct        NUMERIC,
  snapshot_at                 TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No auth.uid() — safe for pg_cron, admin tooling, analytics pipelines
  RETURN QUERY
    SELECT * FROM public.v_etax_health_trend;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_health_trend_admin() IS
  'Service-role variant of rpc_etax_health_trend. Returns 30-day daily trend rows '
  'for ALL organisations. No auth.uid() call — safe for cron jobs and admin tooling. '
  'Added by migration 0191.';

-- ─────────────────────────────────────────────────────────────
-- 7. rpc_etax_health_trend_admin(p_org_id UUID) — service_role, single-org override
--    Useful for admin dashboards that need trend data for a specific org
--    without the cost of fetching all orgs.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_health_trend_admin(p_org_id UUID)
RETURNS TABLE (
  org_id                      UUID,
  submission_day              DATE,
  day_rank                    BIGINT,
  daily_total                 BIGINT,
  daily_successful            BIGINT,
  daily_failed                BIGINT,
  daily_pending               BIGINT,
  daily_cancelled             BIGINT,
  daily_exhausted             BIGINT,
  retry_exhaustion_rate_pct   NUMERIC,
  success_rate_pct            NUMERIC,
  avg_attempt_count           NUMERIC,
  max_attempt_count           INT,
  daily_pdfs_downloaded       BIGINT,
  daily_pdfs_failed           BIGINT,
  pdf_success_rate_pct        NUMERIC,
  snapshot_at                 TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM public.v_etax_health_trend
    WHERE org_id = p_org_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_health_trend_admin(UUID) IS
  'Single-org variant of rpc_etax_health_trend_admin. Returns 30-day daily trend '
  'rows for one specified organisation. Service-role only. Added by migration 0191.';

-- ─────────────────────────────────────────────────────────────
-- 8. Grant / Revoke on RPCs
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rpc_etax_health_trend()           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_etax_health_trend_admin()     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_etax_health_trend_admin(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin()      TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin()      TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin(UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_etax_health_trend_admin(UUID)  TO postgres;

-- ─────────────────────────────────────────────────────────────
-- 9. Post-migration verification
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- View exists
  SELECT COUNT(*) INTO v_count
    FROM information_schema.views
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_health_trend';
  IF v_count = 0 THEN
    RAISE EXCEPTION '0191: v_etax_health_trend view was NOT created';
  END IF;

  -- Three RPCs exist (0-arg admin, 1-arg admin, org-scoped)
  SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'rpc_etax_health_trend',
       'rpc_etax_health_trend_admin'
     );
  IF v_count < 3 THEN
    RAISE EXCEPTION '0191: expected 3 RPCs (1 org-scoped + 2 admin variants), found %', v_count;
  END IF;

  -- Key trend columns present
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_health_trend'
     AND column_name  = 'retry_exhaustion_rate_pct';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0191: retry_exhaustion_rate_pct column missing from view';
  END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_health_trend'
     AND column_name  = 'success_rate_pct';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0191: success_rate_pct column missing from view';
  END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_health_trend'
     AND column_name  = 'submission_day';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0191: submission_day column missing from view';
  END IF;

  -- Supporting index exists
  PERFORM 1 FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname  = 'idx_etaxsub_org_created_at';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0191: idx_etaxsub_org_created_at index was NOT created';
  END IF;

  RAISE NOTICE '0191: v_etax_health_trend + 3 RPCs + 1 index created successfully';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 10. Rollback instructions
-- ─────────────────────────────────────────────────────────────
-- To roll back:
--   DROP FUNCTION IF EXISTS public.rpc_etax_health_trend();
--   DROP FUNCTION IF EXISTS public.rpc_etax_health_trend_admin();
--   DROP FUNCTION IF EXISTS public.rpc_etax_health_trend_admin(UUID);
--   DROP VIEW  IF EXISTS public.v_etax_health_trend;
--   DROP INDEX IF EXISTS public.idx_etaxsub_org_created_at;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- Migration 0191 complete.
-- New objects:
--   VIEW     : v_etax_health_trend
--   FUNCTION : rpc_etax_health_trend()           — authenticated, org-scoped
--   FUNCTION : rpc_etax_health_trend_admin()     — service_role, all orgs
--   FUNCTION : rpc_etax_health_trend_admin(UUID) — service_role, single-org
--   INDEX    : idx_etaxsub_org_created_at
--
-- Key metrics surfaced (per org per day, last 30 days):
--   retry_exhaustion_rate_pct — % failed with attempt_count >= 5
--   success_rate_pct          — % submitted / total
--   avg_attempt_count         — avg attempts per submission
--   pdf_success_rate_pct      — % with pdf_status = 'downloaded'
--   day_rank                  — 1 = today, 30 = 30 days ago
-- ─────────────────────────────────────────────────────────────
