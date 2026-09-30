-- P0-10 discovery template, PostgreSQL 17. Current view-ACL revision NOT executed.
-- Reviewer reports prior revision ran on synthetic PG17 fixtures, not MONOLITH.
-- Only for a separately approved disposable schema. No shared/live credentials.
-- This reads catalogs only; it does not prove real-operation denial or safety.
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '15s';
select version(), current_user, session_user, current_database();

-- Exact eight tables: owner, RLS and raw/effective default table ACL.
select c.oid::regclass as relation, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl,
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where n.nspname='public' and c.relname=any(array[
 'line_oa_channels','line_oa_conversations','line_oa_inbound_messages',
 'line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates',
 'line_oa_orders','line_oa_audit_log'])
order by 1,6,7;

-- Named roles: effective table writes and column-level INSERT/UPDATE.
select r.rolname,c.oid::regclass as relation,v.privilege,
       has_table_privilege(r.oid,c.oid,v.privilege) as effective_table_privilege,
       case when v.privilege in ('INSERT','UPDATE')
            then has_any_column_privilege(r.oid,c.oid,v.privilege) end as any_column_privilege
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) v(privilege)
where r.rolname in ('anon','authenticated','service_role','authenticator','postgres') and n.nspname='public'
and c.relname=any(array['line_oa_channels','line_oa_conversations','line_oa_inbound_messages',
 'line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates',
 'line_oa_orders','line_oa_audit_log']) order by 1,2,3;

select c.oid::regclass as relation,a.attname,a.attacl
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and a.attnum>0 and not a.attisdropped and a.attacl is not null
and c.relname=any(array['line_oa_channels','line_oa_conversations','line_oa_inbound_messages',
 'line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates',
 'line_oa_orders','line_oa_audit_log']) order by 1,2;

-- All membership edges are needed to resolve transitive and SET ROLE paths.
select pg_get_userbyid(m.member) as member,pg_get_userbyid(m.roleid) as granted_role,
       m.admin_option,m.inherit_option,m.set_option
from pg_auth_members m order by 1,2;
select rolname,rolsuper,rolinherit,rolbypassrls,rolcanlogin
from pg_roles order by rolname;

-- Discovery only: textual candidates include a few known transitive writers.
-- Complete the call graph separately; PL/pgSQL/dynamic SQL is not exhaustively
-- represented by dependencies or this text search. No function body is emitted.
with candidates as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and
 (position('line_oa_' in p.prosrc)>0 or position('line_oa_' in p.proname)>0
  or p.prosrc ~ '(fn_prod_curated|rpc_send_line_outbound|fn_welcome_on_group_bind)')
)
select p.oid::regprocedure as routine,pg_get_userbyid(p.proowner) as owner,
       p.prosecdef,p.proconfig,p.proacl,md5(p.prosrc) as body_digest,
       r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') as effective_execute
from candidates p cross join pg_roles r
where r.rolname in ('anon','authenticated','service_role','authenticator','postgres') order by 1,7;

-- Definer owner rights against every target table (do not infer owner from name).
with candidates as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and
 (position('line_oa_' in p.prosrc)>0 or p.prosrc ~ '(fn_prod_curated|rpc_send_line_outbound|fn_welcome_on_group_bind)')
)
select p.oid::regprocedure as routine,pg_get_userbyid(p.proowner) as owner,
       c.oid::regclass as relation,v.privilege,
       has_table_privilege(p.proowner,c.oid,v.privilege) as owner_has_privilege
from candidates p cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) v(privilege)
where p.prosecdef and n.nspname='public'
and c.relname=any(array['line_oa_channels','line_oa_conversations','line_oa_inbound_messages',
 'line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates',
 'line_oa_orders','line_oa_audit_log']) order by 1,3,4;

select pg_get_userbyid(d.defaclrole) as creator_role,
       case when d.defaclnamespace=0 then '(global)' else n.nspname end as namespace,
       d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where d.defaclnamespace=0 or n.nspname='public' order by 1,2,3;

-- Trigger discovery: include triggers ON target tables and trigger routines on
-- other tables whose bodies mention targets/known shared writers. Include
-- internal triggers (FKs); textual matching is not a complete call graph.
select t.tgrelid::regclass as attached_relation,t.tgname,t.tgenabled,t.tgisinternal,
       t.tgfoid::regprocedure as routine,pg_get_userbyid(p.proowner) as routine_owner,
       p.prosecdef,pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t join pg_proc p on p.oid=t.tgfoid
join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname=any(array['line_oa_channels','line_oa_conversations','line_oa_inbound_messages','line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates','line_oa_orders','line_oa_audit_log']))
   or position('line_oa_' in p.prosrc)>0
   or p.prosrc ~ '(fn_prod_curated|rpc_send_line_outbound|fn_welcome_on_group_bind)'
order by 1,2;

-- Rewrite dependencies: follow views/materialized views/rules transitively.
-- pg_depend cannot prove absence of references hidden in dynamic SQL/routines.
with recursive targets as (
 select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname=any(array['line_oa_channels','line_oa_conversations','line_oa_inbound_messages','line_oa_outbound_messages','line_oa_customer_identity','line_oa_message_templates','line_oa_orders','line_oa_audit_log'])
), edges as (
 select distinct d.refobjid as source,r.ev_class as dependent,r.oid as rule_oid
 from pg_depend d join pg_rewrite r on d.classid='pg_rewrite'::regclass and r.oid=d.objid
 where d.refclassid='pg_class'::regclass and d.refobjid<>r.ev_class
), walk(root,relation,rule_oid,path,depth) as (
 select t.oid,e.dependent,e.rule_oid,array[t.oid,e.dependent],1
 from targets t join edges e on e.source=t.oid
 union all
 select w.root,e.dependent,e.rule_oid,w.path||e.dependent,w.depth+1
 from walk w join edges e on e.source=w.relation
 where not e.dependent=any(w.path)
), found as (
 select root,relation,rule_oid,depth from walk
 union
 select t.oid,r.ev_class,r.oid,0 from targets t join pg_rewrite r on r.ev_class=t.oid
)
select distinct f.root::regclass as target,f.relation::regclass as dependent,
       c.relkind,pg_get_userbyid(c.relowner) as owner,c.reloptions,r.rulename,
       f.depth,pg_get_ruledef(r.oid,true) as definition,
       c.relacl as relation_acl, rights.effective_role_privileges
from found f join pg_class c on c.oid=f.relation join pg_rewrite r on r.oid=f.rule_oid
left join lateral (
 select jsonb_agg(jsonb_build_object(
   'role',pr.rolname,
   'select',has_table_privilege(pr.oid,c.oid,'SELECT'),
   'insert',has_table_privilege(pr.oid,c.oid,'INSERT'),
   'update',has_table_privilege(pr.oid,c.oid,'UPDATE'),
   'delete',has_table_privilege(pr.oid,c.oid,'DELETE'),
   'truncate',has_table_privilege(pr.oid,c.oid,'TRUNCATE'),
   'any_column_insert',has_any_column_privilege(pr.oid,c.oid,'INSERT'),
   'any_column_update',has_any_column_privilege(pr.oid,c.oid,'UPDATE')
 ) order by pr.rolname) as effective_role_privileges
 from pg_roles pr
 where pr.rolname in ('anon','authenticated','service_role','authenticator','postgres')
) rights on true
-- A NULL raw ACL means default privileges, not necessarily no privileges.
-- These rights alone do not prove view updatability or successful writes.
order by 1,7,2,6;

rollback;
