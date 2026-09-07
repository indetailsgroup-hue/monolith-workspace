-- pgTAP coverage for the PDF-status parent-index rebind.

BEGIN;

SELECT plan(1);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes AS indexes
    WHERE indexes.schemaname = 'public'
      AND indexes.tablename = 'etax_submissions'
      AND indexes.indexname = 'idx_etax_submissions_pdf_status'
  ),
  '20270315-01: canonical PDF-status index belongs to partitioned parent'
);

SELECT * FROM finish();
ROLLBACK;
