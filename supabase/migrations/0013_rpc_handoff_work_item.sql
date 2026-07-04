-- Migration: rpc_handoff_work_item — monolith-workflow-copilot Phase 1 (Req 2, 16)
-- Spec task: 5.4 (canonical handoff + optimistic lock, atomic)
-- Depends on: 0002 (work_item, process_model), 0003 (audit), C12
--
-- optimistic lock บน expected_version (Req 16.3), บังคับลำดับ canonical ติดกัน (Req 2.5),
-- target ∈ process_model (Req 2.7), increment version, audit atomic (Req 2.4, 16.4).
-- mirror src/workflow/handoff/{canonical,locking}.ts.

create or replace function public.rpc_handoff_work_item(
  p_work_item_id uuid,
  p_expected_version int,
  p_target_step text,
  p_new_owner uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur_step text;
  v_cur_version int;
  v_cur_order int;
  v_tgt_order int;
  v_new_version int;
begin
  select current_step, version into v_cur_step, v_cur_version
  from public.work_item where id = p_work_item_id
  for update;  -- row lock เพื่อ atomicity

  if not found then
    raise exception 'work item not found' using errcode = 'no_data_found';
  end if;

  -- Req 16.3 — optimistic lock
  if v_cur_version <> p_expected_version then
    raise exception 'version conflict: expected % got %', p_expected_version, v_cur_version
      using errcode = 'serialization_failure';
  end if;

  -- Req 2.7 — current/target ต้องมีใน process_model
  select canonical_order into v_cur_order from public.process_model where process_step = v_cur_step;
  select canonical_order into v_tgt_order from public.process_model where process_step = p_target_step;
  if v_cur_order is null or v_tgt_order is null then
    raise exception 'unknown step (current=% target=%)', v_cur_step, p_target_step using errcode = 'foreign_key_violation';
  end if;

  -- Req 2.5 — ต้องเป็นขั้นถัดไปติดกันเท่านั้น
  if v_tgt_order <> v_cur_order + 1 then
    raise exception 'invalid sequence: % -> %', v_cur_step, p_target_step using errcode = 'check_violation';
  end if;

  v_new_version := v_cur_version + 1;
  update public.work_item
    set current_step = p_target_step,
        current_owner = p_new_owner,
        version = v_new_version
    where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, performed_by, detail)
  values ('handoff', p_work_item_id, p_target_step, public.resolve_actor(),
    jsonb_build_object('from_step', v_cur_step, 'to_step', p_target_step, 'new_version', v_new_version));

  return v_new_version;
end;
$$;

revoke all on function public.rpc_handoff_work_item(uuid, int, text, uuid) from public;
