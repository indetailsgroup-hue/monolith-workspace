-- Migration: rpc_record_capture + rpc_log_capture_failure — monolith-workflow-copilot Phase 1 (Req 7, §1 STEP 2-FIX)
-- Spec task: 15.2 (atomic capture + caller-driven failure-audit)
-- Depends on: 0002 (capture_item, work_item), 0003 (audit), C12
--
-- §1 design: rpc_record_capture เป็น atomic — ส่วนใดล้มเหลว (รวม actor resolution) → raise →
--   business transaction roll back ทั้งก้อน ไม่ผูกบางส่วน (Req 7.3, 7.7, 7.8).
-- rpc_log_capture_failure = append failure-audit อย่างเดียว ไม่แตะ business data, scrub secret,
--   เรียกในการเรียกครั้งใหม่ (transaction แยก) โดย Edge caller → best-effort (ไม่ durable-guaranteed).
--   **ไม่ใช้ dblink/pg_background** (Req 7.9).

create or replace function public.rpc_record_capture(
  p_work_item_id uuid,
  p_process_step text,
  p_capture jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id uuid;
  v_wi_step text;
begin
  -- actor resolution เป็นส่วนหนึ่งของ atomic unit (Req 7.7) — ถ้าล้มเหลว → raise → roll back
  v_actor := public.resolve_actor();
  if v_actor is null or v_actor = '' then
    raise exception 'actor resolution failed' using errcode = 'no_data_found';
  end if;

  -- work_item ต้องมีและ step ต้องตรงกับ current_step (ผูก Capture ↔ Work_Item ↔ Process_Step)
  select current_step into v_wi_step from public.work_item where id = p_work_item_id for update;
  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;
  if v_wi_step <> p_process_step then
    raise exception 'process_step mismatch (work_item at %, capture for %)', v_wi_step, p_process_step
      using errcode = 'check_violation';
  end if;

  insert into public.capture_item (work_item_id, process_step, site_code, captured_by, capture)
  select p_work_item_id, p_process_step, wi.site_code, v_actor, p_capture
  from public.work_item wi where wi.id = p_work_item_id
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('capture', p_work_item_id, p_process_step, v_actor,
    jsonb_build_object('capture_item_id', v_id));

  return v_id;
end;
$$;

-- failure-audit: append อย่างเดียว, ไม่แตะ business data (best-effort, tx แยกจาก caller)
create or replace function public.rpc_log_capture_failure(
  p_work_item_id uuid,
  p_process_step text,
  p_failure_reason text,
  p_actor_hint text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  v_actor := coalesce(nullif(public.resolve_actor(), ''), p_actor_hint, 'system');
  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('capture_failure', p_work_item_id, p_process_step, v_actor,
    jsonb_build_object('failure_reason', left(coalesce(p_failure_reason, ''), 500), 'best_effort', true));
end;
$$;

revoke all on function public.rpc_record_capture(uuid, text, jsonb) from public;
revoke all on function public.rpc_log_capture_failure(uuid, text, text, text) from public;
grant execute on function public.rpc_record_capture(uuid, text, jsonb) to authenticated;
grant execute on function public.rpc_log_capture_failure(uuid, text, text, text) to authenticated;
