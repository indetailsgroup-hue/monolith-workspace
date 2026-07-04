-- Migration: rpc_record_approval_decision — monolith-workflow-copilot Phase 1 (Req 4, 15, 16)
-- Spec task: 8.4 (idempotent, anti-impersonation, optimistic lock, quorum, unblock/rework)
-- Depends on: 0002 (approval_request/decision, work_item), 0003 (audit), C12
--
-- ON CONFLICT(webhook_event_id) DO NOTHING (idempotency Req 4.7/16.5); resolve decider ผ่าน
-- resolve_actor() ไม่เชื่อ client id (Req 4.3); ผู้กด ≠ resolved_approver → reject + คง blocked
-- (Req 4.4/4.9); optimistic lock บน work_item.version (Req 16.2); รวม quorum (Req 15) →
-- unblock/approve (Req 4.11) หรือ rework (Req 4.10). mirror approval/{authz,quorum,idempotency}.ts.

create or replace function public.rpc_record_approval_decision(
  p_approval_request_id uuid,
  p_webhook_event_id text,
  p_decision public.wf_decision,
  p_channel public.wf_decision_channel,
  p_expected_version int
)
returns text  -- 'approved' | 'rejected' | 'pending' | 'replayed'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_req public.approval_request%rowtype;
  v_wi public.work_item%rowtype;
  v_inserted_id uuid;
  v_total int;
  v_decided int;
  v_approvals int;
  v_rejections int;
  v_needed int;
  v_outcome text;
begin
  select * into v_req from public.approval_request where id = p_approval_request_id;
  if not found then
    raise exception 'approval request not found' using errcode = 'no_data_found';
  end if;

  -- anti-impersonation (Req 4.3/4.4): decider จาก resolve_actor() ต้องตรง resolved_approver
  v_actor := public.resolve_actor();
  if v_actor is distinct from v_req.resolved_approver then
    -- คง blocked, ไม่บันทึกการตัดสิน (Req 4.9)
    update public.work_item set status = 'blocked' where id = v_req.work_item_id and status <> 'completed';
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
    values ('approval_decision', v_req.work_item_id, v_req.process_step, v_actor,
      jsonb_build_object('result', 'rejected_impersonation', 'kept_blocked', true));
    raise exception 'actor % is not the resolved approver', v_actor using errcode = 'insufficient_privilege';
  end if;

  -- optimistic lock (Req 16.2)
  select * into v_wi from public.work_item where id = v_req.work_item_id for update;
  if v_wi.version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_wi.version
      using errcode = 'serialization_failure';
  end if;

  -- idempotency (Req 4.7/16.5): ON CONFLICT DO NOTHING
  insert into public.approval_decision
    (approval_request_id, site_code, webhook_event_id, decider, decision, channel)
  values (p_approval_request_id, v_req.site_code, p_webhook_event_id, v_actor, p_decision, p_channel)
  on conflict (webhook_event_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return 'replayed';  -- เล่นซ้ำ ไม่ apply ใหม่
  end if;

  update public.approval_request
     set status = p_decision::text::public.wf_approval_request_status
   where id = p_approval_request_id;

  -- aggregate quorum ของ work_item + process_step (Req 15)
  select count(*) into v_total
    from public.approval_request where work_item_id = v_req.work_item_id and process_step = v_req.process_step;
  select count(distinct ar.resolved_approver) filter (where ad.decision = 'approved'),
         count(distinct ar.resolved_approver) filter (where ad.decision = 'rejected'),
         count(distinct ar.resolved_approver)
    into v_approvals, v_rejections, v_decided
    from public.approval_request ar
    join public.approval_decision ad on ad.approval_request_id = ar.id
   where ar.work_item_id = v_req.work_item_id and ar.process_step = v_req.process_step;

  v_outcome := 'pending';
  if v_req.quorum = 'unanimous' then
    if v_rejections > 0 then v_outcome := 'rejected';
    elsif v_approvals >= v_total then v_outcome := 'approved';
    end if;
  elsif v_req.quorum = 'majority' then
    v_needed := (v_total / 2) + 1;
    if v_approvals >= v_needed then v_outcome := 'approved';
    elsif v_approvals + (v_total - v_decided) < v_needed then v_outcome := 'rejected';
    end if;
  elsif v_req.quorum = 'first_response' then
    v_outcome := p_decision::text;  -- การตัดสินแรกที่บันทึกได้ชี้ขาด
  end if;

  -- effect (Req 4.10/4.11)
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
