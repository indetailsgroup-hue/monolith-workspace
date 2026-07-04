-- Migration: line_oa_rls (enable RLS + SELECT policies)
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 3.1 Enable RLS and add SELECT policies
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql   (enums + the eight line_oa_* tables)
--   00000000000002_line_oa_constraints.sql
--   (shipped C12) public.is_governance_role(), public.has_site_access(text)
--
-- Scope: RLS enablement + SELECT policies ONLY. The audit-log immutability
-- trigger and REVOKE (task 3.2) and all SECURITY DEFINER RPCs (tasks 6-17) are
-- added by later migrations.
--
-- Access model (Req 12):
--   * RLS is enabled on all eight line_oa_* tables.
--   * Each table gets a SELECT policy gated `TO authenticated` that reuses the
--     shipped C12 helpers public.is_governance_role() and public.has_site_access().
--       - A Governance_Role reads across all Site_Codes (Req 12.2).
--       - A Branch_Role reads only rows whose resolved site_code satisfies
--         public.has_site_access() (Req 12.1, 12.3).
--   * NO client INSERT/UPDATE/DELETE policies are defined. With RLS enabled and
--     no write policy present, all client writes are denied by default; every
--     mutation flows through the SECURITY DEFINER RPCs added in later tasks
--     (Req 12.4, 12.5).
--   * site_code is nullable on conversations/orders/audit_log, and the C12 helper
--     public.has_site_access(NULL) returns false, so Branch_Roles are naturally
--     blocked from `site_unresolved` conversations and their descendants (Req 12.7).
--
-- Per-table site-scope resolution (task 3.1):
--   * Direct site_code column      -> conversations, orders, audit_log
--   * Via the owning conversation  -> inbound_messages, outbound_messages
--   * Via conversations sharing    -> customer_identity
--       (line_user_id, vertical_context)
--   * No site dimension            -> channels (governance-only; holds Vault
--                                     references), message_templates (vertical-
--                                     scoped config, readable by all authenticated)
--
-- NOTE: This migration references the shipped C12 helpers by name. It applies
-- cleanly against a database where the C12 security-federation schema is already
-- deployed (the platform prerequisite). The helpers are intentionally NOT
-- redefined here (Req 12.4 -- "without redefining the auth model").
--
-- Requirements: 12.1, 12.2, 12.3, 12.4, 12.7

-- ---------------------------------------------------------------------------
-- line_oa_channels
-- No site dimension; rows carry Vault references for the channel secret and
-- access token. Restrict reads to Governance_Roles -- Branch_Roles never need
-- channel configuration and must not see secret references.
-- ---------------------------------------------------------------------------
alter table public.line_oa_channels enable row level security;

create policy line_oa_channels_select
  on public.line_oa_channels
  for select
  to authenticated
  using (public.is_governance_role());

-- ---------------------------------------------------------------------------
-- line_oa_conversations
-- Direct site_code (nullable while site_unresolved). Governance reads all;
-- Branch reads only accessible sites. has_site_access(NULL)=false blocks
-- Branch_Roles from site_unresolved conversations (Req 12.7).
-- ---------------------------------------------------------------------------
alter table public.line_oa_conversations enable row level security;

create policy line_oa_conversations_select
  on public.line_oa_conversations
  for select
  to authenticated
  using (
    public.is_governance_role()
    or public.has_site_access(site_code)
  );

-- ---------------------------------------------------------------------------
-- line_oa_inbound_messages
-- No direct site_code; scope resolves through the owning conversation. If the
-- conversation is site_unresolved (NULL site_code) the scalar subquery yields
-- NULL and has_site_access(NULL)=false hides the row from Branch_Roles.
-- ---------------------------------------------------------------------------
alter table public.line_oa_inbound_messages enable row level security;

create policy line_oa_inbound_messages_select
  on public.line_oa_inbound_messages
  for select
  to authenticated
  using (
    public.is_governance_role()
    or public.has_site_access(
      (select c.site_code
         from public.line_oa_conversations c
        where c.id = line_oa_inbound_messages.conversation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- line_oa_outbound_messages
-- No direct site_code; scope resolves through the owning conversation, same as
-- inbound messages.
-- ---------------------------------------------------------------------------
alter table public.line_oa_outbound_messages enable row level security;

create policy line_oa_outbound_messages_select
  on public.line_oa_outbound_messages
  for select
  to authenticated
  using (
    public.is_governance_role()
    or public.has_site_access(
      (select c.site_code
         from public.line_oa_conversations c
        where c.id = line_oa_outbound_messages.conversation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- line_oa_customer_identity
-- No site_code and no conversation FK; an identity is keyed by
-- (line_user_id, vertical_context). Scope resolves through any conversation
-- sharing that key whose site_code the principal can access. A Branch_Role
-- therefore sees an identity only when it has access to at least one of that
-- customer's conversation sites; identities whose conversations are all
-- site_unresolved (NULL site_code) stay hidden (Req 12.1, 12.7).
-- ---------------------------------------------------------------------------
alter table public.line_oa_customer_identity enable row level security;

create policy line_oa_customer_identity_select
  on public.line_oa_customer_identity
  for select
  to authenticated
  using (
    public.is_governance_role()
    or exists (
      select 1
        from public.line_oa_conversations c
       where c.line_user_id = line_oa_customer_identity.line_user_id
         and c.vertical_context = line_oa_customer_identity.vertical_context
         and public.has_site_access(c.site_code)
    )
  );

-- ---------------------------------------------------------------------------
-- line_oa_message_templates
-- Vertical-scoped configuration with no site dimension and no secrets; not part
-- of the Req 12.1 branch-scoped data set. Operators across all branches need to
-- read available templates, so every authenticated principal may read them.
-- (Writes remain RPC-only -- no write policy is defined.)
-- ---------------------------------------------------------------------------
alter table public.line_oa_message_templates enable row level security;

create policy line_oa_message_templates_select
  on public.line_oa_message_templates
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- line_oa_orders (Line_Order)
-- Direct site_code (nullable until resolved). Governance reads all; Branch reads
-- only accessible sites; unresolved-site orders stay hidden from Branch_Roles.
-- ---------------------------------------------------------------------------
alter table public.line_oa_orders enable row level security;

create policy line_oa_orders_select
  on public.line_oa_orders
  for select
  to authenticated
  using (
    public.is_governance_role()
    or public.has_site_access(site_code)
  );

-- ---------------------------------------------------------------------------
-- line_oa_audit_log
-- Direct site_code (nullable where not yet known). Governance reads all audit
-- rows; a Branch_Role reads only audit rows for sites it can access. Rows with a
-- NULL site_code are visible only to Governance_Roles (Req 12.7, 13.4).
-- ---------------------------------------------------------------------------
alter table public.line_oa_audit_log enable row level security;

create policy line_oa_audit_log_select
  on public.line_oa_audit_log
  for select
  to authenticated
  using (
    public.is_governance_role()
    or public.has_site_access(site_code)
  );
