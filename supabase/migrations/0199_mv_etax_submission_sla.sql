-- =============================================================================
-- Migration 0199: mv_etax_submission_sla — Materialized view + hourly refresh
-- =============================================================================
--
-- This migration adds:
--   1. mv_etax_submission_sla   — Materialized view caching v_etax_submission_sla
--   2. fn_refresh_mv_etax_submission_sla() — Refresh function called by pg_cron
--   3. rpc_etax_submission_sla_cached(p_document_type, p_severity)
--                                — SECURITY DEFINER RPC querying the MV
--   4. Grants: authenticated READ on MV; EXECUTE on RPC; anon REVOKED
--   5. COMMENTs on all new objects
--
-- pg_cron job is registered in supabase/config.toml as:
--   [cron."refresh-etax-sla-mv"]
--   schedule = "0 * * * *"   (hourly, at minute 0)
--   command  = "SELECT public.fn_refresh_mv_etax_submission_sla();"
--
-- Dependencies:
--   0198_etax_submission_sla.sql (v_etax_submission_sla, rpc_etax_submission_sla,
--                                 rpc_etax_sla_summary)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Materialized view
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_etax_submission_sla AS
SELECT
  org_id,
  document_type,
  total_submissions,
  breached_count                    AS sla_breached_count,
  breach_rate_pct                   AS breach_rate,
  (breached_count > 0)              AS sla_breach_flag,
  sla_severity                      AS severity_tier,
  avg_processing_hours,
  max_processing_hours,
  sla_threshold_hours,
  newest_breach_created_at          AS last_submission_at,
  snapshot_at                       AS updated_at
FROM public.v_etax_submission_sla
WITH DATA;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS mv_etax_submission_sla_pk
  ON public.mv_etax_submission_sla (org_id, document_type);

-- Supporting indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_mv_etax_sla_severity
  ON public.mv_etax_submission_sla (severity_tier);

CREATE INDEX IF NOT EXISTS idx_mv_etax_sla_breach_flag
  ON public.mv_etax_submission_sla (sla_breach_flag)
  WHERE sla_breach_flag = TRUE;

COMMENT ON MATERIALIZED VIEW public.mv_etax_submission_sla IS
  'Cached materialized view of v_etax_submission_sla. '
  'Refreshed hourly via pg_cron job ''refresh-etax-sla-mv''. '
  'Use rpc_etax_submission_sla_cached() to query with RLS enforcement. '
  'Created by Migration 0199.';

-- ---------------------------------------------------------------------------
-- 2. Refresh function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refresh_mv_etax_submission_sla()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_etax_submission_sla;

  -- Log refresh event into platform_config for lag monitoring
  INSERT INTO public.platform_config (key, value, updated_at)
    VALUES (
      'mv_etax_sla_last_refreshed',
      to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      now()
    )
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at;
END;
$$;

COMMENT ON FUNCTION public.fn_refresh_mv_etax_submission_sla() IS
  'Refreshes mv_etax_submission_sla CONCURRENTLY and records the refresh '
  'timestamp in platform_config(''mv_etax_sla_last_refreshed''). '
  'Called hourly by pg_cron job ''refresh-etax-sla-mv''. '
  'Created by Migration 0199.';

-- ---------------------------------------------------------------------------
-- 3. Cached RPC (queries MV instead of base view)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_submission_sla_cached(
  p_document_type text DEFAULT NULL,
  p_severity      text DEFAULT NULL
)
RETURNS TABLE (
  org_id               uuid,
  document_type        text,
  total_submissions    bigint,
  sla_breached_count   bigint,
  breach_rate          numeric,
  sla_breach_flag      boolean,
  severity_tier        text,
  avg_processing_hours numeric,
  max_processing_hours numeric,
  sla_threshold_hours  numeric,
  updated_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mv.org_id,
    mv.document_type,
    mv.total_submissions,
    mv.sla_breached_count,
    mv.breach_rate,
    mv.sla_breach_flag,
    mv.severity_tier,
    mv.avg_processing_hours,
    mv.max_processing_hours,
    mv.sla_threshold_hours,
    mv.updated_at
  FROM public.mv_etax_submission_sla mv
  WHERE
    -- RLS: authenticated users see only their org; service_role sees all
    (
      mv.org_id = public.get_user_org_id()
      OR current_setting('role', true) = 'service_role'
    )
    AND (p_document_type IS NULL OR mv.document_type = p_document_type)
    AND (p_severity      IS NULL OR mv.severity_tier  = p_severity)
  ORDER BY
    CASE mv.severity_tier
      WHEN 'CRITICAL'  THEN 1
      WHEN 'WARNING'   THEN 2
      WHEN 'ELEVATED'  THEN 3
      WHEN 'NORMAL'    THEN 4
      WHEN 'HEALTHY'   THEN 5
      ELSE 6
    END,
    mv.breach_rate DESC NULLS LAST,
    mv.document_type;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_submission_sla_cached(text, text) IS
  'Cached version of rpc_etax_submission_sla that reads from the hourly-refreshed '
  'mv_etax_submission_sla materialized view instead of the live base view. '
  'Accepts optional p_document_type (T01|T02|T03|T04) and p_severity '
  '(HEALTHY|NORMAL|ELEVATED|WARNING|CRITICAL) filters. '
  'Results are ordered by severity tier DESC then breach_rate DESC. '
  'RLS-enforced: authenticated users see only their org_id. '
  'Created by Migration 0199.';

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
-- MV: authenticated role can SELECT (needed for direct queries)
GRANT SELECT ON public.mv_etax_submission_sla TO authenticated;
REVOKE SELECT ON public.mv_etax_submission_sla FROM anon;

-- Refresh function: restricted to service_role / postgres only
REVOKE EXECUTE ON FUNCTION public.fn_refresh_mv_etax_submission_sla() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_mv_etax_submission_sla() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_mv_etax_submission_sla() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_refresh_mv_etax_submission_sla() TO service_role;

-- Cached RPC: authenticated users only (SECURITY DEFINER handles data scoping)
GRANT  EXECUTE ON FUNCTION public.rpc_etax_submission_sla_cached(text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_submission_sla_cached(text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- 5. Rollback notes (manual)
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.rpc_etax_submission_sla_cached(text, text);
-- DROP FUNCTION IF EXISTS public.fn_refresh_mv_etax_submission_sla();
-- DROP MATERIALIZED VIEW IF EXISTS public.mv_etax_submission_sla;
-- DELETE FROM public.platform_config WHERE key = 'mv_etax_sla_last_refreshed';
-- Remove [cron."refresh-etax-sla-mv"] from supabase/config.toml
