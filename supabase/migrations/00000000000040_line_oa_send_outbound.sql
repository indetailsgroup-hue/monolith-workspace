-- Migration: line_oa_send_outbound
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 11.4 Implement rpc_send_line_outbound (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql              (line_oa_conversations,
--                                                    line_oa_outbound_messages,
--                                                    line_oa_message_templates,
--                                                    line_oa_audit_log,
--                                                    line_oa_send_type / _outbound_status enums,
--                                                    pgcrypto)
--   00000000000002_line_oa_constraints.sql         (templates PK (template_key, vertical_context))
--   00000000000003_line_oa_rls.sql                 (SELECT-only RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql  (append-only audit log)
--   (shipped C12) public.is_governance_role(), public.has_site_access(text),
--                 public.resolve_actor()
--
-- Scope: the outbound COMPOSITION + STAGING RPC ONLY.
--   * public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean)
--
-- This migration does NOT implement the property tests (tasks 11.5/11.6/11.7), the
-- Edge Functions (task 19), or the result-recording RPC (task 12.1). It composes the
-- already-shipped pure-logic contracts — the D2 autonomy gate (task 11.1 /
-- autonomyGate.ts), template resolution + template-bound classification (task 5.5 /
-- templates.ts), and brand-voice 200-char enforcement (task 5.3 / brand-voice.ts) —
-- into the single DB-side write path that STAGES a `pending` outbound row.
--
-- ===========================================================================
-- STAGED OUTBOUND MODEL — NO HTTP HERE (Design Decision 2; Req 4.3, 2.6)
-- ===========================================================================
-- PL/pgSQL performs NO outbound HTTPS to the LINE Messaging API. This RPC does ALL
-- validation + persistence (role/site re-check, autonomy gate, template resolution /
-- classification, named-slot substitution, brand-voice 200-char enforcement, and the
-- reply-token-vs-push decision) and writes a `line_oa_outbound_messages` row in status
-- `pending`. The `line-outbound-sender` Edge Function (task 19.3) later resolves the
-- Channel_Access_Token from Vault, calls LINE, and records the result via
-- rpc_record_line_send_result (task 12.1). Because persistence commits before any send
-- is possible, a persistence failure yields zero external side effects (Req 2.6).
--
-- ===========================================================================
-- BEHAVIOR (Req 4.3, 4.5, 5.2-5.7, 9.1-9.4, 11.6, 12.5-12.7)
-- ===========================================================================
--   1. Re-check the caller's role INSIDE the function against the conversation's
--      site_code: a Governance_Role (any site) OR a principal holding
--      public.has_site_access(site_code) may compose. A `site_unresolved`
--      conversation has a NULL site_code, so has_site_access(NULL) = false naturally
--      BLOCKS all Branch_Roles there; only a Governance_Role may compose on it
--      (Req 12.5-12.7). A caller with neither is rejected permission-denied with NO
--      state change (Req 12.6 / Property 28). The audit actor is resolved via
--      public.resolve_actor(), never from client input (Req 12.5).
--
--   2. Resolve the template by (template_key, vertical_context) — a vertical-specific
--      definition takes precedence over a shared (NULL-scope) one (Req 5.2 / Property
--      12). Classify the outbound as template-bound (resolves to an ACTIVE template)
--      vs free-text (absent / inactive / unbound). Only template-bound content may be
--      sent; an absent/inactive reference is rejected and never sent (Req 5.4, 5.5,
--      5.7, 11.6 / Property 13).
--
--   3. Run the D2 autonomy gate (mirrors autonomyGate.ts). The action is classified
--      into an Autonomy_Tier BEFORE the approve/withhold decision (Req 11.1, 11.2):
--      a genuinely template-bound slot-fill is T1 (autonomous) and proceeds within the
--      guardrails (Req 11.3, 11.6); anything else is a gated tier that is WITHHELD
--      until approved, and BLOCKED as a fail-safe if the approval mechanism is
--      unavailable (Req 11.4, 11.5).
--
--   4. Substitute ONLY the named {{slot}} placeholders of the resolved active body;
--      a declared slot with no supplied value is rejected (missing_slot) so no
--      message with an unfilled placeholder is ever staged (Req 5.3 / Property 13).
--
--   5. Apply the Brand_Voice_Guideline matching the conversation's vertical_context
--      and reject any composed segment longer than 200 characters (Req 9.1-9.4 /
--      Property 22).
--
--   6. Decide reply-token vs push: when a usable reply token is supplied (non-empty
--      and not expired) the send_type is `reply`; otherwise it falls back to `push`
--      (Req 4.5 / Property 11).
--
--   7. Insert ONE outbound row in status `pending` recording template_key + slot_values
--      and the resolved send_type (Req 4.3, 5.6 / Property 9), then write EXACTLY ONE
--      audit entry recording the action, its Autonomy_Tier, and its approval outcome
--      (Req 11.7 / Property 26, 13.1).
--
-- Secret hygiene (secret-scrub convention; Req 13.3): this flow touches NO
-- Channel_Secret or Channel_Access_Token — those are resolved only inside the sender
-- Edge Function at send time — so there is nothing to decrypt and nothing to scrub.
-- The reply token (when supplied) is a short-lived LINE reply token, NOT a channel
-- secret; it is used only to decide reply-vs-push and is never written to the outbound
-- row, the audit entity_ref, or any error message. Every error/audit string is built
-- from non-secret identifiers only.
--
-- Requirements: 4.3, 4.5, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 9.1, 9.2, 9.3, 9.4, 11.6,
--               12.5, 12.6, 12.7

-- This function references the shipped C12 helpers public.is_governance_role(),
-- public.has_site_access(), and public.resolve_actor(), which may not exist at
-- migration-build time in a bare environment (they are a platform prerequisite).
-- Disable body validation so the migration applies cleanly; the body is validated at
-- first call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.rpc_send_line_outbound(
--     p_conversation_id     uuid,    -- the owning Conversation
--     p_template_key        text,    -- the Message_Template to bind to
--     p_slots               jsonb,   -- named-slot values (default '{}')
--     p_reply_token         text,    -- LINE reply token if available (default NULL)
--     p_reply_token_expired boolean, -- whether that reply token is expired (default false)
--     p_approval_available  boolean, -- whether the human-approval mechanism is up (default true)
--     p_approved            boolean, -- whether a human approved a gated action (default false)
--     OUT staged            boolean, -- true iff a pending outbound row was created
--     OUT outbound_id       uuid,    -- the staged row id (NULL when not staged)
--     OUT send_type         text,    -- 'reply' | 'push' (NULL when not staged)
--     OUT classification    text,    -- 'template-bound' | 'free-text'
--     OUT autonomy_tier     text,    -- the classified D2 Autonomy_Tier
--     OUT approval_outcome  text,    -- 'AUTONOMOUS' | 'APPROVED' | 'PENDING' | 'BLOCKED_FAILSAFE'
--     OUT gate_decision     text,    -- 'ALLOW' | 'WITHHELD' | 'BLOCKED'
--     OUT reason            text     -- 'staged' or the rejection reason
-- )
--
-- Compose and STAGE a template-bound, brand-voiced outbound message as a `pending`
-- row. Returns OUT params describing the governance + composition outcome; performs
-- NO outbound HTTP. Hard authorization / precondition failures (permission denied,
-- conversation not found, closed conversation, bad input) RAISE with no state change;
-- governed-but-not-sent outcomes (gate withheld/blocked, unbound/inactive template,
-- missing slot, over-length segment) RETURN staged=false WITH one audit entry so every
-- AI action is recorded (Req 11.7).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_send_line_outbound(
  p_conversation_id uuid,
  p_template_key text,
  p_slots jsonb default '{}'::jsonb,
  p_reply_token text default null,
  p_reply_token_expired boolean default false,
  p_approval_available boolean default true,
  p_approved boolean default false,
  out staged boolean,
  out outbound_id uuid,
  out send_type text,
  out classification text,
  out autonomy_tier text,
  out approval_outcome text,
  out gate_decision text,
  out reason text
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Per-segment brand-voice ceiling (Req 9.2; mirrors MAX_SEGMENT_LENGTH = 200).
  c_max_segment_length constant integer := 200;

  v_actor            text;
  v_vertical_context text;
  v_site_code        text;
  v_status           public.line_oa_conversation_status;

  -- Template resolution / classification.
  v_template_found   boolean := false;
  v_template_active  boolean := false;
  v_template_body    text;
  v_template_bound   boolean := false;

  -- Slot substitution.
  v_slots            jsonb := coalesce(p_slots, '{}'::jsonb);
  v_used_slots       jsonb := '{}'::jsonb;
  v_composed_body    text;
  v_missing_slots    integer := 0;
  v_slot             record;

  -- Brand voice.
  v_brand_tone       text;

  -- Autonomy gate (mirrors autonomyGate.ts).
  v_tier             text;
  v_decision         text;
  v_outcome          text;
  v_may_proceed      boolean;

  -- Resolved send type.
  v_send_type        public.line_oa_send_type;

  -- Outcome bookkeeping.
  v_reason           text;
  v_classification   text;
begin
  -- -------------------------------------------------------------------------
  -- Input validation. Non-secret identifiers only in every message.
  -- -------------------------------------------------------------------------
  if p_conversation_id is null then
    raise exception 'line_oa: conversation_id is required to compose an outbound message'
      using errcode = '22004';   -- null_value_not_allowed
  end if;
  if p_template_key is null or length(btrim(p_template_key)) = 0 then
    raise exception 'line_oa: template_key is required to compose an outbound message'
      using errcode = '22004';
  end if;
  if jsonb_typeof(v_slots) <> 'object' then
    raise exception 'line_oa: slots must be a JSON object of named slot values'
      using errcode = '22023';   -- invalid_parameter_value
  end if;

  -- -------------------------------------------------------------------------
  -- Load + lock the owning Conversation. FOR UPDATE serializes concurrent
  -- composition so the staged row + audit are written consistently.
  -- -------------------------------------------------------------------------
  select c.vertical_context, c.site_code, c.status
    into v_vertical_context, v_site_code, v_status
  from public.line_oa_conversations c
  where c.id = p_conversation_id
  for update;

  if v_vertical_context is null then
    raise exception 'line_oa: conversation not found for outbound composition'
      using errcode = 'P0002';   -- no_data_found; carries no secret/PII
  end if;

  -- An outbound message cannot be composed for a terminal (closed) conversation.
  if v_status = 'closed' then
    raise exception 'line_oa: cannot compose an outbound message for a closed conversation'
      using errcode = '22023';   -- invalid_parameter_value; no state change
  end if;

  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5-12.7 / Property 28). A
  -- Governance_Role may compose on any conversation; a Branch_Role only where it
  -- holds has_site_access(site_code). A site_unresolved conversation has a NULL
  -- site_code, so has_site_access(NULL) = false BLOCKS Branch_Roles there. A
  -- caller with neither is rejected permission-denied with NO state change.
  -- -------------------------------------------------------------------------
  if not (public.is_governance_role() or public.has_site_access(v_site_code)) then
    raise exception 'line_oa: permission denied to compose an outbound message for this conversation'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- (2) Resolve + classify the template (mirrors templates.ts resolveTemplate /
  -- classifyOutbound). Consider templates whose key matches and whose scope is the
  -- conversation's vertical OR shared (NULL); prefer the vertical-specific
  -- definition over the shared one (Req 5.2 / Property 12). "template-bound" means
  -- it resolves to an ACTIVE template; everything else is "free-text" (Req 5.7).
  -- -------------------------------------------------------------------------
  select t.body, t.is_active
    into v_template_body, v_template_active
  from public.line_oa_message_templates t
  where t.template_key = p_template_key
    and (t.vertical_context = v_vertical_context or t.vertical_context is null)
  order by (t.vertical_context = v_vertical_context) desc nulls last
  limit 1;

  v_template_found := v_template_body is not null;
  v_template_bound := v_template_found and v_template_active;
  v_classification := case when v_template_bound then 'template-bound' else 'free-text' end;

  -- -------------------------------------------------------------------------
  -- (3) Autonomy gate (mirrors autonomyGate.ts). Classification of the action's
  -- Autonomy_Tier happens BEFORE the approve/withhold decision (Req 11.1, 11.2).
  -- A genuinely template-bound slot-fill is T1 (autonomous, Req 11.6); otherwise it
  -- is a gated tier (T2). The gate then decides: autonomous -> ALLOW; gated +
  -- mechanism unavailable -> BLOCKED (fail-safe, Req 11.5); gated + approved ->
  -- ALLOW (Req 11.4); gated + not approved -> WITHHELD (Req 11.4). The fail-safe is
  -- checked before the approved flag so a stale approval cannot slip past an
  -- unavailable mechanism.
  -- -------------------------------------------------------------------------
  if v_template_bound then
    v_tier := 'T1_TEMPLATE_SLOT_FILL';
  else
    v_tier := 'T2_HUMAN_APPROVAL';
  end if;

  if v_tier in ('T0_NOTIFY', 'T1_TEMPLATE_SLOT_FILL') then
    v_decision    := 'ALLOW';
    v_outcome     := 'AUTONOMOUS';
    v_may_proceed := true;
  elsif coalesce(p_approval_available, true) = false then
    v_decision    := 'BLOCKED';
    v_outcome     := 'BLOCKED_FAILSAFE';
    v_may_proceed := false;
  elsif coalesce(p_approved, false) = true then
    v_decision    := 'ALLOW';
    v_outcome     := 'APPROVED';
    v_may_proceed := true;
  else
    v_decision    := 'WITHHELD';
    v_outcome     := 'PENDING';
    v_may_proceed := false;
  end if;

  -- -------------------------------------------------------------------------
  -- Determine the rejection reason, in precedence order, BEFORE any insert. Each
  -- non-sent outcome is still a governed AI action and is audited once below.
  -- -------------------------------------------------------------------------
  v_reason := null;

  if not v_template_found then
    -- Reference to an absent template: not bound to an active template -> reject
    -- (Req 5.4, 5.5, 5.7).
    v_reason := 'template_absent';
  elsif not v_template_active then
    -- Reference to an inactive template: rejected, never sent (Req 5.5).
    v_reason := 'template_inactive';
  elsif not v_may_proceed then
    -- Gate withheld / fail-safe blocked (Req 11.4, 11.5).
    v_reason := case when v_decision = 'BLOCKED' then 'autonomy_blocked' else 'autonomy_withheld' end;
  else
    -- Template-bound + gate allowed: substitute ONLY the named slots of the active
    -- body (Req 5.3 / Property 13). A declared slot with no supplied value is a
    -- missing_slot rejection so no unfilled placeholder is ever staged.
    v_composed_body := v_template_body;
    for v_slot in
      select distinct (regexp_matches(v_template_body, '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g'))[1] as name
    loop
      if v_slots ? v_slot.name then
        v_used_slots := v_used_slots || jsonb_build_object(v_slot.name, v_slots ->> v_slot.name);
        -- Escape backslashes so a slot value cannot be interpreted as a regexp
        -- replacement back-reference (\1, \\, ...).
        v_composed_body := regexp_replace(
          v_composed_body,
          '\{\{\s*' || v_slot.name || '\s*\}\}',
          replace(v_slots ->> v_slot.name, '\', '\\'),
          'g'
        );
      else
        v_missing_slots := v_missing_slots + 1;
      end if;
    end loop;

    if v_missing_slots > 0 then
      v_reason := 'missing_slot';
    else
      -- Brand-voice guideline matching the conversation's vertical (Req 9.1, 9.4;
      -- mirrors brand-voice.ts registry). An unconfigured vertical has no guideline.
      v_brand_tone := case v_vertical_context
        when 'monolith' then 'short, warm, craft-confident'
        when 'tcck'     then 'short, warm, appetizing'
        else null
      end;

      if v_brand_tone is null then
        v_reason := 'brand_voice_unresolved';
      elsif char_length(v_composed_body) > c_max_segment_length then
        -- Over-length segment is rejected and not sent (Req 9.2, 9.3).
        v_reason := 'brand_voice_segment_too_long';
      end if;
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- (6) Decide reply-token vs push (Req 4.5 / Property 11). A usable reply token
  -- is non-empty and not expired; otherwise fall back to push. Computed regardless
  -- of the staged/rejected outcome so the OUT value is always meaningful.
  -- -------------------------------------------------------------------------
  if p_reply_token is not null
     and length(btrim(p_reply_token)) > 0
     and coalesce(p_reply_token_expired, false) = false then
    v_send_type := 'reply';
  else
    v_send_type := 'push';
  end if;

  -- -------------------------------------------------------------------------
  -- (7) Stage the outbound row when everything passed; otherwise leave it unstaged.
  -- -------------------------------------------------------------------------
  if v_reason is null then
    insert into public.line_oa_outbound_messages (
      conversation_id, send_type, status, template_key, slot_values
    )
    values (
      p_conversation_id, v_send_type, 'pending', p_template_key, v_used_slots
    )
    returning id into outbound_id;

    -- Keep the conversation live so the 24h Session_Timeout measures from this activity.
    update public.line_oa_conversations
       set last_activity_at = timezone('utc', now())
     where id = p_conversation_id;

    staged    := true;
    send_type := v_send_type::text;
    v_reason  := 'staged';
  else
    staged      := false;
    outbound_id := null;
    -- send_type still reported (the resolved type that WOULD have been used).
    send_type   := v_send_type::text;
  end if;

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the AI action, its Autonomy_Tier, and its
  -- approval outcome (Req 11.7 / Property 26, 13.1). entity_ref is built from
  -- non-secret identifiers only; no Channel_Secret / Channel_Access_Token / reply
  -- token is ever in scope here (Req 13.3). site_code is the conversation's (NULL
  -- while site_unresolved).
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'outbound_message_composed',
    v_vertical_context,
    v_site_code,
    format(
      'conversation_id:%s|outbound_id:%s|template_key:%s|classification:%s|autonomy_tier:%s|gate_decision:%s|approval_outcome:%s|send_type:%s|staged:%s|reason:%s',
      p_conversation_id, coalesce(outbound_id::text, 'none'), p_template_key,
      v_classification, v_tier, v_decision, v_outcome, v_send_type, staged, v_reason
    ),
    v_actor
  );

  -- OUT params describing the governance + composition outcome.
  classification   := v_classification;
  autonomy_tier    := v_tier;
  approval_outcome := v_outcome;
  gate_decision    := v_decision;
  reason           := v_reason;
  return;
end;
$$;

comment on function public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean)
  is 'Composes and STAGES a template-bound, brand-voiced LINE outbound as a pending row: re-checks role + has_site_access(conversation.site_code) (blocking Branch_Roles on site_unresolved), runs the D2 autonomy gate (classify tier before decide; fail-safe block when approval unavailable), resolves+classifies the template by (template_key, vertical_context), substitutes only named slots, enforces the 200-char brand-voice ceiling, decides reply-vs-push (push fallback when the reply token is unavailable/expired), inserts one pending outbound row recording template_key+slot_values, writes one audit entry with tier+outcome, and performs NO outbound HTTP (Req 4.3, 4.5, 5.2-5.7, 9.1-9.4, 11.6, 12.5-12.7).';

-- ---------------------------------------------------------------------------
-- Grants. This is a caller-facing RPC (the only write path), so EXECUTE is
-- revoked from PUBLIC and granted to `authenticated`; the in-function role
-- re-check enforces authorization (Req 12.5, 12.6). The grant is applied only
-- where the role exists so the migration also applies cleanly in a plain
-- PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;
