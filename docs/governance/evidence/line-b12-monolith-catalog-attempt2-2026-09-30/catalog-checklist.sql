-- Read-only B12 inventory; fresh isolated stack only under current approval.
-- Does not call business functions, output bodies or decide production exposure.
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout = '15s';
set local search_path = pg_catalog, public;
with expected(id,name,signature) as (values
 ('B12-01','fn_lead_followup_sweep','public.fn_lead_followup_sweep()'),
 ('B12-02','fn_line_handle_group_event','public.fn_line_handle_group_event(jsonb,text,text)'),
 ('B12-03','fn_prod_curated','public.fn_prod_curated(uuid,text,jsonb)'),
 ('B12-04','fn_welcome_on_group_bind','public.fn_welcome_on_group_bind()'),
 ('B12-05','line_oa_resolve_customer_identity','public.line_oa_resolve_customer_identity(text,text)'),
 ('B12-06','rpc_claim_line_outbound_batch','public.rpc_claim_line_outbound_batch(integer,integer)'),
 ('B12-07','rpc_create_line_order','public.rpc_create_line_order(uuid,jsonb,text,text)'),
 ('B12-08','rpc_evaluate_identity_merge_candidate','public.rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)'),
 ('B12-09','rpc_field_assign_lead','public.rpc_field_assign_lead(uuid,uuid)'),
 ('B12-10','rpc_field_close_lead','public.rpc_field_close_lead(uuid,text,text)'),
 ('B12-11','rpc_field_send_photo_to_customer','public.rpc_field_send_photo_to_customer(uuid,uuid,text)'),
 ('B12-12','rpc_field_set_lead_source','public.rpc_field_set_lead_source(uuid,text)'),
 ('B12-13','rpc_field_shop_drawing_revision','public.rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)'),
 ('B12-14','rpc_ingest_line_webhook','public.rpc_ingest_line_webhook(text,text,text)'),
 ('B12-15','rpc_record_line_send_result','public.rpc_record_line_send_result(uuid,text,text,text,uuid)'),
 ('B12-16','rpc_request_customer_acceptance','public.rpc_request_customer_acceptance(uuid,text)'),
 ('B12-17','rpc_resolve_conversation_site','public.rpc_resolve_conversation_site(uuid,text,text)'),
 ('B12-18','rpc_send_line_outbound','public.rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)'),
 ('B12-19','rpc_sweep_line_session_timeouts','public.rpc_sweep_line_session_timeouts()'),
 ('B12-20','rpc_sync_line_forecast','public.rpc_sync_line_forecast(text,text,text)')
), targets as (
 select e.*,p.oid,p.proowner,p.prosecdef,p.proacl
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), named(name) as (values ('anon'),('authenticated'),('service_role'),('authenticator'),('postgres'))
select jsonb_build_object(
 'schema_version',1,
 'server_version',current_setting('server_version'),
 'read_only',current_setting('transaction_read_only'),
 'targets',(select jsonb_agg(jsonb_build_object(
   'id',t.id,'name',t.name,'signature',t.signature,'exists',t.oid is not null,
   'owner',pg_get_userbyid(t.proowner),'security_definer',t.prosecdef,
   'acl',coalesce((select jsonb_agg(jsonb_build_object(
     'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
     'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
     order by a.grantee,a.grantor,a.privilege_type)
     from aclexplode(coalesce(t.proacl,acldefault('f',t.proowner))) a where t.oid is not null),'[]'::jsonb),
   'effective',coalesce((select jsonb_agg(jsonb_build_object('role',r.rolname,
     'execute',has_function_privilege(r.oid,t.oid,'EXECUTE'),
     'schema_usage',has_schema_privilege(r.oid,'public','USAGE')) order by r.rolname)
     from pg_roles r where t.oid is not null),'[]'::jsonb)
 ) order by t.id) from targets t),
 'missing_roles',coalesce((select jsonb_agg(n.name order by n.name) from named n
   where not exists(select 1 from pg_roles r where r.rolname=n.name)),'[]'::jsonb),
 'unexpected_overloads',coalesce((select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,
   'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef) order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (select name from expected)
   and not exists(select 1 from targets t where t.oid=p.oid)),'[]'::jsonb),
 'roles',(select jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,
   'inherit',rolinherit,'login',rolcanlogin,'bypassrls',rolbypassrls) order by rolname) from pg_roles),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),
   'granted_role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
   'inherit_option',m.inherit_option,'set_option',m.set_option,'admin_option',m.admin_option)
   order by m.member,m.roleid,m.grantor) from pg_auth_members m),'[]'::jsonb),
 'default_function_acl',coalesce((select jsonb_agg(jsonb_build_object('creator',pg_get_userbyid(d.defaclrole),
   'schema',n.nspname,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace)
   from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
   where d.defaclobjtype='f'),'[]'::jsonb),
 'triggers',coalesce((select jsonb_agg(jsonb_build_object('table',g.tgrelid::regclass::text,
   'name',g.tgname,'function',g.tgfoid::regprocedure::text,'enabled',g.tgenabled,'internal',g.tgisinternal)
   order by g.tgrelid,g.tgname) from pg_trigger g where g.tgfoid in (select oid from targets)),'[]'::jsonb)
);
rollback;
