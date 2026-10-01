-- pgTAP DB-level invariants - P0-9 / B8: a LINE group event whose handler fails
-- (fn_line_handle_group_event returns 'handler_error:...') must not be counted
-- as processed, must not leave an inbound row that makes a LINE redelivery look
-- like a duplicate, and must enter an internal retry queue that is reprocessed
-- until success or the bound, then dead-lettered with an audit entry. No
-- reliance on LINE redelivery and no new cron.
--
-- Run inside a rollback wrapper against a migrated throwaway database:
--   psql "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/tests/line_inbound_handler_retry.sql
--
-- Before 0200 (RED) every assertion fails except the regression controls
-- 7, 33, 34 and 35, which hold before and after 0200. After 0200 (GREEN) every
-- assertion passes. The handler failure is injected by a test-only trigger
-- created inside this transaction. All data is synthetic and rolled back; no
-- HTTP call and no LINE delivery happens. now() is fixed for the whole
-- transaction, so backoff deadlines are exact. This file always issues the
-- final ROLLBACK.

\set ON_ERROR_STOP on

create extension if not exists pgtap;
select plan(35);

-- ---------------------------------------------------------------------------
-- Helpers. Every call that may touch an object 0200 creates goes through an
-- exception-safe helper, so RED reports failed assertions instead of aborting.
--   p009_call_as: runs one statement as a role with claims, keeps its effects.
--   p009_ingest:  signs a body with the fixture secret, ingests as service_role.
--   p009_sweep:   runs rpc_line_inbound_retry_sweep as a role.
--   p009_q:       runs a scalar query as the owner, or returns the error.
--   p009_state:   status|attempt_count|next_attempt_at - now()|last_result.
--   p009_due:     makes one pending retry row due now.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.p009_call_as(p_role text, p_claims jsonb, p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_value jsonb;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  begin
    execute format('set local role %I', p_role);
    execute p_sql into v_value;
    execute 'reset role';
    return jsonb_build_object('ok', true, 'value', v_value);
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    return jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'error', left(sqlerrm, 200));
  end;
end;
$$;

create or replace function pg_temp.p009_ingest(p_body text)
returns jsonb
language sql
as $$
  select pg_temp.p009_call_as('service_role', '{"role":"service_role"}'::jsonb, format(
    $q$select to_jsonb(r) from public.rpc_ingest_line_webhook(%L, %L, 'p009-channel') r$q$,
    p_body,
    encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to('p009 synthetic fixture value', 'UTF8'), 'sha256'), 'base64')))
$$;

create or replace function pg_temp.p009_ingest_expect(p_processed int, p_duplicate int, p_skipped int)
returns jsonb
language sql
as $$
  select jsonb_build_object('ok', true, 'value', jsonb_build_object(
    'accepted', true, 'reason', 'accepted',
    'events_processed', p_processed, 'events_duplicate', p_duplicate, 'events_skipped', p_skipped))
$$;

create or replace function pg_temp.p009_sweep(p_role text default 'service_role', p_limit int default 20)
returns jsonb
language sql
as $$
  select pg_temp.p009_call_as(p_role, jsonb_build_object('role', p_role),
    format('select to_jsonb(r) from public.rpc_line_inbound_retry_sweep(%s) r', p_limit))
$$;

create or replace function pg_temp.p009_sweep_expect(p_claimed int, p_succeeded int, p_rescheduled int, p_dead int)
returns jsonb
language sql
as $$
  select jsonb_build_object('ok', true, 'value', jsonb_build_object(
    'claimed', p_claimed, 'succeeded', p_succeeded, 'rescheduled', p_rescheduled, 'dead_lettered', p_dead))
$$;

create or replace function pg_temp.p009_q(p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
  execute p_sql into v_value;
  return coalesce(v_value, '<null>');
exception when others then
  return format('error %s: %s', sqlstate, left(sqlerrm, 120));
end;
$$;

create or replace function pg_temp.p009_state(p_event text)
returns text
language sql
as $$
  select pg_temp.p009_q(format(
    $q$select status || '|' || attempt_count || '|' || coalesce((next_attempt_at - now())::text, 'null')
              || '|' || coalesce(last_result, '')
         from public.line_oa_inbound_retry where webhook_event_id = %L$q$, p_event))
$$;

create or replace function pg_temp.p009_due(p_event text)
returns text
language sql
as $$
  select pg_temp.p009_q(format(
    $q$with u as (update public.line_oa_inbound_retry set next_attempt_at = now() - interval '1 second'
                   where webhook_event_id = %L and status = 'pending' returning 1)
       select count(*)::text from u$q$, p_event))
$$;

create or replace function pg_temp.p009_join_body(p_event text, p_group text)
returns text
language sql
as $$
  select jsonb_build_object('destination', 'p009', 'events', jsonb_build_array(jsonb_build_object(
    'type', 'join', 'webhookEventId', p_event, 'timestamp', 1759300000000, 'mode', 'active',
    'source', jsonb_build_object('type', 'group', 'groupId', p_group))))::text
$$;

create or replace function pg_temp.p009_text_event(p_event text, p_group text, p_text text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'type', 'message', 'webhookEventId', p_event, 'timestamp', 1759300000000, 'mode', 'active',
    'source', jsonb_build_object('type', 'group', 'groupId', p_group, 'userId', 'U-P009-MEMBER'),
    'message', jsonb_build_object('type', 'text', 'id', p_event || '-msg', 'text', p_text))
$$;

create or replace function pg_temp.p009_rights(p_sig text)
returns text
language sql
as $$
  select coalesce(string_agg(case when has_function_privilege(v.r, to_regprocedure(p_sig), 'EXECUTE')
                                  then 't' else 'f' end, '/' order by v.o), '<missing>')
    from (values (1, 'anon'), (2, 'authenticated'), (3, 'service_role')) v(o, r)
   where to_regprocedure(p_sig) is not null
$$;

create or replace function pg_temp.p009_bind_prompts(p_group text)
returns bigint
language sql
as $$
  select count(*) from public.line_oa_outbound_messages
   where template_key = 'tpl_inst_bind_prompt' and target_type = 'group' and target_id = p_group
$$;

-- ---------------------------------------------------------------------------
-- Synthetic fixtures and test-only fault injection (rolled back).
--   p009.fault = 'on'      -> any outbound insert raises, so the join handler
--                             catches it and returns 'handler_error:...'.
--   p009.uv_event = <id>   -> an inbound insert for that event raises
--                             unique_violation, as a concurrent delivery would.
-- ---------------------------------------------------------------------------
select vault.create_secret('p009 synthetic fixture value', 'p009_test_channel_secret_ref');

insert into public.line_oa_channels (channel_identifier, vertical_context, channel_secret_ref, channel_access_token_ref)
values ('p009-channel', 'p009', 'p009_test_channel_secret_ref', 'p009_test_token_ref');

create function public.p009_test_fault()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'line_oa_outbound_messages' then
    if current_setting('p009.fault', true) = 'on' then
      raise exception 'p009 injected handler fault';
    end if;
  elsif new.webhook_event_id = current_setting('p009.uv_event', true) then
    raise exception using errcode = 'unique_violation', message = 'p009 injected concurrent inbound insert';
  end if;
  return new;
end;
$$;

create trigger p009_test_fault before insert on public.line_oa_outbound_messages
  for each row execute function public.p009_test_fault();
create trigger p009_test_fault before insert on public.line_oa_inbound_messages
  for each row execute function public.p009_test_fault();

create temporary table p009_ctx (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- 1-7: B8 — a failed handler is queued, not counted and not deduplicated away.
-- ---------------------------------------------------------------------------
select set_config('p009.fault', 'on', true);
insert into p009_ctx select 'ingest-1', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-1', 'C-P009-G1'));

select is(
  (select v from p009_ctx where k = 'ingest-1'),
  pg_temp.p009_ingest_expect(0, 0, 0),
  'a handler failure is not counted as processed (nor as duplicate or skipped)'
);
select ok(
  not exists (select 1 from public.line_oa_inbound_messages where webhook_event_id = 'p009-evt-join-1'),
  'a failed event leaves no inbound row, so a LINE redelivery is not swallowed by dedupe'
);
select ok(
  not exists (select 1 from public.line_oa_audit_log
               where event_type = 'group_event' and entity_ref like 'webhook_event_id:p009-evt-join-1|%'),
  'a failed event writes no group_event success audit'
);
select is(
  pg_temp.p009_state('p009-evt-join-1'),
  'pending|1|00:00:01|',
  'the failed event enters the internal retry queue: pending, attempt 1, due after 1 s'
);
select is(
  pg_temp.p009_q($q$select (last_error like '%p009 injected handler fault%')::text
                       from public.line_oa_inbound_retry where webhook_event_id = 'p009-evt-join-1'$q$),
  'true',
  'the retry row keeps the handler error'
);
select is(
  pg_temp.p009_q($q$select count(*)::text from public.line_oa_audit_log
                     where event_type = 'group_event_retry_queued'
                       and entity_ref = 'webhook_event_id:p009-evt-join-1|line_group_id:C-P009-G1|attempt:1'$q$),
  '1',
  'queueing the failed event writes exactly one group_event_retry_queued audit entry'
);
select is(
  pg_temp.p009_bind_prompts('C-P009-G1'),
  0::bigint,
  'control: the failed handler left no partial side effect (no bind prompt queued)'
);

-- ---------------------------------------------------------------------------
-- 8: a LINE redelivery while the event is queued is acknowledged as a
-- duplicate and does not run the handler again or touch the queued row.
-- ---------------------------------------------------------------------------
insert into p009_ctx select 'ingest-1-redelivery', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-1', 'C-P009-G1'));

select is(
  jsonb_build_object('result', (select v from p009_ctx where k = 'ingest-1-redelivery'),
                     'state', pg_temp.p009_state('p009-evt-join-1')),
  jsonb_build_object('result', pg_temp.p009_ingest_expect(0, 1, 0), 'state', 'pending|1|00:00:01|'),
  'a redelivery of a queued event is a duplicate and leaves the queued row unchanged'
);

-- ---------------------------------------------------------------------------
-- 9-11: the sweep reprocesses a due row; a repeated failure reschedules it
-- with backoff and still writes no success state.
-- ---------------------------------------------------------------------------
select pg_temp.p009_due('p009-evt-join-1');
insert into p009_ctx select 'sweep-1', pg_temp.p009_sweep();

select is(
  (select v from p009_ctx where k = 'sweep-1'),
  pg_temp.p009_sweep_expect(1, 0, 1, 0),
  'the sweep (as service_role) claims the due row and reschedules it after another failure'
);
select is(
  pg_temp.p009_state('p009-evt-join-1'),
  'pending|2|00:00:02|',
  'a second failure leaves the row pending at attempt 2 with a 2 s backoff'
);
select ok(
  not exists (select 1 from public.line_oa_inbound_messages where webhook_event_id = 'p009-evt-join-1')
  and pg_temp.p009_bind_prompts('C-P009-G1') = 0
  and (select v from p009_ctx where k = 'sweep-1') ->> 'ok' = 'true',
  'a failed retry writes no inbound row and no handler side effect'
);

-- ---------------------------------------------------------------------------
-- 12: rows that are not yet due are not claimed.
-- ---------------------------------------------------------------------------
insert into p009_ctx select 'sweep-not-due', pg_temp.p009_sweep();

select is(
  (select v from p009_ctx where k = 'sweep-not-due'),
  pg_temp.p009_sweep_expect(0, 0, 0, 0),
  'a sweep claims nothing while the only pending row is not yet due'
);

-- ---------------------------------------------------------------------------
-- 13-19: once the fault clears, the retry succeeds exactly once, records the
-- same success state as a first-time ingest, and later redeliveries dedupe.
-- ---------------------------------------------------------------------------
select set_config('p009.fault', 'off', true);
select pg_temp.p009_due('p009-evt-join-1');
insert into p009_ctx select 'sweep-2', pg_temp.p009_sweep();

select is(
  (select v from p009_ctx where k = 'sweep-2'),
  pg_temp.p009_sweep_expect(1, 1, 0, 0),
  'the sweep succeeds once the handler stops failing'
);
select is(
  pg_temp.p009_state('p009-evt-join-1'),
  'succeeded|2|null|join_prompted',
  'the retry row is succeeded with the handler result and no next attempt'
);
select ok(
  exists (select 1 from public.line_oa_inbound_messages
           where webhook_event_id = 'p009-evt-join-1' and source_type = 'group'
             and line_group_id = 'C-P009-G1' and conversation_id is null
             and payload = pg_temp.p009_join_body('p009-evt-join-1', 'C-P009-G1')::jsonb #> '{events,0}')
  and pg_temp.p009_state('p009-evt-join-1') like 'succeeded|%',
  'the successful retry writes the group inbound row with the full event payload'
);
select is(
  pg_temp.p009_bind_prompts('C-P009-G1'),
  1::bigint,
  'the successful retry runs the handler side effect exactly once (one bind prompt)'
);
select is(
  (select count(*) from public.line_oa_audit_log
    where event_type = 'group_event'
      and entity_ref = 'webhook_event_id:p009-evt-join-1|line_group_id:C-P009-G1|result:join_prompted'),
  1::bigint,
  'the successful retry writes exactly one group_event audit entry in the ingest format'
);
select is(
  pg_temp.p009_q($q$select payload::text from public.line_oa_inbound_retry where webhook_event_id = 'p009-evt-join-1'$q$),
  '{}',
  'the payload copy in the retry row is cleared after success (the inbound row keeps it)'
);

insert into p009_ctx select 'ingest-1-after-success', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-1', 'C-P009-G1'));

select ok(
  (select v from p009_ctx where k = 'ingest-1-after-success') = pg_temp.p009_ingest_expect(0, 1, 0)
  and pg_temp.p009_bind_prompts('C-P009-G1') = 1,
  'a redelivery after the successful retry is a duplicate with no second side effect'
);

-- ---------------------------------------------------------------------------
-- 20-24: an event that keeps failing is dead-lettered at attempt 5 with an
-- audit entry and is never claimed again.
-- ---------------------------------------------------------------------------
select set_config('p009.fault', 'on', true);
insert into p009_ctx select 'ingest-2', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-2', 'C-P009-G2'));
create temporary table p009_runs (n int primary key, v jsonb, state text);

select pg_temp.p009_due('p009-evt-join-2');
insert into p009_runs select 2, pg_temp.p009_sweep(), null;
update p009_runs set state = pg_temp.p009_state('p009-evt-join-2') where n = 2;
select pg_temp.p009_due('p009-evt-join-2');
insert into p009_runs select 3, pg_temp.p009_sweep(), null;
update p009_runs set state = pg_temp.p009_state('p009-evt-join-2') where n = 3;
select pg_temp.p009_due('p009-evt-join-2');
insert into p009_runs select 4, pg_temp.p009_sweep(), null;
update p009_runs set state = pg_temp.p009_state('p009-evt-join-2') where n = 4;
select pg_temp.p009_due('p009-evt-join-2');
insert into p009_runs select 5, pg_temp.p009_sweep(), null;
update p009_runs set state = pg_temp.p009_state('p009-evt-join-2') where n = 5;

select is(
  (select string_agg(n || '=' || coalesce(v #>> '{value,rescheduled}', 'x') || '/' || coalesce(v #>> '{value,dead_lettered}', 'x')
                     || ' ' || state, '; ' order by n) from p009_runs),
  '2=1/0 pending|2|00:00:02|; 3=1/0 pending|3|00:00:04|; 4=1/0 pending|4|00:00:08|; 5=0/1 dead_letter|5|null|',
  'attempts 2-4 back off 2 s, 4 s, 8 s and attempt 5 is dead-lettered'
);
select is(
  pg_temp.p009_q($q$select count(*)::text from public.line_oa_audit_log
                     where event_type = 'group_event_dead_letter'
                       and entity_ref = 'webhook_event_id:p009-evt-join-2|line_group_id:C-P009-G2|attempt:5'$q$),
  '1',
  'dead-lettering writes exactly one group_event_dead_letter audit entry'
);
select is(
  pg_temp.p009_q($q$select payload #>> '{source,groupId}' from public.line_oa_inbound_retry where webhook_event_id = 'p009-evt-join-2'$q$),
  'C-P009-G2',
  'a dead-lettered row keeps its payload for human handling'
);

select pg_temp.p009_due('p009-evt-join-2');
insert into p009_ctx select 'sweep-after-dead', pg_temp.p009_sweep();

select is(
  jsonb_build_object('sweep', (select v from p009_ctx where k = 'sweep-after-dead'),
                     'state', pg_temp.p009_state('p009-evt-join-2')),
  jsonb_build_object('sweep', pg_temp.p009_sweep_expect(0, 0, 0, 0), 'state', 'dead_letter|5|null|'),
  'a dead-lettered row is never claimed again'
);
select ok(
  not exists (select 1 from public.line_oa_inbound_messages where webhook_event_id = 'p009-evt-join-2')
  and pg_temp.p009_bind_prompts('C-P009-G2') = 0
  and (select v from p009_ctx where k = 'ingest-2') = pg_temp.p009_ingest_expect(0, 0, 0),
  'a dead-lettered event was never counted as processed and left no inbound row or side effect'
);

-- ---------------------------------------------------------------------------
-- 25: a retry whose handler result is on the ingest skip list keeps PDPA v1:
-- no inbound row, no success audit, payload cleared.
-- ---------------------------------------------------------------------------
select set_config('p009.fault', 'off', true);
insert into p009_ctx select 'fixture-3', to_jsonb(pg_temp.p009_q(format(
  $q$insert into public.line_oa_inbound_retry (webhook_event_id, vertical_context, line_group_id, payload, next_attempt_at)
     values ('p009-evt-plain-3', 'p009', 'C-P009-G3', %L::jsonb, now() - interval '1 second') returning 'inserted'$q$,
  pg_temp.p009_text_event('p009-evt-plain-3', 'C-P009-G3', 'p009 plain chat'))));
insert into p009_ctx select 'sweep-3', pg_temp.p009_sweep();

select is(
  jsonb_build_object(
    'sweep', (select v from p009_ctx where k = 'sweep-3'),
    'state', pg_temp.p009_state('p009-evt-plain-3'),
    'payload', pg_temp.p009_q($q$select payload::text from public.line_oa_inbound_retry where webhook_event_id = 'p009-evt-plain-3'$q$),
    'inbound', exists (select 1 from public.line_oa_inbound_messages where webhook_event_id = 'p009-evt-plain-3'),
    'audit', exists (select 1 from public.line_oa_audit_log where entity_ref like 'webhook_event_id:p009-evt-plain-3|%')),
  jsonb_build_object(
    'sweep', pg_temp.p009_sweep_expect(1, 1, 0, 0),
    'state', 'succeeded|1|null|plain_unbound_ignored',
    'payload', '{}',
    'inbound', false,
    'audit', false),
  'a skip-list result on retry stores no inbound row or audit and clears the payload'
);

-- ---------------------------------------------------------------------------
-- 26-27: an event already ingested by another delivery is closed without
-- running the handler again (sequential), or with the handler's side effects
-- rolled back (concurrent unique_violation on the inbound insert).
-- ---------------------------------------------------------------------------
select set_config('p009.fault', 'on', true);
insert into p009_ctx select 'ingest-4', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-4', 'C-P009-G4'));
insert into public.line_oa_inbound_messages (conversation_id, webhook_event_id, payload, source_type, line_group_id)
values (null, 'p009-evt-join-4', '{}'::jsonb, 'group', 'C-P009-G4')
on conflict (webhook_event_id) do nothing;
select set_config('p009.fault', 'off', true);
select pg_temp.p009_due('p009-evt-join-4');
insert into p009_ctx select 'sweep-4', pg_temp.p009_sweep();

select is(
  jsonb_build_object('sweep', (select v from p009_ctx where k = 'sweep-4'),
                     'state', pg_temp.p009_state('p009-evt-join-4'),
                     'prompts', pg_temp.p009_bind_prompts('C-P009-G4')),
  jsonb_build_object('sweep', pg_temp.p009_sweep_expect(1, 1, 0, 0),
                     'state', 'succeeded|1|null|already_ingested', 'prompts', 0),
  'a queued event that another delivery already ingested is closed without running the handler'
);

select set_config('p009.fault', 'on', true);
insert into p009_ctx select 'ingest-5', pg_temp.p009_ingest(pg_temp.p009_join_body('p009-evt-join-5', 'C-P009-G5'));
select set_config('p009.fault', 'off', true);
select set_config('p009.uv_event', 'p009-evt-join-5', true);
select pg_temp.p009_due('p009-evt-join-5');
insert into p009_ctx select 'sweep-5', pg_temp.p009_sweep();
select set_config('p009.uv_event', '', true);

select is(
  jsonb_build_object('sweep', (select v from p009_ctx where k = 'sweep-5'),
                     'state', pg_temp.p009_state('p009-evt-join-5'),
                     'prompts', pg_temp.p009_bind_prompts('C-P009-G5')),
  jsonb_build_object('sweep', pg_temp.p009_sweep_expect(1, 1, 0, 0),
                     'state', 'succeeded|1|null|already_ingested', 'prompts', 0),
  'a concurrent inbound insert during a retry rolls back the handler side effect and closes the row'
);

-- ---------------------------------------------------------------------------
-- 28: events the handler deliberately ignores are still skipped, not queued.
-- ---------------------------------------------------------------------------
insert into p009_ctx select 'ingest-6', pg_temp.p009_ingest(jsonb_build_object('destination', 'p009',
  'events', jsonb_build_array(pg_temp.p009_text_event('p009-evt-plain-6', 'C-P009-G6', 'p009 plain chat')))::text);

select is(
  jsonb_build_object('result', (select v from p009_ctx where k = 'ingest-6'),
                     'queued', pg_temp.p009_q($q$select count(*)::text from public.line_oa_inbound_retry where webhook_event_id = 'p009-evt-plain-6'$q$)),
  jsonb_build_object('result', pg_temp.p009_ingest_expect(0, 0, 1), 'queued', '0'),
  'an ignored plain chat is skipped as before and never queued'
);

-- ---------------------------------------------------------------------------
-- 29-35: privileges and activation boundaries.
-- ---------------------------------------------------------------------------
insert into p009_ctx select 'sweep-anon', pg_temp.p009_sweep('anon');
insert into p009_ctx select 'sweep-limits', jsonb_build_array(
  pg_temp.p009_sweep('service_role', 0) ->> 'sqlstate',
  pg_temp.p009_sweep('service_role', 101) ->> 'sqlstate');

select is(
  pg_temp.p009_rights('public.rpc_line_inbound_retry_sweep(integer)')
    || ' ' || coalesce((select v ->> 'sqlstate' || ' ' || (v ->> 'error') from p009_ctx where k = 'sweep-anon'), ''),
  'f/f/t 42501 permission denied for function rpc_line_inbound_retry_sweep',
  'only service_role can EXECUTE the sweep; anon is refused at the function ACL'
);
select ok(
  to_regprocedure('public.rpc_line_inbound_retry_sweep(integer)') is not null
  and not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = to_regprocedure('public.rpc_line_inbound_retry_sweep(integer)')
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC holds no EXECUTE on the sweep'
);
select is(
  (select v from p009_ctx where k = 'sweep-limits'),
  '["22023", "22023"]'::jsonb,
  'the sweep rejects a batch limit outside 1..100'
);
select is(
  (select coalesce(string_agg(v.r || ':'
            || (case when has_table_privilege(v.r, c.oid, 'INSERT') then 't' else 'f' end)
            || (case when has_table_privilege(v.r, c.oid, 'UPDATE') then 't' else 'f' end)
            || (case when has_table_privilege(v.r, c.oid, 'DELETE') then 't' else 'f' end)
            || (case when has_table_privilege(v.r, c.oid, 'TRUNCATE') then 't' else 'f' end)
            || (case when has_table_privilege(v.r, c.oid, 'SELECT') then 't' else 'f' end), '|' order by v.o)
            || ' rls=' || bool_or(c.relrowsecurity), '<missing>')
     from pg_class c, (values (1, 'anon'), (2, 'authenticated'), (3, 'service_role')) v(o, r)
    where c.oid = to_regclass('public.line_oa_inbound_retry')),
  'anon:fffff|authenticated:fffff|service_role:fffft rls=true',
  'the retry table has RLS on, no client or service_role writes, and only service_role reads'
);
select is(
  pg_temp.p009_rights('public.rpc_ingest_line_webhook(text,text,text)'),
  'f/f/t',
  'control: rpc_ingest_line_webhook keeps the 0199 service-only EXECUTE'
);
select is(
  pg_temp.p009_rights('public.fn_line_handle_group_event(jsonb,text,text)'),
  'f/f/f',
  'control: fn_line_handle_group_event stays internal (0199)'
);
select is(
  (select count(*) from cron.job where command ilike '%inbound_retry%'),
  0::bigint,
  'control: no cron job schedules the retry sweep (activation is a separate decision)'
);

select * from finish();
rollback;
