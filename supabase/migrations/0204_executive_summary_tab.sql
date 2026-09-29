-- =============================================================================
-- Migration 0204 — Executive Summary Dashboard Tab
-- Adds rpc_etax_executive_kpi_banner — a single-row aggregate for the top
-- KPI banner in the Executive Summary dashboard tab, plus a platform_config
-- feature-flag entry enabling the executive tab in the HTML dashboard.
--
-- Functions created:
--   rpc_etax_executive_kpi_banner   — global executive KPI banner (1 row)
--
-- Dependencies:
--   v_etax_sla_executive_summary    (Migration 0203)
--   organizations                   (0000_multi_tenant_schema)
--   get_user_org_id()
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  rpc_etax_executive_kpi_banner
--     Returns a single-row summary for the executive tab top KPI cards:
--       total_orgs, orgs_requiring_attention, orgs_with_archive,
--       global_worst_severity, global_peak_breach_rate, live_orgs, archive_orgs
--     service_role sees all orgs; authenticated users see only their own org
--     (so the banner reflects their single org's KPIs).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_etax_executive_kpi_banner()
RETURNS TABLE (
  total_orgs                  BIGINT,
  orgs_requiring_attention    BIGINT,
  orgs_with_live_data         BIGINT,
  orgs_with_archive_data      BIGINT,
  global_worst_severity       TEXT,
  global_peak_breach_rate_pct NUMERIC,
  live_total_submissions      BIGINT,
  live_total_breached         BIGINT,
  archive_total_created       BIGINT,
  archive_total_breached      BIGINT,
  sla_threshold_hours         NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)                                                          AS total_orgs,
    COUNT(*) FILTER (WHERE v.requires_attention = true)              AS orgs_requiring_attention,
    COUNT(*) FILTER (WHERE v.has_live_data = true)                   AS orgs_with_live_data,
    COUNT(*) FILTER (WHERE v.has_archive_data = true)                AS orgs_with_archive_data,
    CASE
      WHEN 'CRITICAL' = ANY(array_agg(v.combined_worst_severity))  THEN 'CRITICAL'
      WHEN 'WARNING'  = ANY(array_agg(v.combined_worst_severity))  THEN 'WARNING'
      WHEN 'ELEVATED' = ANY(array_agg(v.combined_worst_severity))  THEN 'ELEVATED'
      WHEN 'NORMAL'   = ANY(array_agg(v.combined_worst_severity))  THEN 'NORMAL'
      ELSE 'HEALTHY'
    END                                                               AS global_worst_severity,
    MAX(v.peak_breach_rate_pct)                                       AS global_peak_breach_rate_pct,
    SUM(COALESCE(v.live_total_submissions, 0))                        AS live_total_submissions,
    SUM(COALESCE(v.live_breach_count, 0))                             AS live_total_breached,
    SUM(COALESCE(v.archive_total_created, 0))                         AS archive_total_created,
    SUM(COALESCE(v.archive_total_breached, 0))                        AS archive_total_breached,
    MAX(COALESCE(v.sla_threshold_hours, 24))                          AS sla_threshold_hours
  FROM v_etax_sla_executive_summary v
  WHERE
    (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
    OR v.org_id = get_user_org_id();
$$;

-- Permissions
REVOKE ALL ON FUNCTION rpc_etax_executive_kpi_banner() FROM PUBLIC;
REVOKE ALL ON FUNCTION rpc_etax_executive_kpi_banner() FROM anon;
GRANT EXECUTE ON FUNCTION rpc_etax_executive_kpi_banner() TO authenticated;

COMMENT ON FUNCTION rpc_etax_executive_kpi_banner IS
  'Single-row executive KPI banner aggregating all orgs in v_etax_sla_executive_summary. '
  'Returns global counts and worst-case signals for the Executive Summary dashboard tab. '
  'SECURITY DEFINER — non-service_role scoped to own org via get_user_org_id(). '
  'Migration 0204.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  platform_config — feature flag + migration stamp
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform_config (key, value, updated_at)
VALUES (
  'executive_tab_enabled',
  jsonb_build_object(
    'enabled',     true,
    'tab_id',      'executive',
    'rpc_summary', 'rpc_etax_sla_executive_summary',
    'rpc_banner',  'rpc_etax_executive_kpi_banner',
    'version',     '0204',
    'enabled_at',  now()
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;

INSERT INTO platform_config (key, value, updated_at)
VALUES (
  'migration_0204_applied',
  jsonb_build_object(
    'version',     '0204',
    'description', 'rpc_etax_executive_kpi_banner + executive_tab_enabled feature flag',
    'applied_at',  now()
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;

COMMIT;
