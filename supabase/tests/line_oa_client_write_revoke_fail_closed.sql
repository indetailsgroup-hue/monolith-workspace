-- pgTAP - P0-10 follow-up: 0198 must fail closed. When a write privilege would
-- survive its REVOKE statements, the migration must raise 42501
-- "P0-10: write privileges remain after revoke", and its own revokes must not
-- persist (the grant it had revoked is back after the error).
--
-- The migration file itself is executed with \ir (no copy of its logic here).
-- Default: ../migrations/0198_line_oa_revoke_client_write_grants.sql. An
-- evidence run may pass -v p010_migration=<path> to point at a mutant copy.
--
-- Run inside a rollback wrapper against a database that already has 0198:
--   psql "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" \
--     -f supabase/tests/line_oa_client_write_revoke_fail_closed.sql
-- Each case works inside its own savepoint; the throwaway roles and grants are
-- rolled back. This file always issues the final ROLLBACK.
--
-- Why case B needs a second grantor: a table-level REVOKE also removes column
-- privileges granted by the same grantor (see case C), so a column grant only
-- survives 0198 when another grantor made it.

\set ON_ERROR_STOP on
\if :{?p010_migration}
\else
  \set p010_migration ../migrations/0198_line_oa_revoke_client_write_grants.sql
\endif
\echo '# migration under test:' :p010_migration

create extension if not exists pgtap;
select plan(13);

-- Every privilege fact 0198 could touch: table and column ACLs of the eight
-- tables, and role membership edges. Compared before and after each attempt.
create or replace function pg_temp.p010_state()
returns text
language sql
as $$
  select concat_ws(E'\n',
    (select string_agg(c.relname || '=' || coalesce(c.relacl::text, '<default>'), E'\n' order by c.relname)
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'line\_oa\_%' and c.relkind = 'r'),
    (select string_agg(c.relname || '.' || a.attname || '=' || a.attacl::text, E'\n' order by c.relname, a.attname)
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'line\_oa\_%' and a.attacl is not null),
    (select string_agg(m.member::regrole::text || '>' || m.roleid::regrole::text, E'\n' order by 1)
       from pg_auth_members m))
$$;

create or replace function pg_temp.p010_anon_direct_insert_on_channels()
returns boolean
language sql
as $$
  select exists (
    select 1 from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.line_oa_channels'::regclass
      and a.grantee = 'anon'::regrole and a.privilege_type = 'INSERT')
$$;

-- 1: scope guard.
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
      'line_oa_channels', 'line_oa_conversations', 'line_oa_inbound_messages', 'line_oa_outbound_messages',
      'line_oa_customer_identity', 'line_oa_message_templates', 'line_oa_orders', 'line_oa_audit_log')) = 8
  and exists (select 1 from pg_roles where rolname = 'anon')
  and not has_table_privilege('anon', 'public.line_oa_orders', 'INSERT'),
  'scope guard: 8 tables and anon exist, and anon starts without write privilege (0198 applied)'
);

-- Facts inside each case are captured into psql variables; the pgTAP
-- assertions run only after the case's savepoint is rolled back, so pgTAP's own
-- bookkeeping is never undone by a savepoint rollback.

-- ---------------------------------------------------------------------------
-- Case A (2-6): anon inherits INSERT/UPDATE on line_oa_orders from a throwaway
-- role, plus a direct INSERT on line_oa_channels that 0198 does revoke.
-- ---------------------------------------------------------------------------
savepoint p010_case_a;
create role p010_fc_writer nologin;
grant insert, update on public.line_oa_orders to p010_fc_writer;
grant p010_fc_writer to anon;
grant insert on public.line_oa_channels to anon;
select pg_temp.p010_state() as case_a_before,
       has_table_privilege('anon', 'public.line_oa_orders', 'INSERT')
       and not exists (select 1 from pg_class c
                       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                       where c.oid = 'public.line_oa_orders'::regclass and a.grantee = 'anon'::regrole
                         and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
       and pg_temp.p010_anon_direct_insert_on_channels() as case_a_pre \gset

savepoint p010_case_a_migration;
\set ON_ERROR_STOP off
\ir :p010_migration
\set case_a_error :ERROR
\set case_a_sqlstate :SQLSTATE
\if :case_a_error
  \set case_a_message :LAST_ERROR_MESSAGE
  rollback to savepoint p010_case_a_migration;
\else
  \set case_a_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p010_state() as case_a_after,
       pg_temp.p010_anon_direct_insert_on_channels() as case_a_direct_back \gset
rollback to savepoint p010_case_a;
release savepoint p010_case_a;

select ok(:'case_a_pre'::boolean,
  'case A precondition: anon has INSERT on line_oa_orders only through role membership, and a direct INSERT on line_oa_channels');
select is(:'case_a_sqlstate'::text, '42501'::text, 'case A: the migration raises SQLSTATE 42501 when an inherited write privilege survives');
select ok(:'case_a_message' like 'P0-10: write privileges remain after revoke%' and :'case_a_message' like '%anon:line_oa_orders%',
  'case A: the error message starts with "P0-10: write privileges remain after revoke" and names anon:line_oa_orders');
select is(:'case_a_after'::text, :'case_a_before'::text, 'case A: after the error every table ACL, column ACL and membership is exactly as before');
select ok(:'case_a_direct_back'::boolean, 'case A: the direct INSERT that 0198 revoked on line_oa_channels is back after the error');

-- ---------------------------------------------------------------------------
-- Case B (7-11): anon holds a column-level UPDATE on line_oa_message_templates
-- granted by another grantor, plus the same direct INSERT on line_oa_channels.
-- ---------------------------------------------------------------------------
savepoint p010_case_b;
create role p010_fc_grantor nologin;
-- PostgreSQL 16+: the creating role gets ADMIN but not SET on a new role.
grant p010_fc_grantor to current_user with set true, inherit false;
grant usage on schema public to p010_fc_grantor;
grant update (body) on public.line_oa_message_templates to p010_fc_grantor with grant option;
set local role p010_fc_grantor;
grant update (body) on public.line_oa_message_templates to anon;
reset role;
grant insert on public.line_oa_channels to anon;
select pg_temp.p010_state() as case_b_before,
       has_column_privilege('anon', 'public.line_oa_message_templates', 'body', 'UPDATE')
       and not has_table_privilege('anon', 'public.line_oa_message_templates', 'UPDATE')
       and exists (select 1 from pg_attribute a
                   where a.attrelid = 'public.line_oa_message_templates'::regclass and a.attname = 'body'
                     and a.attacl::text like '%anon=w/p010_fc_grantor%')
       and pg_temp.p010_anon_direct_insert_on_channels() as case_b_pre \gset

savepoint p010_case_b_migration;
\set ON_ERROR_STOP off
\ir :p010_migration
\set case_b_error :ERROR
\set case_b_sqlstate :SQLSTATE
\if :case_b_error
  \set case_b_message :LAST_ERROR_MESSAGE
  rollback to savepoint p010_case_b_migration;
\else
  \set case_b_message ''
\endif
\set ON_ERROR_STOP on
select pg_temp.p010_state() as case_b_after,
       pg_temp.p010_anon_direct_insert_on_channels() as case_b_direct_back \gset
rollback to savepoint p010_case_b;
release savepoint p010_case_b;

select ok(:'case_b_pre'::boolean,
  'case B precondition: anon has a direct column UPDATE on line_oa_message_templates.body from another grantor, and a direct INSERT on line_oa_channels');
select is(:'case_b_sqlstate'::text, '42501'::text, 'case B: the migration raises SQLSTATE 42501 when a column-level UPDATE survives');
select ok(:'case_b_message' like 'P0-10: write privileges remain after revoke%' and :'case_b_message' like '%anon:line_oa_message_templates%',
  'case B: the error message starts with "P0-10: write privileges remain after revoke" and names anon:line_oa_message_templates');
select is(:'case_b_after'::text, :'case_b_before'::text, 'case B: after the error every table ACL, column ACL and membership is exactly as before');
select ok(:'case_b_direct_back'::boolean, 'case B: the direct INSERT that 0198 revoked on line_oa_channels is back after the error');

-- ---------------------------------------------------------------------------
-- Case C (12-13): nothing survives, so the migration completes. The owner's
-- direct INSERT and direct column UPDATE for anon are both revoked.
-- ---------------------------------------------------------------------------
savepoint p010_case_c;
grant insert on public.line_oa_channels to anon;
grant update (body) on public.line_oa_message_templates to anon;

savepoint p010_case_c_migration;
\set ON_ERROR_STOP off
\ir :p010_migration
\set case_c_error :ERROR
\set case_c_sqlstate :SQLSTATE
\if :case_c_error
  rollback to savepoint p010_case_c_migration;
\endif
\set ON_ERROR_STOP on
select not pg_temp.p010_anon_direct_insert_on_channels()
       and not has_any_column_privilege('anon', 'public.line_oa_message_templates', 'UPDATE')
       and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname like 'line\_oa\_%' and c.relkind = 'r'
                         and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
                              or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')
                              or has_any_column_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'UPDATE')))
       as case_c_clean \gset
rollback to savepoint p010_case_c;
release savepoint p010_case_c;

select is(:'case_c_sqlstate'::text, '00000'::text, 'case C: with no surviving privilege the migration completes without error');
select ok(:'case_c_clean'::boolean,
  'case C: the direct INSERT and the owner-granted column UPDATE are revoked and anon holds no write privilege');

select * from finish();
rollback;
