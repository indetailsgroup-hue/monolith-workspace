-- Migration: requote_full_revert — monolith-workflow-copilot (runbook Wave2 B4, scrutiny F8, ADR-037)
-- Depends on: 0024 (rpc_request_scope_change, rpc_accept_requote, rpc_classify_revision),
--             0083 (fn_wf_gate_for_step, rpc_reject_design_gate), 0084 (trg_work_item_apply_design_lock), C12
--
-- F8 (pre-existing, ยกระดับเป็น ADR-037 ใน grill-with-docs 2026-07-06): rpc_accept_requote เดิม
--   เมื่อ internal+customer ครบคู่ → set 'in_progress' เฉย ๆ — ไม่ revert current_step, ไม่ปลด/ตั้ง lock ใหม่
--   → ขัด Req 21.10 (scope change ที่อนุมัติแล้วต้องพางานกลับเข้าวงจรของ gate ที่แตก)
--
-- มติ ADR-037 (full revert ผ่านวงจรอนุมัติเดิม — ไม่สร้าง mini-approval พิเศษ):
--   (1) ตอน scope_change: เก็บ gate ที่แตกไว้ใน design_locks._requote.gate
--   (2) ตอน accept ครบคู่: ปลด lock ของ gate นั้น + revert current_step/current_order กลับไป step ของ gate
--       (inverse ของ fn_wf_gate_for_step) + เคลียร์ _requote → ทีม rework step นั้นใหม่
--   (3) เมื่อ step ผ่านการอนุมัติรอบใหม่ตามปกติ → trigger 0084 (trg_work_item_apply_design_lock) re-lock เอง
--       (ไม่ต้องมีโค้ด re-lock พิเศษที่นี่ — วงจรเดียว, invariant เดียว)

-- ---------------------------------------------------------------------------
-- (1) fn_wf_step_for_gate — inverse ของ fn_wf_gate_for_step (0083)
--     G-letter = COST TIER ไม่ใช่ลำดับเวลา (Req 21.12) — map ตรงตัว mirror gate-wiring.ts
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_step_for_gate(p_gate text)
returns text
language sql
immutable
as $$
  select case p_gate
    when 'G1' then 'Designer'
    when 'G2' then '3D_Presentation'
    when 'G3' then '3D_Rendering_Final'
    when 'G4' then 'Production Planning'
  end;
$$;

-- ---------------------------------------------------------------------------
-- (2) rpc_request_scope_change — เพิ่ม p_gate เก็บลง _requote.gate (ADR-037 ข้อ 1)
--     drop signature เดิม (uuid) กัน overload ซ้อน; caller เดิมแบบ 1-arg resolve เข้า default ได้
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_request_scope_change(uuid);

create or replace function public.rpc_request_scope_change(
  p_work_item_id uuid,
  p_gate text default null  -- gate ที่แตก (G1–G4); null = พฤติกรรมเดิม (accept แล้วไม่ revert)
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.work_item
    set status = 'awaiting_requote',
        design_locks = coalesce(design_locks, '{}'::jsonb)
          || jsonb_build_object('_requote',
               coalesce(design_locks -> '_requote', '{}'::jsonb) || jsonb_build_object('gate', p_gate))
    where id = p_work_item_id;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;
  insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
  values ('revision', p_work_item_id, public.resolve_actor(),
    jsonb_build_object('op', 'request_scope_change', 'status', 'awaiting_requote', 'gate', p_gate));
end; $$;

revoke all on function public.rpc_request_scope_change(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- (3) rpc_reject_design_gate — ส่ง v_gate เข้า scope_change (เดิมจาก 0083, เปลี่ยนบรรทัดเดียว)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_reject_design_gate(
  p_work_item_id uuid,
  p_process_step text,
  p_changed_fields jsonb,
  p_matches_signed_spec boolean,
  p_is_clear boolean default true,
  p_customer_comment text default null
)
returns text  -- reason ที่ classify ได้
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate text;
  v_reason text;
begin
  v_gate := public.fn_wf_gate_for_step(p_process_step);
  if v_gate is null then
    raise exception 'step % is not a design/3D gate', p_process_step using errcode = 'check_violation';
  end if;

  -- classify + record revision_event + นับ threshold (0024 ทำครบ)
  v_reason := public.rpc_classify_revision(
    p_work_item_id, v_gate, coalesce(p_changed_fields, '[]'::jsonb),
    p_matches_signed_spec, p_is_clear, p_customer_comment);

  -- Req 21.10 + ADR-037 — scope_change → re-quote path พร้อมจำ gate ไว้ revert ตอน accept ครบคู่
  if v_reason = 'scope_change' then
    perform public.rpc_request_scope_change(p_work_item_id, v_gate);
  end if;

  return v_reason;
end;
$$;

revoke all on function public.rpc_reject_design_gate(uuid, text, jsonb, boolean, boolean, text) from public;

-- ---------------------------------------------------------------------------
-- (4) rpc_accept_requote — ครบคู่ = ปลด lock gate + revert step/order + เคลียร์ _requote (ADR-037 ข้อ 2)
--     โครง FSM เดิมจาก 0024 (internal/customer flags, Req 21.6/21.10/21.11/21.17) — เปลี่ยนเฉพาะ complete branch
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
    -- ADR-037: revert กลับ step ของ gate ที่แตก (ถ้ารู้ gate); ปลด lock ของ gate นั้นให้แก้แบบได้;
    -- เคลียร์ _requote ทิ้ง — trigger 0084 จะ re-lock เองเมื่อ gate ผ่านการอนุมัติรอบใหม่
    v_step := case when v_gate is not null then public.fn_wf_step_for_gate(v_gate) end;
    select canonical_order into v_order from public.process_model where process_step = v_step;

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
        'gate', v_gate, 'reverted_to_step', v_step, 'reverted_to_order', v_order));
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

-- grants (mirror 0083: fn map + reject เปิดให้ authenticated; scope_change/accept คง stance 0024 = revoke-only)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_wf_step_for_gate(text) to authenticated';
    execute 'grant execute on function public.rpc_reject_design_gate(uuid, text, jsonb, boolean, boolean, text) to authenticated';
  end if;
end $$;
