-- =============================================================================
-- Migration 0176 — notification_preferences tenant-isolation RLS
-- =============================================================================
--
-- Context
-- -------
-- The v16.8.0 security audit (issue #56) ran lint-rls-org-id.py against the
-- full migration corpus and found 97 tables missing org_id-scoped RLS policies.
-- Of those:
--   • notification_preferences — only table with a direct org_id NOT NULL FK
--     → covered by this migration.
--   • ~16 platform-level / MCP-infrastructure tables → added to ALLOWLIST in
--     scripts/lint-rls-org-id.py (intentionally not org-scoped).
--   • Remaining tables use site_code (not org_id) for scoping and require a
--     separate org_id FK migration before RLS policies can be applied.
--
-- notification_preferences already has ROW LEVEL SECURITY ENABLED (confirmed
-- by the linter); this migration adds the four isolation policies only.
--
-- Rollback: 0176_rollback.sql
-- Preceded by: 0175_child_table_rls.sql
-- =============================================================================

BEGIN;

-- ── SELECT ────────────────────────────────────────────────────────────────────
-- Users may see only preferences that belong to their own org.
CREATE POLICY "notification_preferences_tenant_isolation"
  ON public.notification_preferences
  FOR SELECT
  USING (org_id = public.get_user_org_id());

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- New preference rows must carry the caller's org_id.
CREATE POLICY "notification_preferences_tenant_insert"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id());

-- ── UPDATE ────────────────────────────────────────────────────────────────────
-- Callers may only update rows in their own org and may not change org_id.
CREATE POLICY "notification_preferences_tenant_update"
  ON public.notification_preferences
  FOR UPDATE
  USING  (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- ── DELETE ────────────────────────────────────────────────────────────────────
-- Callers may only delete preferences for their own org.
CREATE POLICY "notification_preferences_tenant_delete"
  ON public.notification_preferences
  FOR DELETE
  USING (org_id = public.get_user_org_id());

COMMIT;
