-- Migration: 0189_line_oa_domain_rls
-- Phase 2 RLS epic — batch 3: LINE OA domain (11 tables)
-- Addresses: 53 remaining violations post-0188
-- Depends on: 0187 (installation_projects.org_id must exist for line_groups backfill chain)
--
-- Tables covered (11):
--   line_bind_codes, line_groups, line_group_members,
--   line_oa_audit_log, line_oa_channels, line_oa_conversations,
--   line_oa_customer_identity, line_oa_inbound_messages,
--   line_oa_message_templates, line_oa_orders, line_oa_outbound_messages
--
-- Strategy (mirrors 0186/0187 pattern):
--   (1) ADD COLUMN org_id uuid (nullable) on all 11 tables
--   (2) Backfill in dependency order:
--
--         Level 1 — direct FK to installation_projects (org_id set by 0187):
--           line_groups     ← installation_projects.org_id via project_id NOT NULL
--           line_bind_codes ← installation_projects.org_id via project_id NOT NULL
--
--         Level 2 — FK to level-1 tables:
--           line_group_members ← line_groups.org_id via group_id NOT NULL
--
--         Sentinel — no org-keyed parent (site_code only or no parent):
--           line_oa_conversations → sentinel
--           line_oa_orders        → sentinel
--           line_oa_audit_log     → sentinel
--           line_oa_customer_identity → sentinel
--           line_oa_message_templates → sentinel (shared template library)
--           line_oa_channels      → sentinel (platform-level config)
--
--         Level 2 — FK to line_oa_conversations (after sentinel set above):
--           line_oa_inbound_messages  ← line_oa_conversations.org_id via conversation_id
--                                     → sentinel for orphaned messages
--           line_oa_outbound_messages ← line_oa_conversations.org_id via conversation_id
--                                     → sentinel for orphaned messages
--
--   (3) ALTER COLUMN org_id SET NOT NULL
--   (4) ALTER TABLE ENABLE ROW LEVEL SECURITY (idempotent)
--   (5) DROP old SELECT policies
--       From 00000000000004_line_oa_rls.sql:
--         line_oa_channels_select, line_oa_conversations_select,
--         line_oa_inbound_messages_select, line_oa_outbound_messages_select,
--         line_oa_customer_identity_select, line_oa_message_templates_select,
--         line_oa_orders_select, line_oa_audit_log_select
--       From 0095_line_groups_identity.sql:
--         line_groups_sel, line_groups_ins, line_groups_upd,
--         line_group_members_sel, line_bind_codes_sel, line_bind_codes_ins
--       Rationale: old policies use is_governance_role() OR has_site_access(site_code)
--       (does not enforce org-level isolation) and USING (true) patterns.
--       Keeping both creates OR-semantics that allow cross-tenant access — must be removed.
--   (6) CREATE org_id-scoped SELECT policies (*_tenant_isolation)
--
-- Write path: all mutations go through SECURITY DEFINER RPCs (Req 10.3/10.4).
-- INSERT/UPDATE policies (_ins/_upd) for line_groups and line_bind_codes are
-- dropped alongside the SELECT policies (they were site_code-scoped, not org_id-scoped).
-- Rollback: 0189_rollback.sql (CI idempotency only — DATA LOSS, never apply to production)

-- =============================================================================
-- (1) ADD org_id COLUMN — all 11 tables
-- =============================================================================
ALTER TABLE public.line_groups
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_group_members
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_bind_codes
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_conversations
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_inbound_messages
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_outbound_messages
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_customer_identity
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_message_templates
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_channels
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_orders
  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.line_oa_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- =============================================================================
-- (2) BACKFILL org_id — dependency order
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Level 1a: line_groups ← installation_projects.org_id via project_id FK
--   project_id NOT NULL — all rows recoverable via parent (0187 set org_id on
--   installation_projects; any remaining NULLs there already got sentinel)
-- ---------------------------------------------------------------------------
UPDATE public.line_groups lg
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  lg.project_id = ip.id
  AND  lg.org_id IS NULL;

UPDATE public.line_groups
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 1b: line_bind_codes ← installation_projects.org_id via project_id FK
--   project_id NOT NULL — all rows recoverable via parent
-- ---------------------------------------------------------------------------
UPDATE public.line_bind_codes lb
SET    org_id = ip.org_id
FROM   public.installation_projects ip
WHERE  lb.project_id = ip.id
  AND  lb.org_id IS NULL;

UPDATE public.line_bind_codes
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2: line_group_members ← line_groups.org_id via group_id FK
--   group_id NOT NULL CASCADE; line_groups already backfilled above
-- ---------------------------------------------------------------------------
UPDATE public.line_group_members lgm
SET    org_id = lg.org_id
FROM   public.line_groups lg
WHERE  lgm.group_id = lg.id
  AND  lgm.org_id IS NULL;

UPDATE public.line_group_members
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_conversations
--   site_code is nullable (null while site_unresolved); no org-keyed parent.
--   All existing rows receive sentinel UUID.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_conversations
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2: line_oa_inbound_messages ← line_oa_conversations.org_id via conversation_id
--   conversation_id NOT NULL; conversations already backfilled above (sentinel).
--   Any orphaned messages (parent conversation deleted) also get sentinel.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_inbound_messages im
SET    org_id = c.org_id
FROM   public.line_oa_conversations c
WHERE  im.conversation_id = c.id
  AND  im.org_id IS NULL;

UPDATE public.line_oa_inbound_messages
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Level 2: line_oa_outbound_messages ← line_oa_conversations.org_id via conversation_id
--   conversation_id nullable (dropped NOT NULL in 0095); rows with NULL conversation_id
--   go directly to sentinel.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_outbound_messages om
SET    org_id = c.org_id
FROM   public.line_oa_conversations c
WHERE  om.conversation_id = c.id
  AND  om.org_id IS NULL;

UPDATE public.line_oa_outbound_messages
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_customer_identity
--   customer_id FK to customers table; no org_id on customers yet (future migration).
--   All existing rows receive sentinel UUID.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_customer_identity
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_message_templates
--   Shared template library; template_key + vertical_context composite key.
--   Not tenant-specific; sentinel signals "shared / platform row".
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_message_templates
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_channels
--   Platform-level channel config; vault-referenced credentials.
--   Not tenant-specific; all access via SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_channels
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_orders
--   site_code nullable; no org-keyed parent table yet.
-- ---------------------------------------------------------------------------
UPDATE public.line_oa_orders
SET    org_id = '00000000-0000-0000-0000-000000000000'
WHERE  org_id IS NULL;

-- ---------------------------------------------------------------------------
-- Sentinel — line_oa_audit_log
--   site_code nullable; event-capture table with no org-keyed parent.
--   This table is append-only for application traffic. The schema migration
--   must temporarily suspend only its immutability trigger while it performs
--   the one-time tenant-key backfill. ALTER TABLE takes a lock for the
--   statement, and the exception handler restores the trigger before
--   propagating any failure.
-- ---------------------------------------------------------------------------
DO $line_oa_audit_org_backfill$
BEGIN
  EXECUTE 'ALTER TABLE public.line_oa_audit_log '
       || 'DISABLE TRIGGER trg_line_oa_audit_log_immutable';

  UPDATE public.line_oa_audit_log
  SET    org_id = '00000000-0000-0000-0000-000000000000'
  WHERE  org_id IS NULL;

  EXECUTE 'ALTER TABLE public.line_oa_audit_log '
       || 'ENABLE TRIGGER trg_line_oa_audit_log_immutable';
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER TABLE public.line_oa_audit_log '
         || 'ENABLE TRIGGER trg_line_oa_audit_log_immutable';
    RAISE;
END
$line_oa_audit_org_backfill$;

-- =============================================================================
-- (3) ENFORCE NOT NULL — all 11 tables
-- =============================================================================
ALTER TABLE public.line_groups                ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_group_members         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_bind_codes            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_conversations      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_inbound_messages   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_outbound_messages  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_customer_identity  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_message_templates  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_channels           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_orders             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.line_oa_audit_log          ALTER COLUMN org_id SET NOT NULL;

-- =============================================================================
-- (4) ENABLE ROW LEVEL SECURITY — idempotent; required for linter static analysis
-- =============================================================================
ALTER TABLE public.line_groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_group_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_bind_codes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_inbound_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_customer_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_oa_audit_log         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- (5) DROP old SELECT (and write) policies
--
--     From 00000000000004_line_oa_rls.sql (8 policies):
-- =============================================================================
DROP POLICY IF EXISTS line_oa_channels_select          ON public.line_oa_channels;
DROP POLICY IF EXISTS line_oa_conversations_select     ON public.line_oa_conversations;
DROP POLICY IF EXISTS line_oa_inbound_messages_select  ON public.line_oa_inbound_messages;
DROP POLICY IF EXISTS line_oa_outbound_messages_select ON public.line_oa_outbound_messages;
DROP POLICY IF EXISTS line_oa_customer_identity_select ON public.line_oa_customer_identity;
DROP POLICY IF EXISTS line_oa_message_templates_select ON public.line_oa_message_templates;
DROP POLICY IF EXISTS line_oa_orders_select            ON public.line_oa_orders;
DROP POLICY IF EXISTS line_oa_audit_log_select         ON public.line_oa_audit_log;

-- From 0095_line_groups_identity.sql (6 policies — SELECT + INSERT + UPDATE):
DROP POLICY IF EXISTS line_groups_sel         ON public.line_groups;
DROP POLICY IF EXISTS line_groups_ins         ON public.line_groups;
DROP POLICY IF EXISTS line_groups_upd         ON public.line_groups;
DROP POLICY IF EXISTS line_group_members_sel  ON public.line_group_members;
DROP POLICY IF EXISTS line_bind_codes_sel     ON public.line_bind_codes;
DROP POLICY IF EXISTS line_bind_codes_ins     ON public.line_bind_codes;

-- =============================================================================
-- (6) CREATE org_id-scoped SELECT policies
--     SELECT only — write path remains SECURITY DEFINER RPCs (Req 10.3/10.4)
-- =============================================================================
CREATE POLICY line_groups_tenant_isolation
  ON public.line_groups
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_group_members_tenant_isolation
  ON public.line_group_members
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_bind_codes_tenant_isolation
  ON public.line_bind_codes
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_conversations_tenant_isolation
  ON public.line_oa_conversations
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_inbound_messages_tenant_isolation
  ON public.line_oa_inbound_messages
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_outbound_messages_tenant_isolation
  ON public.line_oa_outbound_messages
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_customer_identity_tenant_isolation
  ON public.line_oa_customer_identity
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_message_templates_tenant_isolation
  ON public.line_oa_message_templates
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_channels_tenant_isolation
  ON public.line_oa_channels
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_orders_tenant_isolation
  ON public.line_oa_orders
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY line_oa_audit_log_tenant_isolation
  ON public.line_oa_audit_log
  FOR SELECT USING (org_id = public.get_user_org_id());
