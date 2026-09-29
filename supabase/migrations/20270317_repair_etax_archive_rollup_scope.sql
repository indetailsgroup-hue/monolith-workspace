-- Restore service-role visibility for the archive rollup RPC while preserving
-- tenant isolation for authenticated callers.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_etax_sla_archive_org_rollup(
    p_org_id    uuid DEFAULT NULL,
    p_from_date date DEFAULT NULL,
    p_to_date   date DEFAULT NULL
)
RETURNS TABLE (
    org_id                   uuid,
    org_name                 text,
    first_archived_date      date,
    last_archived_date       date,
    last_archived_at         timestamptz,
    total_archive_days       int,
    total_created            bigint,
    total_breached           bigint,
    overall_breach_rate      numeric,
    avg_daily_breach_rate    numeric,
    peak_daily_breach_rate   numeric,
    peak_cumulative          bigint,
    worst_severity_tier      text,
    breached_document_types  text[],
    sla_threshold_hours      int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        rollup.org_id,
        rollup.org_name,
        rollup.first_archived_date,
        rollup.last_archived_date,
        rollup.last_archived_at,
        rollup.total_archive_days,
        rollup.total_created,
        rollup.total_breached,
        rollup.overall_breach_rate,
        rollup.avg_daily_breach_rate,
        rollup.peak_daily_breach_rate,
        rollup.peak_cumulative,
        rollup.worst_severity_tier,
        rollup.breached_document_types,
        rollup.sla_threshold_hours
    FROM public.v_etax_sla_archive_org_rollup AS rollup
    WHERE
        (
            COALESCE(
                current_setting('request.jwt.claims', true)::jsonb ->> 'role',
                ''
            ) = 'service_role'
            OR rollup.org_id = public.get_user_org_id()
        )
        AND (p_org_id IS NULL OR rollup.org_id = p_org_id)
        AND (p_from_date IS NULL OR rollup.last_archived_date >= p_from_date)
        AND (p_to_date IS NULL OR rollup.first_archived_date <= p_to_date)
    ORDER BY
        CASE rollup.worst_severity_tier
            WHEN 'CRITICAL' THEN 5
            WHEN 'WARNING'  THEN 4
            WHEN 'ELEVATED' THEN 3
            WHEN 'NORMAL'   THEN 2
            ELSE 1
        END DESC,
        rollup.overall_breach_rate DESC;
$$;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_archive_org_rollup(uuid, date, date)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_archive_org_rollup(uuid, date, date)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_etax_sla_archive_org_rollup(uuid, date, date) IS
    'Returns archive rollups for all organizations to service_role and only '
    'the caller organization to authenticated users. Repaired 20270317.';

COMMIT;
