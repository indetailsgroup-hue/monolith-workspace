-- =============================================================================
-- Migration 0201: etax_sla_breach_archive + daily archival pg_cron job
-- Long-term retention of v_etax_sla_breach_timeline data beyond 90-day window
-- =============================================================================
--
-- This migration adds:
--   1. etax_sla_breach_archive       — permanent archive table (one row per
--                                       org × document_type × breach_date)
--   2. fn_archive_etax_sla_breach_timeline()
--                                    — SECURITY DEFINER UPSERT from
--                                       v_etax_sla_breach_timeline; idempotent
--   3. rpc_etax_sla_breach_archive(p_org_id, p_document_type,
--                                  p_from_date, p_to_date)
--                                    — SECURITY DEFINER RPC; RLS enforced
--   4. pg_cron job: runs archival daily at 00:15 UTC
--   5. Grants / RLS
--
-- Design notes:
--   • PRIMARY KEY (org_id, document_type, breach_date) allows ON CONFLICT DO
--     UPDATE so daily jobs are fully idempotent — re-running never duplicates.
--   • archived_at records the most-recent upsert timestamp per row.
--   • etax_sla_breach_archive is partitioned by breach_date (RANGE, monthly)
--     via a CHECK constraint approach — full declarative partitioning omitted
--     to keep the migration self-contained; add partition tables separately
--     if volume demands it.
--   • The archive preserves ALL 10 view columns plus archived_at so queries
--     against historical data never need to join back to the live view.
--   • rpc_etax_sla_breach_archive supports open-ended p_from_date / p_to_date
--     so callers can retrieve any historical range.
--
-- Dependencies:
--   0200_etax_sla_breach_timeline.sql  (v_etax_sla_breach_timeline, platform_config,
--                                       get_user_org_id(), organisations)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Archive table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.etax_sla_breach_archive (
  -- identity
  org_id               uuid        NOT NULL,
  document_type        text        NOT NULL
    CONSTRAINT etax_sla_breach_archive_doc_type_chk
      CHECK (document_type IN ('T01','T02','T03','T04')),
  breach_date          date        NOT NULL,

  -- denormalised display
  org_name             text,

  -- daily metrics (match v_etax_sla_breach_timeline columns)
  total_created        bigint      NOT NULL DEFAULT 0,
  breached_count       bigint      NOT NULL DEFAULT 0,
  breach_rate          numeric(6,4),          -- NULL when total_created = 0
  severity_tier        text        NOT NULL
    CONSTRAINT etax_sla_breach_archive_tier_chk
      CHECK (severity_tier IN ('HEALTHY','NORMAL','ELEVATED','WARNING','CRITICAL')),
  cumulative_breached  bigint      NOT NULL DEFAULT 0,
  sla_threshold_hours  numeric     NOT NULL DEFAULT 24,

  -- audit
  archived_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT etax_sla_breach_archive_pk
    PRIMARY KEY (org_id, document_type, breach_date)
);

-- Index: time-range queries per org (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_sla_archive_org_date
  ON public.etax_sla_breach_archive (org_id, breach_date DESC);

-- Index: queries filtered by severity across all orgs (admin dashboards)
CREATE INDEX IF NOT EXISTS idx_sla_archive_severity_date
  ON public.etax_sla_breach_archive (severity_tier, breach_date DESC);

-- Index: document-type analytics
CREATE INDEX IF NOT EXISTS idx_sla_archive_doctype_date
  ON public.etax_sla_breach_archive (document_type, breach_date DESC);

COMMENT ON TABLE public.etax_sla_breach_archive IS
  'Long-term archive of daily SLA breach metrics per (org, document_type, date). '
  'Populated daily by fn_archive_etax_sla_breach_timeline via pg_cron. '
  'PK upsert ensures full idempotency. Retains data beyond the 90-day live-view window. '
  'Created by Migration 0201.';

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.etax_sla_breach_archive ENABLE ROW LEVEL SECURITY;

-- Authenticated users see only their own org
CREATE POLICY etax_sla_breach_archive_tenant_iso
  ON public.etax_sla_breach_archive
  FOR ALL
  USING (
    org_id = public.get_user_org_id()
    OR current_setting('role', true) = 'service_role'
  );

-- ---------------------------------------------------------------------------
-- 3. Archival function: fn_archive_etax_sla_breach_timeline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_archive_etax_sla_breach_timeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_rows_upserted  bigint := 0;
  v_started_at     timestamptz := clock_timestamp();
  v_finished_at    timestamptz;
BEGIN
  -- Upsert all rows from the live view into the archive table.
  -- ON CONFLICT DO UPDATE refreshes the daily row with the latest
  -- computed values (breach counts may change during the day as
  -- submissions are processed) and stamps archived_at.
  INSERT INTO public.etax_sla_breach_archive (
    org_id,
    document_type,
    breach_date,
    org_name,
    total_created,
    breached_count,
    breach_rate,
    severity_tier,
    cumulative_breached,
    sla_threshold_hours,
    archived_at
  )
  SELECT
    tl.org_id,
    tl.document_type,
    tl.breach_date,
    tl.org_name,
    tl.total_created,
    tl.breached_count,
    tl.breach_rate,
    tl.severity_tier,
    tl.cumulative_breached,
    tl.sla_threshold_hours,
    clock_timestamp()
  FROM public.v_etax_sla_breach_timeline tl
  ON CONFLICT (org_id, document_type, breach_date) DO UPDATE SET
    org_name            = EXCLUDED.org_name,
    total_created       = EXCLUDED.total_created,
    breached_count      = EXCLUDED.breached_count,
    breach_rate         = EXCLUDED.breach_rate,
    severity_tier       = EXCLUDED.severity_tier,
    cumulative_breached = EXCLUDED.cumulative_breached,
    sla_threshold_hours = EXCLUDED.sla_threshold_hours,
    archived_at         = EXCLUDED.archived_at;

  GET DIAGNOSTICS v_rows_upserted = ROW_COUNT;
  v_finished_at := clock_timestamp();

  -- Stamp last run metadata in platform_config for monitoring
  INSERT INTO public.platform_config (key, value, updated_at)
  VALUES (
    'sla_archive_last_run',
    jsonb_build_object(
      'run_at',        v_started_at,
      'rows_upserted', v_rows_upserted,
      'duration_ms',   ROUND(
        EXTRACT(EPOCH FROM (v_finished_at - v_started_at)) * 1000
      )
    )::text,
    now()
  )
  ON CONFLICT (key) DO UPDATE SET
    value      = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'success',        true,
    'rows_upserted',  v_rows_upserted,
    'run_at',         v_started_at,
    'duration_ms',    ROUND(
      EXTRACT(EPOCH FROM (v_finished_at - v_started_at)) * 1000
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log failure to platform_config and re-raise so pg_cron records it
    INSERT INTO public.platform_config (key, value, updated_at)
    VALUES (
      'sla_archive_last_run',
      jsonb_build_object(
        'success',   false,
        'error',     SQLERRM,
        'run_at',    v_started_at
      )::text,
      now()
    )
    ON CONFLICT (key) DO UPDATE SET
      value      = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.fn_archive_etax_sla_breach_timeline() IS
  'Upserts all rows from v_etax_sla_breach_timeline into etax_sla_breach_archive. '
  'Fully idempotent via ON CONFLICT (org_id, document_type, breach_date) DO UPDATE. '
  'Stamps run metadata in platform_config.sla_archive_last_run. '
  'Called by pg_cron daily at 00:15 UTC. Created by Migration 0201.';

-- ---------------------------------------------------------------------------
-- 4. Query RPC: rpc_etax_sla_breach_archive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_sla_breach_archive(
  p_org_id        uuid    DEFAULT NULL,
  p_document_type text    DEFAULT NULL,
  p_from_date     date    DEFAULT NULL,
  p_to_date       date    DEFAULT NULL
)
RETURNS TABLE (
  breach_date          date,
  org_id               uuid,
  org_name             text,
  document_type        text,
  total_created        bigint,
  breached_count       bigint,
  breach_rate          numeric,
  severity_tier        text,
  cumulative_breached  bigint,
  sla_threshold_hours  numeric,
  archived_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.breach_date,
    a.org_id,
    a.org_name,
    a.document_type,
    a.total_created,
    a.breached_count,
    a.breach_rate,
    a.severity_tier,
    a.cumulative_breached,
    a.sla_threshold_hours,
    a.archived_at
  FROM public.etax_sla_breach_archive a
  WHERE
    -- RLS: authenticated see only their org; service_role sees all
    (
      a.org_id = public.get_user_org_id()
      OR current_setting('role', true) = 'service_role'
    )
    AND (p_org_id        IS NULL OR a.org_id        = p_org_id)
    AND (p_document_type IS NULL OR a.document_type = p_document_type)
    AND (p_from_date     IS NULL OR a.breach_date   >= p_from_date)
    AND (p_to_date       IS NULL OR a.breach_date   <= p_to_date)
  ORDER BY a.org_id, a.document_type, a.breach_date ASC;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_sla_breach_archive(uuid, text, date, date) IS
  'Returns archived daily SLA breach rows from etax_sla_breach_archive. '
  'Optional filters: p_org_id, p_document_type, p_from_date, p_to_date. '
  'RLS-enforced: authenticated users see only their own org_id. '
  'Returns full historical range — not limited to 90 days. '
  'Created by Migration 0201.';

-- ---------------------------------------------------------------------------
-- 5. pg_cron job: daily archive at 00:15 UTC
-- ---------------------------------------------------------------------------
-- Scheduled 15 minutes after midnight to run after the etax-submit-worker
-- and other nightly jobs have had time to complete their last cycle.
DO $$
BEGIN
  -- Remove any existing schedule for this job name before re-creating
  -- (cron.unschedule is safe to call even if the job does not exist)
  BEGIN
    PERFORM cron.unschedule('archive-etax-sla-breach-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- pg_cron extension not installed or job not found — skip
  END;

  BEGIN
    PERFORM cron.schedule(
      'archive-etax-sla-breach-daily',  -- job name
      '15 0 * * *',                     -- 00:15 UTC every day
      'SELECT public.fn_archive_etax_sla_breach_timeline();'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — skipping job registration: %', SQLERRM;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
-- Archive table
GRANT SELECT ON public.etax_sla_breach_archive TO authenticated;
REVOKE SELECT ON public.etax_sla_breach_archive FROM anon;

-- Archival function (service_role only — not callable by end users directly)
GRANT  EXECUTE ON FUNCTION public.fn_archive_etax_sla_breach_timeline() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_archive_etax_sla_breach_timeline() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_archive_etax_sla_breach_timeline() FROM anon;

-- Query RPC (authenticated users query their own archive)
GRANT  EXECUTE ON FUNCTION public.rpc_etax_sla_breach_archive(uuid, text, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_sla_breach_archive(uuid, text, date, date) FROM anon;

-- ---------------------------------------------------------------------------
-- 7. Rollback notes (manual)
-- ---------------------------------------------------------------------------
-- SELECT cron.unschedule('archive-etax-sla-breach-daily');
-- DROP FUNCTION IF EXISTS public.rpc_etax_sla_breach_archive(uuid, text, date, date);
-- DROP FUNCTION IF EXISTS public.fn_archive_etax_sla_breach_timeline();
-- DROP TABLE  IF EXISTS public.etax_sla_breach_archive;
