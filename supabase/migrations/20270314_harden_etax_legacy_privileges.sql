-- =============================================================================
-- Close legacy privilege gaps caused by PostgreSQL's default PUBLIC EXECUTE.
--
-- Several older migrations granted their intended role and revoked anon or
-- authenticated directly, but did not revoke PUBLIC. Because anon and
-- authenticated inherit PUBLIC privileges, those functions remained callable.
-- =============================================================================

BEGIN;

-- Authenticated tenant RPCs. Reads remain scoped inside each SECURITY DEFINER
-- function through get_user_org_id().
REVOKE ALL ON FUNCTION public.rpc_etax_compliance_dashboard_cached()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_compliance_dashboard_cached()
  TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_breach_archive(
  UUID, TEXT, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_breach_archive(
  UUID, TEXT, DATE, DATE
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_archive_summary(
  UUID, TEXT, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_archive_summary(
  UUID, TEXT, DATE, DATE
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_etax_sla_archive_org_rollup(
  UUID, DATE, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_sla_archive_org_rollup(
  UUID, DATE, DATE
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_partition_archive_log(
  TEXT, DATE, DATE, INT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_partition_archive_log(
  TEXT, DATE, DATE, INT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_partition_archive_log_stats()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_partition_archive_log_stats()
  TO authenticated, service_role;

-- Maintenance and diagnostic functions are service-role only.
REVOKE ALL ON FUNCTION public.fn_archive_etax_sla_breach_timeline()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_archive_etax_sla_breach_timeline()
  TO service_role;

REVOKE ALL ON FUNCTION public.rpc_etax_partition_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_partition_health()
  TO service_role;

REVOKE ALL ON FUNCTION public.rpc_etax_notify_request_status(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_etax_notify_request_status(INT)
  TO service_role;

REVOKE ALL ON FUNCTION public.fn_create_etax_partition(INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_etax_partition(INT, INT)
  TO service_role;

REVOKE ALL ON FUNCTION public.fn_auto_create_next_etax_partition()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_auto_create_next_etax_partition()
  TO service_role;

-- The lifecycle table is an internal audit log. Authenticated access is only
-- through the two filtered SECURITY DEFINER RPCs above.
REVOKE ALL ON TABLE public.partition_archive_log
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partition_archive_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partition_archive_log_id_seq
  TO service_role;

COMMIT;
