-- Migration 0223: Add created_at to organizations
-- Fixes 0180_identity_reconciliation.sql (Dubious 0/17):
--   "column created_at of relation organizations does not exist"
-- CI-FIX-22

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
