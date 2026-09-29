-- =============================================================================
-- Rollback for Migration 0176 — notification_preferences tenant-isolation RLS
-- =============================================================================
--
-- Drops the four tenant-isolation policies added by 0176_notification_preferences_rls.sql.
-- ROW LEVEL SECURITY is NOT disabled here because it was enabled before 0176.
--
-- For CI idempotency testing only — DO NOT apply to production.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "notification_preferences_tenant_isolation" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_tenant_insert"    ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_tenant_update"    ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_tenant_delete"    ON public.notification_preferences;

COMMIT;
