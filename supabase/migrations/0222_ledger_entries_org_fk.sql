-- =============================================================================
-- Migration 0222: Add FK constraint on ledger_entries.org_id
--
-- Migration 0183 sets org_id NOT NULL on ledger_entries but does not add the
-- FK referencing public.organizations.  The pgTAP test 0183_baseline_org_id_not_null
-- (T-0183-13) asserts the FK exists.  This migration adds it.
--
-- Note: ADD CONSTRAINT IF NOT EXISTS is not valid PostgreSQL syntax;
-- the migration is idempotent via a DO block.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'fk_ledger_entries_org'
      AND  conrelid = 'public.ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT fk_ledger_entries_org
      FOREIGN KEY (org_id) REFERENCES public.organizations(org_id);
  END IF;
END;
$$;
