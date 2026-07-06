-- Migration: delegation_routing_wiring — monolith-workflow-copilot Phase 14 close
-- Spec task: 7.3/7.4 + 9 (wire delegation routing เข้า rpc_resolve_approver จริง)
-- Depends on: 0002 (delegation, approval_request), 0014 (rpc_resolve_approver), 0010 (knowledge RACI), C12
--
-- ปัญหาเดิม (ตรวจพบ 2026-07-06): delegation เป็น feature ที่ "นั่งเฉย ๆ" —
--   rpc_resolve_approver ไม่เคยเรียก routing เลย (grep 'delegat' ใน 0014 = ไม่เจอ) →
--   Approval_Request ไปหา approver เดิมเสมอ แม้มี delegation active. ต้นเหตุ: identity ไม่ align —
--   approval_request.resolved_approver + RACI accountable เป็น "actor identity" (resolve_actor: email/uid)
--   แต่ public.delegation คีย์ด้วย employee uuid → จับคู่กันไม่ได้จึง wire ไม่ได้.
--
-- แก้ (additive, ไม่มี data เดิมเพราะ feature ไม่เคยทำงาน):
--   (1) เพิ่มคอลัมน์ actor-identity ให้ delegation (approver_actor/acting_actor) ให้อยู่ identity space
--       เดียวกับ resolved_approver; ปลด NOT NULL ของคอลัมน์ uuid (เก็บไว้อ้าง employee ได้ แต่ไม่ใช่คีย์ routing)
--   (2) rpc_create_delegation รับ actor identity (text) แทน uuid — ไม่มี caller ภายนอก (grep แล้ว) จึงปลอดภัย
--   (3) fn_wf_route_delegation: mirror src/workflow/resolver/delegation-routing.ts + resolve-with-delegation.ts
--   (4) rpc_resolve_approver v2: route ผู้อนุมัติแต่ละรายผ่าน delegation ก่อน insert + audit รายที่ถูก route
--
-- หมายเหตุค้าง (ไม่แก้ในนี้): rpc_create_delegation ตรวจ has_any_app_role ของ "ผู้เรียก" ไม่ใช่ acting
--   approver — สอดคล้อง C12 (roles อ่านจาก JWT ของ caller) ต่อเมื่อ acting approver เป็นผู้ยอมรับ delegation
--   เอง (caller = acting). ถ้าต้องการให้ original approver เป็นผู้ตั้ง ต้องมีวิธีตรวจ role ของ acting แยก
--   (เช่น ตาราง employee_roles) — ยกเป็นข้อสังเกตไว้ ไม่ใช่ขอบเขต Phase 14 routing.

-- ---------------------------------------------------------------------------
-- (1) identity columns
-- ---------------------------------------------------------------------------
alter table public.delegation add column if not exists approver_actor text;
alter table public.delegation add column if not exists acting_actor text;
alter table public.delegation alter column approver_employee drop not null;
alter table public.delegation alter column acting_approver drop not null;

-- index สำหรับ routing lookup (step + approver + active window)
create index if not exists ix_delegation_routing
  on public.delegation (process_step, approver_actor)
  where not is_revoked;

-- ---------------------------------------------------------------------------
-- (2) rpc_create_delegation v2 — actor identity params (drop เดิมก่อน เพราะ signature เปลี่ยน)
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_create_delegation(uuid, uuid, text, text[], timestamptz, timestamptz, text);

create or replace function public.rpc_create_delegation(
  p_approver_actor text,          -- identity ที่ตรงกับ resolved_approver (ผู้มอบ)
  p_acting_actor text,            -- identity ผู้รับมอบ (ผู้อนุมัติแทน)
  p_process_step text,
  p_required_roles text[],
  p_start timestamptz,
  p_end timestamptz,
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
  -- Req 14.2/14.3 — บทบาทเพียงพอตาม Process_Step (ตรวจ role ของ caller ตาม C12; ดูหมายเหตุค้างหัวไฟล์)
  if p_required_roles is null or array_length(p_required_roles, 1) is null
     or not public.has_any_app_role(p_required_roles) then
    raise exception 'insufficient role for delegation at step %', p_process_step using errcode = 'insufficient_privilege';
  end if;

  if p_approver_actor is null or length(btrim(p_approver_actor)) = 0
     or p_acting_actor is null or length(btrim(p_acting_actor)) = 0 then
    raise exception 'approver/acting actor identity required' using errcode = 'check_violation';
  end if;
  if p_acting_actor = p_approver_actor then
    raise exception 'acting approver must differ from approver' using errcode = 'check_violation';
  end if;
  if p_end <= p_start then
    raise exception 'delegation end must be after start' using errcode = 'check_violation';
  end if;

  insert into public.delegation
    (approver_actor, acting_actor, process_step, site_code, start_time, end_time, is_revoked)
  values
    (p_approver_actor, p_acting_actor, p_process_step, p_site_code, p_start, p_end, false)
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, process_step, site_code, performed_by, detail)
  values ('delegation', p_process_step, p_site_code, public.resolve_actor(),
    jsonb_build_object('op', 'create', 'delegation_id', v_id,
      'approver', p_approver_actor, 'acting', p_acting_actor, 'start', p_start, 'end', p_end));

  return v_id;
end;
$$;

revoke all on function public.rpc_create_delegation(text, text, text, text[], timestamptz, timestamptz, text) from public;

-- ---------------------------------------------------------------------------
-- (3) fn_wf_route_delegation — mirror routeApprover: active delegation → acting, else เดิม
--     active = not revoked · step ตรง · site ตรงหรือ null · now ∈ [start,end]. หลายอัน → ล่าสุด.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_route_delegation(
  p_approver_actor text,
  p_process_step text,
  p_site_code text,
  p_now timestamptz default timezone('utc', now())
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select d.acting_actor
      from public.delegation d
      where d.approver_actor = p_approver_actor
        and d.process_step = p_process_step
        and not d.is_revoked
        and (d.site_code is null or d.site_code = p_site_code)
        and p_now >= d.start_time
        and p_now <= d.end_time
      order by d.created_at desc
      limit 1
    ),
    p_approver_actor
  );
$$;

revoke all on function public.fn_wf_route_delegation(text, text, text, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- (4) rpc_resolve_approver v2 — route ผู้อนุมัติแต่ละรายผ่าน delegation ก่อน insert (Req 14.4)
--     mirror src/workflow/resolver/resolve-with-delegation.ts (resolve → route → dedup effective)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_approver(
  p_work_item_id uuid,
  p_process_step text,
  p_sla_minutes int default 1440
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site text;
  v_quorum public.wf_approval_quorum;
  v_requires boolean;
  v_payload jsonb;
  v_accountable jsonb;
  v_role text;
  v_effective text;
  v_count int := 0;
  v_seen text[] := array[]::text[];
  v_now timestamptz := timezone('utc', now());
  v_deadline timestamptz := timezone('utc', now()) + make_interval(mins => greatest(1, p_sla_minutes));
begin
  select site_code into v_site from public.work_item where id = p_work_item_id;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  select approval_quorum, requires_approval into v_quorum, v_requires
  from public.process_model where process_step = p_process_step;
  if not found then
    raise exception 'unknown step: %', p_process_step using errcode = 'foreign_key_violation';
  end if;

  v_quorum := coalesce(v_quorum, 'unanimous');

  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_accountable := v_payload #> array['raciMap', p_process_step, 'accountable'];

  -- Req 3.4 — ว่าง → fail-safe block + escalate + audit (คงเดิม)
  if v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0 then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

  for v_role in select jsonb_array_elements_text(v_accountable) loop
    -- Req 14.4 — route ผ่าน delegation active ก่อน (identity aligned กับ resolved_approver)
    v_effective := public.fn_wf_route_delegation(v_role, p_process_step, v_site, v_now);

    -- dedup: ถ้าสอง approver เดิมถูก delegate ไปคนเดียวกัน → 1 request
    if v_effective = any(v_seen) then
      continue;
    end if;
    v_seen := array_append(v_seen, v_effective);

    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
    values
      (p_work_item_id, p_process_step, v_site, v_effective, 'employee', v_quorum, v_deadline, v_deadline, 'pending');
    v_count := v_count + 1;

    -- audit เฉพาะรายที่ถูก route ไป acting (Req 14.5)
    if v_effective is distinct from v_role then
      insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
      values ('delegation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
        jsonb_build_object('op', 'route', 'from', v_role, 'to', v_effective));
    end if;
  end loop;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, text, int) from public;

-- grants (service/authenticated ตาม pattern เดิมของ workflow RPC)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_create_delegation(text, text, text, text[], timestamptz, timestamptz, text) to authenticated';
  end if;
end $$;
