-- Migration: rpc_create_delegation — monolith-workflow-copilot Phase 1 (Req 14)
-- Spec task: 9.2 (create delegation, role-sufficiency check)
-- Depends on: 0002 (delegation), 0003 (audit), C12
--
-- อนุญาต iff Acting_Approver มี C12_Role เพียงพอตาม Process_Step (has_any_app_role) — Req 14.2/14.3.
-- mirror src/workflow/delegation/authorize.ts.

create or replace function public.rpc_create_delegation(
  p_approver_employee uuid,
  p_acting_approver uuid,
  p_process_step text,
  p_required_roles text[],
  p_start timestamptz,
  p_end timestamptz,
  p_site_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Req 14.2/14.3 — Acting_Approver ต้องมีบทบาทเพียงพอตาม Process_Step
  if p_required_roles is null or array_length(p_required_roles, 1) is null
     or not public.has_any_app_role(p_required_roles) then
    raise exception 'insufficient role for delegation at step %', p_process_step using errcode = 'insufficient_privilege';
  end if;

  if p_end <= p_start then
    raise exception 'delegation end must be after start' using errcode = 'check_violation';
  end if;

  insert into public.delegation (approver_employee, acting_approver, process_step, site_code, start_time, end_time, is_revoked)
  values (p_approver_employee, p_acting_approver, p_process_step, p_site_code, p_start, p_end, false)
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, process_step, site_code, performed_by, detail)
  values ('delegation', p_process_step, p_site_code, public.resolve_actor(),
    jsonb_build_object('op', 'create', 'delegation_id', v_id, 'approver', p_approver_employee, 'acting', p_acting_approver,
      'start', p_start, 'end', p_end));

  return v_id;
end;
$$;

revoke all on function public.rpc_create_delegation(uuid, uuid, text, text[], timestamptz, timestamptz, text) from public;
