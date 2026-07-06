-- Migration: revision_gate_wiring — monolith-workflow-copilot Phase 1.5 close (Req 21.3, 21.10, 21.12)
-- Spec task: 22 (wire revision discipline เข้า approve/reject จริง)
-- Depends on: 0024 (design_lock_field_config, rpc_record_design_lock, rpc_classify_revision,
--             rpc_request_scope_change), 0031 (process_model canonical_order, gate_order), C12
--
-- ปัญหาเดิม (ตรวจพบ 2026-07-06): revision RPCs (0024) เป็น building block คีย์ด้วย GATE (G1–G4)
--   แต่ไม่มีที่ไหน map canonical Process_Step → gate → feature ไม่เคย engage ตอน approve/reject จริง
--   (grep 'classif|design_lock' ใน 0015/0031 decision RPC = ไม่เจอ). เหมือน Phase 13/14: logic ครบ wiring ขาด.
--
-- แก้ (additive, ไม่แตะ decision RPC ที่ test แล้ว — ลด risk regression):
--   (1) fn_wf_gate_for_step: mirror src/workflow/revision/gate-wiring.ts (Designer→G1, 3D_Presentation→G2,
--       3D_Rendering_Final→G3, Production Planning→G4; อื่น → null). G-letter = cost tier ไม่ใช่ลำดับเวลา.
--   (2) rpc_apply_design_lock_for_step: idempotent — เรียกหลัง gate ผ่านอนุมัติ → ตั้ง lock ของ gate นั้น
--       (ข้ามถ้า step ไม่ lockable หรือ gate ถูก lock แล้ว). App/Edge เรียกที่ boundary การอนุมัติ.
--   (3) rpc_reject_design_gate: reject ที่ design/3D gate → classify (0024) → ถ้า scope_change เข้า
--       awaiting_requote; else record reject ปกติ (rework). ต้องการ change payload จึงเป็น RPC แยก
--       (plain reject ไม่มี field diff — โดยธรรมชาติ).

-- ---------------------------------------------------------------------------
-- (1) step → gate mapping
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_gate_for_step(p_step text)
returns text
language sql
immutable
as $$
  select case p_step
    when 'Designer' then 'G1'
    when '3D_Presentation' then 'G2'
    when '3D_Rendering_Final' then 'G3'
    when 'Production Planning' then 'G4'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- (2) apply design lock เมื่อ gate ผ่านอนุมัติ (Req 21.3) — idempotent
-- ---------------------------------------------------------------------------
create or replace function public.rpc_apply_design_lock_for_step(
  p_work_item_id uuid,
  p_process_step text
)
returns text  -- gate ที่ตั้ง หรือ null (ไม่ lockable/ตั้งแล้ว)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate text;
  v_already boolean;
begin
  v_gate := public.fn_wf_gate_for_step(p_process_step);
  if v_gate is null then
    return null;  -- step นี้ไม่ตั้ง lock (Sale/Area Measurement/Factory/Installation)
  end if;

  -- idempotent: ถ้า gate ถูก lock แล้ว ไม่ทำซ้ำ (Req 21.11 — no silent re-lock/unlock)
  select coalesce(design_locks ? v_gate, false) into v_already
  from public.work_item where id = p_work_item_id;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;
  if v_already then
    return null;
  end if;

  perform public.rpc_record_design_lock(p_work_item_id, v_gate);
  return v_gate;
end;
$$;

revoke all on function public.rpc_apply_design_lock_for_step(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- (3) reject ที่ design/3D gate → classify → route (scope_change → requote; else rework)
--     รวม classify (0024) + routing ในธุรกรรมเดียว. record reject ผ่าน decision RPC ปกติทำที่ caller
--     (ต้องมี approval_request_id + version) — ที่นี่จัด revision discipline หลัง reject ถูกบันทึกแล้ว.
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

  -- Req 21.10 — scope_change → re-quote path (awaiting_requote); else คง rework (decision RPC ตั้งแล้ว)
  if v_reason = 'scope_change' then
    perform public.rpc_request_scope_change(p_work_item_id);
  end if;

  return v_reason;
end;
$$;

revoke all on function public.rpc_reject_design_gate(uuid, text, jsonb, boolean, boolean, text) from public;

-- grants
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_wf_gate_for_step(text) to authenticated';
    execute 'grant execute on function public.rpc_apply_design_lock_for_step(uuid, text) to authenticated';
    execute 'grant execute on function public.rpc_reject_design_gate(uuid, text, jsonb, boolean, boolean, text) to authenticated';
  end if;
end $$;
