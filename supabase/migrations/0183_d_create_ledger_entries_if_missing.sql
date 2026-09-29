-- Migration: 0183_d_create_ledger_entries_if_missing.sql
-- Purpose : Ensure public.ledger_entries table exists before pgTAP tests
--           and before 20260828_multi_tenant_schema.sql conditionally alters it.
-- Note    : Uses IF NOT EXISTS so it is safe to run on any environment
--           regardless of whether the table was created by an earlier migration.

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL,
  amount      NUMERIC(15, 4) NOT NULL DEFAULT 0,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (required by 0183_baseline_org_id_not_null.sql tests)
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Add org_id NOT NULL constraint if somehow missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ledger_entries'
      AND column_name  = 'org_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.ledger_entries ALTER COLUMN org_id SET NOT NULL;
  END IF;
END;
$$;
