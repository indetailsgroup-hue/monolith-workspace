-- Migration: customer_approver — monolith-workflow-copilot Phase 1 (Req 20)
-- Spec task: 21.1–21.3 (customer as approver via Edge gatekeeper; ลูกค้าไม่เป็น DB principal)
-- Depends on: 0002 (work_item/approval_request customer cols), 0014/0015 (resolver/decision),
--             00000000000020 (line_oa_resolve_customer_identity), C12
--
-- §3 reconcile: Req 8.4 (Designer lead ไม่ escalate) ไม่ override การเพิ่ม customer (Req 20.2).
-- คง RLS TO authenticated = พนักงานล้วน (ไม่มี customer RLS/session/JWT helper).

-- ---------------------------------------------------------------------------
-- ขั้นที่มีลูกค้าร่วมอนุมัติ (Req 20.2) — helper immutable
-- ---------------------------------------------------------------------------
create or replace function public.wf_is_customer_approval_step(p_step text)
returns boolean language sql immutable as $$
  select p_step in ('Designer', '3D_Presentation', '3D_Rendering_Final');
$$;

-- ---------------------------------------------------------------------------
-- rpc_resolve_approver (REPLACE) — เพิ่ม customer เข้า set สำหรับ design steps
-- set = { internal Designer lead (RACI), Customer_Approver (primary_customer_id) } quorum=unanimous
-- primary_customer_id NULL → internal เดี่ยว (degrade single) (Req 20.9)
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
  v_count int := 0;
  v_with_customer boolean;
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
  -- ขั้นที่มีลูกค้าร่วม → บังคับ unanimous (Req 20.2); มิฉะนั้นใช้ค่า process_model
  v_quorum := case when v_with_customer then 'unanimous'::public.wf_approval_quorum else coalesce(v_quorum, 'unanimous') end;

  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_accountable := v_payload #> array['raciMap', p_process_step, 'accountable'];

  -- internal accountable ว่าง และไม่มี customer → fail-safe block + escalate
  if (v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0)
     and not v_with_customer then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

  -- internal Approval_Request ต่อ Accountable (Req 8.4 Designer lead ยังอยู่ในชุด)
  if v_accountable is not null and jsonb_typeof(v_accountable) = 'array' then
    for v_role in select jsonb_array_elements_text(v_accountable) loop
      insert into public.approval_request
        (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
      values (p_work_item_id, p_process_step, v_site, v_role, 'employee', v_quorum, v_deadline, v_deadline, 'pending');
      v_count := v_count + 1;
    end loop;
  end if;

  -- customer Approval_Request (Req 20.2) — resolved_approver = primary_customer_id::text
  if v_with_customer then
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
    values (p_work_item_id, p_process_step, v_site, v_customer::text, 'customer', v_quorum, v_deadline, v_deadline, 'pending');
    v_count := v_count + 1;
  end if;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum, 'with_customer', v_with_customer));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, text, int) from public;

-- ---------------------------------------------------------------------------
-- rpc_record_customer_approval_decision (Req 20.3, 20.4, 20.6, 20.10)
-- ลูกค้าผ่าน Edge gatekeeper → resolve ผ่าน line_oa_resolve_customer_identity;
-- authorize iff resolved customer_id = primary_customer_id AND = resolved_approver (anti-impersonation).
-- audit ด้วย customer_id ไม่บันทึก PII. quorum logic เดียวกับ employee.
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

  -- resolve customer (ไม่เชื่อ client id) — Req 20.3
  select ci.customer_id into v_customer_id
  from public.line_oa_resolve_customer_identity(p_line_user_id, p_vertical_context) ci;

  select * into v_wi from public.work_item where id = v_req.work_item_id for update;

  -- authorize: resolved customer = primary_customer_id AND = resolved_approver (Req 20.4 anti-impersonation)
  if v_customer_id is null
     or v_wi.primary_customer_id is distinct from v_customer_id
     or v_req.resolved_approver is distinct from v_customer_id::text then
    update public.work_item set status = 'blocked' where id = v_req.work_item_id and status <> 'completed';
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
    values ('approval_decision', v_req.work_item_id, v_req.process_step, 'customer',
      jsonb_build_object('result', 'rejected_impersonation', 'kept_blocked', true));
    raise exception 'customer not authorized for this approval' using errcode = 'insufficient_privilege';
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

  select count(*) into v_total from public.approval_request where work_item_id = v_req.work_item_id and process_step = v_req.process_step;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step;

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
    -- Req 20.10 — customer reject: free-text เท่านั้น; Revision_Reason classify โดย internal (task 22.4)
    update public.work_item set status = 'rework', version = version + 1 where id = v_req.work_item_id;
  end if;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_decision', v_req.work_item_id, v_req.process_step, v_req.site_code, 'customer:' || v_customer_id::text,
    jsonb_build_object('decision', p_decision, 'outcome', v_outcome, 'quorum', v_req.quorum, 'approver_kind', 'customer'));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_customer_approval_decision(uuid, text, public.wf_decision, text, int, text) from public;
