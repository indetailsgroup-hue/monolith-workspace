-- Migration: attempt_scoped_quorum — monolith-workflow-copilot (re-scrutinize round-2 fixes A, B)
-- Depends on: 0002, 0014/0015, 0023, 0027, C12
--
-- A (MAJOR): quorum นับ decision ข้ามรอบ → หลัง reject ครั้งเดียว work_item อนุมัติไม่ได้อีก.
--   แก้: เพิ่ม approval_request.attempt; resolve ตั้ง attempt = max+1 ต่อ cycle ใหม่;
--        quorum filter เฉพาะ attempt ปัจจุบัน (+ คง #5 ตัด escalated).
-- B (MAJOR): web-fallback เรียก RPC ด้วย service-role → end-user roles ไม่ถึง has_any_app_role.
--   แก้ฝั่ง DB: grant execute rpc_record_approval_decision ให้ authenticated (RPC authz เองด้วย
--   has_any_app_role); ฝั่ง Edge: web-fallback ใช้ user-scoped client (อยู่ใน index.ts).

-- ---------------------------------------------------------------------------
-- A: attempt column (existing rows → attempt 1)
-- ---------------------------------------------------------------------------
alter table public.approval_request
  add column if not exists attempt int not null default 1;

-- ---------------------------------------------------------------------------
-- A: rpc_resolve_approver — ตั้ง attempt ต่อ cycle (idempotent ภายใน cycle เดิม)
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
  v_customer uuid;
  v_quorum public.wf_approval_quorum;
  v_requires boolean;
  v_payload jsonb;
  v_accountable jsonb;
  v_role text;
  v_with_customer boolean;
  v_count int := 0;
  v_attempt int;
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

  -- A: attempt ของ cycle นี้ — ถ้ามี pending อยู่แล้วใช้ค่าเดิม (idempotent re-resolve รอบเดียวกัน);
  --    มิฉะนั้นเริ่ม cycle ใหม่ = max(attempt)+1 (กัน decision รอบก่อนปนใน quorum)
  select attempt into v_attempt
  from public.approval_request
  where work_item_id = p_work_item_id and process_step = p_process_step and status = 'pending'
  limit 1;
  if v_attempt is null then
    select coalesce(max(attempt), 0) + 1 into v_attempt
    from public.approval_request
    where work_item_id = p_work_item_id and process_step = p_process_step;
  end if;

  if v_accountable is not null and jsonb_typeof(v_accountable) = 'array' then
    for v_role in select jsonb_array_elements_text(v_accountable) loop
      insert into public.approval_request
        (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt)
      values (p_work_item_id, p_process_step, v_site, v_role, 'employee', v_quorum, v_deadline, v_deadline, 'pending', v_attempt)
      on conflict (work_item_id, process_step, resolved_approver) where status = 'pending' do nothing;
    end loop;
  end if;

  if v_with_customer then
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt)
    values (p_work_item_id, p_process_step, v_site, v_customer::text, 'customer', v_quorum, v_deadline, v_deadline, 'pending', v_attempt)
    on conflict (work_item_id, process_step, resolved_approver) where status = 'pending' do nothing;
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

-- ---------------------------------------------------------------------------
-- A + B: rpc_record_approval_decision — quorum scope ตาม attempt + grant authenticated
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_approval_decision(
  p_approval_request_id uuid,
  p_webhook_event_id text,
  p_decision public.wf_decision,
  p_channel public.wf_decision_channel,
  p_expected_version int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_req public.approval_request%rowtype;
  v_wi public.work_item%rowtype;
  v_inserted_id uuid;
  v_total int; v_decided int; v_approvals int; v_rejections int; v_needed int;
  v_outcome text;
begin
  select * into v_req from public.approval_request where id = p_approval_request_id;
  if not found then raise exception 'approval request not found' using errcode = 'no_data_found'; end if;
  if v_req.approver_kind <> 'employee' then
    raise exception 'not an employee approval request' using errcode = 'check_violation';
  end if;

  v_actor := public.resolve_actor();

  if not public.has_any_app_role(array[v_req.resolved_approver]) then
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('approval_decision', v_req.work_item_id, v_req.process_step, v_req.site_code, v_actor,
      jsonb_build_object('result', 'rejected_unauthorized', 'kept_blocked', true, 'required_role', v_req.resolved_approver));
    return 'unauthorized';
  end if;

  select * into v_wi from public.work_item where id = v_req.work_item_id for update;
  if v_wi.version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_wi.version using errcode = 'serialization_failure';
  end if;

  insert into public.approval_decision (approval_request_id, site_code, webhook_event_id, decider, decision, channel)
  values (p_approval_request_id, v_req.site_code, p_webhook_event_id, v_actor, p_decision, p_channel)
  on conflict (webhook_event_id) do nothing
  returning id into v_inserted_id;
  if v_inserted_id is null then return 'replayed'; end if;

  update public.approval_request set status = p_decision::text::public.wf_approval_request_status where id = p_approval_request_id;

  -- A: scope ตาม attempt ปัจจุบัน (+ #5 ตัด escalated)
  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and process_step = v_req.process_step
     and status <> 'escalated' and attempt = v_req.attempt;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step
     and ar.status <> 'escalated' and ar.attempt = v_req.attempt;

  v_outcome := 'pending';
  if v_req.quorum = 'unanimous' then
    if v_rejections > 0 then v_outcome := 'rejected';
    elsif v_approvals >= v_total then v_outcome := 'approved'; end if;
  elsif v_req.quorum = 'majority' then
    v_needed := (v_total / 2) + 1;
    if v_approvals >= v_needed then v_outcome := 'approved';
    elsif v_approvals + (v_total - v_decided) < v_needed then v_outcome := 'rejected'; end if;
  else
    v_outcome := p_decision::text;
  end if;

  if v_outcome = 'approved' then
    update public.work_item set status = 'in_progress', version = version + 1 where id = v_req.work_item_id;
  elsif v_outcome = 'rejected' then
    update public.work_item set status = 'rework', version = version + 1 where id = v_req.work_item_id;
  end if;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_decision', v_req.work_item_id, v_req.process_step, v_req.site_code, v_actor,
    jsonb_build_object('decision', p_decision, 'channel', p_channel, 'outcome', v_outcome, 'quorum', v_req.quorum, 'attempt', v_req.attempt));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_approval_decision(uuid, text, public.wf_decision, public.wf_decision_channel, int) from public;
-- B: authenticated เรียกได้ (RPC authz เองด้วย has_any_app_role) → web-fallback ใช้ user-scoped client
grant execute on function public.rpc_record_approval_decision(uuid, text, public.wf_decision, public.wf_decision_channel, int) to authenticated;

-- ---------------------------------------------------------------------------
-- A: rpc_record_customer_approval_decision — quorum scope ตาม attempt
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_customer_approval_decision(
  p_approval_request_id uuid,
  p_webhook_event_id text,
  p_decision public.wf_decision,
  p_line_user_id text,
  p_expected_version int,
  p_vertical_context text default 'line_oa'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.approval_request%rowtype;
  v_wi public.work_item%rowtype;
  v_customer_id uuid;
  v_inserted_id uuid;
  v_total int; v_decided int; v_approvals int; v_rejections int; v_needed int;
  v_outcome text;
begin
  select * into v_req from public.approval_request where id = p_approval_request_id;
  if not found then raise exception 'approval request not found' using errcode = 'no_data_found'; end if;
  if v_req.approver_kind <> 'customer' then
    raise exception 'not a customer approval request' using errcode = 'check_violation';
  end if;

  select ci.customer_id into v_customer_id
  from public.line_oa_resolve_customer_identity(p_line_user_id, p_vertical_context) ci;

  select * into v_wi from public.work_item where id = v_req.work_item_id for update;

  if v_customer_id is null
     or v_wi.primary_customer_id is distinct from v_customer_id
     or v_req.resolved_approver is distinct from v_customer_id::text then
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('approval_decision', v_req.work_item_id, v_req.process_step, v_req.site_code,
      case when v_customer_id is null then 'customer:unresolved' else 'customer:' || v_customer_id::text end,
      jsonb_build_object('result', 'rejected_impersonation', 'kept_blocked', true, 'approver_kind', 'customer'));
    return 'unauthorized';
  end if;

  if v_wi.version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_wi.version using errcode = 'serialization_failure';
  end if;

  insert into public.approval_decision (approval_request_id, site_code, webhook_event_id, decider, decision, channel)
  values (p_approval_request_id, v_req.site_code, p_webhook_event_id, 'customer:' || v_customer_id::text, p_decision, 'line')
  on conflict (webhook_event_id) do nothing
  returning id into v_inserted_id;
  if v_inserted_id is null then return 'replayed'; end if;

  update public.approval_request set status = p_decision::text::public.wf_approval_request_status where id = p_approval_request_id;

  -- A: scope ตาม attempt ปัจจุบัน (+ #5 ตัด escalated)
  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and process_step = v_req.process_step
     and status <> 'escalated' and attempt = v_req.attempt;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step
     and ar.status <> 'escalated' and ar.attempt = v_req.attempt;

  v_outcome := 'pending';
  if v_req.quorum = 'unanimous' then
    if v_rejections > 0 then v_outcome := 'rejected';
    elsif v_approvals >= v_total then v_outcome := 'approved'; end if;
  elsif v_req.quorum = 'majority' then
    v_needed := (v_total / 2) + 1;
    if v_approvals >= v_needed then v_outcome := 'approved';
    elsif v_approvals + (v_total - v_decided) < v_needed then v_outcome := 'rejected'; end if;
  else
    v_outcome := p_decision::text;
  end if;

  if v_outcome = 'approved' then
    update public.work_item set status = 'in_progress', version = version + 1 where id = v_req.work_item_id;
  elsif v_outcome = 'rejected' then
    update public.work_item set status = 'rework', version = version + 1 where id = v_req.work_item_id;
  end if;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_decision', v_req.work_item_id, v_req.process_step, v_req.site_code, 'customer:' || v_customer_id::text,
    jsonb_build_object('decision', p_decision, 'outcome', v_outcome, 'quorum', v_req.quorum, 'approver_kind', 'customer', 'attempt', v_req.attempt));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_customer_approval_decision(uuid, text, public.wf_decision, text, int, text) from public;
