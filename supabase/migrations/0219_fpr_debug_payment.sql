-- =============================================================================
-- Migration 0219 — FPR Cleanup / No-op placeholder
-- Replaces the temporary debug migration used during root-cause investigation
-- of the column "status" does not exist error in rpc_bulk_record_fpr_payment.
--
-- Root cause identified and fixed in 20261001_people_culture_schema.sql:
--   get_user_org_id() and has_role_in_org() incorrectly referenced
--   org_members.status (does not exist) instead of org_members.is_active.
--
-- No schema changes in this migration.
-- =============================================================================

DO $$ BEGIN NULL; END $$;
