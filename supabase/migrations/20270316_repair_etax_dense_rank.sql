-- =============================================================================
-- Restore true DENSE_RANK tie semantics for the eTax risk ranking.
--
-- The original window ordered by (health_score, org_id). Adding the unique
-- org_id to the window means equal scores can never share a rank, contradicting
-- both the documented contract and DENSE_RANK semantics. Deterministic display
-- ordering remains in the RPC's ORDER BY risk_rank, org_id.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_etax_org_risk_ranking AS
SELECT
  summary.org_id,
  organization.name AS org_name,
  summary.health_score,
  summary.health_status,
  summary.total_submissions,
  summary.submitted_count,
  summary.failed_count,
  summary.compliance_success_rate,
  summary.overdue_with_pending_etax,
  summary.failed_last_24h,
  summary.today_total AS today_daily_total,
  summary.today_retry_exhaustion_rate_pct,
  summary.compliance_mv_last_refreshed_at,
  summary.trend_mv_last_refreshed_at,
  DENSE_RANK() OVER (
    ORDER BY summary.health_score ASC
  )::BIGINT AS risk_rank,
  (summary.health_status = 'critical')::BOOLEAN AS is_priority_review,
  CASE summary.health_status
    WHEN 'critical' THEN 'CRITICAL'
    WHEN 'warning' THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS risk_tier,
  NOW() AS ranked_at
FROM public.v_etax_full_health_summary AS summary
JOIN public.organizations AS organization
  ON organization.org_id = summary.org_id;

COMMENT ON COLUMN public.v_etax_org_risk_ranking.risk_rank IS
  'DENSE_RANK() over health_score only, so equal scores share a rank. RPCs '
  'apply org_id as a deterministic display-order tiebreaker. Repaired 20270316.';

REVOKE ALL ON public.v_etax_org_risk_ranking
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_etax_org_risk_ranking TO service_role;

COMMIT;
