-- pgTAP DB-level invariants - P0-10 / B10: no direct client or service-role
-- table writes on the eight line_oa_* tables (0198), while the SECURITY DEFINER
-- RPC and trigger write paths keep working.
--
-- Run inside a rollback wrapper against a migrated throwaway database:
--   psql "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/tests/line_oa_client_write_revoke.sql
--
-- Before 0198 (RED) the effective-privilege and write-probe assertions fail;
-- after 0198 (GREEN) every assertion passes. All data is synthetic, created in
-- this transaction and rolled back. No HTTP call and no LINE delivery happens:
-- rows are only queued/claimed/recorded inside the database.
-- This file always issues the final ROLLBACK.

\set ON_ERROR_STOP on

create extension if not exists pgtap;
select plan(133);

-- ---------------------------------------------------------------------------
-- Scope tables
-- ---------------------------------------------------------------------------
create temporary table p010_roles (ord int, role text);
insert into p010_roles values (1, 'anon'), (2, 'authenticated'), (3, 'service_role');

create temporary table p010_tables (ord int, tbl text);
insert into p010_tables values
  (1, 'line_oa_channels'), (2, 'line_oa_conversations'), (3, 'line_oa_inbound_messages'),
  (4, 'line_oa_outbound_messages'), (5, 'line_oa_customer_identity'),
  (6, 'line_oa_message_templates'), (7, 'line_oa_orders'), (8, 'line_oa_audit_log');

-- ---------------------------------------------------------------------------
-- Helpers. Each switches role inside a subtransaction.
--   p010_probe: runs one write, then always rolls it back with a sentinel, and
--               classifies the outcome (acl_denied only for the exact message
--               "permission denied for table <tbl>", SQLSTATE 42501).
--   p010_read_as / p010_call_as: run a statement as a role and return its first
--               value (read_as rolls back; call_as keeps the effects).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.p010_probe(p_role text, p_table text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_rows bigint;
  v_state text;
  v_msg text;
  v_detail text;
begin
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    get diagnostics v_rows = row_count;
    raise exception using errcode = 'P0100', message = 'p010 probe rollback', detail = v_rows::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
  end;
  return case
    when v_state = 'P0100' then format('succeeded (%s rows, rolled back)', v_detail)
    when v_state = '42501' and v_msg = 'permission denied for table ' || p_table then 'acl_denied'
    when v_state = '42501' and v_msg like 'new row violates row-level security policy%' then 'rls_denied'
    else format('other %s: %s', v_state, left(v_msg, 120))
  end;
end;
$$;

create or replace function pg_temp.p010_read_as(p_role text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
  v_state text;
  v_msg text;
  v_detail text;
begin
  begin
    execute format('set local role %I', p_role);
    execute p_sql into v_value;
    raise exception using errcode = 'P0100', message = 'p010 read rollback', detail = coalesce(v_value, '<null>');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
  end;
  return case when v_state = 'P0100' then v_detail else format('error %s: %s', v_state, left(v_msg, 120)) end;
end;
$$;

create or replace function pg_temp.p010_call_as(p_role text, p_claims jsonb, p_sql text)
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

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (created as the migration owner, inside this transaction).
-- ---------------------------------------------------------------------------
select vault.create_secret('p010 synthetic fixture value', 'p010_test_channel_secret_ref');

insert into public.line_oa_channels (channel_identifier, vertical_context, channel_secret_ref, channel_access_token_ref)
values ('p010-channel', 'p010', 'p010_test_channel_secret_ref', 'p010_test_token_ref');

insert into public.line_oa_conversations (id, line_user_id, vertical_context, site_code, status) values
  ('b0100000-0000-0000-0000-0000000000c1', 'U-P010-KEEP', 'p010', 'P010-SITE', 'open'),
  ('b0100000-0000-0000-0000-0000000000c2', 'U-P010-TARGET', 'p010', 'P010-SITE', 'open');

insert into public.line_oa_inbound_messages (id, conversation_id, webhook_event_id, payload)
values ('b0100000-0000-0000-0000-0000000000a1', 'b0100000-0000-0000-0000-0000000000c1', 'p010-fixture-inbound', '{}'::jsonb);

insert into public.line_oa_outbound_messages (id, conversation_id, send_type, status, template_key, slot_values)
values ('b0100000-0000-0000-0000-0000000000b1', 'b0100000-0000-0000-0000-0000000000c1', 'push', 'sent', 'tpl_p010_fixture', '{}'::jsonb);

insert into public.line_oa_customer_identity (id, line_user_id, vertical_context, customer_id)
values ('b0100000-0000-0000-0000-0000000000d1', 'U-P010-IDENTITY', 'p010', 'b0100000-0000-0000-0000-0000000000f1');

insert into public.line_oa_message_templates (template_key, vertical_context, body)
values ('tpl_p010_fixture', 'p010', 'p010 fixture body');

insert into public.line_oa_orders (id, vertical_context, canonical_payload)
values ('b0100000-0000-0000-0000-0000000000e1', 'p010', '{}'::jsonb);

insert into public.line_oa_audit_log (id, event_type, vertical_context, entity_ref, performed_by)
values ('b0100000-0000-0000-0000-0000000000e2', 'p010_fixture', 'p010', 'p010-fixture', 'p010');

insert into public.installation_projects (id, name)
values ('b0100000-0000-0000-0000-0000000000f2', 'P010 fixture project');

-- One write statement of each kind per table. %1$s = probing role (unique keys).
create temporary table p010_ops (tbl text, op_ord int, op text, sql text);
insert into p010_ops values
  ('line_oa_channels', 1, 'INSERT', $q$insert into public.line_oa_channels (channel_identifier, vertical_context, channel_secret_ref, channel_access_token_ref) values ('p010-probe-%1$s', 'p010', 'p010-probe-ref', 'p010-probe-ref')$q$),
  ('line_oa_channels', 2, 'UPDATE', $q$update public.line_oa_channels set is_active = is_active where channel_identifier = 'p010-channel'$q$),
  ('line_oa_channels', 3, 'DELETE', $q$delete from public.line_oa_channels where channel_identifier = 'p010-channel'$q$),
  ('line_oa_channels', 4, 'TRUNCATE', $q$truncate public.line_oa_channels$q$),
  ('line_oa_conversations', 1, 'INSERT', $q$insert into public.line_oa_conversations (line_user_id, vertical_context) values ('U-P010-PROBE-%1$s', 'p010')$q$),
  ('line_oa_conversations', 2, 'UPDATE', $q$update public.line_oa_conversations set last_activity_at = last_activity_at where id = 'b0100000-0000-0000-0000-0000000000c2'$q$),
  ('line_oa_conversations', 3, 'DELETE', $q$delete from public.line_oa_conversations where id = 'b0100000-0000-0000-0000-0000000000c2'$q$),
  ('line_oa_conversations', 4, 'TRUNCATE', $q$truncate public.line_oa_conversations$q$),
  ('line_oa_inbound_messages', 1, 'INSERT', $q$insert into public.line_oa_inbound_messages (conversation_id, webhook_event_id, payload) values ('b0100000-0000-0000-0000-0000000000c1', 'p010-probe-%1$s', '{}')$q$),
  ('line_oa_inbound_messages', 2, 'UPDATE', $q$update public.line_oa_inbound_messages set payload = payload where id = 'b0100000-0000-0000-0000-0000000000a1'$q$),
  ('line_oa_inbound_messages', 3, 'DELETE', $q$delete from public.line_oa_inbound_messages where id = 'b0100000-0000-0000-0000-0000000000a1'$q$),
  ('line_oa_inbound_messages', 4, 'TRUNCATE', $q$truncate public.line_oa_inbound_messages$q$),
  ('line_oa_outbound_messages', 1, 'INSERT', $q$insert into public.line_oa_outbound_messages (conversation_id, send_type, template_key, slot_values) values ('b0100000-0000-0000-0000-0000000000c1', 'push', 'tpl_p010_probe', '{}')$q$),
  ('line_oa_outbound_messages', 2, 'UPDATE', $q$update public.line_oa_outbound_messages set slot_values = slot_values where id = 'b0100000-0000-0000-0000-0000000000b1'$q$),
  ('line_oa_outbound_messages', 3, 'DELETE', $q$delete from public.line_oa_outbound_messages where id = 'b0100000-0000-0000-0000-0000000000b1'$q$),
  ('line_oa_outbound_messages', 4, 'TRUNCATE', $q$truncate public.line_oa_outbound_messages$q$),
  ('line_oa_customer_identity', 1, 'INSERT', $q$insert into public.line_oa_customer_identity (line_user_id, vertical_context, customer_id) values ('U-P010-PROBE-%1$s', 'p010', 'b0100000-0000-0000-0000-0000000000f1')$q$),
  ('line_oa_customer_identity', 2, 'UPDATE', $q$update public.line_oa_customer_identity set manual_review_required = manual_review_required where id = 'b0100000-0000-0000-0000-0000000000d1'$q$),
  ('line_oa_customer_identity', 3, 'DELETE', $q$delete from public.line_oa_customer_identity where id = 'b0100000-0000-0000-0000-0000000000d1'$q$),
  ('line_oa_customer_identity', 4, 'TRUNCATE', $q$truncate public.line_oa_customer_identity$q$),
  ('line_oa_message_templates', 1, 'INSERT', $q$insert into public.line_oa_message_templates (template_key, vertical_context, body) values ('tpl_p010_probe_%1$s', 'p010', 'p010 probe body')$q$),
  ('line_oa_message_templates', 2, 'UPDATE', $q$update public.line_oa_message_templates set body = body where template_key = 'tpl_p010_fixture'$q$),
  ('line_oa_message_templates', 3, 'DELETE', $q$delete from public.line_oa_message_templates where template_key = 'tpl_p010_fixture'$q$),
  ('line_oa_message_templates', 4, 'TRUNCATE', $q$truncate public.line_oa_message_templates$q$),
  ('line_oa_orders', 1, 'INSERT', $q$insert into public.line_oa_orders (vertical_context, canonical_payload) values ('p010', '{}')$q$),
  ('line_oa_orders', 2, 'UPDATE', $q$update public.line_oa_orders set canonical_payload = canonical_payload where id = 'b0100000-0000-0000-0000-0000000000e1'$q$),
  ('line_oa_orders', 3, 'DELETE', $q$delete from public.line_oa_orders where id = 'b0100000-0000-0000-0000-0000000000e1'$q$),
  ('line_oa_orders', 4, 'TRUNCATE', $q$truncate public.line_oa_orders$q$),
  ('line_oa_audit_log', 1, 'INSERT', $q$insert into public.line_oa_audit_log (event_type, vertical_context, entity_ref, performed_by) values ('p010_probe', 'p010', 'p010-probe', 'p010')$q$),
  ('line_oa_audit_log', 2, 'UPDATE', $q$update public.line_oa_audit_log set event_type = event_type where id = 'b0100000-0000-0000-0000-0000000000e2'$q$),
  ('line_oa_audit_log', 3, 'DELETE', $q$delete from public.line_oa_audit_log where id = 'b0100000-0000-0000-0000-0000000000e2'$q$),
  ('line_oa_audit_log', 4, 'TRUNCATE', $q$truncate public.line_oa_audit_log$q$);

-- ---------------------------------------------------------------------------
-- 1-4: scope guard, schema USAGE, PUBLIC, owner rights.
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in (select tbl from p010_tables)) = 8
  and (select count(*) from pg_roles where rolname in (select role from p010_roles)) = 3
  and (select count(*) from p010_ops) = 32,
  'scope guard: 8 target tables, 3 roles and 32 write statements exist (no vacuous pass)'
);

select is(
  array(select role from p010_roles where not has_schema_privilege(role, 'public', 'USAGE') order by ord),
  '{}'::text[],
  'anon, authenticated and service_role keep USAGE on schema public, so denials are not schema-level'
);

select is(
  array(
    select t.tbl || ':' || a.privilege_type
    from p010_tables t
    join pg_class c on c.oid = format('public.%I', t.tbl)::regclass
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where a.grantee = 0 and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    order by 1),
  '{}'::text[],
  'PUBLIC holds no INSERT/UPDATE/DELETE/TRUNCATE grant on the eight tables'
);

select is(
  array(
    select t.tbl from p010_tables t
    join pg_class c on c.oid = format('public.%I', t.tbl)::regclass
    where not (has_table_privilege(c.relowner, c.oid, 'INSERT') and has_table_privilege(c.relowner, c.oid, 'UPDATE')
               and has_table_privilege(c.relowner, c.oid, 'DELETE') and has_table_privilege(c.relowner, c.oid, 'TRUNCATE'))
    order by t.ord),
  '{}'::text[],
  'each table owner (the SECURITY DEFINER owner) keeps INSERT/UPDATE/DELETE/TRUNCATE'
);

-- ---------------------------------------------------------------------------
-- 5-28: effective privileges, 3 roles x 8 tables x 4 privileges (+ column level).
-- ---------------------------------------------------------------------------
select is(
  array(
    select v.priv from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) v(priv)
    where has_table_privilege(s.role, format('public.%I', s.tbl), v.priv)
    union all
    select 'COLUMN ' || c.priv from unnest(array['INSERT', 'UPDATE']) c(priv)
    where has_any_column_privilege(s.role, format('public.%I', s.tbl), c.priv)
    order by 1),
  '{}'::text[],
  format('%s holds no effective INSERT/UPDATE/DELETE/TRUNCATE (table or column) on %s', s.role, s.tbl)
)
from (select r.role, t.tbl from p010_roles r cross join p010_tables t order by r.ord, t.ord offset 0) s;

-- ---------------------------------------------------------------------------
-- 29-124: real write attempts with SET LOCAL ROLE, 3 roles x 32 statements.
-- Each attempt is rolled back whatever happens.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.p010_probe(s.role, s.tbl, format(s.sql, s.role)),
  'acl_denied',
  format('%s %s on %s is refused by the table privilege (42501 permission denied for table)', s.role, s.op, s.tbl)
)
from (
  select r.role, o.tbl, o.op, o.sql
  from p010_roles r cross join p010_ops o join p010_tables t on t.tbl = o.tbl
  order by r.ord, t.ord, o.op_ord offset 0
) s;

-- ---------------------------------------------------------------------------
-- 125-127: service_role still reads the three tables the sender reads.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.p010_read_as('service_role', $q$select channel_access_token_ref from public.line_oa_channels where vertical_context = 'p010'$q$),
  'p010_test_token_ref',
  'service_role can still SELECT line_oa_channels (sender reads channel_access_token_ref)'
);
select is(
  pg_temp.p010_read_as('service_role', $q$select line_user_id || '|' || vertical_context from public.line_oa_conversations where id = 'b0100000-0000-0000-0000-0000000000c1'$q$),
  'U-P010-KEEP|p010',
  'service_role can still SELECT line_oa_conversations (sender reads line_user_id, vertical_context)'
);
select is(
  pg_temp.p010_read_as('service_role', $q$select body from public.line_oa_message_templates where template_key = 'tpl_p010_fixture'$q$),
  'p010 fixture body',
  'service_role can still SELECT line_oa_message_templates (sender reads body)'
);

-- ---------------------------------------------------------------------------
-- 128-129: webhook ingress through rpc_ingest_line_webhook as service_role.
-- The signature is computed here from the synthetic fixture secret.
-- ---------------------------------------------------------------------------
create temporary table p010_ctx (k text primary key, v jsonb);
insert into p010_ctx
select 'ingest', pg_temp.p010_call_as('service_role', '{"role":"service_role"}'::jsonb, format(
  $q$select to_jsonb(r) from public.rpc_ingest_line_webhook(%L, %L, 'p010-channel') r$q$,
  b.body,
  encode(extensions.hmac(convert_to(b.body, 'UTF8'), convert_to('p010 synthetic fixture value', 'UTF8'), 'sha256'), 'base64')))
from (select '{"destination":"p010","events":[{"type":"message","webhookEventId":"p010-evt-0001","timestamp":1759200000000,"source":{"type":"user","userId":"U-P010-INGEST"},"message":{"type":"text","id":"p010-msg-1","text":"p010 synthetic"}}]}'::text as body) b;

select is(
  (select v from p010_ctx where k = 'ingest'),
  jsonb_build_object('ok', true, 'value', jsonb_build_object(
    'accepted', true, 'reason', 'accepted', 'events_processed', 1, 'events_duplicate', 0, 'events_skipped', 0)),
  'rpc_ingest_line_webhook as service_role accepts a signed synthetic event and processes it'
);
select ok(
  exists (select 1 from public.line_oa_inbound_messages m
          join public.line_oa_conversations c on c.id = m.conversation_id
          where m.webhook_event_id = 'p010-evt-0001' and c.line_user_id = 'U-P010-INGEST' and c.vertical_context = 'p010')
  and exists (select 1 from public.line_oa_customer_identity i where i.line_user_id = 'U-P010-INGEST' and i.vertical_context = 'p010')
  and exists (select 1 from public.line_oa_audit_log l where l.event_type = 'webhook_inbound_received'
              and l.entity_ref like 'webhook_event_id:p010-evt-0001|%'),
  'ingress wrote the conversation, inbound message, customer identity and audit receipt through the DEFINER path'
);

-- ---------------------------------------------------------------------------
-- 130: trigger fn_welcome_on_group_bind (DEFINER) queues the welcome pack when
-- service_role binds a customer group, although service_role cannot write the
-- outbound table itself.
-- ---------------------------------------------------------------------------
insert into p010_ctx
select 'bind', pg_temp.p010_call_as('service_role', '{"role":"service_role"}'::jsonb,
  $q$insert into public.line_groups (line_group_id, project_id, group_type, status, vertical_context)
     values ('C-P010-CUSTOMER', 'b0100000-0000-0000-0000-0000000000f2', 'customer', 'active', 'p010')
     returning to_jsonb(line_group_id)$q$);

select ok(
  (select (v->>'ok')::boolean from p010_ctx where k = 'bind')
  and exists (select 1 from public.line_oa_outbound_messages o
              where o.target_type = 'group' and o.target_id = 'C-P010-CUSTOMER'
                and o.template_key = 'tpl_welcome_pack' and o.status = 'pending'
                and o.slot_values->>'project_name' = 'P010 fixture project'),
  'binding a customer group as service_role fires fn_welcome_on_group_bind, which queues tpl_welcome_pack for that group'
);

-- ---------------------------------------------------------------------------
-- 131: fn_prod_curated (DEFINER) queues a curated push as service_role.
-- ---------------------------------------------------------------------------
insert into p010_ctx
select 'curated', pg_temp.p010_call_as('service_role', '{"role":"service_role"}'::jsonb,
  $q$select to_jsonb(public.fn_prod_curated('b0100000-0000-0000-0000-0000000000f2', 'tpl_prod_started',
       '{"project_name":"P010 fixture project","p010":"curated"}'::jsonb)::text)$q$);

insert into p010_ctx
select 'curated_row', to_jsonb(o.id)
from public.line_oa_outbound_messages o
where o.target_type = 'group' and o.target_id = 'C-P010-CUSTOMER' and o.template_key = 'tpl_prod_started';

select ok(
  (select (v->>'ok')::boolean from p010_ctx where k = 'curated')
  and (select count(*) from public.line_oa_outbound_messages o
        where o.target_type = 'group' and o.target_id = 'C-P010-CUSTOMER' and o.template_key = 'tpl_prod_started'
          and o.status = 'pending' and o.slot_values->>'p010' = 'curated') = 1,
  'fn_prod_curated as service_role queues exactly one pending tpl_prod_started push for the bound group'
);

-- ---------------------------------------------------------------------------
-- 132-133: claim and record through the service RPCs (no HTTP, no delivery).
-- The record call passes the same named arguments as the sender
-- (supabase/functions/line-outbound-sender/index.ts recordResult).
-- ---------------------------------------------------------------------------
insert into p010_ctx
select 'claim', pg_temp.p010_call_as('service_role', '{"role":"service_role"}'::jsonb,
  $q$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.rpc_claim_line_outbound_batch(50, 300) c$q$);

select ok(
  (select (v->>'ok')::boolean from p010_ctx where k = 'claim')
  and exists (select 1 from jsonb_array_elements((select v->'value' from p010_ctx where k = 'claim')) e
              where e->>'id' = (select v #>> '{}' from p010_ctx where k = 'curated_row')
                and e->>'claim_token' is not null)
  and (select o.claim_token is not null and o.claimed_at is not null from public.line_oa_outbound_messages o
        where o.id = (select (v #>> '{}')::uuid from p010_ctx where k = 'curated_row')),
  'rpc_claim_line_outbound_batch as service_role claims the curated row and stamps a claim token'
);

insert into p010_ctx
select 'record', pg_temp.p010_call_as('service_role', '{"role":"service_role"}'::jsonb, format(
  $q$select to_jsonb(r) from public.rpc_record_line_send_result(
       p_outbound_id => %L::uuid, p_status => 'sent', p_error_detail => null,
       p_failure_class => 'transient', p_claim_token => %L::uuid) r$q$,
  (select v #>> '{}' from p010_ctx where k = 'curated_row'),
  (select o.claim_token::text from public.line_oa_outbound_messages o
    where o.id = (select (v #>> '{}')::uuid from p010_ctx where k = 'curated_row'))));

select ok(
  (select (v->>'ok')::boolean from p010_ctx where k = 'record')
  and (select o.status = 'sent' and o.sent_at is not null from public.line_oa_outbound_messages o
        where o.id = (select (v #>> '{}')::uuid from p010_ctx where k = 'curated_row')),
  'rpc_record_line_send_result as service_role records the claimed row as sent'
);

select * from finish();
rollback;
