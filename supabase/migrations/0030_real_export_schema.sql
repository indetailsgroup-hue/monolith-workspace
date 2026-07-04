-- Migration: real_export_schema — monolith-workflow-copilot (integration 18.1 reconciliation)
-- Depends on: 0002, 0010, 0027, 0028, 0029, C12
--
-- ปรับ ingestion + resolver ให้ตรง schema ของ daph-second-brain export จริง (consume ไม่ redefine):
--   processModel[]: processStep / subProcessGroup / requiresApproval / approvalQuorum / canonicalOrder
--   raciMap: { status, entries: [{ processStep, accountable (string), ... }] }
--   approvalQuorumByStep: { <step>: quorum|null }
-- เดิมโค้ดคาดหวัง step/order/raciMap.<step>.accountable/approvalQuorum → reject export จริง.

-- ---------------------------------------------------------------------------
-- wf_validate_knowledge_export (real schema) — mirror src/workflow/knowledge/import.ts
-- ---------------------------------------------------------------------------
create or replace function public.wf_validate_knowledge_export(p_payload jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_orders int[];
  v_n int;
  v_q text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then return false; end if;
  if jsonb_typeof(p_payload -> 'pfmeaRiskRows') <> 'array' then return false; end if;
  if jsonb_typeof(p_payload -> 'processModel') <> 'array' then return false; end if;
  if jsonb_typeof(p_payload -> 'raciMap') <> 'object'
     or jsonb_typeof(p_payload #> '{raciMap,entries}') <> 'array' then return false; end if;
  if jsonb_typeof(p_payload -> 'approvalQuorumByStep') <> 'object' then return false; end if;
  if jsonb_typeof(p_payload -> 'knowledgeFreshness') <> 'object' then return false; end if;

  if (p_payload #>> '{knowledgeFreshness,sourceVersion}') is null
     or (p_payload #>> '{knowledgeFreshness,importedAt}') is null
     or (p_payload #>> '{knowledgeFreshness,reviewStatus}') is null then
    return false;
  end if;

  -- canonicalOrder ต่อเนื่อง 0..n-1
  select array_agg((e ->> 'canonicalOrder')::int order by (e ->> 'canonicalOrder')::int)
    into v_orders
  from jsonb_array_elements(p_payload -> 'processModel') e;
  if v_orders is null then return false; end if;
  v_n := array_length(v_orders, 1);
  for i in 1..v_n loop
    if v_orders[i] <> i - 1 then return false; end if;
  end loop;

  -- approvalQuorumByStep: ค่า ∈ {unanimous,majority,first_response} หรือ null
  for v_q in select value::text from jsonb_each_text(p_payload -> 'approvalQuorumByStep') loop
    if v_q is not null and v_q not in ('unanimous', 'majority', 'first_response') then return false; end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_import_knowledge (real schema) — populate process_model จาก processStep/canonicalOrder/...
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
      insert into public.process_model (process_step, sub_process_group, canonical_order, approval_quorum, requires_approval)
      values (
        e ->> 'processStep',
        coalesce(e ->> 'subProcessGroup', 'Office'),
        (e ->> 'canonicalOrder')::int,
        nullif(e ->> 'approvalQuorum', '')::public.wf_approval_quorum,
        coalesce((e ->> 'requiresApproval')::boolean, false)
      )
      on conflict (process_step) do update
        set sub_process_group = excluded.sub_process_group,
            canonical_order = excluded.canonical_order,
            approval_quorum = excluded.approval_quorum,
            requires_approval = excluded.requires_approval;
    end loop;
  end if;

  insert into public.workflow_audit_log (event_type, performed_by, detail)
  values ('knowledge_import', public.resolve_actor(),
    jsonb_build_object('import_id', v_id, 'source_version', p_source_version, 'is_valid', v_valid));

  return v_id;
end;
$$;

revoke all on function public.rpc_import_knowledge(jsonb, text, text) from public;

-- ---------------------------------------------------------------------------
-- helper: accountable role(s) ของ step จาก raciMap.entries (accountable เดี่ยว → jsonb array)
-- ---------------------------------------------------------------------------
create or replace function public.wf_accountable_for_step(p_payload jsonb, p_step text)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_agg(e ->> 'accountable')
     from jsonb_array_elements(p_payload #> '{raciMap,entries}') e
     where e ->> 'processStep' = p_step and nullif(e ->> 'accountable', '') is not null),
    '[]'::jsonb
  );
$$;

-- ---------------------------------------------------------------------------
-- rpc_resolve_approver — อ่าน accountable จาก raciMap.entries (real schema)
-- (คง logic attempt/idempotent ของ 0029 ทุกอย่าง เปลี่ยนเฉพาะการอ่าน v_accountable)
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

  -- real schema: accountable จาก raciMap.entries
  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_accountable := public.wf_accountable_for_step(coalesce(v_payload, '{}'::jsonb), p_process_step);

  if (v_accountable is null or jsonb_array_length(v_accountable) = 0) and not v_with_customer then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

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
    v_attempt := v_latest_attempt;
  else
    v_attempt := v_latest_attempt + 1;
  end if;

  if v_accountable is not null and jsonb_array_length(v_accountable) > 0 then
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
