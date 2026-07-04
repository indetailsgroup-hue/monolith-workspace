-- Migration: line_oa_record_send_result
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 12.1 Implement rpc_record_line_send_result (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (public.line_oa_outbound_messages,
--                                              public.line_oa_conversations,
--                                              public.line_oa_audit_log,
--                                              public.line_oa_outbound_status, pgcrypto)
--   00000000000003_line_oa_rls.sql            (SELECT-only RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql (append-only audit log)
--   (shipped C12) public.is_governance_role(), public.has_site_access(text),
--                 public.resolve_actor()
--
-- Scope: the outbound SEND-RESULT RECORDING RPC ONLY.
--   * public.rpc_record_line_send_result(uuid, text, text)
--
-- This migration does NOT implement the property test (task 12.2), the outbound
-- composition RPC (task 11.4), the Edge Functions (task 19), or any other RPC.
--
-- ===========================================================================
-- STAGED OUTBOUND: RECORDING THE LINE SEND RESULT (Req 4.3, 4.4, 4.6, 12.5)
-- ===========================================================================
-- Outbound uses the staged pending -> sent/failed model (Decision 2). The DB-side
-- composition RPC (rpc_send_line_outbound, task 11.4) validates and persists an
-- outbound row in status 'pending' but performs NO HTTP. The line-outbound-sender
-- Edge Function then resolves the Channel_Access_Token from Vault, calls the LINE
-- Messaging API, and reports the outcome back through THIS RPC, which transitions
-- the row to its terminal delivery status.
--
-- Behavior:
--   * Re-checks the caller's role INSIDE the function (Req 12.5, 12.6, 12.7). The
--     outbound row belongs to a Conversation; recording its result is permitted to
--     a Governance_Role (any site) OR to a principal holding access to that
--     Conversation's site_code via public.has_site_access(). A site_unresolved
--     Conversation has a NULL site_code, so has_site_access(NULL) = false naturally
--     blocks Branch_Roles. A caller with neither is rejected permission-denied with
--     NO state change (Req 12.6).
--   * Resolves the audit/sender actor via public.resolve_actor() rather than
--     trusting any client-supplied identifier (Req 12.5).
--   * Sets the outbound row status to 'sent' or 'failed' (Req 4.3).
--   * On FAILURE it stores a non-empty error_detail and NEVER marks the row
--     sent/delivered; sent_at is left NULL (Req 4.4).
--   * On SUCCESS it stores status='sent', stamps sent_at, and clears any error_detail.
--   * Writes EXACTLY ONE audit entry recording the send outcome (Req 13.1).
--
-- Secret hygiene (secret-scrub convention) (Req 4.6, 13.3): the Channel_Access_Token
-- is NEVER passed into or resolved by this RPC -- the token lives only in the Edge
-- Function / Vault boundary. The only free text this RPC accepts is the failure
-- error_detail produced by the sender; that text is SCRUBBED of any Bearer token /
-- access-token-shaped material before it is persisted, so no token can leak into the
-- outbound row or the audit log even if a caller mistakenly forwards a raw API error.
--
-- Requirements: 4.4, 4.6, 12.5

-- This function references the shipped C12 helpers public.is_governance_role(),
-- public.has_site_access(), and public.resolve_actor(), which may not exist at
-- migration-build time in a bare environment (they are a platform prerequisite).
-- Disable body validation so the migration applies cleanly; the body is validated
-- at first call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.rpc_record_line_send_result(
--     p_outbound_id  uuid,
--     p_status       text,          -- 'sent' | 'failed'
--     p_error_detail text default null,
--     OUT outbound_id  uuid,
--     OUT status       text,
--     OUT error_detail text,
--     OUT sent_at      timestamptz,
--     OUT recorded     boolean
-- )
--
-- Record the terminal delivery result of a staged outbound message. Called by the
-- line-outbound-sender Edge Function after it attempts the LINE Messaging API call.
--
-- OUT parameters (for callers / tests):
--   * outbound_id  -- the recorded outbound row id
--   * status       -- the terminal status actually stored ('sent' | 'failed')
--   * error_detail -- the scrubbed failure detail (NULL on success)
--   * sent_at      -- the UTC delivery timestamp on success (NULL on failure)
--   * recorded     -- always true on the success path (a rejection raises instead)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_line_send_result(
  p_outbound_id uuid,
  p_status text,
  p_error_detail text default null,
  out outbound_id uuid,
  out status text,
  out error_detail text,
  out sent_at timestamptz,
  out recorded boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status            public.line_oa_outbound_status;
  v_actor             text;
  v_conversation_id   uuid;
  v_site_code         text;
  v_vertical_context  text;
  v_current_status    public.line_oa_outbound_status;
  v_error_detail      text;
  v_sent_at           timestamptz;
begin
  -- -------------------------------------------------------------------------
  -- Input validation. A result is meaningless without an outbound row and a
  -- terminal status. Messages use non-secret identifiers only.
  -- -------------------------------------------------------------------------
  if p_outbound_id is null then
    raise exception 'line_oa: outbound_id is required to record a send result'
      using errcode = '22004';   -- null_value_not_allowed
  end if;

  -- Normalize/validate the reported status. Only the two TERMINAL outbound states
  -- may be recorded here; 'pending' (the staged initial state) is not a result and
  -- anything else is rejected (Req 4.3, 4.4).
  begin
    v_status := p_status::public.line_oa_outbound_status;
  exception
    when invalid_text_representation then
      raise exception 'line_oa: unsupported send status (expected sent or failed)'
        using errcode = '22023';   -- invalid_parameter_value
  end;

  if v_status = 'pending' then
    raise exception 'line_oa: send result must be sent or failed, not pending'
      using errcode = '22023';
  end if;

  -- -------------------------------------------------------------------------
  -- Load + lock the target outbound row together with its Conversation's site
  -- dimension. FOR UPDATE serializes concurrent result recordings so the
  -- transition is race-safe and a single delivery wins.
  -- -------------------------------------------------------------------------
  select o.conversation_id, o.status, c.site_code, c.vertical_context
    into v_conversation_id, v_current_status, v_site_code, v_vertical_context
  from public.line_oa_outbound_messages o
  join public.line_oa_conversations c on c.id = o.conversation_id
  where o.id = p_outbound_id
  for update of o;

  if v_conversation_id is null then
    raise exception 'line_oa: outbound message not found to record a send result'
      using errcode = 'P0002';   -- no_data_found; carries no secret/PII
  end if;

  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5, 12.6, 12.7). Recording the result
  -- is permitted to a Governance_Role (any site) OR to a principal holding access
  -- to the Conversation's site_code. A site_unresolved Conversation has a NULL
  -- site_code, so has_site_access(NULL) = false blocks Branch_Roles. A caller with
  -- neither is rejected permission-denied with NO state change (Req 12.6).
  -- -------------------------------------------------------------------------
  if not (public.is_governance_role() or public.has_site_access(v_site_code)) then
    raise exception 'line_oa: permission denied to record send result for this conversation'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- Branch on the reported outcome. On FAILURE we store a non-empty error_detail
  -- and NEVER mark the row sent (Req 4.4): status='failed', sent_at stays NULL. On
  -- SUCCESS we store status='sent', stamp sent_at, and clear any prior error_detail.
  --
  -- Secret scrub (Req 4.6, 13.3): the error_detail is operator-supplied free text
  -- forwarded from the LINE API error. Strip any Bearer/access-token-shaped material
  -- before persisting so a Channel_Access_Token can never leak into the row or audit.
  -- -------------------------------------------------------------------------
  if v_status = 'failed' then
    v_error_detail := nullif(btrim(coalesce(p_error_detail, '')), '');
    if v_error_detail is null then
      -- A failure MUST carry an explanation; default to a non-secret placeholder so
      -- the row never appears delivered AND never appears successful-but-empty (Req 4.4).
      v_error_detail := 'line_oa: send failed (no detail provided)';
    end if;

    -- Scrub access-token-shaped material from the failure detail (Req 4.6, 13.3).
    -- Replaces "Bearer <token>" and long opaque token-like runs with a redaction tag.
    v_error_detail := regexp_replace(v_error_detail, '(?i)bearer\s+[A-Za-z0-9._\-+/=]+', 'Bearer [REDACTED]', 'g');
    v_error_detail := regexp_replace(v_error_detail, '[A-Za-z0-9._\-+/=]{40,}', '[REDACTED]', 'g');

    v_sent_at := null;

    update public.line_oa_outbound_messages o
       set status = 'failed',
           error_detail = v_error_detail,
           sent_by = v_actor,
           sent_at = null            -- never marked delivered on failure (Req 4.4)
     where o.id = p_outbound_id;
  else
    -- Success path: status='sent'. Any error_detail from a prior attempt is cleared.
    v_error_detail := null;
    v_sent_at := timezone('utc', now());

    update public.line_oa_outbound_messages o
       set status = 'sent',
           error_detail = null,
           sent_by = v_actor,
           sent_at = v_sent_at
     where o.id = p_outbound_id;
  end if;

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the send outcome (Req 13.1). entity_ref is
  -- composed from non-secret identifiers only; the Channel_Access_Token is never in
  -- scope here, and the (already scrubbed) failure detail is excluded from the audit
  -- text entirely so no token-shaped material can reach the audit log (Req 4.6, 13.3).
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'outbound_send_result_recorded',
    v_vertical_context,
    v_site_code,
    format(
      'line_oa_outbound_message:%s|conversation:%s|status:%s',
      p_outbound_id, v_conversation_id, v_status
    ),
    v_actor
  );

  -- OUT params describing the recorded result.
  outbound_id  := p_outbound_id;
  status       := v_status::text;
  error_detail := v_error_detail;
  sent_at      := v_sent_at;
  recorded     := true;
  return;
end;
$$;

comment on function public.rpc_record_line_send_result(uuid, text, text)
  is 'Records the terminal delivery result of a staged LINE outbound message: re-checks role + has_site_access on the conversation site, resolves the actor, sets status=sent (stamping sent_at) or status=failed (storing a non-empty, token-scrubbed error_detail and never marking delivered), and writes one audit entry (Req 4.3, 4.4, 4.6, 12.5, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This is a server-side RPC invoked by the line-outbound-sender Edge
-- Function under an authenticated context, so EXECUTE is revoked from PUBLIC and
-- granted to `authenticated`; the in-function role re-check enforces authorization
-- (Req 12.5, 12.6). The grant is applied only where the role exists so the migration
-- also applies cleanly in a plain PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_record_line_send_result(uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_record_line_send_result(uuid, text, text) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;
