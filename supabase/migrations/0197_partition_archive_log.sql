-- =============================================================================
-- Migration 0197: partition_archive_log
-- MONOLITH Manufacturing OS
--
-- Creates the audit table written to by scripts/etax_partition_lifecycle.sh
-- when a partition is successfully DETACHed/archived.
--
-- Also adds:
--   - v_partition_archive_summary  — per-partition archival history view
--   - rpc_partition_archive_log()  — authenticated RPC to query the log
--   - fn_partition_archive_log_updated_at trigger — auto-stamps updated_at
--
-- Dependencies:
--   - Migration 0196 (etax_submissions partitioned table must exist)
-- =============================================================================

BEGIN;

-- ─── 1. partition_archive_log table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partition_archive_log (
  id                      BIGSERIAL        PRIMARY KEY,

  -- Partition identity
  partition_name          TEXT             NOT NULL,
  original_range_start    DATE             NOT NULL,
  original_range_end      DATE             NOT NULL,

  -- State at time of archival
  row_count_at_archive    BIGINT           NOT NULL DEFAULT 0,
  size_bytes_at_archive   BIGINT           NULL,           -- populated if pg_dump ran

  -- Archival outcome
  action                  TEXT             NOT NULL
    DEFAULT 'DETACH'
    CHECK (action IN ('DETACH', 'DETACH_RENAME', 'DETACH_DROP', 'DETACH_BACKUP_RENAME', 'DETACH_BACKUP_DROP')),
  archived_name           TEXT             NULL,           -- renamed-to name if renamed
  backup_file_path        TEXT             NULL,           -- pg_dump file path if backed up
  backup_size_bytes       BIGINT           NULL,

  -- Actor & timing
  archived_by             TEXT             NOT NULL DEFAULT current_user,
  archived_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  notes                   TEXT             NULL,

  -- Audit metadata
  script_version          TEXT             NULL,           -- script version if reported
  hostname                TEXT             NULL,           -- server hostname at run time
  created_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE  public.partition_archive_log IS
  'Audit log of etax_submissions partition archival actions performed by etax_partition_lifecycle.sh.';
COMMENT ON COLUMN public.partition_archive_log.partition_name IS
  'Original partition table name (e.g. etax_submissions_y2024m01).';
COMMENT ON COLUMN public.partition_archive_log.original_range_start IS
  'Inclusive start date of the partition range (PARTITION FOR VALUES FROM).';
COMMENT ON COLUMN public.partition_archive_log.original_range_end IS
  'Exclusive end date of the partition range (PARTITION FOR VALUES TO).';
COMMENT ON COLUMN public.partition_archive_log.row_count_at_archive IS
  'Live row count fetched from the partition immediately before detaching.';
COMMENT ON COLUMN public.partition_archive_log.action IS
  'Archival action performed: DETACH | DETACH_RENAME | DETACH_DROP | DETACH_BACKUP_RENAME | DETACH_BACKUP_DROP.';
COMMENT ON COLUMN public.partition_archive_log.archived_name IS
  'New table name after rename (e.g. etax_submissions_y2024m01_archived_20260901). NULL if dropped.';
COMMENT ON COLUMN public.partition_archive_log.backup_file_path IS
  'Absolute path to pg_dump output file. NULL if --backup was not passed.';
COMMENT ON COLUMN public.partition_archive_log.archived_by IS
  'PostgreSQL current_user at time of execution.';

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_partition_archive_log_partition_name
  ON public.partition_archive_log (partition_name);

CREATE INDEX IF NOT EXISTS idx_partition_archive_log_archived_at
  ON public.partition_archive_log (archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_partition_archive_log_range_start
  ON public.partition_archive_log (original_range_start);

-- ─── 3. updated_at auto-stamp trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_partition_archive_log_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partition_archive_log_updated_at
  ON public.partition_archive_log;

CREATE TRIGGER trg_partition_archive_log_updated_at
  BEFORE UPDATE ON public.partition_archive_log
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_partition_archive_log_set_updated_at();

-- ─── 4. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.partition_archive_log ENABLE ROW LEVEL SECURITY;

-- service_role has full access (script runs as service_role or postgres superuser)
DROP POLICY IF EXISTS pol_partition_archive_log_service_all ON public.partition_archive_log;
CREATE POLICY pol_partition_archive_log_service_all
  ON public.partition_archive_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated users can SELECT their own org's partitions via the RPC only;
-- direct table access is denied (reads go through rpc_partition_archive_log)
DROP POLICY IF EXISTS pol_partition_archive_log_authenticated_none ON public.partition_archive_log;
CREATE POLICY pol_partition_archive_log_authenticated_none
  ON public.partition_archive_log
  FOR SELECT
  TO authenticated
  USING (false);   -- force all reads through the RPC

-- ─── 5. v_partition_archive_summary view ─────────────────────────────────────
DROP VIEW IF EXISTS public.v_partition_archive_summary;

CREATE VIEW public.v_partition_archive_summary AS
SELECT
  partition_name,
  original_range_start,
  original_range_end,
  action,
  row_count_at_archive,
  CASE
    WHEN size_bytes_at_archive IS NOT NULL
    THEN pg_size_pretty(size_bytes_at_archive)
    ELSE NULL
  END                                        AS size_pretty,
  CASE
    WHEN backup_file_path IS NOT NULL THEN TRUE
    ELSE FALSE
  END                                        AS has_backup,
  backup_file_path,
  archived_name,
  archived_by,
  archived_at,
  EXTRACT(EPOCH FROM (NOW() - archived_at)) / 86400 AS days_since_archive,
  notes
FROM public.partition_archive_log
ORDER BY archived_at DESC;

COMMENT ON VIEW public.v_partition_archive_summary IS
  'Human-readable summary of all partition archival events, newest first.';

-- ─── 6. rpc_partition_archive_log() — authenticated RPC ──────────────────────
DROP FUNCTION IF EXISTS public.rpc_partition_archive_log(
  p_partition_name TEXT,
  p_from_date      DATE,
  p_to_date        DATE,
  p_limit          INT
);

CREATE OR REPLACE FUNCTION public.rpc_partition_archive_log(
  p_partition_name TEXT    DEFAULT NULL,
  p_from_date      DATE    DEFAULT NULL,
  p_to_date        DATE    DEFAULT NULL,
  p_limit          INT     DEFAULT 100
)
RETURNS TABLE (
  id                    BIGINT,
  partition_name        TEXT,
  original_range_start  DATE,
  original_range_end    DATE,
  row_count_at_archive  BIGINT,
  size_pretty           TEXT,
  action                TEXT,
  archived_name         TEXT,
  has_backup            BOOLEAN,
  backup_file_path      TEXT,
  archived_by           TEXT,
  archived_at           TIMESTAMPTZ,
  days_since_archive    NUMERIC,
  notes                 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pal.id,
    pal.partition_name,
    pal.original_range_start,
    pal.original_range_end,
    pal.row_count_at_archive,
    CASE
      WHEN pal.size_bytes_at_archive IS NOT NULL
      THEN pg_size_pretty(pal.size_bytes_at_archive)
      ELSE NULL
    END                                                          AS size_pretty,
    pal.action,
    pal.archived_name,
    (pal.backup_file_path IS NOT NULL)                          AS has_backup,
    pal.backup_file_path,
    pal.archived_by,
    pal.archived_at,
    ROUND(
      EXTRACT(EPOCH FROM (NOW() - pal.archived_at)) / 86400.0, 1
    )                                                           AS days_since_archive,
    pal.notes
  FROM public.partition_archive_log pal
  WHERE
    (p_partition_name IS NULL OR pal.partition_name ILIKE '%' || p_partition_name || '%')
    AND (p_from_date  IS NULL OR pal.original_range_start >= p_from_date)
    AND (p_to_date    IS NULL OR pal.original_range_end   <= p_to_date)
  ORDER BY pal.archived_at DESC
  LIMIT LEAST(p_limit, 1000);
END;
$$;

COMMENT ON FUNCTION public.rpc_partition_archive_log IS
  'Returns filtered partition archival history. Accessible to authenticated and service_role.
   Filters: p_partition_name (partial match), p_from_date, p_to_date (by partition range), p_limit (max 1000).';

GRANT EXECUTE ON FUNCTION public.rpc_partition_archive_log(TEXT, DATE, DATE, INT)
  TO authenticated, service_role;

-- ─── 7. rpc_partition_archive_log_stats() — aggregate stats RPC ──────────────
DROP FUNCTION IF EXISTS public.rpc_partition_archive_log_stats();

CREATE OR REPLACE FUNCTION public.rpc_partition_archive_log_stats()
RETURNS TABLE (
  total_archived_partitions   BIGINT,
  total_rows_archived         BIGINT,
  total_backups_taken         BIGINT,
  total_partitions_dropped    BIGINT,
  earliest_archive_date       TIMESTAMPTZ,
  latest_archive_date         TIMESTAMPTZ,
  most_recent_partition       TEXT,
  most_recent_action          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT                                           AS total_archived_partitions,
    COALESCE(SUM(row_count_at_archive), 0)::BIGINT            AS total_rows_archived,
    COUNT(*) FILTER (WHERE backup_file_path IS NOT NULL)::BIGINT AS total_backups_taken,
    COUNT(*) FILTER (WHERE action ILIKE '%DROP%')::BIGINT     AS total_partitions_dropped,
    MIN(archived_at)                                           AS earliest_archive_date,
    MAX(archived_at)                                           AS latest_archive_date,
    (SELECT partition_name FROM public.partition_archive_log ORDER BY archived_at DESC LIMIT 1) AS most_recent_partition,
    (SELECT action          FROM public.partition_archive_log ORDER BY archived_at DESC LIMIT 1) AS most_recent_action
  FROM public.partition_archive_log;
END;
$$;

COMMENT ON FUNCTION public.rpc_partition_archive_log_stats IS
  'Returns aggregate statistics over the full partition_archive_log history.';

GRANT EXECUTE ON FUNCTION public.rpc_partition_archive_log_stats()
  TO authenticated, service_role;

COMMIT;
