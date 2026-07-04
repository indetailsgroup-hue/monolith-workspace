-- Migration: line_oa_resolve_conversation_site
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 10.1 Implement rpc_resolve_conversation_site (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (public.line_oa_conversations,
--                                              public.line_oa_audit_log,
--                                              public.line_oa_conversation_status, pgcrypto)
--   00000000000003_line_oa_rls.sql            (SELECT-only RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql (append-only audit log)
--   (shipped A1) public.get_active_site_codes()  -- canonical active Site_Code source
--   (shipped C12) public.is_governance_role(), public.has_site_access(text),
--                 public.resolve_actor()
--
-- Scope: the conversation SITE-RESOLUTION RPC ONLY.
--   * public.rpc_resolve_conversation_site(uuid, text, text)
--
-- This migration does NOT implement the property test (task 10.2), the ingest RPC
-- (task 8.1), or any other RPC.
--
-- ===========================================================================
-- SITE RESOLUTION UNDER THE CENTRALIZED-PER-VERTICAL TOPOLOGY (Req 3.4-3.6, 12.7)
-- ===========================================================================
-- The LINE webhook payload carries no Site_Code, so a Conversation starts
-- `site_unresolved` and is later bound to a branch either by a postback that
-- conforms to the Postback_Data_Contract (source = 'postback') or by an operator
-- assignment (source = 'manual'). Both sources funnel through this single RPC.
--
-- Behavior:
--   * Re-checks the caller's role INSIDE the function (Req 12.5, 12.6, 12.7). A
--     `site_unresolved` Conversation has a NULL site_code, so RLS naturally hides
--     it from Branch_Roles (has_site_access(NULL) = false). Resolution is therefore
--     permitted to a Governance_Role (any active site) OR to a principal that holds
--     access to the TARGET site_code via public.has_site_access(p_site_code). A
--     caller with neither is rejected permission-denied with NO state change (Req 12.6).
--   * Resolves the audit actor via public.resolve_actor() rather than trusting any
--     client-supplied identifier (Req 12.5).
--   * Validates p_site_code against public.get_active_site_codes() -- the ONLY source
--     of valid Site_Codes (A1). An unknown or inactive code is rejected with an
--     "unknown or inactive" error and the Conversation state is left UNCHANGED (Req 3.6).
--   * On success sets status = 'open', stores the site_code, and refreshes
--     last_activity_at (Req 3.4, 3.5). A closed Conversation is never reopened here
--     (Req 3.8): resolution applies only to a non-closed Conversation.
--   * Writes EXACTLY ONE audit entry recording the resolution, the source, and the
--     site_code (Req 13.1).
--
-- Secret hygiene (secret-scrub convention): this flow touches NO Channel_Secret or
-- Channel_Access_Token, so there is nothing to decrypt and nothing to scrub. Every
-- error message and the audit entity_ref are built from non-secret identifiers only
-- (conversation_id, site_code, source) (Req 13.3).
--
-- Requirements: 3.4, 3.5, 3.6, 12.5, 12.6, 12.7

-- This function references the shipped A1/C12 helpers public.get_active_site_codes(),
-- public.has_site_access(), public.is_governance_role(), and public.resolve_actor(),
-- which may not exist at migration-build time in a bare environment (they are a
-- platform prerequisite). Disable body validation so the migration applies cleanly;
-- the body is validated at first call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Resolution-source enum: which contract carried the Site_Code. Created
-- idempotently so the migration can re-apply cleanly (Req 3.4 postback / 3.5 manual).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'line_oa_resolution_source'
      and n.nspname = 'public'
  ) then
    create type public.line_oa_resolution_source as enum ('postback', 'manual');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- public.rpc_resolve_conversation_site(
--     p_conversation_id uuid,
--     p_site_code       text,
--     p_source          text default 'manual',   -- 'postback' | 'manual'
--     OUT conversation_id uuid,
--     OUT site_code        text,
--     OUT status           text,
--     OUT source           text,
--     OUT resolved         boolean
-- )
--
-- Resolve the Site_Code state of a Conversation to p_site_code, transitioning it to
-- `open`. Supports both the postback contract and manual operator assignment.
--
-- OUT parameters (for callers / tests):
--   * conversation_id -- the resolved Conversation id
--   * site_code       -- the now-stored active Site_Code
--   * status          -- the Conversation status after resolution ('open')
--   * source          -- the normalized resolution source actually applied
--   * resolved        -- always true on the success path (a rejection raises instead)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_conversation_site(
  p_conversation_id uuid,
  p_site_code text,
  p_source text default 'manual',
  out conversation_id uuid,
  out site_code text,
  out status text,
  out source text,
  out resolved boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source           public.line_oa_resolution_source;
  v_actor            text;
  v_vertical_context text;
  v_current_status   public.line_oa_conversation_status;
  v_is_active_code   boolean;
begin
  -- -------------------------------------------------------------------------
  -- Input validation. Resolution is meaningless without a conversation and a
  -- candidate site_code. Messages use non-secret identifiers only.
  -- -------------------------------------------------------------------------
  if p_conversation_id is null then
    raise exception 'line_oa: conversation_id is required for site resolution'
      using errcode = '22004';   -- null_value_not_allowed
  end if;
  if p_site_code is null or length(btrim(p_site_code)) = 0 then
    raise exception 'line_oa: site_code is required for site resolution'
      using errcode = '22004';
  end if;

  -- Normalize/validate the resolution source. Only the postback and manual
  -- contracts are supported (Req 3.4, 3.5); anything else is rejected.
  begin
    v_source := coalesce(p_source, 'manual')::public.line_oa_resolution_source;
  exception
    when invalid_text_representation then
      raise exception 'line_oa: unsupported resolution source (expected postback or manual)'
        using errcode = '22023';   -- invalid_parameter_value
  end;

  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5, 12.6, 12.7). A site_unresolved
  -- Conversation is invisible to Branch_Roles (has_site_access(NULL) = false), so
  -- resolution is permitted to a Governance_Role (any active site) OR to a principal
  -- holding access to the TARGET site_code. A caller with neither is rejected with
  -- permission denied and NO state change.
  -- -------------------------------------------------------------------------
  if not (public.is_governance_role() or public.has_site_access(p_site_code)) then
    raise exception 'line_oa: permission denied to resolve conversation to the given site_code'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- Load + lock the target Conversation. FOR UPDATE serializes concurrent
  -- resolutions so the state transition is race-safe.
  -- -------------------------------------------------------------------------
  select c.vertical_context, c.status
    into v_vertical_context, v_current_status
  from public.line_oa_conversations c
  where c.id = p_conversation_id
  for update;

  if v_vertical_context is null then
    raise exception 'line_oa: conversation not found for site resolution'
      using errcode = 'P0002';   -- no_data_found; carries no secret/PII
  end if;

  -- A closed Conversation is terminal and is never reopened by resolution (Req 3.8).
  if v_current_status = 'closed' then
    raise exception 'line_oa: cannot resolve a closed conversation'
      using errcode = '22023';   -- invalid_parameter_value; state left unchanged
  end if;

  -- -------------------------------------------------------------------------
  -- Validate the candidate site_code against the ONLY source of valid Site_Codes
  -- (A1). An unknown or inactive code is rejected and the Conversation state is
  -- left UNCHANGED (Req 3.6). This check runs for every caller, including a
  -- Governance_Role whose role gate does not depend on the code being active.
  -- -------------------------------------------------------------------------
  select exists (
    select 1
    from public.get_active_site_codes() g
    where g.site_code = p_site_code
  )
  into v_is_active_code;

  if not v_is_active_code then
    raise exception 'line_oa: site_code is unknown or inactive'
      using errcode = '22023';   -- invalid_parameter_value; no state change
  end if;

  -- -------------------------------------------------------------------------
  -- Success: store the site_code, transition to `open`, and refresh activity so
  -- the 24h Session_Timeout sweep measures from the resolution (Req 3.4, 3.5).
  -- -------------------------------------------------------------------------
  update public.line_oa_conversations c
     set site_code = p_site_code,
         status = 'open',
         last_activity_at = timezone('utc', now())
   where c.id = p_conversation_id;

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the resolution, its source, and the
  -- site_code (Req 13.1). entity_ref is composed from non-secret identifiers only;
  -- no Channel_Secret / Channel_Access_Token is ever in scope here (Req 13.3).
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'conversation_site_resolved',
    v_vertical_context,
    p_site_code,
    format(
      'line_oa_conversation:%s|site_code:%s|source:%s',
      p_conversation_id, p_site_code, v_source
    ),
    v_actor
  );

  -- OUT params describing the resolved state.
  conversation_id := p_conversation_id;
  site_code       := p_site_code;
  status          := 'open';
  source          := v_source::text;
  resolved        := true;
  return;
end;
$$;

comment on function public.rpc_resolve_conversation_site(uuid, text, text)
  is 'Resolves a LINE Conversation''s Site_Code (postback or manual): re-checks role + has_site_access, resolves the actor, validates the code against get_active_site_codes() (rejects unknown/inactive with state unchanged), sets status=open and stores site_code, and writes one audit entry (Req 3.4-3.6, 12.5-12.7, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This is a caller-facing RPC (the only write path), so EXECUTE is
-- revoked from PUBLIC and granted to `authenticated`; the in-function role
-- re-check enforces authorization (Req 12.5, 12.6). The grant is applied only
-- where the role exists so the migration also applies cleanly in a plain
-- PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_resolve_conversation_site(uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_resolve_conversation_site(uuid, text, text) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;
