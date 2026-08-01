-- Migration: LINE OA outbound atomic claim + safe result recording (Phase A1)
-- Fixes: PRD-LINE-OA B1-B5 / P0-1, P0-2, P0-3, P0-4, P0-6.
--
-- Scope is deliberately DB-only. This migration creates no cron schedule and
-- does not enable any live sender path.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Queue lease + bounded-attempt state.
-- ---------------------------------------------------------------------------
alter table public.line_oa_outbound_messages
  add column claimed_at timestamptz null,
  add column claimed_by text null,
  add column attempt_count int not null default 0;

comment on column public.line_oa_outbound_messages.claimed_at is
  'Lease timestamp set atomically by rpc_claim_line_outbound_batch; stale leases are reclaimable after the caller-supplied timeout.';
comment on column public.line_oa_outbound_messages.claimed_by is
  'Lease actor resolved inside rpc_claim_line_outbound_batch via resolve_actor(); never caller supplied.';
comment on column public.line_oa_outbound_messages.attempt_count is
  'Recorded failed delivery attempts. Attempts 1-4 return to pending; attempt 5 is terminal failed.';

-- ---------------------------------------------------------------------------
-- P0-1: atomically claim pending outbound rows. UPDATE + locked subselect makes
-- claim ownership durable after commit and SKIP LOCKED prevents overlapping
-- workers from receiving the same row.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_claim_line_outbound_batch(
  p_limit int,
  p_claim_timeout_seconds int default 300
)
returns table (
  id uuid,
  conversation_id uuid,
  send_type public.line_oa_send_type,
  template_key text,
  slot_values jsonb,
  target_type text,
  target_id text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit <= 0 then
    raise exception 'line_oa: claim limit must be a positive integer'
      using errcode = '22023';
  end if;
  if p_claim_timeout_seconds is null or p_claim_timeout_seconds <= 0 then
    raise exception 'line_oa: claim timeout must be a positive integer'
      using errcode = '22023';
  end if;

  return query
  update public.line_oa_outbound_messages o
     set claimed_at = now(),
         claimed_by = public.resolve_actor()
   where o.id in (
     select q.id
     from public.line_oa_outbound_messages q
     where q.status = 'pending'
       and (
         q.claimed_at is null
         or q.claimed_at < now() - make_interval(secs => p_claim_timeout_seconds)
       )
     order by q.id
     limit p_limit
     for update skip locked
   )
  returning
    o.id,
    o.conversation_id,
    o.send_type,
    o.template_key,
    o.slot_values,
    o.target_type,
    o.target_id;
end;
$$;

comment on function public.rpc_claim_line_outbound_batch(int, int) is
  'Atomically leases pending LINE OA outbound messages using UPDATE over an ordered FOR UPDATE SKIP LOCKED subselect. A lease older than p_claim_timeout_seconds is reclaimable. Returns only sender-required non-secret columns.';

-- Claim authority belongs only to the server-side sender.
revoke all on function public.rpc_claim_line_outbound_batch(int, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.rpc_claim_line_outbound_batch(int, int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.rpc_claim_line_outbound_batch(int, int) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.rpc_claim_line_outbound_batch(int, int) from service_role';
    execute 'grant execute on function public.rpc_claim_line_outbound_batch(int, int) to service_role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- P0-2/P0-3/P0-4/P0-6: replace the original record-result implementation while
-- preserving its exact (uuid, text, text) signature and guarded human path.
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
  v_reported_status         public.line_oa_outbound_status;
  v_stored_status           public.line_oa_outbound_status;
  v_actor                   text;
  v_conversation_id         uuid;
  v_target_type             text;
  v_target_id               text;
  v_authorization_site_code text;
  v_audit_site_code         text;
  v_vertical_context        text;
  v_current_status          public.line_oa_outbound_status;
  v_current_error_detail    text;
  v_current_sent_at         timestamptz;
  v_attempt_count           int;
  v_error_detail            text;
  v_sent_at                 timestamptz;
  v_is_service_context      boolean;
begin
  if p_outbound_id is null then
    raise exception 'line_oa: outbound_id is required to record a send result'
      using errcode = '22004';
  end if;

  if p_status is null then
    raise exception 'line_oa: unsupported send status (expected sent or failed)'
      using errcode = '22023';
  end if;

  begin
    v_reported_status := p_status::public.line_oa_outbound_status;
  exception
    when invalid_text_representation then
      raise exception 'line_oa: unsupported send status (expected sent or failed)'
        using errcode = '22023';
  end;

  if v_reported_status = 'pending' then
    raise exception 'line_oa: send result must be sent or failed, not pending'
      using errcode = '22023';
  end if;

  -- LEFT JOIN preserves group rows, whose conversation_id is intentionally NULL.
  -- The group audit vertical follows 0097/sender behavior: line_groups first,
  -- then the "monolith" fallback used for an unbound-group prompt.
  select
    o.conversation_id,
    o.target_type,
    o.target_id,
    o.status,
    o.error_detail,
    o.sent_at,
    o.attempt_count,
    case
      when o.target_type = 'group' then coalesce(g.vertical_context, 'monolith')
      else c.vertical_context
    end,
    case
      when o.target_type = 'group' then g.site_code
      else c.site_code
    end,
    case
      when o.target_type = 'group' then null
      else c.site_code
    end
  into
    v_conversation_id,
    v_target_type,
    v_target_id,
    v_current_status,
    v_current_error_detail,
    v_current_sent_at,
    v_attempt_count,
    v_vertical_context,
    v_authorization_site_code,
    v_audit_site_code
  from public.line_oa_outbound_messages o
  left join public.line_oa_conversations c
    on c.id = o.conversation_id
  left join public.line_groups g
    on o.target_type = 'group'
   and g.line_group_id = o.target_id
  where o.id = p_outbound_id
  for update of o;

  if not found then
    raise exception 'line_oa: outbound message not found to record a send result'
      using errcode = 'P0002';
  end if;

  -- SECURITY DEFINER changes current_user to the owner, so using the repository
  -- helper's current_user='postgres' fallback here would authorize every caller.
  -- Detect only the active invocation role. request.jwt.claims is a mutable GUC
  -- and must not be trusted as service authority. This is an additional server
  -- branch; human governance/site criteria remain unchanged.
  v_is_service_context :=
    coalesce(current_setting('role', true), '') = 'service_role';

  if v_is_service_context then
    v_actor := 'line-outbound-sender';
  else
    if not (
      public.is_governance_role()
      or public.has_site_access(v_authorization_site_code)
    ) then
      raise exception 'line_oa: permission denied to record send result for this conversation'
        using errcode = '42501';
    end if;
    v_actor := public.resolve_actor();
  end if;

  -- A locked terminal row is a successful no-op: single delivery wins and no
  -- second audit record is emitted. Authorization is checked first to avoid
  -- exposing terminal row state to an otherwise unauthorized caller.
  if v_current_status <> 'pending' then
    outbound_id := p_outbound_id;
    status := v_current_status::text;
    error_detail := v_current_error_detail;
    sent_at := v_current_sent_at;
    recorded := false;
    return;
  end if;

  if v_reported_status = 'failed' then
    v_error_detail := nullif(btrim(coalesce(p_error_detail, '')), '');
    if v_error_detail is null then
      v_error_detail := 'line_oa: send failed (no detail provided)';
    end if;

    -- Preserve the original secret scrub; retry wiring must never weaken it.
    v_error_detail := regexp_replace(
      v_error_detail,
      '(?i)bearer\s+[A-Za-z0-9._\-+/=]+',
      'Bearer [REDACTED]',
      'g'
    );
    v_error_detail := regexp_replace(
      v_error_detail,
      '[A-Za-z0-9._\-+/=]{40,}',
      '[REDACTED]',
      'g'
    );

    v_attempt_count := v_attempt_count + 1;
    if v_attempt_count < 5 then
      v_stored_status := 'pending';
    else
      v_stored_status := 'failed';
    end if;
    v_sent_at := null;

    update public.line_oa_outbound_messages o
       set status = v_stored_status,
           attempt_count = v_attempt_count,
           error_detail = v_error_detail,
           sent_by = v_actor,
           sent_at = null,
           claimed_at = null,
           claimed_by = null
     where o.id = p_outbound_id;
  else
    v_stored_status := 'sent';
    v_error_detail := null;
    v_sent_at := timezone('utc', now());

    update public.line_oa_outbound_messages o
       set status = 'sent',
           error_detail = null,
           sent_by = v_actor,
           sent_at = v_sent_at,
           claimed_at = null,
           claimed_by = null
     where o.id = p_outbound_id;
  end if;

  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'outbound_send_result_recorded',
    v_vertical_context,
    v_audit_site_code,
    format(
      'line_oa_outbound_message:%s|conversation:%s|status:%s',
      p_outbound_id,
      v_conversation_id,
      v_reported_status
    ),
    v_actor
  );

  outbound_id := p_outbound_id;
  status := v_stored_status::text;
  error_detail := v_error_detail;
  sent_at := v_sent_at;
  recorded := true;
  return;
end;
$$;

comment on function public.rpc_record_line_send_result(uuid, text, text) is
  'Records one authorized LINE outbound result. Service sender calls are accepted as line-outbound-sender; guarded human governance/site authorization remains unchanged. Group rows use line_groups vertical (monolith fallback) and NULL audit site. Only pending rows transition. Failures 1-4 re-pend and failure 5 is terminal; every recorded attempt is audited and claim fields are cleared.';

-- Keep the original guarded authenticated path and add the sender service role.
-- Neither anon nor PUBLIC receives execution authority.
revoke all on function public.rpc_record_line_send_result(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.rpc_record_line_send_result(uuid, text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.rpc_record_line_send_result(uuid, text, text) from authenticated';
    execute 'grant execute on function public.rpc_record_line_send_result(uuid, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.rpc_record_line_send_result(uuid, text, text) from service_role';
    execute 'grant execute on function public.rpc_record_line_send_result(uuid, text, text) to service_role';
  end if;
end;
$$;

set check_function_bodies = on;
