-- Migration: celebrate_via_dispatch — monolith-workflow-copilot (re-scrutinize 0033 fixes A, B)
-- Depends on: 0018 (rpc_dispatch_notification), 0031/0033 (rpc_complete_work_item), C12
--
-- A (MEDIUM): celebrate เดิม insert notification ตรง (target ว่าง → ส่งไม่ถึงใคร + bypass routing/suppression).
--   แก้: route ผ่าน rpc_dispatch_notification (intent=fyi → group_message; ผ่าน suppression/template Req 6) +
--        target ที่ resolve ได้ (work_item_id/site/owner); best-effort (Req 12.7: celebrate fail ไม่ย้อน completion).
-- B (NIT): double-complete ให้ idempotent (status='completed' → return 'completed' ไม่ error เพี้ยน).

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

  -- B: idempotent — จบแล้วคืน 'completed' (ไม่ double-apply, ไม่ error เพี้ยน)
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

  -- A + Req 12.7: celebrate ผ่าน notification engine (routing/suppression) — best-effort
  -- (notification fail ไม่ย้อน completion; sub-block savepoint คงสถานะ completed ไว้)
  begin
    perform public.rpc_dispatch_notification(
      jsonb_build_object('work_item_id', p_work_item_id, 'site_code', v_site, 'owner', v_owner),  -- p_target (resolve ได้)
      'fyi',                                                                                       -- p_intent → group_message
      'celebrate',                                                                                 -- p_category (mutable)
      'tpl_celebrate',                                                                             -- p_template_key
      jsonb_build_object('work_item_id', p_work_item_id, 'final_step', v_last_step),               -- p_slots
      false,                                                                                       -- p_muted
      false,                                                                                       -- p_in_quiet_hours
      true,                                                                                        -- p_has_active_binding
      null,                                                                                        -- p_dept_head_target
      v_site                                                                                       -- p_site_code
    );
  exception when others then
    -- best-effort: บันทึกว่า celebrate dispatch ล้มเหลว แต่ไม่ย้อน completion (Req 12.7)
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('notification', p_work_item_id, v_last_step, v_site, public.resolve_actor(),
      jsonb_build_object('result', 'celebrate_dispatch_failed', 'best_effort', true));
  end;

  return 'completed';
end;
$$;

revoke all on function public.rpc_complete_work_item(uuid, int) from public;
