-- Migration: rpc_identity_binding — monolith-workflow-copilot Phase 1 (Req 1)
-- Spec task: 4.2 (create/revoke identity binding)
-- Depends on: 0002 (identity_binding), 0003 (audit), C12
--
-- บังคับความไม่ซ้ำของ LINE_User_Id ต่อ binding active (Req 1.2 — partial unique index),
-- resolve ผู้กระทำผ่าน resolve_actor(), audit ทั้ง create/revoke (Req 1.1, 1.6).

create or replace function public.rpc_create_identity_binding(
  p_employee_id uuid,
  p_line_user_id text,
  p_department text,
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
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  -- Req 1.2 — ความไม่ซ้ำของ active binding (กันก่อน insert เพื่อ error ชัด; index บังคับซ้ำชั้น)
  if exists (select 1 from public.identity_binding where line_user_id = p_line_user_id and is_active) then
    raise exception 'duplicate active identity binding for line_user_id' using errcode = 'unique_violation';
  end if;

  insert into public.identity_binding (employee_id, line_user_id, department, site_code, is_active)
  values (p_employee_id, p_line_user_id, p_department, p_site_code, true)
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
  values ('identity_binding', p_site_code, public.resolve_actor(),
    jsonb_build_object('op', 'create', 'binding_id', v_id, 'employee_id', p_employee_id, 'department', p_department));

  return v_id;
end;
$$;

create or replace function public.rpc_revoke_identity_binding(p_binding_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site text;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  update public.identity_binding set is_active = false
   where id = p_binding_id and is_active
   returning site_code into v_site;

  if not found then
    raise exception 'identity binding not found or already revoked' using errcode = 'no_data_found';
  end if;

  -- Req 1.5 — revoke มีผลทันที (direct push ตรวจ is_active=false หลังจุดนี้)
  insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
  values ('identity_binding', v_site, public.resolve_actor(),
    jsonb_build_object('op', 'revoke', 'binding_id', p_binding_id));
end;
$$;

revoke all on function public.rpc_create_identity_binding(uuid, text, text, text) from public;
revoke all on function public.rpc_revoke_identity_binding(uuid) from public;
