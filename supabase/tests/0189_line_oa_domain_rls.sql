-- =============================================================================
-- 0189_line_oa_domain_rls.sql — pgTAP tests for migration 0189
--
-- Suite: 49 tests (T-0189-01 through T-0189-49)
-- Migration: 0189_line_oa_domain_rls.sql
-- Purpose: Verify that migration 0189 correctly adds org_id columns, NOT NULL
--          constraints, RLS enablement, and tenant-isolation SELECT policies
--          to the 11 LINE OA domain tables.
--
-- Test groups:
--   T-0189-01            Superuser sanity check
--   T-0189-02–T-0189-12  has_column: org_id present on all 11 tables
--   T-0189-13–T-0189-23  col_not_null: org_id is NOT NULL on all 11 tables
--   T-0189-24–T-0189-34  relrowsecurity: RLS enabled on all 11 tables
--   T-0189-35–T-0189-45  policy_exists: 11 *_tenant_isolation policies
--   T-0189-46–T-0189-48  Cross-tenant SELECT isolation
--                         (line_oa_conversations, line_groups, line_bind_codes)
--   T-0189-49            Own-org SELECT (line_groups)
--
-- Design notes:
--   * Fixture rows planted with session_replication_role = replica +
--     row_security = off to bypass FK constraints (organizations,
--     installation_projects, etc.).
--   * JWT carries org_id claim: get_user_org_id() reads auth.jwt()->>'org_id'.
--   * line_groups/line_bind_codes are backfilled from installation_projects.org_id
--     (set by 0187). Fixtures insert directly with explicit org_id (FKs bypassed).
--   * line_bind_codes PK is code text; uses 'ALPHA-TEST-0189' / 'BETA-TEST-0189'.
--   * line_oa_conversations, line_oa_orders, line_oa_audit_log, line_oa_channels,
--     line_oa_customer_identity, line_oa_message_templates all carry sentinel org_id.
--   * No INSERT / UPDATE / DELETE tests: write path via SECURITY DEFINER RPCs
--     (Req 10.3/10.4); no client write policies exist post-0189.
--   * Runs inside BEGIN … ROLLBACK — no persistent state.
--
-- Sentinel UUIDs:
--   Alpha org                   : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org                   : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha installation_project  : a1a1a1a1-0187-0000-0000-000000000001
--   Beta  installation_project  : b2b2b2b2-0187-0000-0000-000000000001
--   Alpha line_oa_conversation  : a1a1a1a1-0189-0000-0000-000000000001
--   Beta  line_oa_conversation  : b2b2b2b2-0189-0000-0000-000000000001
--   Alpha line_group            : a1a1a1a1-0189-0001-0000-000000000001
--   Beta  line_group            : b2b2b2b2-0189-0001-0000-000000000001
--   Alpha line_bind_code        : 'ALPHA-TEST-0189' (text PK)
--   Beta  line_bind_code        : 'BETA-TEST-0189'  (text PK)
-- =============================================================================

BEGIN;

SELECT plan(49);

-- ---------------------------------------------------------------------------
-- T-0189-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0189-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0189-02–T-0189-12  has_column: org_id exists on all 11 tables
-- (alphabetical order matches migration comment)
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'line_bind_codes', 'org_id',
  'T-0189-02: line_bind_codes.org_id column exists'
);

SELECT has_column(
  'public', 'line_group_members', 'org_id',
  'T-0189-03: line_group_members.org_id column exists'
);

SELECT has_column(
  'public', 'line_groups', 'org_id',
  'T-0189-04: line_groups.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_audit_log', 'org_id',
  'T-0189-05: line_oa_audit_log.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_channels', 'org_id',
  'T-0189-06: line_oa_channels.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_conversations', 'org_id',
  'T-0189-07: line_oa_conversations.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_customer_identity', 'org_id',
  'T-0189-08: line_oa_customer_identity.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_inbound_messages', 'org_id',
  'T-0189-09: line_oa_inbound_messages.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_message_templates', 'org_id',
  'T-0189-10: line_oa_message_templates.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_orders', 'org_id',
  'T-0189-11: line_oa_orders.org_id column exists'
);

SELECT has_column(
  'public', 'line_oa_outbound_messages', 'org_id',
  'T-0189-12: line_oa_outbound_messages.org_id column exists'
);

-- ---------------------------------------------------------------------------
-- T-0189-13–T-0189-23  col_not_null: org_id is NOT NULL on all 11 tables
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'line_bind_codes', 'org_id',
  'T-0189-13: line_bind_codes.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_group_members', 'org_id',
  'T-0189-14: line_group_members.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_groups', 'org_id',
  'T-0189-15: line_groups.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_audit_log', 'org_id',
  'T-0189-16: line_oa_audit_log.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_channels', 'org_id',
  'T-0189-17: line_oa_channels.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_conversations', 'org_id',
  'T-0189-18: line_oa_conversations.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_customer_identity', 'org_id',
  'T-0189-19: line_oa_customer_identity.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_inbound_messages', 'org_id',
  'T-0189-20: line_oa_inbound_messages.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_message_templates', 'org_id',
  'T-0189-21: line_oa_message_templates.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_orders', 'org_id',
  'T-0189-22: line_oa_orders.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'line_oa_outbound_messages', 'org_id',
  'T-0189-23: line_oa_outbound_messages.org_id is NOT NULL'
);

-- ---------------------------------------------------------------------------
-- T-0189-24–T-0189-34  relrowsecurity: RLS is enabled on all 11 tables
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_bind_codes'),
  'T-0189-24: RLS must be enabled on public.line_bind_codes'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_group_members'),
  'T-0189-25: RLS must be enabled on public.line_group_members'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_groups'),
  'T-0189-26: RLS must be enabled on public.line_groups'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_audit_log'),
  'T-0189-27: RLS must be enabled on public.line_oa_audit_log'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_channels'),
  'T-0189-28: RLS must be enabled on public.line_oa_channels'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_conversations'),
  'T-0189-29: RLS must be enabled on public.line_oa_conversations'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_customer_identity'),
  'T-0189-30: RLS must be enabled on public.line_oa_customer_identity'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_inbound_messages'),
  'T-0189-31: RLS must be enabled on public.line_oa_inbound_messages'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_message_templates'),
  'T-0189-32: RLS must be enabled on public.line_oa_message_templates'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_orders'),
  'T-0189-33: RLS must be enabled on public.line_oa_orders'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'line_oa_outbound_messages'),
  'T-0189-34: RLS must be enabled on public.line_oa_outbound_messages'
);

-- ---------------------------------------------------------------------------
-- T-0189-35–T-0189-45  Policy existence: 11 *_tenant_isolation policies
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_bind_codes'
       AND policyname = 'line_bind_codes_tenant_isolation'
  ),
  'T-0189-35: line_bind_codes_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_group_members'
       AND policyname = 'line_group_members_tenant_isolation'
  ),
  'T-0189-36: line_group_members_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_groups'
       AND policyname = 'line_groups_tenant_isolation'
  ),
  'T-0189-37: line_groups_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_audit_log'
       AND policyname = 'line_oa_audit_log_tenant_isolation'
  ),
  'T-0189-38: line_oa_audit_log_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_channels'
       AND policyname = 'line_oa_channels_tenant_isolation'
  ),
  'T-0189-39: line_oa_channels_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_conversations'
       AND policyname = 'line_oa_conversations_tenant_isolation'
  ),
  'T-0189-40: line_oa_conversations_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_customer_identity'
       AND policyname = 'line_oa_customer_identity_tenant_isolation'
  ),
  'T-0189-41: line_oa_customer_identity_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_inbound_messages'
       AND policyname = 'line_oa_inbound_messages_tenant_isolation'
  ),
  'T-0189-42: line_oa_inbound_messages_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_message_templates'
       AND policyname = 'line_oa_message_templates_tenant_isolation'
  ),
  'T-0189-43: line_oa_message_templates_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_orders'
       AND policyname = 'line_oa_orders_tenant_isolation'
  ),
  'T-0189-44: line_oa_orders_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'line_oa_outbound_messages'
       AND policyname = 'line_oa_outbound_messages_tenant_isolation'
  ),
  'T-0189-45: line_oa_outbound_messages_tenant_isolation policy must exist'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants
-- session_replication_role = replica bypasses FKs
-- (organizations, installation_projects, line_groups, etc.)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- ── Organizations ─────────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Alpha Co', 'alpha-co'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Beta  Co', 'beta-co')
ON CONFLICT (org_id) DO NOTHING;

-- ── Auth users + active tenant memberships used by get_user_org_id() ─────────
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0189@example.test'),
  ('b2b2b2b2-0000-0000-0001-000000000002', 'beta-0189@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, email, role, is_active) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0189@example.test', 'VIEWER', true),
  ('b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta-0189@example.test', 'VIEWER', true)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── installation_projects (needed as FK parent for line_groups + line_bind_codes)
INSERT INTO public.installation_projects (id, name, status, created_by, org_id) VALUES
  ('a1a1a1a1-0187-0000-0000-000000000001', 'Alpha Project', 'active', 'system',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0187-0000-0000-000000000001', 'Beta  Project', 'active', 'system',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── line_oa_conversations (used for T-0189-46) ────────────────────────────────
INSERT INTO public.line_oa_conversations (id, line_user_id, vertical_context, org_id) VALUES
  ('a1a1a1a1-0189-0000-0000-000000000001', 'Uline_alpha', 'daph', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0189-0000-0000-000000000001', 'Uline_beta',  'daph', 'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── line_groups (used for T-0189-47, T-0189-49) ───────────────────────────────
INSERT INTO public.line_groups
  (id, line_group_id, project_id, group_type, bound_by, org_id) VALUES
  ('a1a1a1a1-0189-0001-0000-000000000001',
   'C_ALPHA_0189', 'a1a1a1a1-0187-0000-0000-000000000001',
   'internal', 'system',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0189-0001-0000-000000000001',
   'C_BETA_0189',  'b2b2b2b2-0187-0000-0000-000000000001',
   'internal', 'system',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── line_bind_codes (used for T-0189-48) ──────────────────────────────────────
INSERT INTO public.line_bind_codes
  (code, project_id, expires_at, org_id) VALUES
  ('ALPHA-TEST-0189', 'a1a1a1a1-0187-0000-0000-000000000001',
   now() + interval '48 hours',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('BETA-TEST-0189',  'b2b2b2b2-0187-0000-0000-000000000001',
   now() + interval '48 hours',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Switch to Beta user context (authenticated, Beta org_id claim)
-- ---------------------------------------------------------------------------
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0001-000000000002","org_id":"b2b2b2b2-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- ===========================================================================
-- T-0189-46  Cross-tenant SELECT — Beta sees 0 Alpha line_oa_conversations rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.line_oa_conversations
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0189-46: Beta sees 0 Alpha rows in line_oa_conversations'
);

-- ===========================================================================
-- T-0189-47  Cross-tenant SELECT — Beta sees 0 Alpha line_groups rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.line_groups
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0189-47: Beta sees 0 Alpha rows in line_groups'
);

-- ===========================================================================
-- T-0189-48  Cross-tenant SELECT — Beta sees 0 Alpha line_bind_codes rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.line_bind_codes
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0189-48: Beta sees 0 Alpha rows in line_bind_codes'
);

-- ===========================================================================
-- T-0189-49  Own-org SELECT — Beta sees its own line_groups row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.line_groups
    WHERE id     = 'b2b2b2b2-0189-0001-0000-000000000001'
      AND org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0189-49: Beta sees its own line_groups row'
);

SELECT * FROM finish();
ROLLBACK;
