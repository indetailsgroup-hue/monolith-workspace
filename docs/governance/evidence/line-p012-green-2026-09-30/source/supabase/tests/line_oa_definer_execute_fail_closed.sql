-- pgTAP - B12 / P0-12: 0199 must fail closed. If an EXECUTE right the matrix
-- denies would survive (through role membership or another grantor), if a
-- right the matrix keeps would be lost (reachable only through PUBLIC), or if a
-- covered name has an unclassified overload, the migration must stop and its
-- own revokes must not persist. It never grants or changes memberships.
--
-- The migration file itself is executed with \ir (no copy of its logic here).
-- Default: ../migrations/0199_line_oa_restrict_definer_execute.sql. An evidence
-- run may pass -v p012_migration=<path> to point at a mutant copy.
--
-- Run inside a rollback wrapper against a database that already has 0199:
--   psql "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/tests/line_oa_definer_execute_fail_closed.sql
-- Facts inside each case are captured into psql variables; the pgTAP
-- assertions run only after the case's savepoint is rolled back, so pgTAP's own
-- bookkeeping is never undone. This file always issues the final ROLLBACK.

\set ON_ERROR_STOP on
\if :{?p012_migration}
\else
  \set p012_migration ../migrations/0199_line_oa_restrict_definer_execute.sql
\endif
\echo '# migration under test:' :p012_migration

create extension if not exists pgtap;
select plan(23);

create temporary table p012_matrix (sig text, target text);
insert into p012_matrix values
  ('fn_lead_followup_sweep()', 'f/f/t'), ('fn_line_handle_group_event(jsonb,text,text)', 'f/f/f'),
  ('fn_prod_curated(uuid,text,jsonb)', 'f/f/f'), ('fn_welcome_on_group_bind()', 'f/f/f'),
  ('line_oa_resolve_customer_identity(text,text)', 'f/f/t'), ('rpc_claim_line_outbound_batch(integer,integer)', 'f/f/t'),
  ('rpc_create_line_order(uuid,jsonb,text,text)', 'f/t/t'),
  ('rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)', 'f/t/t'),
  ('rpc_field_assign_lead(uuid,uuid)', 'f/t/t'), ('rpc_field_close_lead(uuid,text,text)', 'f/t/t'),
  ('rpc_field_send_photo_to_customer(uuid,uuid,text)', 'f/t/t'), ('rpc_field_set_lead_source(uuid,text)', 'f/t/t'),
  ('rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)', 'f/t/t'),
  ('rpc_ingest_line_webhook(text,text,text)', 'f/f/t'), ('rpc_record_line_send_result(uuid,text,text,text,uuid)', 'f/f/t'),
  ('rpc_request_customer_acceptance(uuid,text)', 'f/t/t'), ('rpc_resolve_conversation_site(uuid,text,text)', 'f/t/t'),
  ('rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)', 'f/t/t'),
  ('rpc_sweep_line_session_timeouts()', 'f/f/t'), ('rpc_sync_line_forecast(text,text,text)', 'f/t/t');

-- Every privilege fact 0199 could touch: the ACL of every public function whose
-- name is one of the twenty (overloads included), and role membership edges.
create or replace function pg_temp.p012_state()
returns text
language sql
as $$
  select concat_ws(E'\n',
    (select string_agg(p.oid::regprocedure::text || '=' || coalesce(p.proacl::text, '<default>'), E'\n' order by 1)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (select split_part(sig, '(', 1) from p012_matrix)),
    (select string_agg(m.member::regrole::text || '>' || m.roleid::regrole::text, E'\n' order by 1)
       from pg_auth_members m))
$$;

-- anon's direct EXECUTE on rpc_sync_line_forecast: 0199 revokes it (target f).
create or replace function pg_temp.p012_anon_direct_on_forecast()
returns boolean
language sql
as $$
  select exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.rpc_sync_line_forecast(text,text,text)'::regprocedure
      and a.grantee = 'anon'::regrole and a.privilege_type = 'EXECUTE')
$$;

create or replace function pg_temp.p012_matrix_met()
returns boolean
language sql
as $$
  select not exists (
    select 1 from p012_matrix m
    cross join lateral unnest(array['anon', 'authenticated', 'service_role']) with ordinality as x(r, o)
    where has_function_privilege(x.r, ('public.' || m.sig)::regprocedure, 'EXECUTE') <> (split_part(m.target, '/', x.o::int) = 't'))
  and not exists (
    select 1 from p012_matrix m
    join pg_proc p on p.oid = ('public.' || m.sig)::regprocedure
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
$$;

-- 1: scope guard.
select ok(
  (select count(*) from p012_matrix where to_regprocedure('public.' || sig) is not null) = 20
  and pg_temp.p012_matrix_met(),
  'scope guard: the twenty identities exist and already match the matrix (0199 applied)'
);

-- ---------------------------------------------------------------------------
-- Case A (2-6): anon inherits EXECUTE on fn_prod_curated from a throwaway role,
-- plus a direct EXECUTE on rpc_sync_line_forecast that 0199 does revoke.
-- ---------------------------------------------------------------------------
savepoint p012_case_a;
create role p012_fc_exec nologin;
grant execute on function public.fn_prod_curated(uuid, text, jsonb) to p012_fc_exec;
grant p012_fc_exec to anon;
grant execute on function public.rpc_sync_line_forecast(text, text, text) to anon;
select pg_temp.p012_state() as case_a_before,
       has_function_privilege('anon', 'public.fn_prod_curated(uuid,text,jsonb)', 'EXECUTE')
       and pg_temp.p012_anon_direct_on_forecast() as case_a_pre \gset
savepoint p012_case_a_migration;
\set ON_ERROR_STOP off
\ir :p012_migration
\set case_a_error :ERROR
\set case_a_sqlstate :SQLSTATE
\if :case_a_error
  \set case_a_message :LAST_ERROR_MESSAGE
  rollback to savepoint p012_case_a_migration;
\else
  \set case_a_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p012_state() as case_a_after, pg_temp.p012_anon_direct_on_forecast() as case_a_direct_back \gset
rollback to savepoint p012_case_a;
release savepoint p012_case_a;

select ok(:'case_a_pre'::boolean,
  'case A precondition: anon can execute fn_prod_curated only through role membership, and holds a direct EXECUTE on rpc_sync_line_forecast');
select is(:'case_a_sqlstate'::text, '42501'::text, 'case A: the migration raises SQLSTATE 42501 when an inherited EXECUTE survives');
select ok(:'case_a_message' like 'B12: EXECUTE matrix not met after revoke%' and :'case_a_message' like '%anon:fn_prod_curated(uuid,text,jsonb) want f%',
  'case A: the message starts with "B12: EXECUTE matrix not met after revoke" and names anon:fn_prod_curated');
select is(:'case_a_after'::text, :'case_a_before'::text, 'case A: after the error every function ACL and membership is exactly as before');
select ok(:'case_a_direct_back'::boolean, 'case A: the direct EXECUTE that 0199 revoked on rpc_sync_line_forecast is back after the error');

-- ---------------------------------------------------------------------------
-- Case B (7-11): authenticated holds EXECUTE on fn_line_handle_group_event
-- granted by another grantor, plus the same direct anon EXECUTE.
-- ---------------------------------------------------------------------------
savepoint p012_case_b;
create role p012_fc_grantor nologin;
-- PostgreSQL 16+: the creating role gets ADMIN but not SET on a new role.
grant p012_fc_grantor to current_user with set true, inherit false;
grant usage on schema public to p012_fc_grantor;
grant execute on function public.fn_line_handle_group_event(jsonb, text, text) to p012_fc_grantor with grant option;
set local role p012_fc_grantor;
grant execute on function public.fn_line_handle_group_event(jsonb, text, text) to authenticated;
reset role;
grant execute on function public.rpc_sync_line_forecast(text, text, text) to anon;
select pg_temp.p012_state() as case_b_before,
       exists (select 1 from pg_proc p
               cross join lateral aclexplode(p.proacl) a
               where p.oid = 'public.fn_line_handle_group_event(jsonb,text,text)'::regprocedure
                 and a.grantee = 'authenticated'::regrole and a.grantor = 'p012_fc_grantor'::regrole
                 and a.privilege_type = 'EXECUTE')
       and pg_temp.p012_anon_direct_on_forecast() as case_b_pre \gset
savepoint p012_case_b_migration;
\set ON_ERROR_STOP off
\ir :p012_migration
\set case_b_error :ERROR
\set case_b_sqlstate :SQLSTATE
\if :case_b_error
  \set case_b_message :LAST_ERROR_MESSAGE
  rollback to savepoint p012_case_b_migration;
\else
  \set case_b_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p012_state() as case_b_after, pg_temp.p012_anon_direct_on_forecast() as case_b_direct_back \gset
rollback to savepoint p012_case_b;
release savepoint p012_case_b;

select ok(:'case_b_pre'::boolean,
  'case B precondition: authenticated holds EXECUTE on fn_line_handle_group_event from another grantor, and anon a direct EXECUTE on rpc_sync_line_forecast');
select is(:'case_b_sqlstate'::text, '42501'::text, 'case B: the migration raises SQLSTATE 42501 when another grantor''s EXECUTE survives');
select ok(:'case_b_message' like 'B12: EXECUTE matrix not met after revoke%' and :'case_b_message' like '%authenticated:fn_line_handle_group_event(jsonb,text,text) want f%',
  'case B: the message starts with "B12: EXECUTE matrix not met after revoke" and names authenticated:fn_line_handle_group_event');
select is(:'case_b_after'::text, :'case_b_before'::text, 'case B: after the error every function ACL and membership is exactly as before');
select ok(:'case_b_direct_back'::boolean, 'case B: the direct EXECUTE that 0199 revoked on rpc_sync_line_forecast is back after the error');

-- ---------------------------------------------------------------------------
-- Case C (12-16): authenticated reaches rpc_create_line_order only through
-- PUBLIC. Removing PUBLIC would break a KEEP, so 0199 must stop, not re-grant.
-- ---------------------------------------------------------------------------
savepoint p012_case_c;
revoke execute on function public.rpc_create_line_order(uuid, jsonb, text, text) from authenticated;
grant execute on function public.rpc_create_line_order(uuid, jsonb, text, text) to public;
grant execute on function public.rpc_sync_line_forecast(text, text, text) to anon;
select pg_temp.p012_state() as case_c_before,
       has_function_privilege('authenticated', 'public.rpc_create_line_order(uuid,jsonb,text,text)', 'EXECUTE')
       and not exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
                       where p.oid = 'public.rpc_create_line_order(uuid,jsonb,text,text)'::regprocedure
                         and a.grantee = 'authenticated'::regrole)
       and pg_temp.p012_anon_direct_on_forecast() as case_c_pre \gset
savepoint p012_case_c_migration;
\set ON_ERROR_STOP off
\ir :p012_migration
\set case_c_error :ERROR
\set case_c_sqlstate :SQLSTATE
\if :case_c_error
  \set case_c_message :LAST_ERROR_MESSAGE
  rollback to savepoint p012_case_c_migration;
\else
  \set case_c_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p012_state() as case_c_after, pg_temp.p012_anon_direct_on_forecast() as case_c_direct_back \gset
rollback to savepoint p012_case_c;
release savepoint p012_case_c;

select ok(:'case_c_pre'::boolean,
  'case C precondition: authenticated can execute rpc_create_line_order only through PUBLIC, and anon holds a direct EXECUTE on rpc_sync_line_forecast');
select is(:'case_c_sqlstate'::text, '42501'::text, 'case C: the migration raises SQLSTATE 42501 when a kept right would be lost');
select ok(:'case_c_message' like 'B12: EXECUTE matrix not met after revoke%' and :'case_c_message' like '%authenticated:rpc_create_line_order(uuid,jsonb,text,text) want t%',
  'case C: the message names authenticated:rpc_create_line_order want t, and nothing is granted in its place');
select is(:'case_c_after'::text, :'case_c_before'::text, 'case C: after the error every function ACL and membership is exactly as before');
select ok(:'case_c_direct_back'::boolean, 'case C: the direct EXECUTE that 0199 revoked on rpc_sync_line_forecast is back after the error');

-- ---------------------------------------------------------------------------
-- Case D (17-21): an unclassified overload of a covered name stops 0199 before
-- it revokes anything.
-- ---------------------------------------------------------------------------
savepoint p012_case_d;
create function public.fn_prod_curated(p_unclassified text) returns void language sql as 'select null';
grant execute on function public.rpc_sync_line_forecast(text, text, text) to anon;
select pg_temp.p012_state() as case_d_before,
       to_regprocedure('public.fn_prod_curated(text)') is not null
       and pg_temp.p012_anon_direct_on_forecast() as case_d_pre \gset
savepoint p012_case_d_migration;
\set ON_ERROR_STOP off
\ir :p012_migration
\set case_d_error :ERROR
\set case_d_sqlstate :SQLSTATE
\if :case_d_error
  \set case_d_message :LAST_ERROR_MESSAGE
  rollback to savepoint p012_case_d_migration;
\else
  \set case_d_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p012_state() as case_d_after, pg_temp.p012_anon_direct_on_forecast() as case_d_direct_back \gset
rollback to savepoint p012_case_d;
release savepoint p012_case_d;

select ok(:'case_d_pre'::boolean,
  'case D precondition: an extra overload fn_prod_curated(text) exists, and anon holds a direct EXECUTE on rpc_sync_line_forecast');
select is(:'case_d_sqlstate'::text, '55000'::text, 'case D: the migration raises SQLSTATE 55000 for an unclassified overload');
select ok(:'case_d_message' like 'B12: unclassified overload%' and :'case_d_message' like '%fn_prod_curated(text)%',
  'case D: the message starts with "B12: unclassified overload" and names fn_prod_curated(text)');
select is(:'case_d_after'::text, :'case_d_before'::text, 'case D: after the error every function ACL and membership is exactly as before');
select ok(:'case_d_direct_back'::boolean, 'case D: the direct anon EXECUTE on rpc_sync_line_forecast is untouched');

-- ---------------------------------------------------------------------------
-- Case E (22-23): nothing blocks, so the migration completes and restores the
-- matrix: the direct anon EXECUTE and a PUBLIC EXECUTE are revoked.
-- ---------------------------------------------------------------------------
savepoint p012_case_e;
grant execute on function public.rpc_sync_line_forecast(text, text, text) to anon;
grant execute on function public.fn_prod_curated(uuid, text, jsonb) to public;
savepoint p012_case_e_migration;
\set ON_ERROR_STOP off
\ir :p012_migration
\set case_e_error :ERROR
\set case_e_sqlstate :SQLSTATE
\if :case_e_error
  rollback to savepoint p012_case_e_migration;
\endif
\set ON_ERROR_STOP on
select not pg_temp.p012_anon_direct_on_forecast() and pg_temp.p012_matrix_met() as case_e_clean \gset
rollback to savepoint p012_case_e;
release savepoint p012_case_e;

select is(:'case_e_sqlstate'::text, '00000'::text, 'case E: with nothing blocking, the migration completes without error');
select ok(:'case_e_clean'::boolean,
  'case E: the direct anon EXECUTE and the PUBLIC EXECUTE are revoked and every identity matches the matrix');

select * from finish();
rollback;
