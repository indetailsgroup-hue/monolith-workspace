-- Migration: 0199_line_oa_restrict_definer_execute
-- B12 / P0-12: restrict EXECUTE on the twenty SECURITY DEFINER routines that
-- write line_oa_* tables, following the owner-approved exact-identity matrix
-- (docs/governance/line-b12-permission-matrix.*).
--
-- Why: platform default ACLs grant EXECUTE on every new function to anon,
-- authenticated and service_role, and earlier migrations revoked only from
-- PUBLIC. A DEFINER routine runs as its owner, so 0198's table revoke did not
-- stop a client role from calling these writers directly.
--
-- Target effective EXECUTE (anon / authenticated / service_role):
--   INTERNAL (called only by owner chains or a trigger): f / f / f
--   SERVICE and SENDER entry points:                     f / f / t
--   FIELD and CALLER-UNKNOWN RPCs (keep, guarded):       f / t / t
--   rpc_record_line_send_result is service-only (owner decision, 30 Sep 2026).
--   PUBLIC holds EXECUTE on none of the twenty.
--
-- Scope: REVOKE EXECUTE only. No GRANT is added; owners, function bodies,
-- memberships, table privileges and default privileges are unchanged. Roles are
-- handled only where present (0005 pattern).
-- Fail closed, without granting or changing memberships:
--   * a missing identity or an overload of a covered name that the matrix does
--     not classify stops the migration (55000);
--   * if afterwards any role's effective EXECUTE differs from the target, in
--     either direction (a DENY survives through inheritance or another grantor,
--     or a KEEP was only reachable through PUBLIC), or PUBLIC still holds
--     EXECUTE, the migration raises 42501 and rolls back.
-- Not covered: default privileges for future or recreated functions, other
-- functions, and production verification.

do $$
declare
  v_row record;
  v_role text;
  v_oid regprocedure;
  v_problems text[] := '{}';
  v_roles constant text[] := array['anon', 'authenticated', 'service_role'];
  v_matrix constant text[] := array[
    'fn_lead_followup_sweep()=f/f/t',
    'fn_line_handle_group_event(jsonb,text,text)=f/f/f',
    'fn_prod_curated(uuid,text,jsonb)=f/f/f',
    'fn_welcome_on_group_bind()=f/f/f',
    'line_oa_resolve_customer_identity(text,text)=f/f/t',
    'rpc_claim_line_outbound_batch(integer,integer)=f/f/t',
    'rpc_create_line_order(uuid,jsonb,text,text)=f/t/t',
    'rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)=f/t/t',
    'rpc_field_assign_lead(uuid,uuid)=f/t/t',
    'rpc_field_close_lead(uuid,text,text)=f/t/t',
    'rpc_field_send_photo_to_customer(uuid,uuid,text)=f/t/t',
    'rpc_field_set_lead_source(uuid,text)=f/t/t',
    'rpc_field_shop_drawing_revision(uuid,text,text,boolean,boolean)=f/t/t',
    'rpc_ingest_line_webhook(text,text,text)=f/f/t',
    'rpc_record_line_send_result(uuid,text,text,text,uuid)=f/f/t',
    'rpc_request_customer_acceptance(uuid,text)=f/t/t',
    'rpc_resolve_conversation_site(uuid,text,text)=f/t/t',
    'rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)=f/t/t',
    'rpc_sweep_line_session_timeouts()=f/f/t',
    'rpc_sync_line_forecast(text,text,text)=f/t/t'
  ];
begin
  -- 1. Every identity exists, and no covered name has an unclassified overload.
  select array_agg(sig order by sig) into v_problems
  from (select split_part(x, '=', 1) as sig from unnest(v_matrix) x) m
  where to_regprocedure('public.' || sig) is null;
  if cardinality(v_problems) > 0 then
    raise exception 'B12: matrix identity missing: %', array_to_string(v_problems, ', ')
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_problems
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (select split_part(split_part(x, '=', 1), '(', 1) from unnest(v_matrix) x)
    and p.oid not in (select to_regprocedure('public.' || split_part(x, '=', 1)) from unnest(v_matrix) x);
  if cardinality(v_problems) > 0 then
    raise exception 'B12: unclassified overload: %', array_to_string(v_problems, ', ')
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- 2. Revoke EXECUTE from PUBLIC on all twenty, and from each present role
  --    wherever the target is f. Nothing is granted.
  for v_row in select split_part(x, '=', 1) as sig, split_part(x, '=', 2) as target from unnest(v_matrix) x loop
    v_oid := to_regprocedure('public.' || v_row.sig);
    execute format('revoke execute on function %s from public', v_oid);
    for i in 1 .. 3 loop
      v_role := v_roles[i];
      if split_part(v_row.target, '/', i) = 'f' and exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke execute on function %s from %I', v_oid, v_role);
      end if;
    end loop;
  end loop;

  -- 3. The effective state must equal the target exactly.
  v_problems := '{}';
  for v_row in select split_part(x, '=', 1) as sig, split_part(x, '=', 2) as target from unnest(v_matrix) x loop
    v_oid := to_regprocedure('public.' || v_row.sig);
    for i in 1 .. 3 loop
      v_role := v_roles[i];
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, v_oid, 'EXECUTE') <> (split_part(v_row.target, '/', i) = 't') then
        v_problems := v_problems || format('%s:%s want %s', v_role, v_row.sig, split_part(v_row.target, '/', i));
      end if;
    end loop;
    if exists (select 1 from pg_proc p
               cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      v_problems := v_problems || format('PUBLIC:%s', v_row.sig);
    end if;
  end loop;

  if cardinality(v_problems) > 0 then
    raise exception 'B12: EXECUTE matrix not met after revoke: %', array_to_string(v_problems, ', ')
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
