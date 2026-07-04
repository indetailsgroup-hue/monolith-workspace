-- Migration: order_keyed_process_model — monolith-workflow-copilot (ADR-017 + ADR-018)
-- Depends on: 0002, 0010, 0014/0015, 0023, 0027–0030, C12
--
-- ADR-017: Process_Step identity = canonical_order (sub-step first-class); process_step = label ซ้ำได้;
--          work_item.current_order ขยับทีละ sub-step; approval เฉพาะ requiresApproval; gate = (work_item, gate_order).
-- ADR-018: approver source — unanimous → approvers[].ref ; first_response/single → accountable.
--
-- create/handoff/resolve RPC เปลี่ยน signature ได้ (ไม่ถูกเรียกจาก Edge); decision RPC คง signature.

-- ---------------------------------------------------------------------------
-- schema re-key
-- ---------------------------------------------------------------------------
alter table public.process_model drop constraint if exists process_model_pkey;
alter table public.process_model add constraint process_model_pkey primary key (canonical_order);
-- process_step กลายเป็น label (ซ้ำได้) — index ช่วย lookup by name (RACI accountable เดียวกันทั้ง group)
create index if not exists ix_process_model_step on public.process_model (process_step);

alter table public.work_item add column if not exists current_order int not null default 0;
alter table public.approval_request add column if not exists gate_order int;

-- re-key partial unique index: pending leg unique ต่อ (work_item, gate_order, approver, attempt)
drop index if exists public.ux_approval_request_pending;
create unique index if not exists ux_approval_request_pending
  on public.approval_request (work_item_id, gate_order, resolved_approver, attempt)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- helper: approver set ของ step ตาม quorum (ADR-018)
--   unanimous → approvers[].ref (array); อื่น ๆ → [accountable]
-- ---------------------------------------------------------------------------
create or replace function public.wf_approvers_for_step(p_payload jsonb, p_step text, p_quorum text)
returns jsonb
language sql
immutable
as $$
  select case
    when p_quorum = 'unanimous' then
      coalesce(
        nullif(
          (select jsonb_agg(a ->> 'ref')
           from jsonb_array_elements(p_payload #> '{raciMap,entries}') e,
                jsonb_array_elements(e -> 'approvers') a
           where e ->> 'processStep' = p_step and nullif(a ->> 'ref', '') is not null),
          '[]'::jsonb
        ),
        public.wf_accountable_for_step(p_payload, p_step)   -- fallback ถ้าไม่มี approvers array
      )
    else
      public.wf_accountable_for_step(p_payload, p_step)
  end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_import_knowledge (order-keyed) — เก็บทุก entry by canonical_order (ไม่ collapse ตามชื่อ)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_import_knowledge(
  p_payload jsonb,
  p_source_version text,
  p_review_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valid boolean;
  v_id uuid;
  e jsonb;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  v_valid := public.wf_validate_knowledge_export(p_payload);

  insert into public.knowledge_import (source_version, payload, review_status, is_valid, is_current)
  values (p_source_version, p_payload, coalesce(p_review_status, 'draft'), v_valid, false)
  returning id into v_id;

  if v_valid then
    update public.knowledge_import set is_current = false where is_current;
    update public.knowledge_import set is_current = true where id = v_id;

    delete from public.process_model;
    for e in select value from jsonb_array_elements(p_payload -> 'processModel') loop
      insert into public.process_model (canonical_order, process_step, sub_process_group, approval_quorum, requires_approval)
      values (
        (e ->> 'canonicalOrder')::int,
        e ->> 'processStep',
        coalesce(e ->> 'subProcessGroup', 'Office'),
        nullif(e ->> 'approvalQuorum', '')::public.wf_approval_quorum,
        coalesce((e ->> 'requiresApproval')::boolean, false)
      )
      on conflict (canonical_order) do update
        set process_step = excluded.process_step,
            sub_process_group = excluded.sub_process_group,
            approval_quorum = excluded.approval_quorum,
            requires_approval = excluded.requires_approval;
    end loop;
  end if;

  insert into public.workflow_audit_log (event_type, performed_by, detail)
  values ('knowledge_import', public.resolve_actor(),
    jsonb_build_object('import_id', v_id, 'source_version', p_source_version, 'is_valid', v_valid,
      'steps', (select count(*) from jsonb_array_elements(p_payload -> 'processModel'))));

  return v_id;
end;
$$;

revoke all on function public.rpc_import_knowledge(jsonb, text, text) from public;

-- ---------------------------------------------------------------------------
-- rpc_create_work_item (order-keyed) — เริ่มที่ canonical_order ต่ำสุด (0)
-- signature เปลี่ยน: ตัด p_first_step (เริ่มที่ order 0 เสมอ)
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_create_work_item(text, text, jsonb);

create or replace function public.rpc_create_work_item(
  p_site_code text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_min_order int;
  v_step text;
begin
  if p_site_code is null
     or not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
    raise exception 'unknown or inactive site_code: %', p_site_code using errcode = 'foreign_key_violation';
  end if;

  select min(canonical_order) into v_min_order from public.process_model;
  if v_min_order is null then
    raise exception 'process_model empty: import Knowledge_Export first' using errcode = 'no_data_found';
  end if;
  select process_step into v_step from public.process_model where canonical_order = v_min_order;

  insert into public.work_item (site_code, current_step, current_order, status, version, data)
  values (p_site_code, v_step, v_min_order, 'in_progress', 0, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('work_item_create', v_id, v_step, p_site_code, public.resolve_actor(),
    jsonb_build_object('first_order', v_min_order, 'first_step', v_step));

  return v_id;
end;
$$;

revoke all on function public.rpc_create_work_item(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- rpc_handoff_work_item (order-keyed) — adjacency = current_order + 1
-- signature เปลี่ยน: p_target_step text → p_target_order int
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_handoff_work_item(uuid, int, text, uuid);

create or replace function public.rpc_handoff_work_item(
  p_work_item_id uuid,
  p_expected_version int,
  p_target_order int,
  p_new_owner uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur_order int;
  v_cur_version int;
  v_target_step text;
  v_new_version int;
begin
  select current_order, version into v_cur_order, v_cur_version
  from public.work_item where id = p_work_item_id
  for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  if v_cur_version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_cur_version
      using errcode = 'serialization_failure';
  end if;

  -- target ต้องมีใน process_model (Req 2.7) และเป็นขั้นถัดไปติดกัน (Req 2.5)
  select process_step into v_target_step from public.process_model where canonical_order = p_target_order;
  if v_target_step is null then
    raise exception 'unknown step at order %', p_target_order using errcode = 'foreign_key_violation';
  end if;
  if p_target_order <> v_cur_order + 1 then
    raise exception 'invalid sequence: order % -> %', v_cur_order, p_target_order using errcode = 'check_violation';
  end if;

  v_new_version := v_cur_version + 1;
  update public.work_item
    set current_order = p_target_order,
        current_step = v_target_step,
        current_owner = p_new_owner,
        version = v_new_version
    where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('handoff', p_work_item_id, v_target_step, public.resolve_actor(),
    jsonb_build_object('from_order', v_cur_order, 'to_order', p_target_order, 'to_step', v_target_step, 'new_version', v_new_version));

  return v_new_version;
end;
$$;

revoke all on function public.rpc_handoff_work_item(uuid, int, int, uuid) from public;

-- ---------------------------------------------------------------------------
-- rpc_resolve_approver (order-keyed + ADR-018 approver source)
-- signature: (work_item_id, p_canonical_order int, p_sla_minutes) — gate = canonical_order
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_resolve_approver(uuid, text, int);

create or replace function public.rpc_resolve_approver(
  p_work_item_id uuid,
  p_canonical_order int,
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
  v_step text;
  v_pm_quorum public.wf_approval_quorum;
  v_requires boolean;
  v_quorum public.wf_approval_quorum;
  v_payload jsonb;
  v_approvers jsonb;
  v_ref text;
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

  select process_step, approval_quorum, requires_approval into v_step, v_pm_quorum, v_requires
  from public.process_model where canonical_order = p_canonical_order;
  if v_step is null then
    raise exception 'unknown step at order %', p_canonical_order using errcode = 'foreign_key_violation';
  end if;

  v_with_customer := public.wf_is_customer_approval_step(v_step) and v_customer is not null;
  v_quorum := case when v_with_customer then 'unanimous'::public.wf_approval_quorum else coalesce(v_pm_quorum, 'first_response') end;

  -- ADR-018: approver set ตาม quorum (unanimous → approvers[].ref; อื่น ๆ → accountable)
  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_approvers := public.wf_approvers_for_step(coalesce(v_payload, '{}'::jsonb), v_step, v_quorum::text);

  if (v_approvers is null or jsonb_array_length(v_approvers) = 0) and not v_with_customer then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, v_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true, 'gate_order', p_canonical_order));
    return 0;
  end if;

  -- attempt scope ต่อ (work_item, gate_order)
  select attempt,
         bool_or(status in ('approved', 'rejected')),
         bool_or(status = 'pending')
    into v_latest_attempt, v_latest_terminal, v_latest_pending
  from public.approval_request
  where work_item_id = p_work_item_id and gate_order = p_canonical_order
  group by attempt
  order by attempt desc
  limit 1;

  if v_latest_attempt is null then v_attempt := 1;
  elsif v_latest_pending and not v_latest_terminal then v_attempt := v_latest_attempt;
  else v_attempt := v_latest_attempt + 1;
  end if;

  if v_approvers is not null and jsonb_array_length(v_approvers) > 0 then
    for v_ref in select jsonb_array_elements_text(v_approvers) loop
      insert into public.approval_request
        (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt, gate_order)
      values (p_work_item_id, v_step, v_site, v_ref, 'employee', v_quorum, v_deadline, v_deadline, 'pending', v_attempt, p_canonical_order)
      on conflict (work_item_id, gate_order, resolved_approver, attempt) where status = 'pending' do nothing;
    end loop;
  end if;

  if v_with_customer then
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt, gate_order)
    values (p_work_item_id, v_step, v_site, v_customer::text, 'customer', v_quorum, v_deadline, v_deadline, 'pending', v_attempt, p_canonical_order)
    on conflict (work_item_id, gate_order, resolved_approver, attempt) where status = 'pending' do nothing;
  end if;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  select count(*) into v_count
  from public.approval_request
  where work_item_id = p_work_item_id and gate_order = p_canonical_order and status = 'pending' and attempt = v_attempt;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, v_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum, 'with_customer', v_with_customer, 'attempt', v_attempt, 'gate_order', p_canonical_order));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, int, int) from public;

-- ---------------------------------------------------------------------------
-- decision RPCs — quorum scope ตาม (work_item, gate_order, attempt) แทน process_step
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
      jsonb_build_object('result', 'rejected_unauthorized', 'kept_blocked', true, 'required_role', v_req.resolved_approver, 'gate_order', v_req.gate_order));
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

  -- scope ตาม gate_order + attempt (ADR-017: ชื่อขั้นซ้ำได้ → ใช้ gate_order)
  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and gate_order = v_req.gate_order
     and status <> 'escalated' and attempt = v_req.attempt;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.gate_order = v_req.gate_order
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
    jsonb_build_object('decision', p_decision, 'channel', p_channel, 'outcome', v_outcome, 'quorum', v_req.quorum, 'attempt', v_req.attempt, 'gate_order', v_req.gate_order));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_approval_decision(uuid, text, public.wf_decision, public.wf_decision_channel, int) from public;
grant execute on function public.rpc_record_approval_decision(uuid, text, public.wf_decision, public.wf_decision_channel, int) to authenticated;

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
      jsonb_build_object('result', 'rejected_impersonation', 'kept_blocked', true, 'approver_kind', 'customer', 'gate_order', v_req.gate_order));
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

  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and gate_order = v_req.gate_order
     and status <> 'escalated' and attempt = v_req.attempt;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.gate_order = v_req.gate_order
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
    jsonb_build_object('decision', p_decision, 'outcome', v_outcome, 'quorum', v_req.quorum, 'approver_kind', 'customer', 'attempt', v_req.attempt, 'gate_order', v_req.gate_order));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_customer_approval_decision(uuid, text, public.wf_decision, text, int, text) from public;
