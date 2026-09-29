-- =============================================================================
-- Migration 0196: Monthly Partitioning of etax_submissions
-- Purpose : Partition etax_submissions by RANGE on created_at (monthly)
--           for production performance — large orgs generate 10k–50k rows/month
-- Strategy: Rename old → backup, create partitioned table, migrate data,
--           recreate indexes/RLS/policies, auto-partition via pg_cron
-- Author  : MONOLITH Platform Team
-- Date    : 2026-09-01
-- =============================================================================

BEGIN;

-- ─── 0. Guard: skip if already partitioned ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'etax_submissions'
      AND c.relkind = 'p'            -- 'p' = partitioned table
      AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'etax_submissions is already partitioned — skipping migration 0196.';
    -- Signal skip by setting a session variable that the DO block at the end checks
    PERFORM set_config('app.migration_0196_skip', 'true', true);
  END IF;
END $$;

-- ─── 1. Rename existing table to backup ──────────────────────────────────────
DO $$
BEGIN
  IF current_setting('app.migration_0196_skip', true) IS DISTINCT FROM 'true' THEN
    ALTER TABLE IF EXISTS public.etax_submissions
      RENAME TO etax_submissions_pre_partition;
    RAISE NOTICE 'Renamed etax_submissions → etax_submissions_pre_partition';
  END IF;
END $$;

-- ─── 2. Drop old indexes on backup table (they will be recreated on partitioned) ──
DO $$
BEGIN
  IF current_setting('app.migration_0196_skip', true) IS DISTINCT FROM 'true' THEN
    -- Drop constraints that would block partition table creation
    ALTER TABLE IF EXISTS public.etax_submissions_pre_partition
      DROP CONSTRAINT IF EXISTS etax_submissions_pkey CASCADE;
    ALTER TABLE IF EXISTS public.etax_submissions_pre_partition
      DROP CONSTRAINT IF EXISTS etax_submissions_invoice_id_document_type_key CASCADE;
  END IF;
END $$;

-- ─── 3. Create partitioned parent table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etax_submissions (
  id                UUID         NOT NULL DEFAULT gen_random_uuid(),
  org_id            UUID         NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  invoice_id        UUID         NOT NULL REFERENCES public.invoices(id)      ON DELETE RESTRICT,
  document_type     TEXT         NOT NULL CHECK (document_type IN ('T01','T02','T03','T04')),
  status            TEXT         NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued','submitting','submitted','failed','cancelled')),
  attempt_count     INTEGER      NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  error_message     TEXT,
  etax_reference_no TEXT,
  pdf_status        TEXT         DEFAULT 'pending'
                                 CHECK (pdf_status IN ('pending','processing','ready','failed')),
  pdf_path          TEXT,
  pdf_downloaded_at TIMESTAMPTZ,
  metadata          JSONB        DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.etax_submissions IS
  'Partitioned by created_at (monthly). Partition key included in all unique constraints.';

-- ─── 4. Create monthly partitions ─────────────────────────────────────────────
-- Helper: generate partition SQL for a given year-month
CREATE OR REPLACE FUNCTION public.fn_create_etax_partition(
  p_year  INT,
  p_month INT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_name    TEXT;
  v_start   DATE;
  v_end     DATE;
  v_sql     TEXT;
BEGIN
  v_name  := format('etax_submissions_%s_%s', p_year, LPAD(p_month::TEXT, 2, '0'));
  v_start := make_date(p_year, p_month, 1);
  v_end   := v_start + INTERVAL '1 month';

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = v_name AND n.nspname = 'public'
  ) THEN
    RETURN format('Partition %s already exists — skipped.', v_name);
  END IF;

  v_sql := format(
    'CREATE TABLE public.%I PARTITION OF public.etax_submissions
       FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start::TIMESTAMPTZ, v_end::TIMESTAMPTZ
  );
  EXECUTE v_sql;
  RETURN format('Created partition %s (%s → %s)', v_name, v_start, v_end);
END;
$fn$;

-- Create partitions: 2024-01 through 2027-03 (covers historical + ~18 months ahead)
DO $$
DECLARE
  yr  INT;
  mo  INT;
  msg TEXT;
BEGIN
  IF current_setting('app.migration_0196_skip', true) IS DISTINCT FROM 'true' THEN
    FOR yr IN 2024..2027 LOOP
      FOR mo IN 1..12 LOOP
        -- Stop at 2027-03
        EXIT WHEN yr = 2027 AND mo > 3;
        msg := public.fn_create_etax_partition(yr, mo);
        RAISE NOTICE '%', msg;
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- Default partition: catches any rows outside the explicit ranges
CREATE TABLE IF NOT EXISTS public.etax_submissions_default
  PARTITION OF public.etax_submissions DEFAULT;

COMMENT ON TABLE public.etax_submissions_default IS
  'Catch-all partition for etax_submissions rows outside 2024-01 – 2027-03. Monitor regularly.';

-- ─── 5. Primary key (includes partition key) ─────────────────────────────────
ALTER TABLE public.etax_submissions
  ADD CONSTRAINT etax_submissions_pkey PRIMARY KEY (id, created_at);

-- ─── 6. Unique constraint per partition-aware scope ──────────────────────────
-- PostgreSQL requires unique constraints on partitioned tables to include the
-- partition key. We enforce (invoice_id, document_type) uniqueness within the
-- same calendar month — which is the meaningful business constraint anyway
-- (a single invoice cannot be submitted twice for the same document type in a month).
DO $$
DECLARE
  yr  INT;
  mo  INT;
  tbl TEXT;
BEGIN
  IF current_setting('app.migration_0196_skip', true) IS DISTINCT FROM 'true' THEN
    FOR yr IN 2024..2027 LOOP
      FOR mo IN 1..12 LOOP
        EXIT WHEN yr = 2027 AND mo > 3;
        tbl := format('etax_submissions_%s_%s', yr, LPAD(mo::TEXT, 2, '0'));
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (invoice_id, document_type)',
          tbl,
          tbl || '_invoice_doctype_key'
        );
      END LOOP;
    END LOOP;
    -- Default partition unique
    ALTER TABLE public.etax_submissions_default
      ADD CONSTRAINT etax_submissions_default_invoice_doctype_key
        UNIQUE (invoice_id, document_type);
  END IF;
END $$;

-- Cross-partition uniqueness guard (belt-and-suspenders trigger)
CREATE OR REPLACE FUNCTION public.fn_etax_submissions_cross_partition_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   public.etax_submissions
    WHERE  invoice_id    = NEW.invoice_id
      AND  document_type = NEW.document_type
      AND  id           <> NEW.id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'duplicate key value violates unique constraint: invoice_id=% document_type=% already exists',
      NEW.invoice_id, NEW.document_type;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_etax_submissions_cross_partition_unique
  BEFORE INSERT OR UPDATE ON public.etax_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_etax_submissions_cross_partition_unique();

-- ─── 7. Performance indexes ───────────────────────────────────────────────────
-- Org + status (most common query pattern in v_etax_compliance_dashboard)
CREATE INDEX IF NOT EXISTS idx_etax_submissions_org_status
  ON public.etax_submissions (org_id, status, created_at DESC);

-- Invoice lookup
CREATE INDEX IF NOT EXISTS idx_etax_submissions_invoice_id
  ON public.etax_submissions (invoice_id, document_type);

-- Retry worker queue: queued/failed rows with attempt_count < 5
CREATE INDEX IF NOT EXISTS idx_etax_submissions_retry_queue
  ON public.etax_submissions (status, attempt_count, last_attempt_at)
  WHERE status IN ('queued', 'failed') AND attempt_count < 5;

-- PDF pipeline
CREATE INDEX IF NOT EXISTS idx_etax_submissions_pdf_status
  ON public.etax_submissions (org_id, pdf_status, created_at DESC)
  WHERE pdf_status IN ('pending', 'processing', 'failed');

-- Health trend queries (daily aggregation over created_at)
CREATE INDEX IF NOT EXISTS idx_etax_submissions_org_created
  ON public.etax_submissions (org_id, created_at);

-- GIN index on metadata JSONB
CREATE INDEX IF NOT EXISTS idx_etax_submissions_metadata
  ON public.etax_submissions USING GIN (metadata);

-- ─── 8. updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_etax_submissions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_etax_submissions_updated_at
  BEFORE UPDATE ON public.etax_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_etax_submissions_set_updated_at();

-- ─── 9. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE public.etax_submissions ENABLE ROW LEVEL SECURITY;

-- Orgs can only see their own submissions
CREATE POLICY etax_submissions_org_isolation
  ON public.etax_submissions
  FOR ALL
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- Service role bypasses RLS (for edge functions + cron workers)
CREATE POLICY etax_submissions_service_role
  ON public.etax_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 10. Migrate data from backup table ──────────────────────────────────────
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  IF current_setting('app.migration_0196_skip', true) IS DISTINCT FROM 'true'
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name   = 'etax_submissions_pre_partition'
     )
  THEN
    INSERT INTO public.etax_submissions (
      id, org_id, invoice_id, document_type, status, attempt_count,
      last_attempt_at, submitted_at, error_message, etax_reference_no,
      pdf_status, pdf_path, pdf_downloaded_at, metadata, created_at, updated_at
    )
    SELECT
      id, org_id, invoice_id, document_type, status, attempt_count,
      last_attempt_at, submitted_at, error_detail, rd_ref_no,
      pdf_status, pdf_path, pdf_downloaded_at,
      '{}'::jsonb,
      created_at,
      COALESCE(updated_at, created_at)
    FROM public.etax_submissions_pre_partition;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % rows from etax_submissions_pre_partition', v_count;
  END IF;
END $$;

-- ─── 11. Auto-partition function (called monthly by pg_cron) ─────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_create_next_etax_partition()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_next_month  DATE  := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
  v_month_after DATE  := v_next_month + INTERVAL '1 month';
  v_result      TEXT  := '';
BEGIN
  -- Create next month's partition
  v_result := v_result || public.fn_create_etax_partition(
    EXTRACT(YEAR  FROM v_next_month)::INT,
    EXTRACT(MONTH FROM v_next_month)::INT
  );

  -- Also pre-create the month after (2-month lookahead)
  v_result := v_result || E'\n' || public.fn_create_etax_partition(
    EXTRACT(YEAR  FROM v_month_after)::INT,
    EXTRACT(MONTH FROM v_month_after)::INT
  );

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.fn_auto_create_next_etax_partition() IS
  'Creates the next two monthly etax_submissions partitions. Run via pg_cron on the 20th of each month.';

-- ─── 12. RPC: partition health check ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_etax_partition_health()
RETURNS TABLE (
  partition_name  TEXT,
  from_date       DATE,
  to_date         DATE,
  row_count       BIGINT,
  size_pretty     TEXT,
  is_default      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    c.relname::TEXT                                         AS partition_name,
    CASE WHEN pg_get_expr(c.relpartbound, c.oid) ~ 'DEFAULT'
         THEN NULL::DATE
         ELSE (regexp_match(
                 pg_get_expr(c.relpartbound, c.oid),
                 E'FROM \\(''([^'']+)'
               ))[1]::DATE
    END                                                     AS from_date,
    CASE WHEN pg_get_expr(c.relpartbound, c.oid) ~ 'DEFAULT'
         THEN NULL::DATE
         ELSE (regexp_match(
                 pg_get_expr(c.relpartbound, c.oid),
                 E'TO \\(''([^'']+)'
               ))[1]::DATE
    END                                                     AS to_date,
    (SELECT COUNT(*) FROM public.etax_submissions
      WHERE created_at >= CASE WHEN pg_get_expr(c.relpartbound, c.oid) ~ 'DEFAULT'
                               THEN '-infinity'::TIMESTAMPTZ
                               ELSE (regexp_match(
                                       pg_get_expr(c.relpartbound, c.oid),
                                       E'FROM \\(''([^'']+)'
                                     ))[1]::TIMESTAMPTZ
                          END
        AND created_at <  CASE WHEN pg_get_expr(c.relpartbound, c.oid) ~ 'DEFAULT'
                               THEN 'infinity'::TIMESTAMPTZ
                               ELSE (regexp_match(
                                       pg_get_expr(c.relpartbound, c.oid),
                                       E'TO \\(''([^'']+)'
                                     ))[1]::TIMESTAMPTZ
                          END
    )                                                       AS row_count,
    pg_size_pretty(pg_relation_size(c.oid))                 AS size_pretty,
    (pg_get_expr(c.relpartbound, c.oid) ~ 'DEFAULT')::BOOL  AS is_default
  FROM   pg_inherits     i
  JOIN   pg_class        c ON c.oid = i.inhrelid
  JOIN   pg_class        p ON p.oid = i.inhparent
  JOIN   pg_namespace    n ON n.oid = c.relnamespace
  WHERE  p.relname   = 'etax_submissions'
    AND  n.nspname   = 'public'
  ORDER  BY from_date NULLS LAST;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rpc_etax_partition_health() TO service_role;

-- ─── 13. Register pg_cron job for auto-partition ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'auto-create-etax-partition',
      '0 0 20 * *',   -- 00:00 on the 20th of each month
      'SELECT public.fn_auto_create_next_etax_partition();'
    );
    RAISE NOTICE 'pg_cron job auto-create-etax-partition registered (0 0 20 * *)';
  ELSE
    RAISE NOTICE 'pg_cron not available — register auto-create-etax-partition manually';
  END IF;
END $$;

-- ─── 14. Grant permissions ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etax_submissions TO authenticated;
GRANT ALL                            ON public.etax_submissions TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_etax_partition(INT, INT)           TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_create_next_etax_partition()         TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_etax_submissions_cross_partition_unique() TO service_role;

-- ─── 15. Retention view: partitions older than 24 months ─────────────────────
CREATE OR REPLACE VIEW public.v_etax_partition_retention AS
SELECT
  c.relname::TEXT                                          AS partition_name,
  (regexp_match(
     pg_get_expr(c.relpartbound, c.oid),
     E'FROM \\(''([^'']+)'
   ))[1]::DATE                                             AS partition_month,
  pg_size_pretty(pg_relation_size(c.oid))                  AS size_pretty,
  NOW() - (regexp_match(
             pg_get_expr(c.relpartbound, c.oid),
             E'FROM \\(''([^'']+)'
           ))[1]::TIMESTAMPTZ                              AS age,
  CASE
    WHEN (NOW() - (regexp_match(
                     pg_get_expr(c.relpartbound, c.oid),
                     E'FROM \\(''([^'']+)'
                   ))[1]::TIMESTAMPTZ) > INTERVAL '24 months'
    THEN 'ARCHIVE_CANDIDATE'
    ELSE 'RETAIN'
  END                                                      AS retention_status
FROM   pg_inherits  i
JOIN   pg_class     c ON c.oid = i.inhrelid
JOIN   pg_class     p ON p.oid = i.inhparent
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  p.relname  = 'etax_submissions'
  AND  n.nspname  = 'public'
  AND  pg_get_expr(c.relpartbound, c.oid) NOT LIKE '%DEFAULT%'
ORDER  BY partition_month;

GRANT SELECT ON public.v_etax_partition_retention TO service_role;

COMMENT ON VIEW public.v_etax_partition_retention IS
  'Lists all etax_submissions monthly partitions with size and 24-month retention status.';

COMMIT;
