-- =============================================================================
-- Rollback: 0183_rollback.sql
-- =============================================================================
-- Reverts the NOT NULL constraint added by 0183_baseline_tables_org_id_not_null.sql.
-- IMPORTANT: Sentinel backfill data is NOT reverted (data safety).
--            This file is for CI forward-and-back idempotency testing ONLY.
--            Do NOT apply to production.
-- =============================================================================

BEGIN;

ALTER TABLE public.jobs           ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.quotations     ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.invoices       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN org_id DROP NOT NULL;

COMMIT;
