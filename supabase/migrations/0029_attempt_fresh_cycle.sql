-- Migration: attempt_fresh_cycle — monolith-workflow-copilot (re-scrutinize round-3 fix A')
-- Depends on: 0002, 0027, 0028, C12
--
-- A' (round-3): fix A ใน 0028 ยัง reuse attempt เดิมถ้ามี leg ค้าง pending (เช่น unanimous
--   หลายคน คนหนึ่ง reject → leg อื่นค้าง pending) → decision รอบก่อนยังปน quorum.
-- แก้ (minimal): (1) unique index รวม attempt → leg attempt ใหม่ไม่ชน leg ค้าง;
--   (2) resolve เริ่ม attempt ใหม่เมื่อ cycle ล่าสุด "มี decision แล้ว" (ไม่ reuse เพราะ pending ค้าง).
-- หมายเหตุ: leg ค้าง pending ของ attempt เก่าเป็น dead row (quorum scope ตาม attempt อยู่แล้ว
--   ไม่ถูกนับ) — known-minor: sweep อาจ escalate มันครั้งเดียว (ไม่กระทบ correctness).

-- (1) unique index รวม attempt
drop index if exists public.ux_approval_request_pending;
create unique index if not exists ux_approval_request_pending
  on public.approval_request (work_item_id, process_step, resolved_approver, attempt)
  where status = 'pending';

-- (2) resolve_approver — attempt ใหม่เมื่อ cycle ล่าสุดมี decision
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
  v_customer uuid;
  v_quorum public.wf_approval_quorum;
  v_requires boolean;
  v_payload jsonb;
  v_accountable jsonb;
  v_role text;
  v_with_customer boolean;
  v_count int := 0;
  v_attempt int;
  v_latest_attempt int;
  v_latest_terminal boolean;
  v_latest_pending boolean;
  v_deadline timestamptz := timezone('utc', now()) + make_interval(mins => greatest(1, p_sla_minutes));
begin
  select site_code, primary_customer_id into v_site, v_customer from public.work_item where id = p_work_item_id;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  select approval_quorum, requires_approval into v_quorum, v_requires
  from public.process_model where process_step = p_process_step;
  if not found then
    raise exception 'unknown step: %', p_process_step using errcode = 'foreign_key_violation';
  end if;

  v_with_customer := public.wf_is_customer_approval_step(p_process_step) and v_customer is not null;
  v_quorum := case when v_with_customer then 'unanimous'::public.wf_approval_quorum else coalesce(v_quorum, 'unanimous') end;

  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_accountable := v_payload #> array['raciMap', p_process_step, 'accountable'];

  if (v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0)
     and not v_with_customer then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

  -- attempt: cycle ล่าสุด — reuse เฉพาะเมื่อยังไม่มี decision (idempotent same cycle);
  -- ถ้ามี decision แล้ว (approved/rejected) → เริ่ม attempt ใหม่ (กัน decision เก่าปน + leg ค้างไม่ชน)
  select attempt,
         bool_or(status in ('approved', 'rejected')),
         bool_or(status = 'pending')
    into v_latest_attempt, v_latest_terminal, v_latest_pending
  from public.approval_request
  where work_item_id = p_work_item_id and process_step = p_process_step
  group by attempt
  order by attempt desc
  limit 1;

  if v_latest_attempt is null then
    v_attempt := 1;
  elsif v_latest_pending and not v_latest_terminal then
    v_attempt := v_latest_attempt;             -- รอบเดิมยังไม่ตัดสิน → idempotent
  else
    v_attempt := v_latest_attempt + 1;         -- รอบใหม่
  end if;

  if v_accountable is not null and jsonb_typeof(v_accountable) = 'array' then
    for v_role in select jsonb_array_elements_text(v_accountable) loop
      insert into public.approval_request
        (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt)
      values (p_work_item_id, p_process_step, v_site, v_role, 'employee', v_quorum, v_deadline, v_deadline, 'pending', v_attempt)
      on conflict (work_item_id, process_step, resolved_approver, attempt) where status = 'pending' do nothing;
    end loop;
  end if;

  if v_with_customer then
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt)
    values (p_work_item_id, p_process_step, v_site, v_customer::text, 'customer', v_quorum, v_deadline, v_deadline, 'pending', v_attempt)
    on conflict (work_item_id, process_step, resolved_approver, attempt) where status = 'pending' do nothing;
  end if;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  select count(*) into v_count
  from public.approval_request
  where work_item_id = p_work_item_id and process_step = p_process_step and status = 'pending' and attempt = v_attempt;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum, 'with_customer', v_with_customer, 'attempt', v_attempt));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, text, int) from public;
