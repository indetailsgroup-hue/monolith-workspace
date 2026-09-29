-- =============================================================================
-- Migration 0193: View — v_etax_full_health_summary
-- =============================================================================
-- Purpose:
--   Produces a single per-org health snapshot by joining the daily-cached
--   trend MV (mv_etax_health_trend, day_rank=1) with the 15-min-cached
--   compliance MV (mv_etax_compliance_dashboard).  Computes a composite
--   health_score (0–100) and a human-readable health_status label.
--
-- Objects created:
--   VIEW  v_etax_full_health_summary            — per-org health snapshot
--   RPC   rpc_etax_full_health_summary()         — authenticated, org-scoped
--   RPC   rpc_etax_full_health_summary_admin()   — service_role, all orgs
--
-- Prerequisites:
--   0187_etax_compliance_dashboard_mv.sql  (mv_etax_compliance_dashboard)
--   0192_mv_etax_health_trend.sql          (mv_etax_health_trend,
--                                           etax_health_trend_mv_refresh_log,
--                                           etax_compliance_mv_refresh_log)
--
-- Rollback:
--   DROP FUNCTION IF EXISTS rpc_etax_full_health_summary_admin() CASCADE;
--   DROP FUNCTION IF EXISTS rpc_etax_full_health_summary()       CASCADE;
--   DROP VIEW    IF EXISTS v_etax_full_health_summary             CASCADE;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Prerequisite guard
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'public' AND matviewname = 'mv_etax_compliance_dashboard'
    ) THEN
        RAISE EXCEPTION
            'Migration 0193 requires mv_etax_compliance_dashboard (0187). '
            'Apply migration 0187 first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname = 'public' AND matviewname = 'mv_etax_health_trend'
    ) THEN
        RAISE EXCEPTION
            'Migration 0193 requires mv_etax_health_trend (0192). '
            'Apply migration 0192 first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'etax_health_trend_mv_refresh_log'
    ) THEN
        RAISE EXCEPTION
            'Migration 0193 requires etax_health_trend_mv_refresh_log (0192). '
            'Apply migration 0192 first.';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. View: v_etax_full_health_summary
-- ---------------------------------------------------------------------------
-- Design:
--   LEFT JOIN mv_etax_health_trend on day_rank=1 so orgs with zero trend rows
--   (no submissions in last 30 days) still appear via the compliance MV.
--
-- Health Score formula (0–100, higher = healthier):
--   Start at 100.
--   Deduct up to 40 pts for low submission success rate.
--   Deduct up to 30 pts for today's retry-exhaustion rate.
--   Deduct up to 20 pts for overdue-invoices-with-pending-eTax.
--   Deduct up to 10 pts for recent failures in the last 24 h.
--   Clamp result to [0, 100].
--
-- Health Status:
--   health_score >= 80  → 'healthy'
--   health_score >= 50  → 'warning'
--   health_score <  50  → 'critical'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_etax_full_health_summary AS
WITH

-- Latest refresh timestamps (single-row subqueries for each MV)
compliance_refresh AS (
    SELECT refreshed_at AS last_refreshed_at,
           EXTRACT(EPOCH FROM (NOW() - refreshed_at))::INT AS age_seconds
    FROM   etax_compliance_mv_refresh_log
    ORDER  BY id DESC
    LIMIT  1
),

trend_refresh AS (
    SELECT refreshed_at AS last_refreshed_at,
           EXTRACT(EPOCH FROM (NOW() - refreshed_at))::INT AS age_seconds
    FROM   etax_health_trend_mv_refresh_log
    ORDER  BY id DESC
    LIMIT  1
),

-- Join: one compliance row per org + today's trend row (LEFT)
joined AS (
    SELECT
        -- Identity
        c.org_id,
        o.name                                              AS org_name,

        -- ── Compliance MV columns ───────────────────────────────────────
        c.total_submissions,
        c.submitted_count,
        c.failed_count,
        c.cancelled_count,
        c.queued_count,
        c.submitting_count,
        c.success_rate                                      AS compliance_success_rate,
        c.avg_attempt_count                                 AS compliance_avg_attempt_count,
        c.max_attempt_count                                 AS compliance_max_attempt_count,
        c.submissions_with_pdf_downloaded,
        c.pdf_success_rate                                  AS compliance_pdf_success_rate,
        c.last_submission_at,
        c.last_failed_at,
        c.oldest_unresolved_failed_at,
        c.failed_last_24h,
        c.last_audit_event_at,
        c.overdue_invoice_count,
        c.overdue_with_pending_etax,

        -- ── Trend MV columns (today, day_rank=1) ────────────────────────
        t.submission_day                                    AS today_submission_day,
        COALESCE(t.daily_total,                  0)        AS today_total,
        COALESCE(t.daily_submitted,              0)        AS today_submitted,
        COALESCE(t.daily_failed,                 0)        AS today_failed,
        COALESCE(t.daily_exhausted,              0)        AS today_exhausted,
        COALESCE(t.daily_queued,                 0)        AS today_queued,
        COALESCE(t.daily_pdf_ok,                 0)        AS today_pdf_ok,
        COALESCE(t.daily_pdf_fail,               0)        AS today_pdf_fail,
        COALESCE(t.retry_exhaustion_rate_pct,    0)        AS today_retry_exhaustion_rate_pct,
        COALESCE(t.success_rate_pct,             0)        AS today_success_rate_pct,
        COALESCE(t.pdf_success_rate_pct,         0)        AS today_pdf_success_rate_pct,
        t.avg_attempt_count                                AS today_avg_attempt_count,
        t.max_attempt_count                                AS today_max_attempt_count,

        -- ── MV freshness metadata ────────────────────────────────────────
        cr.last_refreshed_at   AS compliance_mv_last_refreshed_at,
        cr.age_seconds         AS compliance_mv_age_seconds,
        tr.last_refreshed_at   AS trend_mv_last_refreshed_at,
        tr.age_seconds         AS trend_mv_age_seconds

    FROM      mv_etax_compliance_dashboard c
    JOIN      organizations               o  ON o.org_id = c.org_id
    LEFT JOIN mv_etax_health_trend        t  ON t.org_id   = c.org_id
                                             AND t.day_rank = 1
    CROSS JOIN compliance_refresh         cr
    CROSS JOIN trend_refresh              tr
)

SELECT
    *,

    -- ── Composite health score (INTEGER, 0–100) ──────────────────────────
    GREATEST(0,
        LEAST(100,
            100
            -- Success rate impact (max −40): lower success → bigger deduction
            - ROUND((100 - COALESCE(compliance_success_rate,   0)) * 0.40)
            -- Retry-exhaustion impact (max −30)
            - ROUND(COALESCE(today_retry_exhaustion_rate_pct, 0) * 0.30)
            -- Overdue-with-pending eTax (−2 per invoice, capped at −20)
            - LEAST(COALESCE(overdue_with_pending_etax, 0) * 2, 20)
            -- Recent failures in last 24 h (−1 per failure, capped at −10)
            - LEAST(COALESCE(failed_last_24h, 0)::INT, 10)
        )
    )::INT                                                  AS health_score,

    -- ── Human-readable status label ─────────────────────────────────────
    CASE
        WHEN GREATEST(0,
            LEAST(100,
                100
                - ROUND((100 - COALESCE(compliance_success_rate,   0)) * 0.40)
                - ROUND(COALESCE(today_retry_exhaustion_rate_pct, 0) * 0.30)
                - LEAST(COALESCE(overdue_with_pending_etax, 0) * 2, 20)
                - LEAST(COALESCE(failed_last_24h, 0)::INT, 10)
            )
        ) >= 80  THEN 'healthy'
        WHEN GREATEST(0,
            LEAST(100,
                100
                - ROUND((100 - COALESCE(compliance_success_rate,   0)) * 0.40)
                - ROUND(COALESCE(today_retry_exhaustion_rate_pct, 0) * 0.30)
                - LEAST(COALESCE(overdue_with_pending_etax, 0) * 2, 20)
                - LEAST(COALESCE(failed_last_24h, 0)::INT, 10)
            )
        ) >= 50  THEN 'warning'
        ELSE          'critical'
    END                                                     AS health_status

FROM joined
ORDER BY health_score ASC;   -- worst-health orgs first (risk-descending)

COMMENT ON VIEW v_etax_full_health_summary IS
    'Per-org eTax health snapshot joining mv_etax_compliance_dashboard (15-min cache) '
    'with mv_etax_health_trend day_rank=1 (daily cache). '
    'health_score 0–100 (higher = healthier); health_status: healthy / warning / critical. '
    'Access via rpc_etax_full_health_summary() (org-scoped) or '
    'rpc_etax_full_health_summary_admin() (service_role).';

-- ---------------------------------------------------------------------------
-- 2. Permissions on view
-- ---------------------------------------------------------------------------

REVOKE ALL ON v_etax_full_health_summary FROM PUBLIC, authenticated;
GRANT SELECT ON v_etax_full_health_summary TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC — rpc_etax_full_health_summary()  (org-scoped, authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_etax_full_health_summary()
RETURNS TABLE (
    -- Identity
    org_id                          UUID,
    org_name                        TEXT,
    -- Compliance totals
    total_submissions               BIGINT,
    submitted_count                 BIGINT,
    failed_count                    BIGINT,
    cancelled_count                 BIGINT,
    queued_count                    BIGINT,
    submitting_count                BIGINT,
    compliance_success_rate         NUMERIC,
    compliance_avg_attempt_count    NUMERIC,
    compliance_max_attempt_count    BIGINT,
    submissions_with_pdf_downloaded BIGINT,
    compliance_pdf_success_rate     NUMERIC,
    last_submission_at              TIMESTAMPTZ,
    last_failed_at                  TIMESTAMPTZ,
    oldest_unresolved_failed_at     TIMESTAMPTZ,
    failed_last_24h                 BIGINT,
    last_audit_event_at             TIMESTAMPTZ,
    overdue_invoice_count           BIGINT,
    overdue_with_pending_etax       BIGINT,
    -- Today's trend
    today_submission_day            DATE,
    today_total                     BIGINT,
    today_submitted                 BIGINT,
    today_failed                    BIGINT,
    today_exhausted                 BIGINT,
    today_queued                    BIGINT,
    today_pdf_ok                    BIGINT,
    today_pdf_fail                  BIGINT,
    today_retry_exhaustion_rate_pct NUMERIC,
    today_success_rate_pct          NUMERIC,
    today_pdf_success_rate_pct      NUMERIC,
    today_avg_attempt_count         NUMERIC,
    today_max_attempt_count         INTEGER,
    -- MV freshness
    compliance_mv_last_refreshed_at TIMESTAMPTZ,
    compliance_mv_age_seconds       INTEGER,
    trend_mv_last_refreshed_at      TIMESTAMPTZ,
    trend_mv_age_seconds            INTEGER,
    -- Composite
    health_score                    INTEGER,
    health_status                   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_role   TEXT;
BEGIN
    SELECT om.org_id, om.role
    INTO   v_org_id, v_role
    FROM   org_members om
    WHERE  om.user_id = auth.uid()
    LIMIT  1;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'User is not a member of any organization';
    END IF;

    IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
        RAISE EXCEPTION 'Insufficient permissions — OWNER, ADMIN, or FINANCE required';
    END IF;

    RETURN QUERY
    SELECT
        s.org_id,
        s.org_name,
        s.total_submissions,
        s.submitted_count,
        s.failed_count,
        s.cancelled_count,
        s.queued_count,
        s.submitting_count,
        s.compliance_success_rate,
        s.compliance_avg_attempt_count,
        s.compliance_max_attempt_count,
        s.submissions_with_pdf_downloaded,
        s.compliance_pdf_success_rate,
        s.last_submission_at,
        s.last_failed_at,
        s.oldest_unresolved_failed_at,
        s.failed_last_24h,
        s.last_audit_event_at,
        s.overdue_invoice_count,
        s.overdue_with_pending_etax,
        s.today_submission_day,
        s.today_total,
        s.today_submitted,
        s.today_failed,
        s.today_exhausted,
        s.today_queued,
        s.today_pdf_ok,
        s.today_pdf_fail,
        s.today_retry_exhaustion_rate_pct,
        s.today_success_rate_pct,
        s.today_pdf_success_rate_pct,
        s.today_avg_attempt_count,
        s.today_max_attempt_count,
        s.compliance_mv_last_refreshed_at,
        s.compliance_mv_age_seconds,
        s.trend_mv_last_refreshed_at,
        s.trend_mv_age_seconds,
        s.health_score,
        s.health_status
    FROM v_etax_full_health_summary s
    WHERE s.org_id = v_org_id;
END;
$$;

COMMENT ON FUNCTION rpc_etax_full_health_summary() IS
    'Returns the full health summary for the caller''s org from v_etax_full_health_summary. '
    'Roles: OWNER, ADMIN, FINANCE.';

REVOKE ALL ON FUNCTION rpc_etax_full_health_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_etax_full_health_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC — rpc_etax_full_health_summary_admin()  (cross-org, service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_etax_full_health_summary_admin(
    p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
    org_id                          UUID,
    org_name                        TEXT,
    total_submissions               BIGINT,
    submitted_count                 BIGINT,
    failed_count                    BIGINT,
    cancelled_count                 BIGINT,
    queued_count                    BIGINT,
    submitting_count                BIGINT,
    compliance_success_rate         NUMERIC,
    compliance_avg_attempt_count    NUMERIC,
    compliance_max_attempt_count    BIGINT,
    submissions_with_pdf_downloaded BIGINT,
    compliance_pdf_success_rate     NUMERIC,
    last_submission_at              TIMESTAMPTZ,
    last_failed_at                  TIMESTAMPTZ,
    oldest_unresolved_failed_at     TIMESTAMPTZ,
    failed_last_24h                 BIGINT,
    last_audit_event_at             TIMESTAMPTZ,
    overdue_invoice_count           BIGINT,
    overdue_with_pending_etax       BIGINT,
    today_submission_day            DATE,
    today_total                     BIGINT,
    today_submitted                 BIGINT,
    today_failed                    BIGINT,
    today_exhausted                 BIGINT,
    today_queued                    BIGINT,
    today_pdf_ok                    BIGINT,
    today_pdf_fail                  BIGINT,
    today_retry_exhaustion_rate_pct NUMERIC,
    today_success_rate_pct          NUMERIC,
    today_pdf_success_rate_pct      NUMERIC,
    today_avg_attempt_count         NUMERIC,
    today_max_attempt_count         INTEGER,
    compliance_mv_last_refreshed_at TIMESTAMPTZ,
    compliance_mv_age_seconds       INTEGER,
    trend_mv_last_refreshed_at      TIMESTAMPTZ,
    trend_mv_age_seconds            INTEGER,
    health_score                    INTEGER,
    health_status                   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('role', TRUE) NOT IN ('service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'rpc_etax_full_health_summary_admin requires service_role';
    END IF;

    RETURN QUERY
    SELECT
        s.org_id,
        s.org_name,
        s.total_submissions,
        s.submitted_count,
        s.failed_count,
        s.cancelled_count,
        s.queued_count,
        s.submitting_count,
        s.compliance_success_rate,
        s.compliance_avg_attempt_count,
        s.compliance_max_attempt_count,
        s.submissions_with_pdf_downloaded,
        s.compliance_pdf_success_rate,
        s.last_submission_at,
        s.last_failed_at,
        s.oldest_unresolved_failed_at,
        s.failed_last_24h,
        s.last_audit_event_at,
        s.overdue_invoice_count,
        s.overdue_with_pending_etax,
        s.today_submission_day,
        s.today_total,
        s.today_submitted,
        s.today_failed,
        s.today_exhausted,
        s.today_queued,
        s.today_pdf_ok,
        s.today_pdf_fail,
        s.today_retry_exhaustion_rate_pct,
        s.today_success_rate_pct,
        s.today_pdf_success_rate_pct,
        s.today_avg_attempt_count,
        s.today_max_attempt_count,
        s.compliance_mv_last_refreshed_at,
        s.compliance_mv_age_seconds,
        s.trend_mv_last_refreshed_at,
        s.trend_mv_age_seconds,
        s.health_score,
        s.health_status
    FROM v_etax_full_health_summary s
    WHERE (p_org_id IS NULL OR s.org_id = p_org_id)
    ORDER BY s.health_score ASC;  -- worst first
END;
$$;

COMMENT ON FUNCTION rpc_etax_full_health_summary_admin(UUID) IS
    'Cross-org full health summary from v_etax_full_health_summary. '
    'Pass p_org_id to filter; NULL returns all orgs ordered worst-health-first. '
    'Restricted to service_role.';

REVOKE ALL ON FUNCTION rpc_etax_full_health_summary_admin(UUID) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION rpc_etax_full_health_summary_admin(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_view_exists   BOOLEAN;
    v_rpc1_exists   BOOLEAN;
    v_rpc2_exists   BOOLEAN;
    v_col_score     BOOLEAN;
    v_col_status    BOOLEAN;
    v_col_today     BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'v_etax_full_health_summary'
    ) INTO v_view_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public' AND p.proname = 'rpc_etax_full_health_summary'
    ) INTO v_rpc1_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public' AND p.proname = 'rpc_etax_full_health_summary_admin'
    ) INTO v_rpc2_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'v_etax_full_health_summary'
          AND column_name  = 'health_score'
    ) INTO v_col_score;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'v_etax_full_health_summary'
          AND column_name  = 'health_status'
    ) INTO v_col_status;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'v_etax_full_health_summary'
          AND column_name  = 'today_submission_day'
    ) INTO v_col_today;

    ASSERT v_view_exists,  'v_etax_full_health_summary does not exist';
    ASSERT v_rpc1_exists,  'rpc_etax_full_health_summary does not exist';
    ASSERT v_rpc2_exists,  'rpc_etax_full_health_summary_admin does not exist';
    ASSERT v_col_score,    'health_score column missing';
    ASSERT v_col_status,   'health_status column missing';
    ASSERT v_col_today,    'today_submission_day column missing';

    RAISE NOTICE '0193 verification passed — v_etax_full_health_summary and both RPCs present.';
END;
$$;

COMMIT;
