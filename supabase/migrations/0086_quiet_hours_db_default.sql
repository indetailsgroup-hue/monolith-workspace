-- Migration: quiet_hours_db_default — monolith-workflow-copilot (runbook Wave2 B2, scrutiny F10)
-- Depends on: 0018/0060 (rpc_dispatch_notification), 0034/0035 (rpc_complete_work_item), C12
--
-- F10 (พบใน grill-with-docs 2026-07-06): p_in_quiet_hours เป็น boolean param ที่ทุก caller ปล่อย/ส่ง false
--   → digest ไม่มีทางเกิดจริง และ Quiet_Hours ไม่เคยมีค่าจริงจนกระทั่ง owner กำหนดใน grill:
--   **Quiet_Hours = 20:00–08:00 เวลาไทย · Daily_Digest 08:00 ไทย** (glossary ใน requirements.md)
--
-- แก้ตามมติ: default คำนวณจากนาฬิกา DB (Asia/Bangkok) เมื่อ caller ไม่ส่งค่า —
--   (1) fn_wf_in_quiet_hours(): now() ∈ 20:00–08:00 ไทย (ข้ามเที่ยงคืน → OR)
--   (2) rpc_dispatch_notification: p_in_quiet_hours default null → null = ให้ DB คำนวณ;
--       caller ที่ส่ง true/false ชัดเจน (เช่น test/simulation) ยัง override ได้
--   (3) rpc_complete_work_item: default null + forward → celebrate เคารพ quiet hours จริง
--       (0035 แก้เชิงโครงสร้างไว้แล้วแต่พึ่ง caller ที่ไม่มีใครคำนวณ — ปิดที่ DB จุดเดียว)
--   (4) ฝั่ง TS: sla-sweep-scheduler เลิก hardcode p_in_quiet_hours:false (แก้คู่กันใน commit นี้)

-- ---------------------------------------------------------------------------
-- (1) fn_wf_in_quiet_hours — SSOT ของหน้าต่าง Quiet_Hours (20:00–08:00 Asia/Bangkok)
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_in_quiet_hours()
returns boolean
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Bangkok', now()))::time >= time '20:00'
      or (timezone('Asia/Bangkok', now()))::time <  time '08:00';
$$;

comment on function public.fn_wf_in_quiet_hours() is
  'Quiet_Hours 20:00–08:00 เวลาไทย (มติ grill 2026-07-06, glossary workflow spec). ไทยไม่มี DST — หน้าต่างคงที่';

-- ---------------------------------------------------------------------------
-- (2) rpc_dispatch_notification — p_in_quiet_hours: false → null (= DB คำนวณ)
--     body เดิมจาก 0060 ทั้งหมด เปลี่ยนเฉพาะ default + v_quiet (ตรวจแล้วไม่มี migration หลัง 0060 ทับ)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_dispatch_notification(
  p_target jsonb,
  p_intent text,
  p_category text,
  p_template_key text,
  p_slots jsonb default '{}'::jsonb,
  p_muted boolean default false,
  p_in_quiet_hours boolean default null,  -- B2: null = คำนวณจากนาฬิกา DB (เดิม default false)
  p_has_active_binding boolean default true,
  p_dept_head_target jsonb default null,
  p_site_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel public.wf_notification_channel;
  v_is_direct boolean;
  v_id uuid;
  v_quiet boolean;
begin
  -- B2 (F10): caller ไม่ส่งค่า → DB ตัดสินจากเวลาไทยจริง
  v_quiet := coalesce(p_in_quiet_hours, public.fn_wf_in_quiet_hours());

  v_channel := case
    when p_intent in ('personal_responsibility', 'personal_approval') then 'direct_push'
    else 'group_message'
  end::public.wf_notification_channel;
  v_is_direct := (v_channel = 'direct_push');

  if p_muted then
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_muted', 'category', p_category));
    return null;
  end if;

  if v_is_direct then
    if not p_has_active_binding then
      insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
      values ('notification', p_site_code, public.resolve_actor(),
        jsonb_build_object('result', 'binding_missing_failure', 'category', p_category));
      if p_dept_head_target is not null then
        insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
        values (p_site_code, p_dept_head_target, 'direct_push', p_category, true, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
        returning id into v_id;
      end if;
      insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
      values ('notification', p_site_code, public.resolve_actor(),
        jsonb_build_object('result', 'binding_missing_escalation', 'escalated', p_dept_head_target is not null));
      return v_id;
    end if;
    insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
    values (p_site_code, p_target, 'direct_push', p_category, true, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
    returning id into v_id;
    return v_id;
  end if;

  -- D1: non-Direct ใน quiet hours → persist 'digest_pending' (แทน drop) — Req 6.6/6.4
  if v_quiet then
    insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
    values (p_site_code, p_target, 'group_message', p_category, false, p_template_key, coalesce(p_slots,'{}'::jsonb), 'digest_pending')
    returning id into v_id;
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_digest', 'category', p_category, 'notification_id', v_id));
    return v_id;  -- D1: persisted (เดิม return null)
  end if;

  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (p_site_code, p_target, 'group_message', p_category, false, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rpc_dispatch_notification(jsonb, text, text, text, jsonb, boolean, boolean, boolean, jsonb, text) from public;

-- ---------------------------------------------------------------------------
-- (3) rpc_complete_work_item — p_in_quiet_hours default false → null (forward = DB คำนวณ)
--     body เดิมจาก 0035 ทั้งหมด เปลี่ยนเฉพาะ default (call site 2-arg เดิม → null → คำนวณจริง)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_complete_work_item(
  p_work_item_id uuid,
  p_expected_version int,
  p_in_quiet_hours boolean default null  -- B2: null = ให้ rpc_dispatch_notification คำนวณ
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

  -- A (0034) + C1 (0035) + B2: celebrate ผ่าน notification engine — best-effort.
  -- forward p_in_quiet_hours (null → dispatch คำนวณจากเวลาไทย) → non-Direct celebrate ใน quiet hours เข้า digest (Req 6.6/6.9).
  begin
    perform public.rpc_dispatch_notification(
      jsonb_build_object('work_item_id', p_work_item_id, 'site_code', v_site, 'owner', v_owner),  -- p_target
      'fyi',                                                                                       -- p_intent → group_message
      'celebrate',                                                                                 -- p_category
      'tpl_celebrate',                                                                             -- p_template_key
      jsonb_build_object('work_item_id', p_work_item_id, 'final_step', v_last_step),               -- p_slots
      false,                                                                                       -- p_muted (group broadcast; per-user mute ตอน delivery)
      p_in_quiet_hours,                                                                            -- p_in_quiet_hours (null = DB คำนวณ — Req 6.6/6.9)
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

-- grants (pattern 0061/0083: revoke public + conditional grant)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_wf_in_quiet_hours() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_wf_in_quiet_hours() to service_role';
  end if;
end $$;
