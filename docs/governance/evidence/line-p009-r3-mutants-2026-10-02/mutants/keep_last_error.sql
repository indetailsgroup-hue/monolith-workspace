-- Migration: 0200_line_inbound_handler_retry
-- P0-9 / B8: a LINE group event whose handler fails is no longer counted as
-- processed or lost. fn_line_handle_group_event catches its own errors and
-- returns 'handler_error:...'; until now rpc_ingest_line_webhook treated that
-- as success (inbound row + group_event audit + events_processed), so a LINE
-- redelivery was then dropped as a duplicate (0097:281, 0097:437-438,
-- 0097:454, 0097:429-433).
--
-- Change:
--   * line_oa_inbound_retry: our own retry state for failed group events.
--   * rpc_ingest_line_webhook (body from 0097; only the group branch changes,
--     including a timezone-safe received_at for group rows):
--       - handler_error -> a pending retry row (attempt 1, due after 1 s) and a
--         group_event_retry_queued audit entry; no inbound row, no
--         group_event audit, not counted in any events_* counter;
--       - a redelivery of an event that already has a retry row is a duplicate.
--   * rpc_line_inbound_retry_sweep(p_limit): service-only; claims due rows
--     with FOR UPDATE SKIP LOCKED and re-runs the handler:
--       - success -> the same inbound row and group_event audit as a first
--         ingest (skip-list results store neither, PDPA v1), row succeeded and
--         its payload copy cleared;
--       - already ingested by another delivery -> closed as already_ingested
--         without keeping any handler side effect;
--       - failure (handler_error, or any other error the row raises) -> that
--         row's work is rolled back, attempt + 1, backoff 1 s * 2^(attempt - 1)
--         capped at 300 s (as 0196); attempt 5 -> dead_letter +
--         group_event_dead_letter audit (reason retry_bound), payload kept for
--         human handling; the rest of the batch still commits;
--       - queued for more than 10 minutes and not ingested by another
--         delivery -> dead_letter (reason expired, last error kept) without
--         running the handler, so a stale command (for example a '#ปัญหา'
--         that staff already re-sent) is never replayed late. Ordering
--         within the window is not enforced (see PRD P0-9 open items).
--   * Privileges are granted explicitly (service_role: SELECT on the table,
--     EXECUTE on the sweep) and verified at the end: if any role's effective
--     privilege differs from the target, the migration raises 42501 and rolls
--     back (fail closed, as 0198/0199).
--
-- Not changed: the 1:1 path, the handler, the rpc_ingest_line_webhook
-- signature and its 0199 EXECUTE matrix. No cron is added: nothing schedules
-- the sweep, so activating retries is a separate owner decision (as B6).
-- Not covered: query_canceled (statement_timeout) still aborts a whole sweep
-- call; retention of dead-letter payloads; production verification.

create table if not exists public.line_oa_inbound_retry (
  id               uuid primary key default gen_random_uuid(),
  webhook_event_id text not null unique,
  vertical_context text not null,
  line_group_id    text not null,
  payload          jsonb not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'succeeded', 'dead_letter')),
  attempt_count    integer not null default 1 check (attempt_count between 1 and 5),
  next_attempt_at  timestamptz,
  last_error       text,
  last_result      text,
  created_at       timestamptz not null default now(),
  constraint line_oa_inbound_retry_due_shape
    check ((status = 'pending') = (next_attempt_at is not null))
);

create index if not exists line_oa_inbound_retry_due_idx
  on public.line_oa_inbound_retry (next_attempt_at)
  where status = 'pending';

alter table public.line_oa_inbound_retry enable row level security;

-- Only the DEFINER RPCs below write this table. Platform default privileges
-- grant ALL to the client roles, so remove them (0005 role-exists pattern);
-- service_role gets SELECT only, so operators can read dead letters.
revoke all on public.line_oa_inbound_retry from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.line_oa_inbound_retry from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.line_oa_inbound_retry to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_ingest_line_webhook: body from 0097 with the group branch changed only.
-- CREATE OR REPLACE keeps the owner and the 0199 EXECUTE matrix (f/f/t).
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
  -- 1.8b group branch (0097)
  v_group_id             text;
  v_group_result         text;
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

    -- -----------------------------------------------------------------------
    -- 1.8b (0097): group events แยกเส้นทางจาก 1:1 conversation ทั้งหมด
    -- (เดิม: event ไม่มี userId ถูก skip — join/memberJoined/memberLeft ของกลุ่มไม่มี userId)
    -- PDPA v1: เก็บ inbound row เฉพาะ event ที่ระบบทำงานด้วย (join/bind/member/รูป/#ปัญหา)
    -- แชทธรรมดาไม่เก็บ — ไม่มี side effect จึง redeliver ได้ปลอดภัยโดยไม่มีแถว idempotency
    -- -----------------------------------------------------------------------
    v_group_id := v_event #>> '{source,groupId}';
    if v_group_id is not null then
      if v_webhook_event_id is null or length(btrim(v_webhook_event_id)) = 0 then
        events_skipped := events_skipped + 1;
        continue;
      end if;
      -- P0-9 (0200): an event already queued for retry is owned by the queue.
      if exists (select 1 from public.line_oa_inbound_messages m
                 where m.webhook_event_id = v_webhook_event_id)
         or exists (select 1 from public.line_oa_inbound_retry q
                    where q.webhook_event_id = v_webhook_event_id) then
        events_duplicate := events_duplicate + 1;
        continue;
      end if;
      begin
        v_group_result := public.fn_line_handle_group_event(v_event, v_vertical_context, v_actor);

        if v_group_result like 'handler_error:%' then
          -- P0-9 (0200): the handler rolled back its own work. Queue the event
          -- in our own retry state; no inbound row (so dedupe cannot swallow
          -- it), no group_event audit, not counted as processed.
          insert into public.line_oa_inbound_retry (
            webhook_event_id, vertical_context, line_group_id, payload, next_attempt_at, last_error
          )
          values (
            v_webhook_event_id, v_vertical_context, v_group_id, v_event,
            now() + make_interval(secs => 1), left(v_group_result, 500)
          );

          insert into public.line_oa_audit_log (
            event_type, vertical_context, site_code, entity_ref, performed_by
          )
          values (
            'group_event_retry_queued', v_vertical_context, null,
            format('webhook_event_id:%s|line_group_id:%s|attempt:1', v_webhook_event_id, v_group_id),
            v_actor
          );
        elsif v_group_result in ('plain_ignored', 'plain_unbound_ignored', 'plain_archived_ignored',
                              'members_ignored_unbound', 'ignored_event_type', 'issue_empty_ignored') then
          events_skipped := events_skipped + 1;
        else
          insert into public.line_oa_inbound_messages (
            conversation_id, webhook_event_id, payload, received_at, source_type, line_group_id
          )
          values (null, v_webhook_event_id, v_event, now(), 'group', v_group_id);

          insert into public.line_oa_audit_log (
            event_type, vertical_context, site_code, entity_ref, performed_by
          )
          values (
            'group_event', v_vertical_context, null,
            format('webhook_event_id:%s|line_group_id:%s|result:%s', v_webhook_event_id, v_group_id, v_group_result),
            v_actor
          );
          events_processed := events_processed + 1;
        end if;
      exception
        when unique_violation then
          events_duplicate := events_duplicate + 1;
      end;
      continue;
    end if;

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

comment on function public.rpc_ingest_line_webhook(text, text, text) is
  'Single inbound write path (00022 + 0097 + 0200): verify signature → idempotent per webhook_event_id → '
  '1:1 events เข้า conversation flow เดิม; group events เข้า fn_line_handle_group_event '
  '(join/#ผูก/member sync/#ปัญหา/รูป — plain chat ไม่เก็บตาม PDPA v1); '
  'handler_error → line_oa_inbound_retry (P0-9) ไม่นับ processed';

-- ---------------------------------------------------------------------------
-- rpc_line_inbound_retry_sweep: re-run due group events (service only).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_line_inbound_retry_sweep(
  p_limit integer default 20,
  out claimed integer,
  out succeeded integer,
  out rescheduled integer,
  out dead_lettered integer
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   text;
  v_row     public.line_oa_inbound_retry%rowtype;
  v_result  text;
  v_attempt integer;
  v_ingested boolean;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = 'invalid_parameter_value';
  end if;

  claimed       := 0;
  succeeded     := 0;
  rescheduled   := 0;
  dead_lettered := 0;
  v_actor := public.resolve_actor();

  for v_row in
    select * from public.line_oa_inbound_retry q
     where q.status = 'pending' and q.next_attempt_at <= now()
     order by q.next_attempt_at, q.id
     limit p_limit
     for update skip locked
  loop
    claimed := claimed + 1;
    v_ingested := exists (select 1 from public.line_oa_inbound_messages m
                          where m.webhook_event_id = v_row.webhook_event_id);

    -- A stale row is never replayed: staff may already have re-sent the
    -- command, so running it now could repeat a customer-visible action. An
    -- event another delivery already ingested is closed below instead.
    if not v_ingested and v_row.created_at < now() - interval '10 minutes' then
      update public.line_oa_inbound_retry
         set status = 'dead_letter', next_attempt_at = null,
             last_error = 'expired: queued for more than 10 minutes; last error: ' || coalesce(v_row.last_error, 'none')
       where id = v_row.id;

      insert into public.line_oa_audit_log (
        event_type, vertical_context, site_code, entity_ref, performed_by
      )
      values (
        'group_event_dead_letter', v_row.vertical_context, null,
        format('webhook_event_id:%s|line_group_id:%s|attempt:%s|reason:expired',
               v_row.webhook_event_id, v_row.line_group_id, v_row.attempt_count),
        v_actor
      );
      dead_lettered := dead_lettered + 1;
      continue;
    end if;

    -- One savepoint per row: whatever this row raises, its work (including the
    -- handler's side effects) is rolled back and only this row fails. If
    -- another delivery ingested the event first, the row is closed.
    begin
      if v_ingested then
        v_result := 'already_ingested';
      else
        v_result := public.fn_line_handle_group_event(v_row.payload, v_row.vertical_context, v_actor);

        if v_result not like 'handler_error:%'
           and v_result not in ('plain_ignored', 'plain_unbound_ignored', 'plain_archived_ignored',
                                'members_ignored_unbound', 'ignored_event_type', 'issue_empty_ignored') then
          -- Same success state as a first-time ingest (0097), with a
          -- timezone-safe received_at (as 0195/0196).
          insert into public.line_oa_inbound_messages (
            conversation_id, webhook_event_id, payload, received_at, source_type, line_group_id
          )
          values (null, v_row.webhook_event_id, v_row.payload, now(), 'group', v_row.line_group_id);

          insert into public.line_oa_audit_log (
            event_type, vertical_context, site_code, entity_ref, performed_by
          )
          values (
            'group_event', v_row.vertical_context, null,
            format('webhook_event_id:%s|line_group_id:%s|result:%s', v_row.webhook_event_id, v_row.line_group_id, v_result),
            v_actor
          );
        end if;
      end if;
    exception
      when unique_violation then
        v_result := 'already_ingested';
      when others then
        v_result := 'sweep_error:' || sqlstate || ' ' || sqlerrm;
    end;

    if v_result like 'handler_error:%' or v_result like 'sweep_error:%' then
      v_attempt := v_row.attempt_count + 1;
      if v_attempt >= 5 then
        update public.line_oa_inbound_retry
           set status = 'dead_letter', attempt_count = least(v_attempt, 5),
               next_attempt_at = null, last_error = left(v_result, 500)
         where id = v_row.id;

        insert into public.line_oa_audit_log (
          event_type, vertical_context, site_code, entity_ref, performed_by
        )
        values (
          'group_event_dead_letter', v_row.vertical_context, null,
          format('webhook_event_id:%s|line_group_id:%s|attempt:%s|reason:retry_bound',
                 v_row.webhook_event_id, v_row.line_group_id, least(v_attempt, 5)),
          v_actor
        );
        dead_lettered := dead_lettered + 1;
      else
        -- Backoff as 0196: 1 s * 2^(attempt - 1), capped at five minutes.
        update public.line_oa_inbound_retry
           set attempt_count = v_attempt,
               next_attempt_at = now() + make_interval(secs => least(300.0, power(2.0, v_attempt - 1))),
               last_error = left(v_result, 500)
         where id = v_row.id;
        rescheduled := rescheduled + 1;
      end if;
    else
      -- The inbound row keeps the payload; clear the retry copy and the old
      -- error text, which can quote input values (PDPA v1).
      update public.line_oa_inbound_retry
         set status = 'succeeded', next_attempt_at = null,
             last_result = v_result, payload = '{}'::jsonb
       where id = v_row.id;
      succeeded := succeeded + 1;
    end if;
  end loop;
end;
$$;

comment on function public.rpc_line_inbound_retry_sweep(integer) is
  'P0-9 (0200): re-run due line_oa_inbound_retry rows; service_role only; not scheduled (no cron)';

-- Service only: platform default privileges grant EXECUTE to the client roles.
revoke execute on function public.rpc_line_inbound_retry_sweep(integer) from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function public.rpc_line_inbound_retry_sweep(integer) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rpc_line_inbound_retry_sweep(integer) to service_role;
  end if;
end;
$$;

-- Fail closed (as 0198/0199), and last in this file: if any role's effective
-- privilege on the new objects differs from the target, in either direction
-- (for example one inherited through role membership or granted by another
-- grantor), raise 42501 so the whole migration rolls back.
--   line_oa_inbound_retry: anon/authenticated nothing; service_role SELECT only.
--   rpc_line_inbound_retry_sweep: EXECUTE for service_role only; none for PUBLIC.
do $$
declare
  v_table    constant regclass := 'public.line_oa_inbound_retry'::regclass;
  v_sweep    constant regprocedure := 'public.rpc_line_inbound_retry_sweep(integer)'::regprocedure;
  v_privs    text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  v_problems text[] := '{}';
  r text;
  p text;
begin
  if current_setting('server_version_num')::int >= 170000 then
    v_privs := v_privs || 'MAINTAIN'::text;
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    continue when not exists (select 1 from pg_roles where rolname = r);
    foreach p in array v_privs loop
      if has_table_privilege(r, v_table, p) <> (r = 'service_role' and p = 'SELECT') then
        v_problems := v_problems || format('%s:%s line_oa_inbound_retry', r, lower(p));
      end if;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(r, v_table, p) and not (r = 'service_role' and p = 'SELECT') then
        v_problems := v_problems || format('%s:column %s line_oa_inbound_retry', r, lower(p));
      end if;
    end loop;
    if has_function_privilege(r, v_sweep, 'EXECUTE') <> (r = 'service_role') then
      v_problems := v_problems || format('%s:execute rpc_line_inbound_retry_sweep', r);
    end if;
  end loop;

  if exists (select 1 from pg_proc pr, aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
              where pr.oid = v_sweep and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    v_problems := v_problems || 'public:execute rpc_line_inbound_retry_sweep'::text;
  end if;

  if cardinality(v_problems) > 0 then
    raise exception 'P0-9: privileges differ from target: %', array_to_string(v_problems, ', ')
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
