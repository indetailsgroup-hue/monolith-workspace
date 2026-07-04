-- Migration: handoff_gate_enforcement — monolith-workflow-copilot (re-scrutinize 0031 fixes #1, #2)
-- Depends on: 0002, 0021, 0031, C12
--
-- #1 MAJOR: rpc_handoff_work_item เดิมขยับ current_order โดยไม่ตรวจ approval gate → ข้าม gate ได้
--   (work_item awaiting_approval/blocked ก็ handoff ออกได้ ทั้งที่ยังไม่อนุมัติ).
--   แก้: handoff อนุญาตเฉพาะเมื่อ status='in_progress'; เข้าขั้น requiresApproval → set awaiting_approval
--        (decision ที่ approved จะ flip กลับ in_progress → จึง handoff ออกได้). บังคับ Req 4 (block until approved).
-- #2 MINOR: rpc_record_capture ตรวจ step ด้วยชื่อ (ซ้ำได้) → ผูก canonical_order เพิ่มเพื่อ traceability/disambiguate.

-- ---------------------------------------------------------------------------
-- #1: rpc_handoff_work_item — gate enforcement
-- ---------------------------------------------------------------------------
create or replace function public.rpc_handoff_work_item(
  p_work_item_id uuid,
  p_expected_version int,
  p_target_order int,
  p_new_owner uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur_order int;
  v_cur_version int;
  v_cur_status public.wf_work_item_status;
  v_target_step text;
  v_target_requires boolean;
  v_new_version int;
  v_new_status public.wf_work_item_status;
begin
  select current_order, version, status into v_cur_order, v_cur_version, v_cur_status
  from public.work_item where id = p_work_item_id
  for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  -- #1 gate enforcement: ขยับได้เฉพาะเมื่อขั้นปัจจุบัน "เสร็จ + gate ผ่านแล้ว" (status=in_progress)
  --   awaiting_approval/blocked/rework/awaiting_requote/awaiting_customer_acceptance → ปฏิเสธ
  if v_cur_status <> 'in_progress' then
    raise exception 'cannot handoff: work item status is % (approval/state pending)', v_cur_status
      using errcode = 'check_violation';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_cur_version
      using errcode = 'serialization_failure';
  end if;

  select process_step, requires_approval into v_target_step, v_target_requires
  from public.process_model where canonical_order = p_target_order;
  if v_target_step is null then
    raise exception 'unknown step at order %', p_target_order using errcode = 'foreign_key_violation';
  end if;
  if p_target_order <> v_cur_order + 1 then
    raise exception 'invalid sequence: order % -> %', v_cur_order, p_target_order using errcode = 'check_violation';
  end if;

  v_new_version := v_cur_version + 1;
  -- เข้าขั้น requiresApproval → awaiting_approval (กั้น handoff ออกจนกว่า decision จะ approve → in_progress);
  -- ขั้น checklist → in_progress (เดินต่อได้ตาม B3)
  v_new_status := case when v_target_requires then 'awaiting_approval'::public.wf_work_item_status
                       else 'in_progress'::public.wf_work_item_status end;

  update public.work_item
    set current_order = p_target_order,
        current_step = v_target_step,
        current_owner = p_new_owner,
        version = v_new_version,
        status = v_new_status
    where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('handoff', p_work_item_id, v_target_step, public.resolve_actor(),
    jsonb_build_object('from_order', v_cur_order, 'to_order', p_target_order, 'to_step', v_target_step,
      'requires_approval', v_target_requires, 'new_status', v_new_status, 'new_version', v_new_version));

  return v_new_version;
end;
$$;

revoke all on function public.rpc_handoff_work_item(uuid, int, int, uuid) from public;

-- ---------------------------------------------------------------------------
-- #2: capture_item ผูก canonical_order; rpc_record_capture บันทึก current_order
-- ---------------------------------------------------------------------------
alter table public.capture_item add column if not exists canonical_order int;

create or replace function public.rpc_record_capture(
  p_work_item_id uuid,
  p_process_step text,
  p_capture jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id uuid;
  v_wi_step text;
  v_wi_order int;
begin
  v_actor := public.resolve_actor();
  if v_actor is null or v_actor = '' then
    raise exception 'actor resolution failed' using errcode = 'no_data_found';
  end if;

  select current_step, current_order into v_wi_step, v_wi_order
  from public.work_item where id = p_work_item_id for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;
  -- sanity: capture ต้องตรงกับขั้นปัจจุบัน (ชื่อ); ผูก canonical_order ปัจจุบันเป็น authoritative (disambiguate ชื่อซ้ำ)
  if v_wi_step <> p_process_step then
    raise exception 'process_step mismatch (work_item at %, capture for %)', v_wi_step, p_process_step
      using errcode = 'check_violation';
  end if;

  insert into public.capture_item (work_item_id, process_step, site_code, captured_by, capture, canonical_order)
  select p_work_item_id, p_process_step, wi.site_code, v_actor, p_capture, v_wi_order
  from public.work_item wi where wi.id = p_work_item_id
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('capture', p_work_item_id, p_process_step, v_actor,
    jsonb_build_object('capture_item_id', v_id, 'canonical_order', v_wi_order));

  return v_id;
end;
$$;

revoke all on function public.rpc_record_capture(uuid, text, jsonb) from public;
grant execute on function public.rpc_record_capture(uuid, text, jsonb) to authenticated;
