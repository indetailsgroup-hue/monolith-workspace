-- Migration: line_oa_ingest_webhook
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 8.1 Implement rpc_ingest_line_webhook (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql              (the eight line_oa_* tables, pgcrypto)
--   00000000000002_line_oa_constraints.sql         (inbound webhook_event_id UNIQUE,
--                                                    conversations live partial-unique)
--   00000000000003_line_oa_rls.sql                 (RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql  (append-only audit log)
--   00000000000010_line_oa_signature_verification.sql
--                       (public.line_oa_resolve_channel, public.line_oa_verify_signature)
--   00000000000020_line_oa_identity_resolution.sql
--                       (public.line_oa_resolve_customer_identity)
--   (shipped C12) public.resolve_actor()
--
-- Scope: the inbound ingestion RPC ONLY.
--   * public.rpc_ingest_line_webhook(text, text, text)
--
-- This migration does NOT implement the property tests (tasks 8.2/8.3/8.4/8.5), the
-- Edge Functions (task 19), or order intake (task 13). It composes the already-shipped
-- task 6.1 (channel/signature) and task 7.1 (identity) helpers into the single write
-- path for inbound LINE traffic.
--
-- ===========================================================================
-- BEHAVIOR (Req 1.7, 2.1-2.6, 3.1-3.3, 3.8, 6.1, 13.1)
-- ===========================================================================
-- The LINE webhook Edge Function (task 19.1) forwards the EXACT raw request body, the
-- x-line-signature header, and the receiving channel_identifier into this RPC. Here we:
--
--   1. Resolve the channel to its Vertical_Context (via line_oa_resolve_channel). An
--      unknown/inactive channel raises (errcode P0002) carrying NO secret value, so the
--      Edge Function returns 4xx and the request is rejected with no side effects
--      (Req 1.1, 1.6). The audit log requires a NON-NULL vertical_context, which is
--      unknowable for an unresolvable channel, so this case is surfaced as a raised
--      error rather than an audit row.
--
--   2. Verify the LINE_Signature with line_oa_verify_signature BEFORE any processing
--      (Req 1.2). The Channel_Secret is resolved from Vault strictly inside that helper
--      and never returned/logged here. A missing or mismatched signature writes a single
--      rejection audit entry (we now know the vertical) and returns accepted = false with
--      NO conversation/message/identity persistence and NO send (Req 1.3, 1.4).
--
--   3. Parse the (now authenticated) body and iterate its LINE events. For EACH event
--      with a webhookEventId and a source.userId:
--        a. Idempotency (Req 2.1-2.5, 8.7): webhook_event_id is the anchor. If an inbound
--           row already exists for it, acknowledge with NO side effects (no new
--           conversation/message/identity/audit). The inbound UNIQUE(webhook_event_id)
--           constraint is the persistence-layer guarantee; a per-event SAVEPOINT (the
--           nested BEGIN/EXCEPTION block) additionally makes a concurrent redelivery
--           roll back cleanly so no orphan conversation is left behind.
--        b. Routing (Req 3.1-3.3, 3.8): attach to the single live (status <> 'closed')
--           conversation for (line_user_id, vertical_context); if none exists, create a
--           new one in 'site_unresolved' with a NULL site_code. A closed conversation is
--           never reopened — a new inbound after auto-close opens a fresh conversation
--           (the live partial-unique index makes the live one unique).
--        c. Persist the Inbound_Message (Req 3.1).
--        d. Resolve the CustomerIdentity binding (Req 6.1) via the task 7.1 helper.
--        e. Write exactly ONE audit receipt for that webhook_event_id (Req 1.7, 13.1).
--
--   4. STRICT CONSISTENCY (Req 2.6 / Property 5): this RPC performs NO outbound HTTP. All
--      persistence happens in the caller's single transaction and commits BEFORE any send
--      is possible — outbound is the separate staged pending -> sent/failed path driven by
--      the line-outbound-sender Edge Function. A persistence failure therefore rolls the
--      whole transaction back and yields zero external side effects.
--
-- Secret hygiene (Req 1.5, 13.3): the Channel_Secret / Channel_Access_Token never appear
-- here. line_oa_resolve_channel returns only the vertical and the access-token REFERENCE
-- (resolved but unused in this RPC); line_oa_verify_signature keeps the plaintext secret
-- internal. Every error message and audit entity_ref is built from non-secret identifiers
-- only (channel_identifier, webhook_event_id, line_user_id, conversation/customer ids).
--
-- Actor (Req 12.5, 13.1): performed_by is resolved via public.resolve_actor() rather than
-- trusting any client-supplied identifier. Inbound ingestion is authenticated by the LINE
-- signature (not by a C12 site role), so this RPC imposes no per-site role gate; the
-- operational RPCs (resolve/send/order) carry the role/site re-checks.
--
-- Requirements: 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.8, 6.1, 13.1

-- This function references the shipped C12 helper public.resolve_actor() (a platform
-- prerequisite) and the Vault-backed verify helper, which may not exist at migration-build
-- time in a bare environment. Disable body validation so the migration applies cleanly;
-- the body is validated at first call (matching the earlier line_oa migrations).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.rpc_ingest_line_webhook(
--     p_raw_body          text,   -- EXACT raw LINE request body bytes (UTF-8 JSON)
--     p_signature         text,   -- the x-line-signature header value
--     p_channel_identifier text,  -- the receiving channel identifier
--     OUT accepted          boolean,  -- true when the (verified) delivery was accepted
--     OUT reason            text,     -- 'accepted' | 'signature_invalid' | 'malformed_payload'
--     OUT events_processed  integer,  -- first-time events that produced side effects
--     OUT events_duplicate  integer,  -- events whose webhook_event_id was already processed
--     OUT events_skipped    integer   -- events lacking a webhookEventId / source.userId
-- )
--
-- The single inbound write path. Verifies, then idempotently ingests each LINE event,
-- routing it to a live conversation (creating a site_unresolved one if needed), persisting
-- the inbound message, resolving customer identity, and writing one audit receipt per
-- first-time webhook_event_id. Performs NO outbound HTTP (staged outbound model).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_ingest_line_webhook(
  p_raw_body text,
  p_signature text,
  p_channel_identifier text,
  out accepted boolean,
  out reason text,
  out events_processed integer,
  out events_duplicate integer,
  out events_skipped integer
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vertical_context     text;
  v_token_ref            text;     -- resolved but intentionally unused here (never exposed)
  v_verified             boolean;
  v_actor                text;
  v_payload              jsonb;
  v_events               jsonb;
  v_event                jsonb;
  v_webhook_event_id     text;
  v_line_user_id         text;
  v_conversation_id      uuid;
  v_conv_site_code       text;
  v_inbound_id           uuid;
  v_customer_id          uuid;
  v_identity_id          uuid;
  v_identity_created     boolean;
begin
  -- Initialize OUT counters.
  accepted         := false;
  reason           := null;
  events_processed := 0;
  events_duplicate := 0;
  events_skipped   := 0;

  -- -------------------------------------------------------------------------
  -- (1) Resolve the channel to its Vertical_Context (+ token reference, unused).
  -- Unknown/inactive channel raises P0002 with no secret in the message; the
  -- Edge Function maps this to a 4xx rejection (Req 1.1, 1.6).
  -- -------------------------------------------------------------------------
  select r.vertical_context, r.channel_access_token_ref
    into v_vertical_context, v_token_ref
  from public.line_oa_resolve_channel(p_channel_identifier) r;

  -- Resolve the audit actor from the request context, never from client input
  -- (Req 12.5, 13.1).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- (2) Verify the LINE_Signature BEFORE any further processing (Req 1.2). The
  -- secret stays inside the helper. A missing/mismatched signature is rejected
  -- with a single rejection audit entry and NO persistence/side effects
  -- (Req 1.3, 1.4).
  -- -------------------------------------------------------------------------
  v_verified := public.line_oa_verify_signature(p_channel_identifier, p_raw_body, p_signature);

  if not v_verified then
    insert into public.line_oa_audit_log (
      event_type, vertical_context, site_code, entity_ref, performed_by
    )
    values (
      'webhook_rejected_signature',
      v_vertical_context,
      null,
      format('channel_identifier:%s|reason:signature_invalid', p_channel_identifier),
      v_actor
    );
    accepted := false;
    reason   := 'signature_invalid';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- (3) Parse the now-authenticated body. The signature already proves the body
  -- is genuine LINE JSON; guard the cast defensively and record a distinct
  -- rejection if it is malformed.
  -- -------------------------------------------------------------------------
  begin
    v_payload := p_raw_body::jsonb;
  exception
    when others then
      insert into public.line_oa_audit_log (
        event_type, vertical_context, site_code, entity_ref, performed_by
      )
      values (
        'webhook_rejected_malformed',
        v_vertical_context,
        null,
        format('channel_identifier:%s|reason:malformed_payload', p_channel_identifier),
        v_actor
      );
      accepted := false;
      reason   := 'malformed_payload';
      return;
  end;

  -- Normalize to a LINE events array. A standard LINE delivery carries
  -- {"destination":..., "events":[...]}; tolerate a single bare event object too.
  if jsonb_typeof(v_payload -> 'events') = 'array' then
    v_events := v_payload -> 'events';
  elsif v_payload ? 'webhookEventId' then
    v_events := jsonb_build_array(v_payload);
  else
    v_events := '[]'::jsonb;
  end if;

  -- -------------------------------------------------------------------------
  -- (4) Process each event idempotently.
  -- -------------------------------------------------------------------------
  for v_event in select jsonb_array_elements(v_events) loop
    v_webhook_event_id := v_event ->> 'webhookEventId';
    v_line_user_id     := v_event #>> '{source,userId}';

    -- An event without a stable id or a user we can key a conversation by is not
    -- ingestible in this wave (e.g. a console verify ping). Skip without error.
    if v_webhook_event_id is null or length(btrim(v_webhook_event_id)) = 0
       or v_line_user_id is null or length(btrim(v_line_user_id)) = 0 then
      events_skipped := events_skipped + 1;
      continue;
    end if;

    -- Idempotency fast path for sequential redelivery: if this webhook_event_id
    -- was already ingested, acknowledge with NO side effects (Req 2.2, 2.3, 2.4).
    if exists (
      select 1
        from public.line_oa_inbound_messages m
       where m.webhook_event_id = v_webhook_event_id
    ) then
      events_duplicate := events_duplicate + 1;
      continue;
    end if;

    -- Per-event SAVEPOINT: all side effects for this event are atomic. A concurrent
    -- redelivery that loses the race on the inbound UNIQUE(webhook_event_id) (or on
    -- the conversations live partial-unique) raises unique_violation; the nested
    -- block rolls back to the savepoint so no orphan conversation/message remains,
    -- and we record it as a duplicate (Req 2.4, 2.5).
    begin
      -- Route to the single live conversation for (line_user_id, vertical_context),
      -- or create a new site_unresolved one with a NULL site_code (Req 3.1-3.3).
      -- 'closed' conversations are excluded, so an auto-closed thread is never
      -- reopened — a new one is created instead (Req 3.8).
      select c.id, c.site_code
        into v_conversation_id, v_conv_site_code
      from public.line_oa_conversations c
      where c.line_user_id = v_line_user_id
        and c.vertical_context = v_vertical_context
        and c.status <> 'closed'
      order by c.last_activity_at desc
      limit 1;

      if v_conversation_id is null then
        insert into public.line_oa_conversations (
          line_user_id, vertical_context, site_code, status, last_activity_at
        )
        values (
          v_line_user_id, v_vertical_context, null, 'site_unresolved', timezone('utc', now())
        )
        returning id, site_code into v_conversation_id, v_conv_site_code;
      else
        -- Keep the conversation live and bump the Session_Timeout clock (Req 3.3).
        update public.line_oa_conversations
           set last_activity_at = timezone('utc', now())
         where id = v_conversation_id;
      end if;

      -- Persist the Inbound_Message (Req 3.1). No ON CONFLICT clause: a duplicate
      -- webhook_event_id raises unique_violation, handled below as a redelivery.
      insert into public.line_oa_inbound_messages (
        conversation_id, webhook_event_id, payload, received_at
      )
      values (
        v_conversation_id, v_webhook_event_id, v_event, timezone('utc', now())
      )
      returning id into v_inbound_id;

      -- Resolve (or create) the single CustomerIdentity binding for this user +
      -- vertical and associate the conversation's customer (Req 6.1).
      select ci.customer_id, ci.identity_id, ci.created
        into v_customer_id, v_identity_id, v_identity_created
      from public.line_oa_resolve_customer_identity(v_line_user_id, v_vertical_context) ci;

      -- Exactly one audit receipt per first-time webhook_event_id (Req 1.7, 13.1).
      -- entity_ref is composed from non-secret identifiers only (Req 13.3). site_code
      -- is the conversation's (NULL while site_unresolved).
      insert into public.line_oa_audit_log (
        event_type, vertical_context, site_code, entity_ref, performed_by
      )
      values (
        'webhook_inbound_received',
        v_vertical_context,
        v_conv_site_code,
        format(
          'webhook_event_id:%s|conversation_id:%s|inbound_id:%s|line_user_id:%s|customer_id:%s|identity_created:%s',
          v_webhook_event_id, v_conversation_id, v_inbound_id, v_line_user_id, v_customer_id, v_identity_created
        ),
        v_actor
      );

      events_processed := events_processed + 1;

    exception
      when unique_violation then
        -- A concurrent delivery of the same webhook_event_id (or a concurrent new
        -- conversation for the same live key) won the race. The savepoint rolls back
        -- this event's partial work, so the single-delivery state is preserved with
        -- no duplicate rows (Req 2.3, 2.4, 2.5).
        events_duplicate := events_duplicate + 1;
    end;
  end loop;

  -- A verified delivery is accepted; per-event receipts above record the detail.
  accepted := true;
  reason   := 'accepted';
  return;
end;
$$;

comment on function public.rpc_ingest_line_webhook(text, text, text)
  is 'Single inbound write path: resolves the channel + verifies the LINE signature, then '
     'idempotently (on webhook_event_id) routes each event to a live conversation (creating '
     'a site_unresolved one if none), persists the inbound message, resolves customer '
     'identity, and writes one audit receipt per first-time event. Performs no outbound HTTP '
     '(staged pending model), so all persistence commits before any send is possible '
     '(Req 1.7, 2.1-2.6, 3.1-3.3, 3.8, 6.1, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This RPC is the inbound write path invoked server-side by the
-- line-webhook Edge Function. EXECUTE is revoked from PUBLIC and granted to the
-- server-side roles where they exist (authenticated / service_role) so the
-- migration also applies cleanly in a plain PostgreSQL environment. Authenticity
-- is established by the LINE signature verified inside the function, not by a C12
-- site role, so no in-function role gate is imposed for ingestion.
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_ingest_line_webhook(text, text, text) from public;

do $$
declare
  r text;
begin
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'grant execute on function public.rpc_ingest_line_webhook(text, text, text) to %I', r
      );
    end if;
  end loop;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;
