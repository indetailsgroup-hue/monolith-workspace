-- =============================================================================
-- Migration: 0183_baseline_tables_org_id_not_null.sql
-- =============================================================================
-- Purpose : Enforce NOT NULL on org_id for 4 baseline-schema tables that
--           received their org_id FK column via 20260828_multi_tenant_schema.sql
--           without a NOT NULL constraint.  This closes the remaining nullable
--           gap left unaddressed by 0179 (F1 singular tables) and 0182 (audit_logs).
--
-- Scope   : jobs · quotations · invoices · ledger_entries (guarded)
--
-- Pattern : Matches 0179_f1_full_fix_org_id_not_null.sql exactly:
--             1. Insert sentinel org row (idempotent)
--             2. Backfill NULL org_ids → sentinel UUID
--             3. DO-block assertion — abort if any NULLs remain
--             4. ALTER COLUMN … SET NOT NULL
--
-- Note    : ledger_entries is added conditionally by 20260828_multi_tenant_schema.sql
--           (only if the table already exists), so all ledger_entries DDL is
--           wrapped in an IF EXISTS guard to remain idempotent in fresh CI DBs.
--
-- Sentinel UUID : '00000000-0000-0000-0000-000000000000'
-- Safe to run   : Idempotent; backfill only touches WHERE org_id IS NULL.
-- Rollback      : 0183_rollback.sql (DROP NOT NULL; data NOT reverted)
-- Related       : F1 full fix: 0179 | audit_logs fix: 0182
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Ensure sentinel organisation row exists
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000000', '__sentinel__', '__sentinel__')
ON CONFLICT (org_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Back-fill NULL org_ids with sentinel UUID
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.jobs
  SET org_id = '00000000-0000-0000-0000-000000000000'
  WHERE org_id IS NULL;

UPDATE public.quotations
  SET org_id = '00000000-0000-0000-0000-000000000000'
  WHERE org_id IS NULL;

UPDATE public.invoices
  SET org_id = '00000000-0000-0000-0000-000000000000'
  WHERE org_id IS NULL;

-- ledger_entries: guarded — table may not exist in fresh CI environments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ledger_entries'
  ) THEN
    UPDATE public.ledger_entries
      SET org_id = '00000000-0000-0000-0000-000000000000'
      WHERE org_id IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Pre-flight assertion: abort if any NULLs remain
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  nulls INT;
BEGIN
  SELECT COUNT(*) INTO nulls FROM public.jobs           WHERE org_id IS NULL;
  IF nulls > 0 THEN
    RAISE EXCEPTION '0183: jobs still contains % NULL org_id row(s) after backfill', nulls;
  END IF;

  SELECT COUNT(*) INTO nulls FROM public.quotations     WHERE org_id IS NULL;
  IF nulls > 0 THEN
    RAISE EXCEPTION '0183: quotations still contains % NULL org_id row(s) after backfill', nulls;
  END IF;

  SELECT COUNT(*) INTO nulls FROM public.invoices       WHERE org_id IS NULL;
  IF nulls > 0 THEN
    RAISE EXCEPTION '0183: invoices still contains % NULL org_id row(s) after backfill', nulls;
  END IF;

  -- ledger_entries guarded
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ledger_entries'
  ) THEN
    SELECT COUNT(*) INTO nulls FROM public.ledger_entries WHERE org_id IS NULL;
    IF nulls > 0 THEN
      RAISE EXCEPTION '0183: ledger_entries still contains % NULL org_id row(s) after backfill', nulls;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Enforce NOT NULL constraint on all four tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.quotations     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoices       ALTER COLUMN org_id SET NOT NULL;

-- ledger_entries guarded
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ledger_entries'
  ) THEN
    EXECUTE 'ALTER TABLE public.ledger_entries ALTER COLUMN org_id SET NOT NULL';
  END IF;
END $$;

COMMIT;
