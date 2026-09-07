-- =============================================================================
-- Rebind the canonical PDF-status index name to the partitioned parent.
--
-- Migration 0196 renamed the original table but its indexes retained their
-- names. CREATE INDEX IF NOT EXISTS therefore skipped this parent index because
-- the same schema-level name was still attached to the backup relation.
-- =============================================================================

BEGIN;

DO $migration$
DECLARE
  indexed_table TEXT;
BEGIN
  SELECT indexes.tablename
    INTO indexed_table
    FROM pg_indexes AS indexes
   WHERE indexes.schemaname = 'public'
     AND indexes.indexname = 'idx_etax_submissions_pdf_status';

  IF indexed_table IS NOT NULL
     AND indexed_table <> 'etax_submissions' THEN
    ALTER INDEX public.idx_etax_submissions_pdf_status
      RENAME TO idx_etax_submissions_pre_partition_pdf_status_legacy;
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_etax_submissions_pdf_status
  ON public.etax_submissions (org_id, pdf_status, created_at DESC)
  WHERE pdf_status IN ('pending', 'processing', 'failed');

COMMIT;
