-- Migration: celebrate_respect_quiet_hours — monolith-workflow-copilot (re-scrutinize 0034, fix C1)
-- Depends on: 0018 (rpc_dispatch_notification), 0034 (rpc_complete_work_item), C12
--
-- C1 (MEDIUM): 0034 hardcode p_in_quiet_hours=false → celebrate (group_message / non-Direct) ส่งทันที
--   แม้อยู่ใน Quiet_Hours → ขัด Req 6.9 (non-Direct ห้ามข้าม Quiet_Hours) + Req 6.6 (ควรเข้า digest).
--   รากปัญหา: rpc_complete_work_item ไม่มี quiet-hours context และ suppression model ขับเคลื่อนด้วย caller
--   (TS layer คำนวณ flag แล้วส่งเข้า rpc_dispatch_notification เสมอ — เช่น sla-sweep-scheduler).
--   แก้: เพิ่ม param p_in_quiet_hours (default false → call site เดิม 2-arg คงพฤติกรรมเดิม) แล้ว forward
--        เข้า rpc_dispatch_notification → ใน quiet hours celebrate ถูกระงับเข้า digest (return null) ตาม Req 6.6/6.9.
--   หมายเหตุ mute (Req 6.5): celebrate เป็น group broadcast ระดับแผนก ไม่ใช่ per-employee category mute ตอน dispatch
--        — การ filter mute รายบุคคลเกิดตอน fan-out/delivery ปลายทาง จึงคง p_muted=false ที่ระดับ dispatch.

-- drop signature เดิม (uuid, int) เพื่อขยาย arg list (Postgres ไม่ replace ข้าม signature);
-- call site 2-arg เดิม resolve เข้า signature ใหม่ผ่าน default ได้ — ไม่ break.
drop function if exists public.rpc_complete_work_item(uuid, int);

create or replace function public.rpc_complete_work_item(
  p_work_item_id uuid,
  p_expected_version int,
  p_in_quiet_hours boolean default false
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
  v_owner uuid;
  v_max_order int;
  v_last_step text;
begin
  select current_order, version, status, site_code, current_owner
    into v_cur_order, v_cur_version, v_cur_status, v_site, v_owner
  from public.work_item where id = p_work_item_id
  for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  -- B (0034): idempotent — จบแล้วคืน 'completed' (ไม่ double-apply, ไม่ error เพี้ยน)
  if v_cur_status = 'completed' then
    return 'completed';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_cur_version
      using errcode = 'serialization_failure';
  end if;

  select max(canonical_order) into v_max_order from public.process_model;
  if v_cur_order is distinct from v_max_order then
    raise exception 'cannot complete: not at last step (order % of %)', v_cur_order, v_max_order
      using errcode = 'check_violation';
  end if;
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

  -- A (0034) + C1: celebrate ผ่าน notification engine (routing/suppression/template) — best-effort.
  -- forward p_in_quiet_hours → non-Direct celebrate ใน quiet hours ถูกระงับเข้า digest (Req 6.6/6.9).
  begin
    perform public.rpc_dispatch_notification(
      jsonb_build_object('work_item_id', p_work_item_id, 'site_code', v_site, 'owner', v_owner),  -- p_target
      'fyi',                                                                                       -- p_intent → group_message
      'celebrate',                                                                                 -- p_category
      'tpl_celebrate',                                                                             -- p_template_key
      jsonb_build_object('work_item_id', p_work_item_id, 'final_step', v_last_step),               -- p_slots
      false,                                                                                       -- p_muted (group broadcast; per-user mute ตอน delivery)
      p_in_quiet_hours,                                                                            -- p_in_quiet_hours (Req 6.6/6.9)
      true,                                                                                        -- p_has_active_binding
      null,                                                                                        -- p_dept_head_target
      v_site                                                                                       -- p_site_code
    );
  exception when others then
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('notification', p_work_item_id, v_last_step, v_site, public.resolve_actor(),
      jsonb_build_object('result', 'celebrate_dispatch_failed', 'best_effort', true));
  end;

  return 'completed';
end;
$$;

revoke all on function public.rpc_complete_work_item(uuid, int, boolean) from public;
