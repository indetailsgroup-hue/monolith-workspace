-- pgTAP - B12 / P0-12: EXECUTE on the twenty LINE SECURITY DEFINER writers
-- follows the owner-approved matrix (docs/governance/line-b12-permission-matrix),
-- while the business paths that must keep working still work.
--
-- Run inside a rollback wrapper against a migrated throwaway database:
--   psql "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/tests/line_oa_definer_execute_matrix.sql
--
-- Before 0199 (RED) the matrix, PUBLIC, denial and write-probe assertions fail,
-- except the cells already denied before 0199 (assertions 9, 35, 36 and 46),
-- which pass on RED as regression controls; after 0199 (GREEN) every assertion
-- passes. All data is synthetic, created in this transaction and rolled back.
-- No HTTP call and no LINE delivery happens. This file always issues the final
-- ROLLBACK.

\set ON_ERROR_STOP on

create extension if not exists pgtap;
select plan(82);

-- ---------------------------------------------------------------------------
-- The matrix: exact identity, target effective EXECUTE for anon/authenticated/
-- service_role (t = keep, f = deny), class, and a typed probe statement.
-- ---------------------------------------------------------------------------
create temporary table b12_matrix (ord int, id text, sig text, target text, class text, probe text);
insert into b12_matrix values
  (1,  'B12-01', 'fn_lead_followup_sweep()', 'f/f/t', 'SERVICE', $q$select public.fn_lead_followup_sweep()$q$),
  (2,  'B12-02', 'fn_line_handle_group_event(jsonb,text,text)', 'f/f/f', 'INTERNAL', $q$select public.fn_line_handle_group_event(null::jsonb, null::text, null::text)$q$),
  (3,  'B12-03', 'fn_prod_curated(uuid,text,jsonb)', 'f/f/f', 'INTERNAL', $q$select public.fn_prod_curated(null::uuid, null::text, null::jsonb)$q$),
  (4,  'B12-04', 'fn_welcome_on_group_bind()', 'f/f/f', 'INTERNAL', null),
  (5,  'B12-05', 'line_oa_resolve_customer_identity(text,text)', 'f/f/t', 'SERVICE', $q$select public.line_oa_resolve_customer_identity(null::text, null::text)$q$),
  (6,  'B12-06', 'rpc_claim_line_outbound_batch(integer,integer)', 'f/f/t', 'SENDER', $q$select public.rpc_claim_line_outbound_batch(1, 300)$q$),
  (7,  'B12-07', 'rpc_create_line_order(uuid,jsonb,text,text)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_create_line_order(null::uuid, null::jsonb, null::text, null::text)$q$),
  (8,  'B12-08', 'rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_evaluate_identity_merge_candidate(null::text, null::text, null::uuid, null::jsonb, null::numeric)$q$),
  (9,  'B12-09', 'rpc_field_assign_lead(uuid,uuid)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_field_assign_lead(null::uuid, null::uuid)$q$),
  (10, 'B12-10', 'rpc_field_close_lead(uuid,text,text)', 'f/t/t', 'FIELD', $q$select public.rpc_field_close_lead(null::uuid, null::text, null::text)$q$),
  (11, 'B12-11', 'rpc_field_send_photo_to_customer(uuid,uuid,text)', 'f/t/t', 'FIELD', $q$select public.rpc_field_send_photo_to_customer(null::uuid, null::uuid, null::text)$q$),
  (12, 'B12-12', 'rpc_field_set_lead_source(uuid,text)', 'f/t/t', 'FIELD', $q$select public.rpc_field_set_lead_source(null::uuid, null::text)$q$),
  (13, 'B12-13', 'rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)', 'f/t/t', 'FIELD', $q$select public.rpc_field_shop_drawing_revision(null::uuid, null::text, null::text, null::boolean, null::boolean)$q$),
  (14, 'B12-14', 'rpc_ingest_line_webhook(text,text,text)', 'f/f/t', 'SERVICE', $q$select public.rpc_ingest_line_webhook(null::text, null::text, null::text)$q$),
  (15, 'B12-15', 'rpc_record_line_send_result(uuid,text,text,text,uuid)', 'f/f/t', 'SENDER', $q$select public.rpc_record_line_send_result(null::uuid, null::text, null::text, null::text, null::uuid)$q$),
  (16, 'B12-16', 'rpc_request_customer_acceptance(uuid,text)', 'f/t/t', 'FIELD', $q$select public.rpc_request_customer_acceptance(null::uuid, null::text)$q$),
  (17, 'B12-17', 'rpc_resolve_conversation_site(uuid,text,text)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_resolve_conversation_site(null::uuid, null::text, null::text)$q$),
  (18, 'B12-18', 'rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_send_line_outbound(null::uuid, null::text, null::jsonb, null::text, null::boolean, null::boolean, null::boolean)$q$),
  (19, 'B12-19', 'rpc_sweep_line_session_timeouts()', 'f/f/t', 'SERVICE', $q$select public.rpc_sweep_line_session_timeouts()$q$),
  (20, 'B12-20', 'rpc_sync_line_forecast(text,text,text)', 'f/t/t', 'CALLER-UNKNOWN', $q$select public.rpc_sync_line_forecast(null::text, null::text, null::text)$q$);

create temporary table b12_roles (ord int, role text, claims jsonb);
insert into b12_roles values
  (1, 'anon', '{"role":"anon"}'),
  (2, 'authenticated', '{"role":"authenticated","sub":"b1200000-0000-0000-0000-00000000aa01","email":"p012-governance@example.test","app_metadata":{"roles":["admin"],"site_codes":["P012-SITE","BKK-HQ-01"]}}'),
  (3, 'service_role', '{"role":"service_role"}');

-- ---------------------------------------------------------------------------
-- Helpers. Each switches role inside a subtransaction.
--   b12_probe: runs one call, always rolls it back, classifies the outcome;
--              acl_denied only for 42501 "permission denied for function <name>",
--              and a schema denial or a missing function is never "body reached".
--   b12_fingerprint: digest of every row of the tables a LINE writer can touch.
--   b12_write_probe: like b12_probe, but compares the fingerprint taken before
--              the call with one taken after it and before the rollback, so a
--              call that wrote anything reports "wrote (rolled back)".
--   b12_call:  runs one statement as a role with claims and keeps its effects.
--   b12_rights: effective EXECUTE of the three roles as "A/U/S" (t/f).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.b12_classify(p_state text, p_msg text, p_name text)
returns text
language sql
as $$
  select case
    when p_state = '42501' and p_msg = 'permission denied for function ' || p_name then 'acl_denied'
    when p_state = '42501' and p_msg like 'permission denied for schema%' then 'schema_denied: ' || p_msg
    when p_state = '42883' then 'undefined_function: ' || left(p_msg, 100)
    else format('body reached: %s %s', p_state, left(p_msg, 100))
  end
$$;

create or replace function pg_temp.b12_probe(p_role text, p_claims jsonb, p_name text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_msg text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    raise exception using errcode = 'P0100', message = 'b12 probe rollback';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  return case when v_state = 'P0100' then 'succeeded (rolled back)'
              else pg_temp.b12_classify(v_state, v_msg, p_name) end;
end;
$$;

create or replace function pg_temp.b12_fingerprint()
returns text
language sql
as $$
  select concat_ws('/',
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_oa_outbound_messages t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_oa_audit_log t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_oa_customer_identity t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_oa_conversations t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_oa_inbound_messages t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.line_groups t),
    (select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.installation_audit_log t))
$$;

-- PL/pgSQL variables keep the values assigned before an error, so v_wrote
-- survives the forced rollback of the probe's subtransaction.
create or replace function pg_temp.b12_write_probe(p_role text, p_claims jsonb, p_name text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_before text := pg_temp.b12_fingerprint();
  v_wrote boolean := false;
  v_state text;
  v_msg text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  begin
    execute format('set local role %I', p_role);
    execute p_sql;
    execute 'reset role';
    v_wrote := pg_temp.b12_fingerprint() is distinct from v_before;
    raise exception using errcode = 'P0100', message = 'b12 probe rollback';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  return case
    when v_state = 'P0100' and v_wrote then 'wrote (rolled back)'
    when v_state = 'P0100' then 'ran without writes (rolled back)'
    else pg_temp.b12_classify(v_state, v_msg, p_name)
  end;
end;
$$;

create or replace function pg_temp.b12_call(p_role text, p_claims jsonb, p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_value jsonb;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, '{}'::jsonb)::text, true);
  begin
    if p_role is not null then
      execute format('set local role %I', p_role);
    end if;
    execute p_sql into v_value;
    execute 'reset role';
    return jsonb_build_object('ok', true, 'value', v_value);
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    return jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'error', left(sqlerrm, 200));
  end;
end;
$$;

create or replace function pg_temp.b12_rights(p_sig text)
returns text
language sql
as $$
  select string_agg(case when has_function_privilege(r, ('public.' || p_sig)::regprocedure, 'EXECUTE') then 't' else 'f' end, '/' order by o)
  from unnest(array['anon', 'authenticated', 'service_role']) with ordinality as x(r, o)
$$;

-- ---------------------------------------------------------------------------
-- 1-3: scope guard, overloads, schema USAGE.
-- ---------------------------------------------------------------------------
select is(
  array(select sig from b12_matrix where to_regprocedure('public.' || sig) is null order by ord),
  '{}'::text[],
  'all twenty exact identities of the matrix exist'
);

select is(
  array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (select split_part(sig, '(', 1) from b12_matrix)
      and p.oid not in (select to_regprocedure('public.' || sig) from b12_matrix where to_regprocedure('public.' || sig) is not null)
    order by 1),
  '{}'::text[],
  'no unclassified overload exists for any of the twenty names'
);

select is(
  array(select role from b12_roles where not has_schema_privilege(role, 'public', 'USAGE') order by ord),
  '{}'::text[],
  'anon, authenticated and service_role keep USAGE on schema public, so denials are not schema-level'
);

-- ---------------------------------------------------------------------------
-- 4-24: effective EXECUTE per identity equals the matrix; PUBLIC holds none.
-- ---------------------------------------------------------------------------
select is(pg_temp.b12_rights(m.sig), m.target,
  format('%s %s effective EXECUTE anon/authenticated/service_role is %s', m.id, m.sig, m.target))
from (select * from b12_matrix order by ord offset 0) m;

select is(
  array(
    select m.sig from b12_matrix m
    join pg_proc p on p.oid = to_regprocedure('public.' || m.sig)
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    order by m.ord),
  '{}'::text[],
  'PUBLIC holds EXECUTE on none of the twenty identities'
);

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (created as the migration owner, inside this transaction).
-- ---------------------------------------------------------------------------
select vault.create_secret('p012 synthetic fixture value', 'p012_test_channel_secret_ref');
insert into public.line_oa_channels (channel_identifier, vertical_context, channel_secret_ref, channel_access_token_ref)
values ('p012-channel', 'p012', 'p012_test_channel_secret_ref', 'p012_test_token_ref');
insert into public.installation_projects (id, name, site_code, status) values
  ('b1200000-0000-0000-0000-0000000000f1', 'P012 fixture project', 'P012-SITE', 'active'),
  ('b1200000-0000-0000-0000-0000000000f2', 'P012 welcome project', 'P012-SITE', 'active');
insert into public.line_groups (line_group_id, project_id, site_code, group_type, status, vertical_context)
values ('C-P012-CUSTOMER', 'b1200000-0000-0000-0000-0000000000f1', 'P012-SITE', 'customer', 'active', 'p012');
insert into public.line_oa_conversations (id, line_user_id, vertical_context, site_code, status)
values ('b1200000-0000-0000-0000-0000000000c1', 'U-P012-LEAD', 'p012', 'P012-SITE', 'open');
insert into public.installation_photos (id, project_id, site_code, storage_path)
values ('b1200000-0000-0000-0000-0000000000a1', 'b1200000-0000-0000-0000-0000000000f1', 'P012-SITE', 'p012/fixture-photo.jpg');

create temporary table b12_ctx (k text primary key, v jsonb);
insert into b12_ctx values ('claims_site', '{"role":"authenticated","sub":"b1200000-0000-0000-0000-00000000aa02","app_metadata":{"roles":[],"site_codes":["P012-SITE","BKK-HQ-01"]}}');
insert into b12_ctx values ('claims_wrong', '{"role":"authenticated","sub":"b1200000-0000-0000-0000-00000000aa03","app_metadata":{"roles":[],"site_codes":["OTHER-SITE"]}}');
insert into b12_ctx values ('claims_none', '{"role":"authenticated","sub":"b1200000-0000-0000-0000-00000000aa04"}');

-- ---------------------------------------------------------------------------
-- 25-53: every DENY cell refused at the function ACL (42501 "permission denied
-- for function"), even for a governance user. The trigger function is checked
-- by ACL only (a direct call of a trigger function proves nothing).
-- ---------------------------------------------------------------------------
select is(
  pg_temp.b12_probe(s.role, s.claims, split_part(s.sig, '(', 1), s.probe),
  'acl_denied',
  format('%s %s is refused to %s at the function privilege (42501 permission denied for function)', s.id, s.sig, s.role))
from (
  select m.id, m.sig, m.probe, r.role, r.claims
  from b12_matrix m cross join b12_roles r
  where m.probe is not null and split_part(m.target, '/', r.ord) = 'f'
  order by m.ord, r.ord offset 0
) s;

-- 54: realistic anon calls to four DENY writers, with arguments that write when
-- the call is permitted (a bound customer group, a new LINE user, an unsigned
-- webhook, a leave event for the bound group), change no row. Each probe takes
-- a table fingerprint before the call and after it, before its own rollback, so
-- this fails if any of the calls wrote anything (before 0199 it does).
select is(
  array(
    select w.label || ': ' || w.result
    from (
      select 'fn_prod_curated' as label, pg_temp.b12_write_probe('anon', '{"role":"anon"}', 'fn_prod_curated',
        $q$select public.fn_prod_curated('b1200000-0000-0000-0000-0000000000f1', 'tpl_prod_started', '{"station":"p012 probe"}'::jsonb)$q$) as result
      union all
      select 'line_oa_resolve_customer_identity', pg_temp.b12_write_probe('anon', '{"role":"anon"}', 'line_oa_resolve_customer_identity',
        $q$select public.line_oa_resolve_customer_identity('U-P012-ANON-PROBE', 'p012')$q$)
      union all
      select 'rpc_ingest_line_webhook', pg_temp.b12_write_probe('anon', '{"role":"anon"}', 'rpc_ingest_line_webhook',
        $q$select public.rpc_ingest_line_webhook('{"destination":"p012","events":[]}', 'p012-not-a-signature', 'p012-channel')$q$)
      union all
      select 'fn_line_handle_group_event', pg_temp.b12_write_probe('anon', '{"role":"anon"}', 'fn_line_handle_group_event',
        $q$select public.fn_line_handle_group_event('{"type":"leave","webhookEventId":"p012-evt-leave","timestamp":1759200000000,"source":{"type":"group","groupId":"C-P012-CUSTOMER"}}'::jsonb, 'p012', 'p012-anon-probe')$q$)
    ) w
    where w.result not in ('acl_denied')),
  '{}'::text[],
  'realistic anon calls to fn_prod_curated, line_oa_resolve_customer_identity, rpc_ingest_line_webhook and fn_line_handle_group_event are refused at the ACL and write nothing (fingerprint checked inside each probe)'
);

-- 55-60: retained authenticated RPCs with unknown callers still execute; with
-- no role or site the body's own guard or validation answers. A function-ACL
-- denial, a schema denial or a missing function does not count.
select ok(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_none'), split_part(m.sig, '(', 1), m.probe)
    similar to '(body reached:|succeeded)%',
  format('%s %s still executes for authenticated (body reached, no function-ACL or schema denial)', m.id, m.sig))
from (select * from b12_matrix where class = 'CALLER-UNKNOWN' order by ord offset 0) m;

-- ---------------------------------------------------------------------------
-- 61-72: paths that must keep working, checked by their data.
-- ---------------------------------------------------------------------------
-- 61: signed 1:1 ingress as service_role.
insert into b12_ctx
select 'ingest_user', pg_temp.b12_call('service_role', '{"role":"service_role"}', format(
  $q$select to_jsonb(r) from public.rpc_ingest_line_webhook(%L, %L, 'p012-channel') r$q$,
  b.body, encode(extensions.hmac(convert_to(b.body, 'UTF8'), convert_to('p012 synthetic fixture value', 'UTF8'), 'sha256'), 'base64')))
from (select '{"destination":"p012","events":[{"type":"message","webhookEventId":"p012-evt-user","timestamp":1759200000000,"source":{"type":"user","userId":"U-P012-INGEST"},"message":{"type":"text","id":"p012-msg-1","text":"p012 synthetic"}}]}'::text as body) b;
select ok(
  (select v->'value'->>'accepted' = 'true' and v->'value'->>'events_processed' = '1' from b12_ctx where k = 'ingest_user')
  and exists (select 1 from public.line_oa_inbound_messages where webhook_event_id = 'p012-evt-user')
  and exists (select 1 from public.line_oa_customer_identity where line_user_id = 'U-P012-INGEST' and vertical_context = 'p012'),
  'signed 1:1 ingress as service_role still writes the inbound message and customer identity'
);

-- 62: signed group join through ingress reaches fn_line_handle_group_event.
insert into b12_ctx
select 'ingest_group', pg_temp.b12_call('service_role', '{"role":"service_role"}', format(
  $q$select to_jsonb(r) from public.rpc_ingest_line_webhook(%L, %L, 'p012-channel') r$q$,
  b.body, encode(extensions.hmac(convert_to(b.body, 'UTF8'), convert_to('p012 synthetic fixture value', 'UTF8'), 'sha256'), 'base64')))
from (select '{"destination":"p012","events":[{"type":"join","webhookEventId":"p012-evt-join","timestamp":1759200000000,"source":{"type":"group","groupId":"C-P012-UNBOUND"}}]}'::text as body) b;
select ok(
  (select v->'value'->>'accepted' = 'true' and v->'value'->>'events_processed' = '1' from b12_ctx where k = 'ingest_group')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_type = 'group' and target_id = 'C-P012-UNBOUND' and template_key = 'tpl_inst_bind_prompt'),
  'a signed group join through ingress still reaches fn_line_handle_group_event, which queues the bind prompt'
);

-- 63: service identity resolution.
insert into b12_ctx
select 'identity', pg_temp.b12_call('service_role', '{"role":"service_role"}',
  $q$select to_jsonb(r) from public.line_oa_resolve_customer_identity('U-P012-IDENTITY', 'p012') r$q$);
select ok(
  (select (v->'value'->>'created')::boolean from b12_ctx where k = 'identity')
  and exists (select 1 from public.line_oa_customer_identity where line_user_id = 'U-P012-IDENTITY' and vertical_context = 'p012'),
  'line_oa_resolve_customer_identity as service_role still creates the identity'
);

-- 64: the welcome trigger still fires when service_role binds a customer group.
insert into b12_ctx
select 'bind', pg_temp.b12_call('service_role', '{"role":"service_role"}',
  $q$insert into public.line_groups (line_group_id, project_id, site_code, group_type, status, vertical_context)
     values ('C-P012-WELCOME', 'b1200000-0000-0000-0000-0000000000f2', 'P012-SITE', 'customer', 'active', 'p012')
     returning to_jsonb(line_group_id)$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'bind')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_id = 'C-P012-WELCOME' and template_key = 'tpl_welcome_pack'
                and slot_values->>'project_name' = 'P012 welcome project'),
  'binding a customer group as service_role still fires fn_welcome_on_group_bind (tpl_welcome_pack queued)'
);

-- 65: the migration principal can still recreate the welcome trigger.
savepoint b12_recreate_trigger;
drop trigger trg_welcome_group_bind on public.line_groups;
create trigger trg_welcome_group_bind after insert on public.line_groups
  for each row execute function public.fn_welcome_on_group_bind();
select exists (select 1 from pg_trigger where tgname = 'trg_welcome_group_bind' and tgrelid = 'public.line_groups'::regclass
               and tgfoid = 'public.fn_welcome_on_group_bind()'::regprocedure) as b12_recreated \gset
rollback to savepoint b12_recreate_trigger;
release savepoint b12_recreate_trigger;
select ok(:'b12_recreated'::boolean, 'the migration owner can drop and recreate trg_welcome_group_bind on fn_welcome_on_group_bind');

-- 66: fn_prod_curated through a field owner chain (appointment) as a site user.
insert into b12_ctx
select 'appointment', pg_temp.b12_call('authenticated', (select v from b12_ctx where k = 'claims_site'),
  $q$select public.rpc_field_create_appointment('b1200000-0000-0000-0000-0000000000f1', 'survey',
       timezone('utc', now()) + interval '2 days', 'p012 appointment')$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'appointment')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_id = 'C-P012-CUSTOMER' and template_key = 'tpl_appointment'),
  'rpc_field_create_appointment as a site user still queues tpl_appointment through fn_prod_curated'
);


-- 67: fn_prod_curated through the factory owner chain as a governance user.
insert into b12_ctx
select 'factory', pg_temp.b12_call('authenticated', (select claims from b12_roles where role = 'authenticated'),
  $q$select public.rpc_factory_report_station('b1200000-0000-0000-0000-0000000000f1', 'cutting', 'p012 station')$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'factory')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_id = 'C-P012-CUSTOMER' and template_key = 'tpl_prod_started'),
  'rpc_factory_report_station as a governance user still queues tpl_prod_started through fn_prod_curated'
);

-- 68-70: retained service entry points, and the migration owner as the assumed
-- principal of the cron job (cron.job is not inspected here).
insert into b12_ctx
select 'followup_service', pg_temp.b12_call('service_role', '{"role":"service_role"}', $q$select public.fn_lead_followup_sweep()$q$);
select ok((select (v->>'ok')::boolean and jsonb_typeof(v->'value') = 'object' from b12_ctx where k = 'followup_service'),
  'fn_lead_followup_sweep still runs as service_role');
insert into b12_ctx
select 'followup_owner', pg_temp.b12_call(null, '{}', $q$select public.fn_lead_followup_sweep()$q$);
select ok((select (v->>'ok')::boolean and jsonb_typeof(v->'value') = 'object' from b12_ctx where k = 'followup_owner'),
  'fn_lead_followup_sweep still runs as the migration owner (the assumed cron principal; cron.job not inspected)');
insert into b12_ctx
select 'timeouts_service', pg_temp.b12_call('service_role', '{"role":"service_role"}', $q$select to_jsonb(public.rpc_sweep_line_session_timeouts())$q$);
select ok((select (v->>'ok')::boolean from b12_ctx where k = 'timeouts_service'),
  'rpc_sweep_line_session_timeouts still runs as service_role');

-- 71-72: the sender's claim and record, as service_role (the only recorder).
insert into b12_ctx
select 'claim', pg_temp.b12_call('service_role', '{"role":"service_role"}',
  $q$select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.rpc_claim_line_outbound_batch(50, 300) c$q$);
insert into b12_ctx
select 'claimed_row', to_jsonb(o.id)
from public.line_oa_outbound_messages o
where o.target_id = 'C-P012-CUSTOMER' and o.template_key = 'tpl_appointment';
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'claim')
  and exists (select 1 from jsonb_array_elements((select v->'value' from b12_ctx where k = 'claim')) e
              where e->>'id' = (select v #>> '{}' from b12_ctx where k = 'claimed_row') and e->>'claim_token' is not null),
  'rpc_claim_line_outbound_batch as service_role still claims the queued appointment row'
);
insert into b12_ctx
select 'record', pg_temp.b12_call('service_role', '{"role":"service_role"}', format(
  $q$select to_jsonb(r) from public.rpc_record_line_send_result(
       p_outbound_id => %L::uuid, p_status => 'sent', p_error_detail => null,
       p_failure_class => 'transient', p_claim_token => %L::uuid) r$q$,
  (select v #>> '{}' from b12_ctx where k = 'claimed_row'),
  (select o.claim_token::text from public.line_oa_outbound_messages o
    where o.id = (select (v #>> '{}')::uuid from b12_ctx where k = 'claimed_row'))));
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'record')
  and (select o.status = 'sent' and o.sent_at is not null from public.line_oa_outbound_messages o
        where o.id = (select (v #>> '{}')::uuid from b12_ctx where k = 'claimed_row')),
  'rpc_record_line_send_result as service_role still records the claimed row as sent'
);

-- ---------------------------------------------------------------------------
-- 73-82: the five known field-app paths: an authorised user succeeds (checked
-- by data) and a user of another site is refused by the body's own guard.
-- ---------------------------------------------------------------------------
insert into b12_ctx
select 'close_ok', pg_temp.b12_call('authenticated', (select v from b12_ctx where k = 'claims_site'),
  $q$select public.rpc_field_close_lead('b1200000-0000-0000-0000-0000000000c1', 'other', 'p012 close')$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'close_ok')
  and (select lead_closed_at is not null and lead_lost_reason = 'other' from public.line_oa_conversations
        where id = 'b1200000-0000-0000-0000-0000000000c1'),
  'rpc_field_close_lead as a site user still closes the lead'
);
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_wrong'), 'rpc_field_close_lead',
    $q$select public.rpc_field_close_lead('b1200000-0000-0000-0000-0000000000c1', 'other', 'p012 wrong site')$q$),
  'body reached: 42501 insufficient permission',
  'rpc_field_close_lead for another site is refused by its own guard'
);

insert into b12_ctx
select 'source_ok', pg_temp.b12_call('authenticated', (select v from b12_ctx where k = 'claims_site'),
  $q$select to_jsonb(public.rpc_field_set_lead_source('b1200000-0000-0000-0000-0000000000c1', 'referral')::text)$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'source_ok')
  and (select lead_source = 'referral' from public.line_oa_conversations where id = 'b1200000-0000-0000-0000-0000000000c1'),
  'rpc_field_set_lead_source as a site user still sets the lead source'
);
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_wrong'), 'rpc_field_set_lead_source',
    $q$select public.rpc_field_set_lead_source('b1200000-0000-0000-0000-0000000000c1', 'walk_in')$q$),
  'body reached: 42501 insufficient permission',
  'rpc_field_set_lead_source for another site is refused by its own guard'
);

insert into b12_ctx
select 'photo_ok', pg_temp.b12_call('authenticated', (select v from b12_ctx where k = 'claims_site'),
  $q$select public.rpc_field_send_photo_to_customer('b1200000-0000-0000-0000-0000000000f1', 'b1200000-0000-0000-0000-0000000000a1', 'p012 caption')$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'photo_ok')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_id = 'C-P012-CUSTOMER' and template_key = 'tpl_prod_photo'
                and slot_values->>'media_path' = 'p012/fixture-photo.jpg'),
  'rpc_field_send_photo_to_customer as a site user still queues the photo'
);
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_wrong'), 'rpc_field_send_photo_to_customer',
    $q$select public.rpc_field_send_photo_to_customer('b1200000-0000-0000-0000-0000000000f1', 'b1200000-0000-0000-0000-0000000000a1', null)$q$),
  'body reached: 42501 insufficient permission',
  'rpc_field_send_photo_to_customer for another site is refused by its own guard'
);

-- The drawing revision needs a released-spec work item that this fixture does
-- not build: an authorised user passing the guard reaches the next validation.
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_site'), 'rpc_field_shop_drawing_revision',
    $q$select public.rpc_field_shop_drawing_revision('b1200000-0000-0000-0000-0000000000f1', '', 'p012 change', true, true)$q$),
  'body reached: 23514 ต้องมี bible code + สรุปสิ่งที่แก้',
  'rpc_field_shop_drawing_revision as a site user still passes its guard (stops at the bible-code validation)'
);
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_wrong'), 'rpc_field_shop_drawing_revision',
    $q$select public.rpc_field_shop_drawing_revision('b1200000-0000-0000-0000-0000000000f1', 'P012-BIBLE', 'p012 change', true, true)$q$),
  'body reached: 42501 insufficient permission',
  'rpc_field_shop_drawing_revision for another site is refused by its own guard'
);

insert into b12_ctx
select 'acceptance_ok', pg_temp.b12_call('authenticated', (select claims from b12_roles where role = 'authenticated'),
  $q$select to_jsonb(public.rpc_request_customer_acceptance('b1200000-0000-0000-0000-0000000000f1', 'p012 QC override for the test'))$q$);
select ok(
  (select (v->>'ok')::boolean from b12_ctx where k = 'acceptance_ok')
  and exists (select 1 from public.line_oa_outbound_messages
              where target_id = 'C-P012-CUSTOMER' and template_key = 'tpl_inst_approval_request'
                and slot_values->>'approval_id' = (select v->>'value' from b12_ctx where k = 'acceptance_ok')),
  'rpc_request_customer_acceptance as a governance user still creates the approval and queues the card'
);
select is(
  pg_temp.b12_probe('authenticated', (select v from b12_ctx where k = 'claims_wrong'), 'rpc_request_customer_acceptance',
    $q$select public.rpc_request_customer_acceptance('b1200000-0000-0000-0000-0000000000f1', null)$q$),
  'body reached: 42501 insufficient permission to request customer acceptance',
  'rpc_request_customer_acceptance for another site is refused by its own guard'
);

select * from finish();
rollback;
