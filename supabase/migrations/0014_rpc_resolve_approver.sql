-- Migration: rpc_resolve_approver — monolith-workflow-copilot Phase 1 (Req 3, 8, 15)
-- Spec task: 7.4 (resolver + fail-safe escalation + create Approval_Request + quorum)
-- Depends on: 0002 (work_item, approval_request, process_model), 0010 (knowledge_import RACI), 0003 (audit), C12
--
-- หา Approver จาก RACI_Map (Accountable) ของ Process_Step (Req 3.1); ว่าง → fail-safe block +
-- escalate executive_owner + audit (Req 3.4). สร้าง Approval_Request ครบทุกคน + บันทึก quorum จาก
-- process_model (Req 3.3, 8.8, 15.5). mirror src/workflow/resolver/approver.ts + escalation.ts.

create or replace function public.rpc_resolve_approver(
  p_work_item_id uuid,
  p_process_step text,
  p_sla_minutes int default 1440
)
returns int  -- จำนวน Approval_Request ที่สร้าง (0 = fail-safe escalation)
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
  v_count int := 0;
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

  -- RACI Accountable จาก Knowledge_Export ฉบับ current (Req 3.1, 3.6)
  select payload into v_payload from public.knowledge_import where is_current limit 1;
  v_accountable := v_payload #> array['raciMap', p_process_step, 'accountable'];

  -- Req 3.4 — ว่าง → fail-safe block + escalate executive_owner + audit
  if v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0 then
    update public.work_item set status = 'blocked' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    values ('escalation', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
      jsonb_build_object('reason', 'no_eligible_approver', 'escalate_to', 'executive_owner', 'fail_safe', true));
    return 0;
  end if;

  -- สร้าง Approval_Request ต่อ Accountable แต่ละราย (Req 3.3) + ผูก quorum (Req 15.5)
  for v_role in select jsonb_array_elements_text(v_accountable) loop
    insert into public.approval_request
      (work_item_id, process_step, site_code, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status)
    values
      (p_work_item_id, p_process_step, v_site, v_role, 'employee', v_quorum, v_deadline, v_deadline, 'pending');
    v_count := v_count + 1;
  end loop;

  update public.work_item set status = 'awaiting_approval' where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('approval_resolve', p_work_item_id, p_process_step, v_site, public.resolve_actor(),
    jsonb_build_object('approver_count', v_count, 'quorum', v_quorum));

  return v_count;
end;
$$;

revoke all on function public.rpc_resolve_approver(uuid, text, int) from public;
