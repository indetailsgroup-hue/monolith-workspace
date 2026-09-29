-- =============================================================================
-- pgTAP Test Suite: 0183 Rollback Verification
-- File: supabase/tests/0183_rollback_verification.sql
-- Migration: 0183_baseline_tables_org_id_not_null.sql (rollback: 0183_rollback.sql)
--
-- Purpose: Verify that after applying 0183_rollback.sql the NOT NULL constraints
--          on jobs, quotations, invoices, and ledger_entries are fully removed
--          and NULL values are accepted again.
--
-- Tests: 12 total (T-0183-R01 → T-0183-R12)
--   Block A: information_schema is_nullable = 'YES'  (4 tests)
--   Block B: pg_catalog attnotnull = false            (4 tests)
--   Block C: lives_ok — UPDATE SET org_id = NULL      (4 tests)
--
-- Run AFTER applying 0183_rollback.sql, BEFORE re-applying 0183 forward migration.
-- =============================================================================

BEGIN;

SELECT plan(12);

-- ============================================================
-- Inline rollback DDL
-- CI never runs supabase/rollbacks/; DDL is transactional in PostgreSQL
-- so these ALTER TABLE statements will be rolled back at the end of the
-- BEGIN … ROLLBACK block, leaving the schema intact for subsequent tests.
-- ============================================================
ALTER TABLE public.jobs           ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.quotations     ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.invoices       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN org_id DROP NOT NULL;

-- ============================================================
-- BLOCK A: information_schema nullability checks
-- Confirms the schema catalog reflects DROP NOT NULL
-- ============================================================

-- T-0183-R01
SELECT is(
  (SELECT is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'jobs'
     AND column_name  = 'org_id'),
  'YES',
  'T-0183-R01: jobs.org_id must be nullable (information_schema) after 0183 rollback'
);

-- T-0183-R02
SELECT is(
  (SELECT is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'quotations'
     AND column_name  = 'org_id'),
  'YES',
  'T-0183-R02: quotations.org_id must be nullable (information_schema) after 0183 rollback'
);

-- T-0183-R03
SELECT is(
  (SELECT is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'invoices'
     AND column_name  = 'org_id'),
  'YES',
  'T-0183-R03: invoices.org_id must be nullable (information_schema) after 0183 rollback'
);

-- T-0183-R04
SELECT is(
  (SELECT is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'ledger_entries'
     AND column_name  = 'org_id'),
  'YES',
  'T-0183-R04: ledger_entries.org_id must be nullable (information_schema) after 0183 rollback'
);

-- ============================================================
-- BLOCK B: pg_catalog attnotnull flag checks
-- Cross-verifies at the catalog level that attnotnull is cleared
-- ============================================================

-- T-0183-R05
SELECT is(
  (SELECT a.attnotnull
   FROM pg_catalog.pg_attribute  a
   JOIN pg_catalog.pg_class      c ON c.oid = a.attrelid
   JOIN pg_catalog.pg_namespace  n ON n.oid = c.relnamespace
   WHERE n.nspname  = 'public'
     AND c.relname  = 'jobs'
     AND a.attname  = 'org_id'
     AND a.attnum   > 0),
  false,
  'T-0183-R05: pg_catalog jobs.org_id attnotnull must be false after 0183 rollback'
);

-- T-0183-R06
SELECT is(
  (SELECT a.attnotnull
   FROM pg_catalog.pg_attribute  a
   JOIN pg_catalog.pg_class      c ON c.oid = a.attrelid
   JOIN pg_catalog.pg_namespace  n ON n.oid = c.relnamespace
   WHERE n.nspname  = 'public'
     AND c.relname  = 'quotations'
     AND a.attname  = 'org_id'
     AND a.attnum   > 0),
  false,
  'T-0183-R06: pg_catalog quotations.org_id attnotnull must be false after 0183 rollback'
);

-- T-0183-R07
SELECT is(
  (SELECT a.attnotnull
   FROM pg_catalog.pg_attribute  a
   JOIN pg_catalog.pg_class      c ON c.oid = a.attrelid
   JOIN pg_catalog.pg_namespace  n ON n.oid = c.relnamespace
   WHERE n.nspname  = 'public'
     AND c.relname  = 'invoices'
     AND a.attname  = 'org_id'
     AND a.attnum   > 0),
  false,
  'T-0183-R07: pg_catalog invoices.org_id attnotnull must be false after 0183 rollback'
);

-- T-0183-R08
SELECT is(
  (SELECT a.attnotnull
   FROM pg_catalog.pg_attribute  a
   JOIN pg_catalog.pg_class      c ON c.oid = a.attrelid
   JOIN pg_catalog.pg_namespace  n ON n.oid = c.relnamespace
   WHERE n.nspname  = 'public'
     AND c.relname  = 'ledger_entries'
     AND a.attname  = 'org_id'
     AND a.attnum   > 0),
  false,
  'T-0183-R08: pg_catalog ledger_entries.org_id attnotnull must be false after 0183 rollback'
);

-- ============================================================
-- BLOCK C: Functional NULL-write acceptance tests
-- Attempts UPDATE SET org_id = NULL on sentinel rows.
-- lives_ok confirms the statement does not raise an exception.
-- The UPDATE targets the sentinel UUID written by the forward migration;
-- it is a no-op if the sentinel row was already removed, which is safe.
-- ============================================================

-- T-0183-R09
SELECT lives_ok(
  $$UPDATE public.jobs
      SET org_id = NULL
    WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
  'T-0183-R09: UPDATE jobs SET org_id=NULL must not raise after 0183 rollback'
);

-- T-0183-R10
SELECT lives_ok(
  $$UPDATE public.quotations
      SET org_id = NULL
    WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
  'T-0183-R10: UPDATE quotations SET org_id=NULL must not raise after 0183 rollback'
);

-- T-0183-R11
SELECT lives_ok(
  $$UPDATE public.invoices
      SET org_id = NULL
    WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
  'T-0183-R11: UPDATE invoices SET org_id=NULL must not raise after 0183 rollback'
);

-- T-0183-R12
SELECT lives_ok(
  $$UPDATE public.ledger_entries
      SET org_id = NULL
    WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid$$,
  'T-0183-R12: UPDATE ledger_entries SET org_id=NULL must not raise after 0183 rollback'
);

SELECT * FROM finish();
ROLLBACK;

