-- Migration: scrutiny_wave2_fixes — แก้ findings จาก scrutinize งาน 0085–0092 (2026-07-06 รอบสอง)
-- Depends on: 0085 (templates), 0087 (rpc_accept_requote), 0090 (installation_memberships)
--
-- S1 (กลาง): installation_memberships_sel ไม่มี branch has_site_access — office staff (มี site ใน JWT,
--     ไม่ใช่ governance, ไม่ได้เป็น member) insert/update memberships ได้ (policy ins/upd มี site branch)
--     แต่**อ่านไม่ได้** → จัดทีมแล้วมองไม่เห็นรายชื่อ; แก้ให้ scope เดียวกับ ins/upd
-- S2 (ต่ำ/UX tenet): template หลุดศัพท์ระบบถึงผู้ใช้ — tpl_sla_timeout_pm render {{escalate_to}}
--     (= 'project_manager'/'workflow_default' ref ดิบ) และ tpl_daily_digest render {{categories}}
--     (= JSON array text) — ขัด D-12/S2 "ห้ามโชว์ id/key/ศัพท์ระบบ"; ตัด slot เหล่านั้นออกจาก body
--     (ค่ายังอยู่ใน notification.slots ครบ — หลังบ้านดูได้ ผู้ใช้ไม่เห็น)
-- S4 (ต่ำ): 0087 revert — ถ้า gate map เป็น step ที่ไม่อยู่ใน process_model ปัจจุบัน (knowledge เปลี่ยน
--     ระหว่างรอ requote) จะ set current_step ใหม่แต่ current_order ค้างเก่า → step/order ไม่ตรงกัน;
--     แก้เป็น fail-safe: revert เฉพาะเมื่อ map ได้ครบทั้ง step+order, ไม่ครบ = ปลด lock ตามปกติ
--     แต่คง step เดิม + audit 'revert_skipped_unmapped'

-- ---------------------------------------------------------------------------
-- S1: memberships select ให้ office (site access) เห็นทีมของโปรเจกต์ใน site ตัวเอง
-- ---------------------------------------------------------------------------
drop policy if exists installation_memberships_sel on public.installation_memberships;
create policy installation_memberships_sel on public.installation_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_governance_role()
         or public.fn_installation_is_member(project_id)
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)));

-- ---------------------------------------------------------------------------
-- S2: template governance update (ผ่าน PR review เช่นเดียวกับ 0085)
-- ---------------------------------------------------------------------------
update public.line_oa_message_templates
  set body = '🔔 เรียน PM ครับ งาน {{work_item_id}} ขั้นตอน {{process_step}} เกินเวลาที่กำหนดและถูกส่งต่อถึงคุณแล้ว รบกวนช่วยติดตามด้วยครับ 🙏'
  where template_key = 'tpl_sla_timeout_pm' and vertical_context is null;

update public.line_oa_message_templates
  set body = '☀️ สรุปแจ้งเตือนเช้านี้ครับ ช่วงกลางคืนที่ผ่านมามีเรื่องสะสม {{count}} รายการ เข้าไปดูรายละเอียดในระบบได้เลยครับ'
  where template_key = 'tpl_daily_digest' and vertical_context is null;

-- ---------------------------------------------------------------------------
-- S4: rpc_accept_requote — revert เฉพาะเมื่อ map step+order ได้ครบ (body เดิมจาก 0087 เปลี่ยนเฉพาะ guard)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_accept_requote(
  p_work_item_id uuid,
  p_actor_kind text  -- 'internal' | 'customer'
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_wi public.work_item%rowtype;
  v_internal boolean;
  v_customer boolean;
  v_gate text;
  v_step text;
  v_order int;
begin
  select * into v_wi from public.work_item where id = p_work_item_id for update;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;

  v_internal := coalesce((v_wi.design_locks #>> '{_requote,internal_accepted}')::boolean, false);
  v_customer := coalesce((v_wi.design_locks #>> '{_requote,customer_accepted}')::boolean, false);
  v_gate := v_wi.design_locks #>> '{_requote,gate}';

  if p_actor_kind = 'internal' then
    v_internal := true;
  elsif p_actor_kind = 'customer' then
    v_customer := true;
  else
    raise exception 'invalid actor_kind: %', p_actor_kind using errcode = 'check_violation';
  end if;

  -- ปลด lock/เดินต่อ เฉพาะเมื่อครบทั้งคู่ (Req 21.17)
  if v_internal and v_customer then
    -- ADR-037: revert กลับ step ของ gate ที่แตก; S4 fail-safe — revert เฉพาะเมื่อ step อยู่ใน
    -- process_model ปัจจุบัน (map order ได้) ไม่งั้น step/order จะไม่ตรงกัน; map ไม่ได้ = ปลด lock
    -- ตามปกติ คง step เดิม + audit ให้คนตามต่อ
    v_step := case when v_gate is not null then public.fn_wf_step_for_gate(v_gate) end;
    select canonical_order into v_order from public.process_model where process_step = v_step;
    if v_step is not null and v_order is null then
      v_step := null;  -- unmapped → ไม่ revert (กัน current_step/current_order เพี้ยน)
    end if;

    update public.work_item
      set status = 'in_progress',
          version = version + 1,
          current_step = coalesce(v_step, current_step),
          current_order = coalesce(v_order, current_order),
          design_locks = case
            when v_gate is not null
              then (coalesce(design_locks, '{}'::jsonb) - '_requote') - v_gate
            else coalesce(design_locks, '{}'::jsonb) - '_requote'
          end
      where id = p_work_item_id;

    insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
    values ('revision', p_work_item_id, public.resolve_actor(),
      jsonb_build_object('op', 'requote_complete', 'internal', true, 'customer', true, 'proceed', true,
        'gate', v_gate, 'reverted_to_step', v_step, 'reverted_to_order', v_order,
        'revert_skipped_unmapped', (v_gate is not null and v_step is null)));
    return 'proceed';
  end if;

  -- ยังไม่ครบคู่ → บันทึก flag ค้างไว้ (คง gate เดิมใน _requote)
  update public.work_item
    set design_locks = coalesce(design_locks, '{}'::jsonb)
        || jsonb_build_object('_requote', jsonb_build_object(
             'internal_accepted', v_internal, 'customer_accepted', v_customer, 'gate', v_gate))
    where id = p_work_item_id;

  if v_internal and not v_customer then
    update public.work_item set status = 'awaiting_customer_acceptance' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
    values ('revision', p_work_item_id, public.resolve_actor(),
      jsonb_build_object('op', 'requote_internal_done', 'awaiting', 'customer'));
    return 'awaiting_customer_acceptance';
  end if;

  insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
  values ('revision', p_work_item_id, public.resolve_actor(),
    jsonb_build_object('op', 'requote_partial', 'internal', v_internal, 'customer', v_customer));
  return 'awaiting_requote';
end; $$;

revoke all on function public.rpc_accept_requote(uuid, text) from public;
