-- Migration: approval_path_hardening — monolith-workflow-copilot (scrutinize fixes #1–#5)
-- Spec: Req 3.1, 4.3, 4.4, 4.9, 9.x, 15, 20.3, 20.4, 20.6
-- Depends on: 0002, 0003, 0010, 0014/0015, 0023, 0026, 00000000000010 (line_oa_verify_signature), C12
--
-- Fixes from end-to-end scrutinize of the customer approval path:
--   #1 BLOCKER  signature-verified customer decision (ไม่รับ line_user_id จาก client)
--   #2 MAJOR    authz fail → return 'unauthorized' + audit COMMIT (เดิม raise → audit rollback)
--   #3 MAJOR    employee authz = has_any_app_role([resolved_approver]) (role-based, Req 3.1) ไม่ใช่ id string eq
--   #4 MEDIUM   resolve idempotent (partial unique index + ON CONFLICT DO NOTHING) กัน duplicate → quorum miscount
--   #5 MEDIUM   quorum v_total ตัด status='escalated' → leg ที่ timeout ไม่บล็อก leg อื่น

-- ---------------------------------------------------------------------------
-- #4: idempotent resolve — partial unique index ต่อ pending leg
-- ---------------------------------------------------------------------------
create unique index if not exists ux_approval_request_pending
  on public.approval_request (work_item_id, process_step, resolved_approver)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- #4: rpc_resolve_approver — ON CONFLICT DO NOTHING + recount pending จริง
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

  -- fail-safe block + escalate เมื่อไม่มีทั้ง internal accountable และ customer
  if (v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0)
     and not v_with_customer then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

  -- internal legs (ON CONFLICT กัน duplicate ต่อ pending cycle — #4)
  if v_accountable is not null and jsonb_typeof(v_accountable) = 'array' then
    for v_role in select jsonb_array_elements_text(v_accountable) loop
      insert into public.approval_request
        (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
      values (p_work_item_id, p_process_step, v_site, v_role, 'employee', v_quorum, v_deadline, v_deadline, 'pending')
      on conflict (work_item_id, process_step, resolved_approver) where status = 'pending' do nothing;
    end loop;
  end if;

  -- customer leg
  if v_with_customer then
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
    values (p_work_item_id, p_process_step, v_site, v_customer::text, 'customer', v_quorum, v_deadline, v_deadline, 'pending')
    on conflict (work_item_id, process_step, resolved_approver) where status = 'pending' do nothing;
  end if;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  -- คืนจำนวน pending leg จริง (idempotent: เรียกซ้ำได้ค่าคงที่)
  select count(*) into v_count
  from public.approval_request
  where work_item_id = p_work_item_id and process_step = p_process_step and status = 'pending';

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum, 'with_customer', v_with_customer));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, text, int) from public;

-- ---------------------------------------------------------------------------
-- #2 + #3 + #5: rpc_record_approval_decision (employee)
--   authz = has_any_app_role([resolved_approver]) (role-based, Req 3.1) — #3
--   unauthorized → audit COMMIT + return 'unauthorized' (no raise) — #2
--   quorum v_total excludes status='escalated' — #5
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

  -- #3 anti-impersonation (Req 4.3/4.4/4.9): ผู้กดต้องถือ app_role ที่ accountable (resolved_approver = role)
  if not public.has_any_app_role(array[v_req.resolved_approver]) then
    -- #2: audit COMMIT (return ไม่ raise → ไม่ rollback); ไม่ advance work_item (คง state เดิม)
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

  -- #5: v_total นับเฉพาะ leg ที่ยังอยู่ใน quorum (ตัด escalated/timeout ออก)
  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and process_step = v_req.process_step and status <> 'escalated';
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step and ar.status <> 'escalated';

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
    jsonb_build_object('decision', p_decision, 'channel', p_channel, 'outcome', v_outcome, 'quorum', v_req.quorum));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_approval_decision(uuid, text, public.wf_decision, public.wf_decision_channel, int) from public;

-- ---------------------------------------------------------------------------
-- #2 + #5: rpc_record_customer_approval_decision
--   unauthorized → audit COMMIT + return 'unauthorized' (no raise) — #2
--   quorum v_total excludes status='escalated' — #5
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

  -- #2 authz fail → audit COMMIT + return 'unauthorized' (ไม่ raise → audit ไม่ rollback)
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

  -- #5: ตัด escalated ออกจาก quorum
  select count(*) into v_total
    from public.approval_request
   where work_item_id = v_req.work_item_id and process_step = v_req.process_step and status <> 'escalated';
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step and ar.status <> 'escalated';

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
    jsonb_build_object('decision', p_decision, 'outcome', v_outcome, 'quorum', v_req.quorum, 'approver_kind', 'customer'));

  return v_outcome;
end;
$$;

revoke all on function public.rpc_record_customer_approval_decision(uuid, text, public.wf_decision, text, int, text) from public;

-- ---------------------------------------------------------------------------
-- #1 BLOCKER: rpc_record_customer_approval_from_webhook
--   verify LINE signature (reuse line_oa_verify_signature, Vault secret) →
--   derive line_user_id จาก events[].source.userId ของ body ที่ verify แล้ว →
--   parse approval params จาก signed postback.data → เรียก customer decision.
--   ไม่รับ line_user_id จาก client เลย (ปิด impersonation hole, Req 20.3/20.4).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_customer_approval_from_webhook(
  p_channel_identifier text,
  p_raw_body text,
  p_signature text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
  v_vertical text;
  v_token_ref text;
  v_body jsonb;
  v_event jsonb;
  v_line_user text;
  v_data text;
  v_params jsonb;
  v_req_id uuid;
  v_decision public.wf_decision;
  v_event_id text;
  v_expected int;
begin
  -- 1) ตรวจลายเซ็น (Req 20.3) — secret อยู่ใน Vault ไม่รั่ว
  v_verified := public.line_oa_verify_signature(p_channel_identifier, p_raw_body, p_signature);
  if not v_verified then
    raise exception 'invalid LINE signature' using errcode = '28000';
  end if;

  -- 2) vertical_context จาก channel (ไม่เอา secret)
  select vertical_context into v_vertical
  from public.line_oa_resolve_channel(p_channel_identifier);

  -- 3) parse body ที่ verify แล้ว — identity จาก source.userId (ไม่ใช่ client field)
  begin
    v_body := p_raw_body::jsonb;
  exception when others then
    raise exception 'malformed webhook body' using errcode = '22P02';
  end;
  v_event := v_body -> 'events' -> 0;
  v_line_user := v_event #>> '{source,userId}';
  v_data := v_event #>> '{postback,data}';
  if v_line_user is null or v_data is null then
    raise exception 'missing source.userId or postback.data' using errcode = '22023';
  end if;

  -- 4) parse postback.data (querystring) จาก signed payload
  select jsonb_object_agg(split_part(kv, '=', 1), split_part(kv, '=', 2))
    into v_params
  from unnest(string_to_array(v_data, '&')) kv
  where position('=' in kv) > 0;

  if v_params is null
     or v_params ->> 'approval_request_id' is null
     or v_params ->> 'webhook_event_id' is null
     or v_params ->> 'decision' is null
     or v_params ->> 'expected_version' is null then
    raise exception 'incomplete postback params' using errcode = '22023';
  end if;

  v_req_id := (v_params ->> 'approval_request_id')::uuid;
  v_event_id := v_params ->> 'webhook_event_id';
  v_decision := (v_params ->> 'decision')::public.wf_decision;
  v_expected := (v_params ->> 'expected_version')::int;

  -- 5) ส่งต่อ customer decision ด้วย line_user_id ที่ verify แล้ว
  return public.rpc_record_customer_approval_decision(
    v_req_id, v_event_id, v_decision, v_line_user, v_expected, coalesce(v_vertical, 'line_oa'));
end;
$$;

revoke all on function public.rpc_record_customer_approval_from_webhook(text, text, text) from public;
