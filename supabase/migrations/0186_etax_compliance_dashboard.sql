-- ============================================================================
-- Migration  : 0186_etax_compliance_dashboard.sql
-- Feature    : e-Tax compliance dashboard view (v_etax_compliance_dashboard)
-- Description: Materialised view (as regular VIEW with RLS-safe design) that
--              aggregates per-org e-Tax submission metrics, PDF success rates,
--              and overdue-invoice counts — powering the compliance dashboard.
-- Columns    :
--   org_id, total_submissions, submitted_count, failed_count,
--   cancelled_count, queued_count, submitting_count,
--   success_rate (%), avg_attempt_count, max_attempt_count,
--   submissions_with_pdf_downloaded, pdf_success_rate (%),
--   overdue_invoice_count, overdue_with_pending_etax,
--   failed_last_24h, last_submission_at, last_audit_event_at,
--   last_failed_at, oldest_unresolved_failed_at
-- Depends    :
--   0181_etax_auto_submit        — etax_submissions table
--   0183_etax_pdf_download       — etax_submissions.pdf_status columns
--   0185_etax_audit_log          — etax_submission_audit_log table
--   0180_overdue_invoice_detection — invoice_notifications table
-- RLS        : View is owned by postgres; SELECT granted to authenticated via
--              fn_etax_compliance_dashboard() RPC (org-scoped) and
--              admin-only rpc_etax_compliance_all_orgs().
-- Author     : Monolith Accounting Module
-- Date       : 2026-08-28
-- ============================================================================

-- ============================================================================
-- 1. DROP & RECREATE VIEW (idempotent)
-- ============================================================================

DROP VIEW IF EXISTS v_etax_compliance_dashboard CASCADE;

CREATE OR REPLACE VIEW v_etax_compliance_dashboard AS
WITH

-- ── 1a. etax_submissions aggregated per org ─────────────────────────────────
sub_agg AS (
  SELECT
    org_id,

    -- Volume
    COUNT(*)                                                   AS total_submissions,
    COUNT(*) FILTER (WHERE status = 'submitted')               AS submitted_count,
    COUNT(*) FILTER (WHERE status = 'failed')                  AS failed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled')               AS cancelled_count,
    COUNT(*) FILTER (WHERE status = 'queued')                  AS queued_count,
    COUNT(*) FILTER (WHERE status = 'submitting')              AS submitting_count,

    -- Attempt stats
    ROUND(AVG(attempt_count)::NUMERIC, 2)                      AS avg_attempt_count,
    MAX(attempt_count)                                         AS max_attempt_count,

    -- PDF download stats
    COUNT(*) FILTER (WHERE pdf_status = 'downloaded')          AS submissions_with_pdf_downloaded,
    COUNT(*) FILTER (WHERE pdf_status IN ('pending','downloading','failed')
                       AND status = 'submitted')               AS pdf_pending_count,

    -- Time markers
    MAX(submitted_at)                                          AS last_submission_at,
    MAX(last_attempt_at) FILTER (WHERE status = 'failed')      AS last_failed_at,
    MIN(created_at)      FILTER (WHERE status = 'failed'
                                   AND submitted_at IS NULL)   AS oldest_unresolved_failed_at,

    -- Recent failures (last 24 h)
    COUNT(*) FILTER (WHERE status = 'failed'
                       AND last_attempt_at >= now() - INTERVAL '24 hours') AS failed_last_24h

  FROM etax_submissions
  GROUP BY org_id
),

-- ── 1b. audit log — last event per org ─────────────────────────────────────
audit_agg AS (
  SELECT
    org_id,
    MAX(changed_at) AS last_audit_event_at
  FROM etax_submission_audit_log
  GROUP BY org_id
),

-- ── 1c. invoice_notifications — overdue counts per org ─────────────────────
--   overdue_invoice_count    : distinct invoices with any active overdue notification
--   overdue_with_pending_etax: overdue invoices that ALSO have a non-submitted etax record
notif_agg AS (
  SELECT
    n.org_id,

    -- Unique invoices with active overdue notification (status not dismissed)
    COUNT(DISTINCT n.invoice_id) FILTER (
      WHERE n.notification_type IN (
        'overdue_1d', 'overdue_7d', 'overdue_30d', 'overdue_90d'
      )
      AND n.status NOT IN ('dismissed')
      AND (n.snoozed_until IS NULL OR n.snoozed_until < CURRENT_DATE)
    ) AS overdue_invoice_count,

    -- Overdue invoices that have a pending/failed etax submission
    COUNT(DISTINCT n.invoice_id) FILTER (
      WHERE n.notification_type IN (
        'overdue_1d', 'overdue_7d', 'overdue_30d', 'overdue_90d'
      )
      AND n.status NOT IN ('dismissed')
      AND (n.snoozed_until IS NULL OR n.snoozed_until < CURRENT_DATE)
      AND EXISTS (
        SELECT 1 FROM etax_submissions es
        WHERE es.invoice_id = n.invoice_id
          AND es.org_id     = n.org_id
          AND es.status     NOT IN ('submitted', 'cancelled')
      )
    ) AS overdue_with_pending_etax

  FROM invoice_notifications n
  GROUP BY n.org_id
)

-- ── Final SELECT ─────────────────────────────────────────────────────────────
SELECT
  s.org_id,

  -- Volume
  s.total_submissions,
  s.submitted_count,
  s.failed_count,
  s.cancelled_count,
  s.queued_count,
  s.submitting_count,

  -- Success rate: submitted / (submitted + failed + cancelled)
  -- Excludes queued/submitting (in-flight) from denominator
  CASE
    WHEN (s.submitted_count + s.failed_count + s.cancelled_count) = 0
    THEN NULL
    ELSE ROUND(
      s.submitted_count::NUMERIC * 100
      / (s.submitted_count + s.failed_count + s.cancelled_count),
      2
    )
  END AS success_rate,

  -- Attempt stats
  s.avg_attempt_count,
  s.max_attempt_count,

  -- PDF stats
  s.submissions_with_pdf_downloaded,
  CASE
    WHEN s.submitted_count = 0 THEN NULL
    ELSE ROUND(
      s.submissions_with_pdf_downloaded::NUMERIC * 100 / s.submitted_count,
      2
    )
  END AS pdf_success_rate,

  -- Time markers
  s.last_submission_at,
  s.last_failed_at,
  s.oldest_unresolved_failed_at,
  s.failed_last_24h,

  -- Audit log
  COALESCE(a.last_audit_event_at, NULL) AS last_audit_event_at,

  -- Overdue invoice counts (NULL when org has no notifications yet)
  COALESCE(n.overdue_invoice_count,    0) AS overdue_invoice_count,
  COALESCE(n.overdue_with_pending_etax, 0) AS overdue_with_pending_etax

FROM sub_agg s
LEFT JOIN audit_agg  a ON a.org_id = s.org_id
LEFT JOIN notif_agg  n ON n.org_id = s.org_id;

COMMENT ON VIEW v_etax_compliance_dashboard IS
  'Per-org e-Tax compliance metrics: submission volume, success rate, PDF download rate, '
  'average attempt count, overdue invoice count with pending etax, and recent failure signals. '
  'Query via rpc_etax_compliance_dashboard() (org-scoped) or rpc_etax_compliance_all_orgs() (admin).';

-- ============================================================================
-- 2. RPC: rpc_etax_compliance_dashboard — org-scoped (authenticated)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_compliance_dashboard()
RETURNS TABLE (
  org_id                        UUID,
  total_submissions             BIGINT,
  submitted_count               BIGINT,
  failed_count                  BIGINT,
  cancelled_count               BIGINT,
  queued_count                  BIGINT,
  submitting_count              BIGINT,
  success_rate                  NUMERIC,
  avg_attempt_count             NUMERIC,
  max_attempt_count             BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  pdf_success_rate              NUMERIC,
  last_submission_at            TIMESTAMPTZ,
  last_failed_at                TIMESTAMPTZ,
  oldest_unresolved_failed_at   TIMESTAMPTZ,
  failed_last_24h               BIGINT,
  last_audit_event_at           TIMESTAMPTZ,
  overdue_invoice_count         BIGINT,
  overdue_with_pending_etax     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    org_id,
    total_submissions,
    submitted_count,
    failed_count,
    cancelled_count,
    queued_count,
    submitting_count,
    success_rate,
    avg_attempt_count,
    max_attempt_count,
    submissions_with_pdf_downloaded,
    pdf_success_rate,
    last_submission_at,
    last_failed_at,
    oldest_unresolved_failed_at,
    failed_last_24h,
    last_audit_event_at,
    overdue_invoice_count,
    overdue_with_pending_etax
  FROM v_etax_compliance_dashboard
  WHERE org_id = get_user_org_id();
$$;

COMMENT ON FUNCTION rpc_etax_compliance_dashboard() IS
  'Returns the compliance dashboard row for the calling user''s organisation. '
  'SECURITY DEFINER with org isolation via get_user_org_id().';

REVOKE ALL ON FUNCTION rpc_etax_compliance_dashboard() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rpc_etax_compliance_dashboard() TO authenticated;

-- ============================================================================
-- 3. RPC: rpc_etax_compliance_all_orgs — admin/service-role only
--    Returns all orgs sorted by most-recently-failed first.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_compliance_all_orgs(
  p_min_failed_last_24h INT DEFAULT 0
)
RETURNS TABLE (
  org_id                        UUID,
  total_submissions             BIGINT,
  submitted_count               BIGINT,
  failed_count                  BIGINT,
  cancelled_count               BIGINT,
  queued_count                  BIGINT,
  submitting_count              BIGINT,
  success_rate                  NUMERIC,
  avg_attempt_count             NUMERIC,
  max_attempt_count             BIGINT,
  submissions_with_pdf_downloaded BIGINT,
  pdf_success_rate              NUMERIC,
  last_submission_at            TIMESTAMPTZ,
  last_failed_at                TIMESTAMPTZ,
  oldest_unresolved_failed_at   TIMESTAMPTZ,
  failed_last_24h               BIGINT,
  last_audit_event_at           TIMESTAMPTZ,
  overdue_invoice_count         BIGINT,
  overdue_with_pending_etax     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    org_id,
    total_submissions,
    submitted_count,
    failed_count,
    cancelled_count,
    queued_count,
    submitting_count,
    success_rate,
    avg_attempt_count,
    max_attempt_count,
    submissions_with_pdf_downloaded,
    pdf_success_rate,
    last_submission_at,
    last_failed_at,
    oldest_unresolved_failed_at,
    failed_last_24h,
    last_audit_event_at,
    overdue_invoice_count,
    overdue_with_pending_etax
  FROM v_etax_compliance_dashboard
  WHERE failed_last_24h >= p_min_failed_last_24h
  ORDER BY failed_last_24h DESC NULLS LAST, last_failed_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION rpc_etax_compliance_all_orgs(INT) IS
  'Admin/service-role RPC: returns compliance dashboard for all orgs. '
  'Filter by minimum failed_last_24h count (default 0 = all orgs). '
  'Sorted by most-recently-failing first. SECURITY DEFINER — NOT exposed to authenticated.';

-- Service-role only: revoke from all, grant explicitly to service_role
REVOKE ALL ON FUNCTION rpc_etax_compliance_all_orgs(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_etax_compliance_all_orgs(INT) FROM authenticated;
-- NOTE: service_role bypasses RLS by default; only call this from trusted server contexts.

-- ============================================================================
-- 4. GRANT VIEW to postgres (owner) — authenticated users go through RPCs
-- ============================================================================

-- The view itself is NOT exposed directly to authenticated users.
-- All access is mediated by the SECURITY DEFINER RPCs above.
REVOKE ALL ON v_etax_compliance_dashboard FROM PUBLIC;
REVOKE ALL ON v_etax_compliance_dashboard FROM authenticated;
GRANT  SELECT ON v_etax_compliance_dashboard TO postgres;

-- ============================================================================
-- 5. Supporting index hints (on underlying tables — advisory)
-- ============================================================================

-- Index on etax_submissions for dashboard aggregation (org_id + status + timestamps)
CREATE INDEX IF NOT EXISTS idx_etaxsub_org_status_time
  ON etax_submissions(org_id, status, last_attempt_at DESC NULLS LAST);

-- Index on etax_submissions pdf_status for PDF rate calculation
CREATE INDEX IF NOT EXISTS idx_etaxsub_org_pdf_status
  ON etax_submissions(org_id, pdf_status) WHERE status = 'submitted';

-- Index on invoice_notifications for overdue counts
CREATE INDEX IF NOT EXISTS idx_notif_org_type_status
  ON invoice_notifications(org_id, notification_type, status)
  WHERE status NOT IN ('dismissed');

-- ============================================================================
-- 6. Validation query (runs at migration time — errors on schema mismatch)
-- ============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  -- Confirm view is queryable
  SELECT COUNT(*) INTO v_count FROM v_etax_compliance_dashboard WHERE FALSE;

  -- Confirm org-scoped RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_compliance_dashboard'
  ) THEN
    RAISE EXCEPTION '0186: rpc_etax_compliance_dashboard function not found after creation';
  END IF;

  -- Confirm admin RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_compliance_all_orgs'
  ) THEN
    RAISE EXCEPTION '0186: rpc_etax_compliance_all_orgs function not found after creation';
  END IF;

  RAISE NOTICE '0186_etax_compliance_dashboard: validation passed (view + 2 RPCs ready)';
END;
$$;
