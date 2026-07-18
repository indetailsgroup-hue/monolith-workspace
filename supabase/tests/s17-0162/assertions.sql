-- S17-1/S17-2 database assertions for migration 0162.
-- Assumes 0162 has just been applied inside the caller's transaction.

select set_config(
  's17.test_job_id',
  's17-0162-' || pg_backend_pid()::text,
  true
);

create or replace function pg_temp.s17_assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'S17_ASSERT_FAIL: %', p_label;
  end if;
  raise notice 'PASS: %', p_label;
end;
$$;

-- Migration shape and privilege boundary.
select pg_temp.s17_assert(
  to_regprocedure('public.rpc_factory_job_transition(text,text,text,text,text,text)') is null,
  'legacy spoofable transition overload is absent'
);
select pg_temp.s17_assert(
  to_regprocedure('public.rpc_factory_job_record_packet(text,text,text,text,text,text)') is null,
  'legacy spoofable packet overload is absent'
);
select pg_temp.s17_assert(
  to_regprocedure('public.rpc_factory_job_verify_result(text,text,text,text,text)') is null,
  'legacy spoofable verify overload is absent'
);
select pg_temp.s17_assert(
  to_regprocedure('public.rpc_factory_job_transition(text,text,text,text[],text[],text,text,text,text,text)') is not null,
  'server-context transition signature exists'
);
select pg_temp.s17_assert(
  has_function_privilege(
    'service_role',
    'public.rpc_factory_job_transition(text,text,text,text[],text[],text,text,text,text,text)',
    'EXECUTE'
  ),
  'service_role can execute transition RPC'
);
select pg_temp.s17_assert(
  not has_function_privilege(
    'authenticated',
    'public.rpc_factory_job_transition(text,text,text,text[],text[],text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute transition RPC directly'
);
select pg_temp.s17_assert(
  not has_function_privilege(
    'authenticated',
    'public.rpc_factory_job_record_packet(text,text,text,text,text,text[],text[],text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute packet RPC directly'
);
select pg_temp.s17_assert(
  not has_table_privilege('authenticated', 'public.factory_jobs', 'SELECT'),
  'authenticated cannot bypass route policy by selecting factory_jobs directly'
);
select pg_temp.s17_assert(
  not has_table_privilege('authenticated', 'public.factory_job_events', 'SELECT'),
  'authenticated cannot bypass route policy by selecting factory_job_events directly'
);
select pg_temp.s17_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('factory_jobs', 'factory_job_events')
      and 'authenticated' = any(roles)
  ),
  'legacy authenticated USING true Factory policies are absent'
);

-- A client attempting to inject a forged actor cannot reach the RPC and leaves no row/event.
set local role authenticated;
do $client_spoof$
begin
  begin
    perform public.rpc_factory_job_transition(
      current_setting('s17.test_job_id'),
      'freeze',
      'forged-client-subject',
      array['admin'],
      array['FORGED-SITE'],
      repeat('f', 64),
      'ADMIN',
      'forged-client',
      'spoof attempt',
      'METADATA'
    );
    raise exception 'S17_ASSERT_FAIL: authenticated forged actor unexpectedly reached transition RPC';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated forged actor is denied by EXECUTE boundary';
  end;
end
$client_spoof$;
reset role;

select pg_temp.s17_assert(
  not exists (
    select 1 from public.factory_jobs
    where job_id = current_setting('s17.test_job_id')
  ),
  'forged client actor did not create a factory job'
);
select pg_temp.s17_assert(
  not exists (
    select 1 from public.factory_job_events
    where job_id = current_setting('s17.test_job_id')
  ),
  'forged client actor did not create an audit event'
);

do $draft_and_freeze$
declare
  v_job text := current_setting('s17.test_job_id');
  v_context text := repeat('a', 64);
  v_result jsonb;
  v_before bigint;
begin
  -- Invalid server context must raise before creating state or evidence.
  begin
    perform public.rpc_factory_job_transition(
      v_job, 'freeze', '', array['designer'], array['BKK-HQ-01'],
      v_context, 'DESIGNER', 'designer@example.test', null, 'GEOMETRY'
    );
    raise exception 'S17_ASSERT_FAIL: empty actor subject unexpectedly accepted';
  exception
    when check_violation then
      raise notice 'PASS: malformed server actor context is rejected';
  end;
  perform pg_temp.s17_assert(
    not exists (select 1 from public.factory_jobs where job_id = v_job),
    'malformed actor context left no factory row'
  );

  -- Wrong capability for packet upload/verification is rejected before side effects.
  v_before := (select count(*) from public.factory_job_events where job_id = v_job);
  begin
    perform public.rpc_factory_job_record_packet(
      v_job, repeat('1', 64), repeat('2', 64), v_job || '/packet.zip',
      'factory-user', array['factory_operator'], array['BKK-HQ-01'],
      v_context, 'FACTORY', 'factory@example.test'
    );
    raise exception 'S17_ASSERT_FAIL: FACTORY role unexpectedly accepted for packet upload';
  exception
    when check_violation then
      raise notice 'PASS: wrong FACTORY capability is rejected for packet upload';
  end;
  begin
    perform public.rpc_factory_job_verify_result(
      v_job, 'STORAGE_HASH_MATCH', repeat('1', 64),
      'designer-user', array['designer'], array['BKK-HQ-01'],
      v_context, 'DESIGNER', 'designer@example.test'
    );
    raise exception 'S17_ASSERT_FAIL: DESIGNER role unexpectedly accepted for packet verification';
  exception
    when check_violation then
      raise notice 'PASS: wrong DESIGNER capability is rejected for verification';
  end;
  perform pg_temp.s17_assert(
    (select count(*) from public.factory_job_events where job_id = v_job) = v_before,
    'wrong-role attempts created no audit event'
  );

  -- Transition order: release from DRAFT must fail without state/event mutation.
  v_result := public.rpc_factory_job_transition(
    v_job, 'release', 'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test', null, null
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'false' and (v_result ->> 'error') like 'cannot release:%',
    'DRAFT to RELEASED transition is rejected'
  );
  perform pg_temp.s17_assert(
    (select spec_state from public.factory_jobs where job_id = v_job) = 'DRAFT',
    'invalid release leaves state DRAFT'
  );
  perform pg_temp.s17_assert(
    (select count(*) from public.factory_job_events where job_id = v_job) = 0,
    'invalid release writes no event'
  );

  -- Positive control: DRAFT -> FROZEN.
  v_result := public.rpc_factory_job_transition(
    v_job, 'freeze', 'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test', 'dogfood freeze', 'GEOMETRY'
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'true' and v_result ->> 'specState' = 'FROZEN',
    'DRAFT to FROZEN positive control succeeds'
  );
  perform pg_temp.s17_assert(
    exists (
      select 1 from public.factory_job_events
      where job_id = v_job
        and event = 'freeze'
        and actor_subject_id = 'designer-user'
        and actor_name = 'designer-user'
        and authorization_context_id = v_context
    ),
    'freeze event records server actor and authorization context'
  );
end
$draft_and_freeze$;

-- Repeat the client spoof attempt against an existing FROZEN job.
set local role authenticated;
do $existing_spoof$
begin
  begin
    perform public.rpc_factory_job_transition(
      current_setting('s17.test_job_id'),
      'release',
      'forged-admin-subject',
      array['admin'],
      array['BKK-HQ-01'],
      repeat('b', 64),
      'ADMIN',
      'forged-admin',
      null,
      null
    );
    raise exception 'S17_ASSERT_FAIL: forged client released an existing job';
  exception
    when insufficient_privilege then
      raise notice 'PASS: forged client cannot release an existing FROZEN job';
  end;
end
$existing_spoof$;
reset role;

select pg_temp.s17_assert(
  (select spec_state from public.factory_jobs where job_id = current_setting('s17.test_job_id')) = 'FROZEN',
  'client spoof leaves existing job FROZEN'
);
select pg_temp.s17_assert(
  (select count(*) from public.factory_job_events where job_id = current_setting('s17.test_job_id')) = 1,
  'client spoof adds no event to existing job'
);

do $released_only$
declare
  v_job text := current_setting('s17.test_job_id');
  v_context text := repeat('a', 64);
  v_result jsonb;
  v_events bigint;
begin
  -- Invalid transitions from FROZEN fail and leave evidence unchanged.
  v_events := (select count(*) from public.factory_job_events where job_id = v_job);
  v_result := public.rpc_factory_job_transition(
    v_job, 'freeze', 'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test', null, null
  );
  perform pg_temp.s17_assert(v_result ->> 'ok' = 'false', 'FROZEN to FROZEN freeze is rejected');
  v_result := public.rpc_factory_job_transition(
    v_job, 'revoke', 'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test', null, null
  );
  perform pg_temp.s17_assert(v_result ->> 'ok' = 'false', 'FROZEN revoke is rejected');
  perform pg_temp.s17_assert(
    (select count(*) from public.factory_job_events where job_id = v_job) = v_events,
    'invalid FROZEN transitions write no event'
  );

  -- RELEASED-only: FROZEN cannot record/upload, export, or verify.
  v_result := public.rpc_factory_job_record_packet(
    v_job, repeat('1', 64), repeat('2', 64), v_job || '/packet.zip',
    'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test'
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'false' and v_result ->> 'specState' = 'FROZEN',
    'FROZEN packet record/upload is rejected'
  );
  perform pg_temp.s17_assert(
    (select packet_storage_path is null from public.factory_jobs where job_id = v_job),
    'FROZEN packet rejection leaves storage anchor empty'
  );

  v_result := public.rpc_factory_job_packet_info(v_job);
  perform pg_temp.s17_assert(
    v_result ->> 'specState' = 'FROZEN' and v_result ->> 'canExport' = 'false',
    'FROZEN packet info is non-exportable'
  );

  v_result := public.rpc_factory_job_verify_result(
    v_job, 'STORAGE_HASH_MATCH', repeat('1', 64),
    'factory-user', array['factory_operator'], array['BKK-HQ-01'],
    v_context, 'FACTORY', 'factory@example.test'
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'false' and v_result ->> 'specState' = 'FROZEN',
    'FROZEN packet verification is rejected'
  );
  perform pg_temp.s17_assert(
    (select count(*) from public.factory_job_events where job_id = v_job) = v_events,
    'all FROZEN output attempts write no packet/verify event'
  );

  -- Positive controls after explicit Release.
  v_result := public.rpc_factory_job_transition(
    v_job, 'release', 'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test', 'dogfood release', null
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'true' and v_result ->> 'specState' = 'RELEASED',
    'FROZEN to RELEASED positive control succeeds'
  );

  v_result := public.rpc_factory_job_record_packet(
    v_job, repeat('1', 64), repeat('2', 64), v_job || '/packet.zip',
    'designer-user', array['designer'], array['BKK-HQ-01'],
    v_context, 'DESIGNER', 'designer@example.test'
  );
  perform pg_temp.s17_assert(v_result ->> 'ok' = 'true', 'RELEASED packet record succeeds');

  v_result := public.rpc_factory_job_packet_info(v_job);
  perform pg_temp.s17_assert(
    v_result ->> 'specState' = 'RELEASED' and v_result ->> 'canExport' = 'true',
    'RELEASED packet with storage anchor is exportable'
  );

  v_result := public.rpc_factory_job_verify_result(
    v_job, 'STORAGE_HASH_MATCH', repeat('1', 64),
    'factory-user', array['factory_operator'], array['BKK-HQ-01'],
    v_context, 'FACTORY', 'factory@example.test'
  );
  perform pg_temp.s17_assert(v_result ->> 'ok' = 'true', 'RELEASED packet verification succeeds');

  -- FS-B1-02 (0163): legacy full-verification vocabulary is rejected — a
  -- whole-ZIP hash check can never be recorded as PASS again.
  v_result := public.rpc_factory_job_verify_result(
    v_job, 'PASS', repeat('1', 64),
    'factory-user', array['factory_operator'], array['BKK-HQ-01'],
    v_context, 'FACTORY', 'factory@example.test'
  );
  perform pg_temp.s17_assert(
    v_result ->> 'ok' = 'false' and v_result ->> 'error' = 'invalid verdict',
    'legacy PASS verdict is rejected by storage-hash vocabulary (B1-02)'
  );
  perform pg_temp.s17_assert(
    exists (
      select 1 from public.factory_job_events
      where job_id = v_job
        and event = 'verify'
        and actor_subject_id = 'factory-user'
        and actor_name = 'factory-user'
        and authorization_context_id = v_context
    ),
    'verify event records server-derived factory actor context'
  );
  perform pg_temp.s17_assert(
    not exists (
      select 1 from public.factory_job_events
      where job_id = v_job and actor_name like '%@%'
    ) and (select actor_name from public.factory_jobs where job_id = v_job) = 'designer-user',
    'actor_name persists verified subject IDs and not supplied email values'
  );

  raise notice 'S17_0162_ASSERTIONS_PASS job_id=%', v_job;
end
$released_only$;
