-- =============================================================================
-- pgTAP Test Suite: 0183_baseline_org_id_not_null.sql
-- =============================================================================
-- Verifies migration 0183_baseline_tables_org_id_not_null.sql
--
-- Coverage (13 tests):
--   T-0183-01..04  col_not_null — org_id is NOT NULL on all 4 tables
--   T-0183-05..08  Zero NULL org_id rows in all 4 tables
--   T-0183-09      Sentinel org row '00000000-...' exists in organizations
--   T-0183-10..13  FK constraint on org_id references organizations(org_id)
--
-- Run with: pg_prove supabase/tests/0183_baseline_org_id_not_null.sql
-- =============================================================================

BEGIN;
SELECT plan(13);

-- ─────────────────────────────────────────────────────────────────────────────
-- T-0183-01..04  col_not_null: org_id must be NOT NULL on all 4 tables
-- ─────────────────────────────────────────────────────────────────────────────
SELECT col_not_null(
  'public', 'jobs', 'org_id',
  'T-0183-01: jobs.org_id must be NOT NULL'
);

SELECT col_not_null(
  'public', 'quotations', 'org_id',
  'T-0183-02: quotations.org_id must be NOT NULL'
);

SELECT col_not_null(
  'public', 'invoices', 'org_id',
  'T-0183-03: invoices.org_id must be NOT NULL'
);

SELECT col_not_null(
  'public', 'ledger_entries', 'org_id',
  'T-0183-04: ledger_entries.org_id must be NOT NULL'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T-0183-05..08  No NULL org_id rows remain after sentinel backfill
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.jobs WHERE org_id IS NULL),
  0,
  'T-0183-05: jobs — 0 NULL org_id rows after sentinel backfill'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.quotations WHERE org_id IS NULL),
  0,
  'T-0183-06: quotations — 0 NULL org_id rows after sentinel backfill'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.invoices WHERE org_id IS NULL),
  0,
  'T-0183-07: invoices — 0 NULL org_id rows after sentinel backfill'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.ledger_entries WHERE org_id IS NULL),
  0,
  'T-0183-08: ledger_entries — 0 NULL org_id rows after sentinel backfill'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T-0183-09  Sentinel organisation row exists
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int
   FROM public.organizations
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid),
  1,
  'T-0183-09: sentinel org 00000000-0000-0000-0000-000000000000 exists'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- T-0183-10..13  FK: org_id references public.organizations(org_id)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int
   FROM information_schema.referential_constraints rc
   JOIN information_schema.key_column_usage kcu
     ON rc.constraint_name = kcu.constraint_name
    AND kcu.table_schema    = 'public'
   WHERE kcu.table_name  = 'jobs'
     AND kcu.column_name = 'org_id'),
  1,
  'T-0183-10: jobs.org_id has FK constraint to organizations'
);

SELECT is(
  (SELECT COUNT(*)::int
   FROM information_schema.referential_constraints rc
   JOIN information_schema.key_column_usage kcu
     ON rc.constraint_name = kcu.constraint_name
    AND kcu.table_schema    = 'public'
   WHERE kcu.table_name  = 'quotations'
     AND kcu.column_name = 'org_id'),
  1,
  'T-0183-11: quotations.org_id has FK constraint to organizations'
);

SELECT is(
  (SELECT COUNT(*)::int
   FROM information_schema.referential_constraints rc
   JOIN information_schema.key_column_usage kcu
     ON rc.constraint_name = kcu.constraint_name
    AND kcu.table_schema    = 'public'
   WHERE kcu.table_name  = 'invoices'
     AND kcu.column_name = 'org_id'),
  1,
  'T-0183-12: invoices.org_id has FK constraint to organizations'
);

SELECT is(
  (SELECT COUNT(*)::int
   FROM information_schema.referential_constraints rc
   JOIN information_schema.key_column_usage kcu
     ON rc.constraint_name = kcu.constraint_name
    AND kcu.table_schema    = 'public'
   WHERE kcu.table_name  = 'ledger_entries'
     AND kcu.column_name = 'org_id'),
  1,
  'T-0183-13: ledger_entries.org_id has FK constraint to organizations'
);

SELECT * FROM finish();
ROLLBACK;
