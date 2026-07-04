-- Migration: rpc_revoke_delegation — monolith-workflow-copilot Phase 1 (Req 14.5, 14.6)
-- Spec task: 9.3 (executive revoke → next Approval_Request กลับ Approver เดิม)
-- Depends on: 0002 (delegation), 0003 (audit), C12

create or replace function public.rpc_revoke_delegation(p_delegation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step text;
  v_site text;
begin
  -- Req 14.5 — executive_owner เท่านั้นที่เพิกถอนได้
  if not public.has_any_app_role(array['executive_owner']) and not public.is_governance_role() then
    raise exception 'only executive_owner may revoke delegation' using errcode = 'insufficient_privilege';
  end if;

  update public.delegation set is_revoked = true
   where id = p_delegation_id and not is_revoked
   returning process_step, site_code into v_step, v_site;

  if not found then
    raise exception 'delegation not found or already revoked' using errcode = 'no_data_found';
  end if;

  insert into public.workflow_audit_log (event_type, process_step, site_code, performed_by, detail)
  values ('delegation', v_step, v_site, public.resolve_actor(),
    jsonb_build_object('op', 'revoke', 'delegation_id', p_delegation_id));
end;
$$;

revoke all on function public.rpc_revoke_delegation(uuid) from public;
