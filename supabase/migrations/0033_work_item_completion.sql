-- Migration: work_item_completion — monolith-workflow-copilot (re-scrutinize 0032 fixes A, B)
-- Depends on: 0002, 0031, 0032, C12
--
-- A (MAJOR): ไม่มี path ไป 'completed' → work item ติดที่ขั้นสุดท้ายตลอดกาล, celebrate (Req 12.3) ไม่ทำงาน.
--   แก้: rpc_complete_work_item — current_order = max(canonical_order) AND status='in_progress' (gate ผ่าน)
--        → set completed + audit + celebrate notification (Req 12.3/12.7).
-- B (NIT): rpc_create_work_item set in_progress เสมอ → mirror handoff: ขั้นแรก requiresApproval → awaiting_approval.

-- ---------------------------------------------------------------------------
-- A: rpc_complete_work_item — terminal transition + celebrate
-- ---------------------------------------------------------------------------
create or replace function public.rpc_complete_work_item(
  p_work_item_id uuid,
  p_expected_version int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur_order int;
  v_cur_version int;
  v_cur_status public.wf_work_item_status;
  v_site text;
  v_max_order int;
  v_last_step text;
begin
  select current_order, version, status, site_code
    into v_cur_order, v_cur_version, v_cur_status, v_site
  from public.work_item where id = p_work_item_id
  for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_cur_version
      using errcode = 'serialization_failure';
  end if;

  select max(canonical_order) into v_max_order from public.process_model;
  -- ต้องอยู่ขั้นสุดท้ายจริง (Req 12.3 — celebrate เฉพาะจบขั้นสุดท้ายจริง ไม่ใช่ปิดมือกลางทาง)
  if v_cur_order is distinct from v_max_order then
    raise exception 'cannot complete: not at last step (order % of %)', v_cur_order, v_max_order
      using errcode = 'check_violation';
  end if;
  -- gate ของขั้นสุดท้ายต้องผ่านแล้ว (status=in_progress) — กันปิดทั้งที่ยังรออนุมัติ
  if v_cur_status <> 'in_progress' then
    raise exception 'cannot complete: status is % (last-step gate pending)', v_cur_status
      using errcode = 'check_violation';
  end if;

  select process_step into v_last_step from public.process_model where canonical_order = v_max_order;

  update public.work_item
    set status = 'completed', version = v_cur_version + 1
    where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('work_item_complete', p_work_item_id, v_last_step, v_site, public.resolve_actor(),
    jsonb_build_object('final_order', v_max_order, 'celebrate', true));

  -- celebrate hook (Req 12.3/12.7) — แสดงความยินดีเมื่อจบขั้นสุดท้ายจริง
  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (v_site, '{}'::jsonb, 'group_message', 'celebrate', false, 'tpl_celebrate',
    jsonb_build_object('work_item_id', p_work_item_id, 'final_step', v_last_step), 'queued');

  return 'completed';
end;
$$;

revoke all on function public.rpc_complete_work_item(uuid, int) from public;

-- ---------------------------------------------------------------------------
-- B: rpc_create_work_item — mirror gate logic (ขั้นแรก requiresApproval → awaiting_approval)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_work_item(
  p_site_code text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_min_order int;
  v_step text;
  v_requires boolean;
  v_status public.wf_work_item_status;
begin
  if p_site_code is null
     or not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
    raise exception 'unknown or inactive site_code: %', p_site_code using errcode = 'foreign_key_violation';
  end if;

  select min(canonical_order) into v_min_order from public.process_model;
  if v_min_order is null then
    raise exception 'process_model empty: import Knowledge_Export first' using errcode = 'no_data_found';
  end if;
  select process_step, requires_approval into v_step, v_requires
  from public.process_model where canonical_order = v_min_order;

  v_status := case when v_requires then 'awaiting_approval'::public.wf_work_item_status
                   else 'in_progress'::public.wf_work_item_status end;

  insert into public.work_item (site_code, current_step, current_order, status, version, data)
  values (p_site_code, v_step, v_min_order, v_status, 0, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('work_item_create', v_id, v_step, p_site_code, public.resolve_actor(),
    jsonb_build_object('first_order', v_min_order, 'first_step', v_step, 'requires_approval', v_requires, 'status', v_status));

  return v_id;
end;
$$;

revoke all on function public.rpc_create_work_item(text, jsonb) from public;
