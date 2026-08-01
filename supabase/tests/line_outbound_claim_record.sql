-- pgTAP DB-level invariants — LINE OA outbound claim + result recording (Phase A1)
-- Feature: atomic outbound claims, service-safe/group-aware single-delivery
-- recording, and five-attempt bounded retry (migration 0193).
--
-- Run only inside the shared-stack rollback wrapper:
--   psql "$DSN" -X -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/migrations/0193_line_outbound_claim_and_record.sql \
--     -f supabase/tests/line_outbound_claim_record.sql
--
-- The caller opens the transaction so any prerequisite migration(s) and this
-- suite share one rollback boundary. This file always issues the final ROLLBACK.

\set ON_ERROR_STOP on

create extension if not exists pgtap;
select plan(46);

-- ---------------------------------------------------------------------------
-- Test-only dynamic helpers let the complete suite run against the pre-0193
-- schema for RED evidence instead of aborting at the first missing column/RPC.
-- Every helper returns ok=false plus SQLSTATE when the wished-for API is absent.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.a1_claim_as(
  p_role text,
  p_claims jsonb,
  p_limit int,
  p_timeout_seconds int
)
returns jsonb
language plpgsql
as $$
declare
  v_rows jsonb;
  v_state text;
  v_message text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  begin
    execute format('set local role %I', p_role);
    execute $sql$
      select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from public.rpc_claim_line_outbound_batch($1, $2) c
    $sql$ into v_rows using p_limit, p_timeout_seconds;
    execute 'reset role';
    return jsonb_build_object('ok', true, 'rows', v_rows);
  exception when others then
    v_state := sqlstate;
    v_message := sqlerrm;
    begin execute 'reset role'; exception when others then null; end;
    return jsonb_build_object(
      'ok', false,
      'sqlstate', v_state,
      'error', v_message,
      'rows', '[]'::jsonb
    );
  end;
end;
$$;

create or replace function pg_temp.a1_record_as(
  p_role text,
  p_claims jsonb,
  p_outbound_id uuid,
  p_status text,
  p_error_detail text
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
  v_state text;
  v_message text;
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  begin
    execute format('set local role %I', p_role);
    execute $sql$
      select to_jsonb(r)
      from public.rpc_record_line_send_result($1, $2, $3) r
    $sql$ into v_result using p_outbound_id, p_status, p_error_detail;
    execute 'reset role';
    return jsonb_build_object('ok', true, 'result', v_result);
  exception when others then
    v_state := sqlstate;
    v_message := sqlerrm;
    begin execute 'reset role'; exception when others then null; end;
    return jsonb_build_object(
      'ok', false,
      'sqlstate', v_state,
      'error', v_message
    );
  end;
end;
$$;

create or replace function pg_temp.a1_outbound_state(p_outbound_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
begin
  execute $sql$
    select to_jsonb(s)
    from (
      select status::text as status,
             error_detail,
             sent_by,
             sent_at,
             claimed_at,
             claimed_by,
             attempt_count
      from public.line_oa_outbound_messages
      where id = $1
    ) s
  $sql$ into v_row using p_outbound_id;
  return jsonb_build_object('ok', v_row is not null, 'row', v_row);
exception when others then
  return jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'error', sqlerrm);
end;
$$;

create or replace function pg_temp.a1_expire_claim(
  p_outbound_id uuid,
  p_age_seconds int
)
returns boolean
language plpgsql
as $$
declare
  v_updated int;
begin
  execute $sql$
    update public.line_oa_outbound_messages
       set claimed_at = timezone('utc', now()) - make_interval(secs => $2),
           claimed_by = 'expired-a1-worker'
     where id = $1
  $sql$ using p_outbound_id, p_age_seconds;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
exception when others then
  return false;
end;
$$;

create temporary table a1_results (
  label text primary key,
  payload jsonb not null
);

-- ---------------------------------------------------------------------------
-- 1-18: schema, signature, SECURITY DEFINER posture, and exact grants.
-- ---------------------------------------------------------------------------
select has_column('public', 'line_oa_outbound_messages', 'claimed_at',
  'outbound messages have nullable claimed_at');
select has_column('public', 'line_oa_outbound_messages', 'claimed_by',
  'outbound messages have nullable claimed_by');
select has_column('public', 'line_oa_outbound_messages', 'attempt_count',
  'outbound messages have attempt_count');
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'line_oa_outbound_messages'
     and column_name = 'claimed_at'),
  'YES', 'claimed_at is nullable'
);
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'line_oa_outbound_messages'
     and column_name = 'claimed_by'),
  'YES', 'claimed_by is nullable'
);
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'line_oa_outbound_messages'
     and column_name = 'attempt_count'),
  'NO', 'attempt_count is NOT NULL'
);
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'line_oa_outbound_messages'
     and column_name = 'attempt_count'),
  '0', 'attempt_count defaults to zero'
);
select ok(
  to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)') is not null,
  'claim RPC has the required (int, int) signature'
);
select ok(
  coalesce((select prosecdef from pg_proc
            where oid = to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)')), false),
  'claim RPC is SECURITY DEFINER'
);
select is(
  coalesce((select pronargdefaults::int from pg_proc
            where oid = to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)')), 0),
  1, 'only claim timeout has a default'
);
select ok(
  coalesce(has_function_privilege(
    'service_role', to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)'), 'EXECUTE'), false),
  'service_role can execute claim RPC'
);
select ok(
  not coalesce(has_function_privilege(
    'authenticated', to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)'), 'EXECUTE'), false),
  'authenticated cannot execute claim RPC'
);
select ok(
  not coalesce(has_function_privilege(
    'anon', to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)'), 'EXECUTE'), false),
  'anon cannot execute claim RPC'
);
select ok(
  to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)') is not null
  and not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)')
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute claim RPC'
);
select ok(
  coalesce((select prosecdef from pg_proc
            where oid = to_regprocedure('public.rpc_record_line_send_result(uuid,text,text)')), false),
  'record-result RPC remains SECURITY DEFINER'
);
select ok(
  coalesce(has_function_privilege(
    'service_role', to_regprocedure('public.rpc_record_line_send_result(uuid,text,text)'), 'EXECUTE'), false),
  'service_role can execute record-result RPC'
);
select ok(
  coalesce(has_function_privilege(
    'authenticated', to_regprocedure('public.rpc_record_line_send_result(uuid,text,text)'), 'EXECUTE'), false),
  'authenticated retains record-result EXECUTE for the guarded human path'
);
select ok(
  not coalesce(has_function_privilege(
    'anon', to_regprocedure('public.rpc_record_line_send_result(uuid,text,text)'), 'EXECUTE'), false)
  and not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = to_regprocedure('public.rpc_record_line_send_result(uuid,text,text)')
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'anon and PUBLIC cannot execute record-result RPC'
);

-- ---------------------------------------------------------------------------
-- 19-20: fail closed on invalid claim bounds; NULL LIMIT means unlimited in
-- PostgreSQL and a non-positive timeout defeats lease exclusivity.
-- ---------------------------------------------------------------------------
insert into a1_results values (
  'claim_invalid_limit',
  jsonb_build_object(
    'null_limit', pg_temp.a1_claim_as(
      'service_role', '{"role":"service_role"}'::jsonb, null, 300),
    'zero_limit', pg_temp.a1_claim_as(
      'service_role', '{"role":"service_role"}'::jsonb, 0, 300)
  )
);
select ok(
  not coalesce(((select payload->'null_limit'->>'ok' from a1_results where label = 'claim_invalid_limit'))::boolean, true)
  and (select payload->'null_limit'->>'sqlstate' from a1_results where label = 'claim_invalid_limit') = '22023'
  and not coalesce(((select payload->'zero_limit'->>'ok' from a1_results where label = 'claim_invalid_limit'))::boolean, true)
  and (select payload->'zero_limit'->>'sqlstate' from a1_results where label = 'claim_invalid_limit') = '22023',
  'claim RPC rejects NULL and non-positive batch limits'
);

insert into a1_results values (
  'claim_invalid_timeout',
  jsonb_build_object(
    'null_timeout', pg_temp.a1_claim_as(
      'service_role', '{"role":"service_role"}'::jsonb, 1, null),
    'zero_timeout', pg_temp.a1_claim_as(
      'service_role', '{"role":"service_role"}'::jsonb, 1, 0)
  )
);
select ok(
  not coalesce(((select payload->'null_timeout'->>'ok' from a1_results where label = 'claim_invalid_timeout'))::boolean, true)
  and (select payload->'null_timeout'->>'sqlstate' from a1_results where label = 'claim_invalid_timeout') = '22023'
  and not coalesce(((select payload->'zero_timeout'->>'ok' from a1_results where label = 'claim_invalid_timeout'))::boolean, true)
  and (select payload->'zero_timeout'->>'sqlstate' from a1_results where label = 'claim_invalid_timeout') = '22023',
  'claim RPC rejects NULL and non-positive lease timeouts'
);

-- ---------------------------------------------------------------------------
-- Claim fixture and 21-26: one active claim, timeout reclaim, terminal skip.
-- ---------------------------------------------------------------------------
insert into public.line_oa_conversations (
  id, line_user_id, vertical_context, site_code, status
) values (
  'a1000000-0000-0000-0000-00000000c001',
  'U-A1-CLAIM', 'monolith', 'A1-SITE', 'open'
);

insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-00000000c001',
  'push', 'pending', 'tpl_a1_claim', '{}'::jsonb
);

insert into a1_results values (
  'claim_first',
  pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 1, 300)
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_first')->>'ok')::boolean, false)
  and coalesce(jsonb_array_length((select payload->'rows' from a1_results where label = 'claim_first')), 0) = 1
  and (select payload->'rows'->0->>'id' from a1_results where label = 'claim_first')
      = 'a1000000-0000-0000-0000-000000000001',
  'first service claim returns the pending row exactly once'
);
select ok(
  coalesce(
    ((select payload->'rows'->0 from a1_results where label = 'claim_first')
      ?& array['id', 'conversation_id', 'send_type', 'template_key', 'slot_values', 'target_type', 'target_id']),
    false
  ),
  'claim result returns every column the sender needs'
);
select ok(
  coalesce((pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000001')->>'ok')::boolean, false)
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000001')->'row'->>'claimed_at' is not null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000001')->'row'->>'claimed_by' = 'system',
  'claim stamps claimed_at and resolve_actor() as claimed_by'
);

insert into a1_results values (
  'claim_second',
  pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 1, 300)
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_second')->>'ok')::boolean, false)
  and coalesce(jsonb_array_length((select payload->'rows' from a1_results where label = 'claim_second')), 0) = 0,
  'second claim in the same session returns zero while the first claim is live'
);

insert into a1_results values (
  'claim_expired',
  case
    when pg_temp.a1_expire_claim('a1000000-0000-0000-0000-000000000001', 301)
    then pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 1, 300)
    else jsonb_build_object('ok', false, 'rows', '[]'::jsonb)
  end
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_expired')->>'ok')::boolean, false)
  and coalesce(jsonb_array_length((select payload->'rows' from a1_results where label = 'claim_expired')), 0) = 1
  and (select payload->'rows'->0->>'id' from a1_results where label = 'claim_expired')
      = 'a1000000-0000-0000-0000-000000000001'
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000001')->'row'->>'claimed_by' = 'system',
  'an expired claim is reclaimable and receives fresh claim ownership'
);

insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values
) values
  ('a1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-00000000c001', 'push', 'sent', 'tpl_a1_sent', '{}'::jsonb),
  ('a1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-00000000c001', 'push', 'failed', 'tpl_a1_failed', '{}'::jsonb);

insert into a1_results values (
  'claim_nonpending',
  pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 10, 300)
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_nonpending')->>'ok')::boolean, false)
  and coalesce(jsonb_array_length((select payload->'rows' from a1_results where label = 'claim_nonpending')), 0) = 0
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000002')->'row'->>'claimed_at' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000003')->'row'->>'claimed_at' is null,
  'sent and failed rows are never claimed'
);

-- ---------------------------------------------------------------------------
-- Bound-group fixture and 27-32: service result, group audit, single delivery.
-- ---------------------------------------------------------------------------
insert into public.line_groups (
  id, line_group_id, project_id, site_code, group_type, status,
  vertical_context, bound_by
) values (
  'a1000000-0000-0000-0000-00000000a001',
  'C-A1-BOUND-GROUP', null, 'A1-GROUP-SITE', 'factory', 'active',
  'factory-a1', 'a1-fixture'
);

insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values,
  target_type, target_id
) values (
  'a1000000-0000-0000-0000-000000000010',
  null, 'push', 'pending', 'tpl_a1_group', '{}'::jsonb,
  'group', 'C-A1-BOUND-GROUP'
);

insert into a1_results values (
  'claim_group',
  pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 1, 300)
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_group')->>'ok')::boolean, false)
  and (select payload->'rows'->0->>'id' from a1_results where label = 'claim_group')
      = 'a1000000-0000-0000-0000-000000000010',
  'group outbound rows participate in the atomic claim RPC'
);

insert into a1_results values (
  'record_group_sent',
  pg_temp.a1_record_as(
    'service_role', '{}'::jsonb,
    'a1000000-0000-0000-0000-000000000010', 'sent', null
  )
);
select ok(
  coalesce(((select payload from a1_results where label = 'record_group_sent')->>'ok')::boolean, false)
  and coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'record_group_sent'))::boolean, false)
  and (select payload->'result'->>'status' from a1_results where label = 'record_group_sent') = 'sent',
  'service role with absent JWT claims records a group send successfully'
);
select ok(
  pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000010')->'row'->>'status' = 'sent'
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000010')->'row'->>'claimed_at' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000010')->'row'->>'claimed_by' is null
  and (pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000010')->'row'->>'attempt_count')::int = 0,
  'successful recording sends once and clears both claim fields'
);
select ok(
  (select count(*) = 1
   from public.line_oa_audit_log
   where event_type = 'outbound_send_result_recorded'
     and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000010|%'
     and vertical_context = 'factory-a1'
     and site_code is null
     and performed_by = 'line-outbound-sender'),
  'group result audit uses line_groups vertical, NULL site, and system sender actor'
);

insert into a1_results values (
  'record_group_duplicate',
  pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000010', 'failed', 'late duplicate'
  )
);
select ok(
  coalesce(((select payload from a1_results where label = 'record_group_duplicate')->>'ok')::boolean, false)
  and not coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'record_group_duplicate'))::boolean, true),
  'already-sent row returns recorded=false'
);
select ok(
  pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000010')->'row'->>'status' = 'sent'
  and (select count(*) = 1
       from public.line_oa_audit_log
       where event_type = 'outbound_send_result_recorded'
         and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000010|%'),
  'duplicate result cannot flip status or write a second audit row'
);

-- ---------------------------------------------------------------------------
-- 33-34: unbound-group vertical fallback is the sender's 0097 "monolith" default.
-- ---------------------------------------------------------------------------
insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values,
  target_type, target_id
) values (
  'a1000000-0000-0000-0000-000000000011',
  null, 'push', 'pending', 'tpl_inst_bind_prompt', '{}'::jsonb,
  'group', 'C-A1-UNBOUND-GROUP'
);
insert into a1_results values (
  'record_group_fallback',
  pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000011', 'sent', null
  )
);
select ok(
  coalesce(((select payload from a1_results where label = 'record_group_fallback')->>'ok')::boolean, false)
  and coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'record_group_fallback'))::boolean, false),
  'service context records an unbound-group prompt row'
);
select ok(
  (select count(*) = 1
   from public.line_oa_audit_log
   where event_type = 'outbound_send_result_recorded'
     and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000011|%'
     and vertical_context = 'monolith'
     and site_code is null
     and performed_by = 'line-outbound-sender'),
  'unbound group audit uses the 0097 monolith fallback and NULL site'
);

-- ---------------------------------------------------------------------------
-- Unauthorized human fixture and 35-38: existing role/site criteria stay intact;
-- forged service JWT claims and NULL result status both fail closed.
-- ---------------------------------------------------------------------------
insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values
) values (
  'a1000000-0000-0000-0000-00000000f001',
  'a1000000-0000-0000-0000-00000000c001',
  'push', 'pending', 'tpl_a1_unauthorized', '{}'::jsonb
);
insert into a1_results values (
  'record_unauthorized',
  pg_temp.a1_record_as(
    'authenticated',
    '{"role":"authenticated","sub":"a1000000-0000-0000-0000-00000000bad1"}'::jsonb,
    'a1000000-0000-0000-0000-00000000f001', 'sent', null
  )
);
select ok(
  not coalesce(((select payload from a1_results where label = 'record_unauthorized')->>'ok')::boolean, true)
  and (select payload->>'sqlstate' from a1_results where label = 'record_unauthorized') = '42501',
  'authenticated user without governance role or site access is still denied'
);
select ok(
  (select status = 'pending'
   from public.line_oa_outbound_messages
   where id = 'a1000000-0000-0000-0000-00000000f001')
  and (select count(*) = 0
       from public.line_oa_audit_log
       where event_type = 'outbound_send_result_recorded'
         and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-00000000f001|%'),
  'denied user call changes no state and writes no audit'
);

insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values
) values
  ('a1000000-0000-0000-0000-00000000f002',
   'a1000000-0000-0000-0000-00000000c001',
   'push', 'pending', 'tpl_a1_forged_service', '{}'::jsonb),
  ('a1000000-0000-0000-0000-00000000f003',
   'a1000000-0000-0000-0000-00000000c001',
   'push', 'pending', 'tpl_a1_null_status', '{}'::jsonb);

insert into a1_results values (
  'record_forged_service_claim',
  pg_temp.a1_record_as(
    'authenticated',
    '{"role":"service_role","sub":"a1000000-0000-0000-0000-00000000bad2"}'::jsonb,
    'a1000000-0000-0000-0000-00000000f002', 'sent', null
  )
);
select ok(
  not coalesce(((select payload from a1_results where label = 'record_forged_service_claim')->>'ok')::boolean, true)
  and (select payload->>'sqlstate' from a1_results where label = 'record_forged_service_claim') = '42501'
  and (select status = 'pending' from public.line_oa_outbound_messages
       where id = 'a1000000-0000-0000-0000-00000000f002')
  and (select count(*) = 0 from public.line_oa_audit_log
       where event_type = 'outbound_send_result_recorded'
         and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-00000000f002|%'),
  'authenticated caller cannot forge service_role through request JWT claims'
);

insert into a1_results values (
  'record_null_status',
  pg_temp.a1_record_as(
    'service_role', '{}'::jsonb,
    'a1000000-0000-0000-0000-00000000f003', null, null
  )
);
select ok(
  not coalesce(((select payload from a1_results where label = 'record_null_status')->>'ok')::boolean, true)
  and (select payload->>'sqlstate' from a1_results where label = 'record_null_status') = '22023'
  and (select status = 'pending' from public.line_oa_outbound_messages
       where id = 'a1000000-0000-0000-0000-00000000f003')
  and (select count(*) = 0 from public.line_oa_audit_log
       where event_type = 'outbound_send_result_recorded'
         and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-00000000f003|%'),
  'NULL result status is rejected without state or audit change'
);

-- ---------------------------------------------------------------------------
-- Retry fixture and 39-46: transient re-pend, fifth failure terminal, no flip.
-- ---------------------------------------------------------------------------
insert into public.line_oa_outbound_messages (
  id, conversation_id, send_type, status, template_key, slot_values
) values (
  'a1000000-0000-0000-0000-000000000020',
  'a1000000-0000-0000-0000-00000000c001',
  'push', 'pending', 'tpl_a1_retry', '{}'::jsonb
);
insert into a1_results values (
  'claim_retry',
  pg_temp.a1_claim_as('service_role', '{"role":"service_role"}'::jsonb, 1, 300)
);
select ok(
  coalesce(((select payload from a1_results where label = 'claim_retry')->>'ok')::boolean, false)
  and (select payload->'rows'->0->>'id' from a1_results where label = 'claim_retry')
      = 'a1000000-0000-0000-0000-000000000020',
  'retry fixture is claimed before its first delivery attempt'
);

insert into a1_results values (
  'retry_failure_1',
  pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'failed', 'temporary LINE 503'
  )
);
select ok(
  coalesce(((select payload from a1_results where label = 'retry_failure_1')->>'ok')::boolean, false)
  and coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'retry_failure_1'))::boolean, false)
  and (select payload->'result'->>'status' from a1_results where label = 'retry_failure_1') = 'pending',
  'first transient failure is recorded but returned to pending'
);
select ok(
  pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'status' = 'pending'
  and (pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'attempt_count')::int = 1
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'claimed_at' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'claimed_by' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'error_detail' = 'temporary LINE 503',
  'transient failure increments attempt_count, clears claim, and stores error detail'
);
select ok(
  (select count(*) = 1
   from public.line_oa_audit_log
   where event_type = 'outbound_send_result_recorded'
     and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000020|%'
     and performed_by = 'line-outbound-sender'),
  'first transient failure writes one result audit'
);

insert into a1_results values
  ('retry_failure_2', pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'failed', 'temporary LINE 503 attempt 2')),
  ('retry_failure_3', pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'failed', 'temporary LINE 503 attempt 3')),
  ('retry_failure_4', pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'failed', 'temporary LINE 503 attempt 4')),
  ('retry_failure_5', pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'failed', 'temporary LINE 503 attempt 5'));
select ok(
  coalesce(((select payload from a1_results where label = 'retry_failure_5')->>'ok')::boolean, false)
  and coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'retry_failure_5'))::boolean, false)
  and (select payload->'result'->>'status' from a1_results where label = 'retry_failure_5') = 'failed',
  'fifth failure is recorded as terminal failed'
);
select ok(
  pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'status' = 'failed'
  and (pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'attempt_count')::int = 5
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'sent_at' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'claimed_at' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'claimed_by' is null
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'error_detail' = 'temporary LINE 503 attempt 5',
  'terminal failure keeps attempt_count=5, no sent timestamp, and the last scrubbed error'
);
select ok(
  (select count(*) = 5
   from public.line_oa_audit_log
   where event_type = 'outbound_send_result_recorded'
     and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000020|%'
     and performed_by = 'line-outbound-sender'),
  'each of five recorded failures writes exactly one audit row'
);

insert into a1_results values (
  'retry_flip_sent',
  pg_temp.a1_record_as(
    'service_role', '{"role":"service_role"}'::jsonb,
    'a1000000-0000-0000-0000-000000000020', 'sent', null
  )
);
select ok(
  coalesce(((select payload from a1_results where label = 'retry_flip_sent')->>'ok')::boolean, false)
  and not coalesce(((select payload->'result'->>'recorded' from a1_results where label = 'retry_flip_sent'))::boolean, true)
  and pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'status' = 'failed'
  and (pg_temp.a1_outbound_state('a1000000-0000-0000-0000-000000000020')->'row'->>'attempt_count')::int = 5
  and (select count(*) = 5
       from public.line_oa_audit_log
       where event_type = 'outbound_send_result_recorded'
         and entity_ref like 'line_oa_outbound_message:a1000000-0000-0000-0000-000000000020|%'),
  'terminal failed row rejects failed-to-sent flip without state or audit change'
);

select * from finish();
rollback;
