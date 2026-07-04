-- Migration: rpc_create_work_item — monolith-workflow-copilot Phase 1 (Req 2)
-- Spec task: 5.3 (create work_item at first canonical step)
-- Depends on: 0002 (work_item, process_model), 0003 (audit), C12
--
-- ตรวจ site_code ∈ get_active_site_codes() (Req 2.6, 10.6), first_step ∈ process_model (Req 2.7),
-- สร้างที่ step แรก version=0, audit (Req 2.1, 2.2).

create or replace function public.rpc_create_work_item(
  p_site_code text,
  p_first_step text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_is_first boolean;
begin
  -- Req 2.6/10.6 — site ต้อง active
  if p_site_code is null
     or not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
    raise exception 'unknown or inactive site_code: %', p_site_code using errcode = 'foreign_key_violation';
  end if;

  -- Req 2.7 — first_step ต้องมีใน process_model
  if not exists (select 1 from public.process_model where process_step = p_first_step) then
    raise exception 'unknown step: %', p_first_step using errcode = 'foreign_key_violation';
  end if;

  -- ต้องเป็นขั้นแรกของลำดับ canonical (canonical_order = ค่าต่ำสุด)
  select p_first_step = (select process_step from public.process_model order by canonical_order asc limit 1)
    into v_is_first;
  if not v_is_first then
    raise exception 'work item must start at first canonical step' using errcode = 'check_violation';
  end if;

  insert into public.work_item (site_code, current_step, status, version, data)
  values (p_site_code, p_first_step, 'in_progress', 0, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('work_item_create', v_id, p_first_step, p_site_code, public.resolve_actor(),
    jsonb_build_object('first_step', p_first_step));

  return v_id;
end;
$$;

revoke all on function public.rpc_create_work_item(text, text, jsonb) from public;
