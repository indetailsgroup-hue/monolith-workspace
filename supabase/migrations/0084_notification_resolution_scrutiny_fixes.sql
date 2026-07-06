-- Migration: notification_resolution_scrutiny_fixes — ผล scrutinize งานปิด Phase 13/14/Req 21 (2026-07-06)
-- Depends on: 0081 (claim v2), 0083 (design lock wiring), 0002 (identity_binding, work_item),
--             0023/0031 (approval_request customer/role refs), line_oa (customer identity), C12
--
-- Findings ที่แก้ในไฟล์นี้ (รายละเอียดเต็ม: docs/SCRUTINY-2026-07-06-workflow-close.md):
--
-- F1 (สูง): 0081 resolve ผู้รับจาก target->>'line_user_id'/'owner'/'employee_id' เท่านั้น
--   แต่ target ของ SLA sweep (ตัวหลักของระบบ) คือ {approval_request_id, escalate_to} →
--   reminder/timeout ทุกใบจะ recipient_unresolvable → failed ถาวรหลัง 5 ครั้ง.
--   อีกทั้ง resolved_approver เป็น "approver ref" (app-role ref ตาม ADR-018 — ดู
--   has_any_app_role ใน 0031) ไม่ใช่ email/uuid → ต้องมี mapping ref → LINE.
--   แก้: (1) identity_binding += app_role (HR ผูก ref → binding), (2) claim v3 เพิ่ม
--   resolution chain: line_user_id ตรง → employee uuid → approval_request
--   (employee → binding.app_role = ref; customer → line_oa_customer_identity) →
--   escalate_to (binding.app_role = escalate_to).
--
-- F3 (กลาง): กติกา ≤200 ตัวอักษร (Req 6.8/6.10/12.5/12.6 — mirror template.ts composeMessage)
--   ไม่เคยถูกบังคับบนเส้นส่งจริง. แก้: claim v3 คืน resolve_error ('segment_too_long' สำหรับ
--   group_message ที่ render เกิน 200 — reject; direct เกินได้ = ส่งเต็มไม่ตัด)
--
-- F2 (สูง): 0083 สร้าง rpc_apply_design_lock_for_step แต่ไม่มี caller ในโค้ด — wiring gap
--   ถูกย้ายขึ้นชั้นไม่ใช่ปิด. แก้: trigger บน work_item เมื่อ status เปลี่ยน
--   awaiting_approval → in_progress (ผล approve จาก decision RPC ทั้ง employee/customer)
--   → apply lock ของ current_step อัตโนมัติ (idempotent, step ที่ไม่ lockable = no-op).
--   (ฝั่ง reject→classify ต้องมี field diff จาก caller โดยธรรมชาติ — คง contract เดิม
--   ตาม 0083 header; บันทึกเป็นข้อผูกพัน UI/Edge ใน tasks)

-- ---------------------------------------------------------------------------
-- (F1a) identity_binding.app_role — HR ผูก approver ref (ADR-018 role ref) → LINE binding
-- ---------------------------------------------------------------------------
alter table public.identity_binding add column if not exists app_role text null;
create index if not exists ix_identity_binding_app_role
  on public.identity_binding (app_role) where is_active;

comment on column public.identity_binding.app_role is
  'approver ref (ADR-018 app-role ref เช่นค่าใน raciMap approvers[].ref/accountable) ที่ binding นี้รับ notification แทน — ใช้ resolve reminder/timeout/escalation ไปหา LINE user';

-- ---------------------------------------------------------------------------
-- (F1b + F3) claim v3 — resolution chain ครบ + resolve_error + กติกา 200
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_claim_pending_notifications(int, int);

create or replace function public.rpc_claim_pending_notifications(
  p_limit int default 20,
  p_lease_seconds int default 60
)
returns table (
  id uuid,
  channel public.wf_notification_channel,
  category text,
  template_key text,
  slots jsonb,
  retry_count int,
  site_code text,
  line_user_id text,
  rendered_text text,
  token_ref text,
  resolve_error text   -- null = ส่งได้; 'recipient_unresolvable' | 'template_unresolvable' | 'segment_too_long'
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_ref text;
begin
  select c.channel_access_token_ref into v_token_ref
  from public.line_oa_channels c
  where c.is_active
  order by (c.vertical_context = 'monolith') desc, c.channel_identifier
  limit 1;

  return query
  with claimed as (
    select n.id
    from public.notification n
    where n.status in ('queued', 'pending')
      and (n.next_attempt_at is null or n.next_attempt_at <= timezone('utc', now()))
    order by n.created_at
    for update skip locked
    limit greatest(1, p_limit)
  ), leased as (
    update public.notification n
       set next_attempt_at = timezone('utc', now()) + make_interval(secs => greatest(1, p_lease_seconds))
      from claimed
     where n.id = claimed.id
    returning n.*
  ), resolved as (
    select
      l.id, l.channel, l.category, l.template_key, l.slots, l.retry_count, l.site_code,
      -- resolution chain (F1): direct → employee uuid → approval_request (role/customer) → escalate_to
      coalesce(
        l.target ->> 'line_user_id',
        (select b.line_user_id from public.identity_binding b
          where b.is_active
            and b.employee_id::text = coalesce(l.target ->> 'owner', l.target ->> 'employee_id')
          limit 1),
        (select case ar.approver_kind
                  when 'employee' then
                    (select b.line_user_id from public.identity_binding b
                      where b.is_active and b.app_role = ar.resolved_approver limit 1)
                  when 'customer' then
                    (select ci.line_user_id from public.line_oa_customer_identity ci
                      where ci.customer_id::text = ar.resolved_approver
                      order by (ci.vertical_context = 'monolith') desc limit 1)
                end
           from public.approval_request ar
          where ar.id = (l.target ->> 'approval_request_id')::uuid
          limit 1),
        (select b.line_user_id from public.identity_binding b
          where b.is_active and b.app_role = l.target ->> 'escalate_to' limit 1)
      ) as v_line_user,
      public.fn_wf_render_notification_text(l.template_key, l.slots) as v_text
    from leased l
  )
  select
    r.id, r.channel, r.category, r.template_key, r.slots, r.retry_count, r.site_code,
    r.v_line_user,
    r.v_text,
    v_token_ref,
    case
      when r.v_line_user is null then 'recipient_unresolvable'
      when r.v_text is null then 'template_unresolvable'
      -- F3 — mirror composeMessage (Req 6.8/6.10/12.5/12.6): non-Direct เกิน 200 → reject;
      -- Direct เกิน 200 อนุญาต (ส่งเต็ม ไม่ตัด)
      when r.channel <> 'direct_push' and length(r.v_text) > 200 then 'segment_too_long'
      else null
    end as resolve_error
  from resolved r;
end;
$$;

comment on function public.rpc_claim_pending_notifications(int, int) is
  'Claim due workflow notifications + resolve ครบสำหรับส่งจริง (scrutiny v3): ผู้รับผ่าน chain '
  'line_user_id → employee uuid → approval_request (employee: binding.app_role = ref ตาม ADR-018; '
  'customer: line_oa_customer_identity) → escalate_to; render template ที่ approve แล้ว; บังคับกติกา '
  '≤200 ของ non-Direct (Req 12.5/12.6). resolve_error ให้ worker บันทึกเหตุผลตรงโดยไม่แตะ send path.';

revoke all on function public.rpc_claim_pending_notifications(int, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_claim_pending_notifications(int, int) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (F2) trigger: approve outcome → apply design lock ของ current_step อัตโนมัติ
--   จุดยิง: decision RPC (0031 ทั้ง employee/customer) set status awaiting_approval → in_progress
--   เมื่อ outcome = approved. trigger นี้ปิด loop โดยไม่แก้ RPC ที่ test แล้ว.
--   หมายเหตุ: requote complete (awaiting_customer_acceptance → in_progress) ไม่เข้าเงื่อนไข
--   (OLD.status ต้องเป็น awaiting_approval) — การ re-lock หลัง requote เป็น F8 (follow-up).
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_apply_lock_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'awaiting_approval' and new.status = 'in_progress' then
    -- idempotent + step ที่ไม่ lockable คืน null (no-op) — ห้ามล้ม transaction อนุมัติ
    begin
      perform public.rpc_apply_design_lock_for_step(new.id, new.current_step);
    exception when others then
      -- best-effort: lock พลาดต้องไม่ block การอนุมัติ; ทิ้งร่องรอยไว้ใน audit
      insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
      values ('design_lock', new.id, new.current_step, new.site_code, public.resolve_actor(),
        jsonb_build_object('op', 'auto_lock_failed', 'error', left(SQLERRM, 200)));
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_item_apply_design_lock on public.work_item;
create trigger trg_work_item_apply_design_lock
  after update of status on public.work_item
  for each row
  when (old.status is distinct from new.status)
  execute function public.fn_wf_apply_lock_on_approve();

-- ---------------------------------------------------------------------------
-- (F6) แก้เอกสาร semantics ของ delegation ให้ตรงความจริง (refs = ADR-018 approver refs)
-- ---------------------------------------------------------------------------
comment on function public.rpc_create_delegation(text, text, text, text[], timestamptz, timestamptz, text) is
  'สร้าง delegation ใน identity space เดียวกับ approval_request.resolved_approver = "approver ref" '
  'ตาม ADR-018 (app-role ref จาก raciMap approvers[].ref/accountable) — ไม่ใช่ email/uuid. '
  'acting_actor ต้องเป็น ref ที่ผู้อนุมัติแทนถือจริง (0031 ตรวจ has_any_app_role ตอนกดปุ่ม). '
  'caveat: RPC นี้ตรวจ role ของ caller (C12 JWT) — validate acting ได้เมื่อ acting เป็นผู้ accept เอง.';
