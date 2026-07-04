-- Migration: revision_discipline — monolith-workflow-copilot Phase 1.5 (Req 21)
-- Spec task: 22.1–22.4 (revision_event, design_lock_field_config, re-quote FSM, classify)
-- Depends on: 0002 (work_item revision_count/design_locks + awaiting_* status), 0003 (audit), C12
--
-- mirror src/workflow/revision/* (จะตามมา): classify deterministic ก่อน; re-quote = internal
-- (PM+exec single consolidated) AND customer accept ครบทั้งคู่ (Req 21.6/21.10/21.17).

-- ---------------------------------------------------------------------------
-- design_lock_field_config — seed 4-gate (G1/G2/G3 customer, G4 internal)
-- ---------------------------------------------------------------------------
create table if not exists public.design_lock_field_config (
  gate text primary key check (gate in ('G1', 'G2', 'G3', 'G4')),
  gate_owner text not null check (gate_owner in ('customer', 'internal')),
  locked_fields jsonb not null default '[]'::jsonb,
  description text not null default ''
);

insert into public.design_lock_field_config (gate, gate_owner, locked_fields, description) values
  ('G1', 'customer', '["layout","room_scope","cabinet_count"]'::jsonb, 'Mood&Tone / Layout sign-off'),
  ('G2', 'customer', '["material","finish","color"]'::jsonb,           '3D Presentation material/finish sign-off'),
  ('G3', 'customer', '["dimensions","hardware","final_spec"]'::jsonb,  '3D Rendering Final spec sign-off'),
  ('G4', 'internal', '["bom","toolpath","production_route"]'::jsonb,   'Internal production lock')
on conflict (gate) do nothing;

alter table public.design_lock_field_config enable row level security;
drop policy if exists design_lock_field_config_sel on public.design_lock_field_config;
create policy design_lock_field_config_sel on public.design_lock_field_config
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- revision_event
-- ---------------------------------------------------------------------------
create table if not exists public.revision_event (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_item(id),
  gate text not null,
  site_code text null,
  reason text not null check (reason in ('scope_change', 'daph_defect', 'customer_change', 'pm_judgment')),
  reason_classified_by text not null,             -- internal actor (resolve_actor) — Req 20.10
  classification_basis text not null default '',
  customer_comment text null,                     -- free-text จากลูกค้า
  billable boolean not null default false,
  appeal_status text not null default 'none' check (appeal_status in ('none', 'appealed', 'upheld', 'overturned')),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_revision_event_work_item on public.revision_event (work_item_id);

alter table public.revision_event enable row level security;
drop policy if exists revision_event_sel on public.revision_event;
create policy revision_event_sel on public.revision_event
  for select to authenticated using (public.is_governance_role() or public.has_site_access(site_code));

-- ---------------------------------------------------------------------------
-- rpc_record_design_lock — lock fields ของ gate เข้า work_item.design_locks (Req 21.12)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_design_lock(p_work_item_id uuid, p_gate text)
returns void language plpgsql security definer set search_path = public as $$
declare v_fields jsonb;
begin
  select locked_fields into v_fields from public.design_lock_field_config where gate = p_gate;
  if v_fields is null then raise exception 'unknown gate: %', p_gate using errcode = 'foreign_key_violation'; end if;
  update public.work_item
    set design_locks = coalesce(design_locks, '{}'::jsonb) || jsonb_build_object(p_gate, v_fields)
    where id = p_work_item_id;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;
  insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
  values ('design_lock', p_work_item_id, public.resolve_actor(), jsonb_build_object('gate', p_gate, 'locked_fields', v_fields));
end; $$;

-- ---------------------------------------------------------------------------
-- rpc_classify_revision — deterministic classify (Req 21.1, 21.4, 21.5, 21.13)
--   change ∩ locked_fields → scope_change; ≠ signed spec → daph_defect; else customer_change;
--   ไม่ชัด → pm_judgment. customer_change > 1/gate → billable + escalate PM (soft, ไม่ hard-block).
--   daph_defect → ไม่นับ threshold (feed QA_Metric).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_classify_revision(
  p_work_item_id uuid,
  p_gate text,
  p_changed_fields jsonb,
  p_matches_signed_spec boolean,
  p_is_clear boolean default true,
  p_customer_comment text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_locked jsonb;
  v_touches_locked boolean;
  v_reason text;
  v_site text;
  v_actor text := public.resolve_actor();
  v_customer_change_count int;
  v_billable boolean := false;
begin
  select site_code into v_site from public.work_item where id = p_work_item_id;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;

  select locked_fields into v_locked from public.design_lock_field_config where gate = p_gate;

  -- change แตะ field ที่ lock → scope_change (Req 21.4/21.12)
  v_touches_locked := v_locked is not null and exists (
    select 1 from jsonb_array_elements_text(p_changed_fields) cf
    where cf in (select jsonb_array_elements_text(v_locked))
  );

  if v_touches_locked then
    v_reason := 'scope_change';
  elsif not p_matches_signed_spec then
    v_reason := 'daph_defect';      -- ความผิดพลาดของ DAPH (Req 21.2/21.13) — ไม่นับ threshold
  elsif not p_is_clear then
    v_reason := 'pm_judgment';
  else
    v_reason := 'customer_change';
  end if;

  -- นับเฉพาะ customer_change > 1 ต่อ gate → billable + escalate PM (soft) (Req 21.5/21.15)
  if v_reason = 'customer_change' then
    select count(*) into v_customer_change_count
      from public.revision_event
      where work_item_id = p_work_item_id and gate = p_gate and reason = 'customer_change';
    if v_customer_change_count >= 1 then
      v_billable := true;  -- ครั้งที่ 2 ขึ้นไป
    end if;
  end if;

  insert into public.revision_event (work_item_id, gate, site_code, reason, reason_classified_by, classification_basis, customer_comment, billable)
  values (p_work_item_id, p_gate, v_site, v_reason, v_actor,
    case when v_touches_locked then 'touches_locked_field'
         when not p_matches_signed_spec then 'deviates_signed_spec'
         when not p_is_clear then 'pm_judgment' else 'within_signed_spec' end,
    p_customer_comment, v_billable);

  update public.work_item set revision_count = revision_count + 1 where id = p_work_item_id;

  insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
  values ('revision', p_work_item_id, p_gate, v_site, v_actor,
    jsonb_build_object('reason', v_reason, 'billable', v_billable, 'escalate_pm', v_billable));

  return v_reason;
end; $$;

-- ---------------------------------------------------------------------------
-- rpc_request_scope_change — เข้าสู่ awaiting_requote (Req 21.6)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_request_scope_change(p_work_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.work_item set status = 'awaiting_requote' where id = p_work_item_id;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;
  insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
  values ('revision', p_work_item_id, public.resolve_actor(), jsonb_build_object('op', 'request_scope_change', 'status', 'awaiting_requote'));
end; $$;

-- ---------------------------------------------------------------------------
-- rpc_accept_requote — re-quote FSM (Req 21.6, 21.10, 21.11, 21.17)
--   "re-quote approved" = internal (PM+exec single consolidated) AND customer accept ครบทั้งคู่.
--   internal approve → awaiting_customer_acceptance; customer accept → in_progress + re-lock.
--   ทั้งสอง flag ต้องครบจึงปลด lock/เดินต่อ.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_accept_requote(
  p_work_item_id uuid,
  p_actor_kind text  -- 'internal' | 'customer'
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_wi public.work_item%rowtype;
  v_internal boolean;
  v_customer boolean;
begin
  select * into v_wi from public.work_item where id = p_work_item_id for update;
  if not found then raise exception 'work item not found' using errcode = 'no_data_found'; end if;

  v_internal := coalesce((v_wi.design_locks #>> '{_requote,internal_accepted}')::boolean, false);
  v_customer := coalesce((v_wi.design_locks #>> '{_requote,customer_accepted}')::boolean, false);

  if p_actor_kind = 'internal' then
    v_internal := true;
  elsif p_actor_kind = 'customer' then
    v_customer := true;
  else
    raise exception 'invalid actor_kind: %', p_actor_kind using errcode = 'check_violation';
  end if;

  update public.work_item
    set design_locks = coalesce(design_locks, '{}'::jsonb)
        || jsonb_build_object('_requote', jsonb_build_object('internal_accepted', v_internal, 'customer_accepted', v_customer))
    where id = p_work_item_id;

  -- ปลด lock/เดินต่อ เฉพาะเมื่อครบทั้งคู่ (Req 21.17)
  if v_internal and v_customer then
    update public.work_item set status = 'in_progress', version = version + 1 where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
    values ('revision', p_work_item_id, public.resolve_actor(),
      jsonb_build_object('op', 'requote_complete', 'internal', true, 'customer', true, 'proceed', true));
    return 'proceed';
  elsif v_internal and not v_customer then
    update public.work_item set status = 'awaiting_customer_acceptance' where id = p_work_item_id;
    insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
    values ('revision', p_work_item_id, public.resolve_actor(),
      jsonb_build_object('op', 'requote_internal_done', 'awaiting', 'customer'));
    return 'awaiting_customer_acceptance';
  end if;

  insert into public.workflow_audit_log (event_type, work_item_id, performed_by, detail)
  values ('revision', p_work_item_id, public.resolve_actor(),
    jsonb_build_object('op', 'requote_partial', 'internal', v_internal, 'customer', v_customer));
  return 'awaiting_requote';
end; $$;

-- ---------------------------------------------------------------------------
-- rpc_appeal_revision_reason — อุทธรณ์ไป executive_owner (Req 21.14)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_appeal_revision_reason(p_revision_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_site text;
begin
  update public.revision_event set appeal_status = 'appealed'
    where id = p_revision_event_id and appeal_status = 'none'
    returning site_code into v_site;
  if not found then raise exception 'revision event not found or already appealed' using errcode = 'no_data_found'; end if;
  insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
  values ('revision', v_site, public.resolve_actor(),
    jsonb_build_object('op', 'appeal', 'revision_event_id', p_revision_event_id, 'escalate_to', 'executive_owner'));
end; $$;

revoke all on function public.rpc_record_design_lock(uuid, text) from public;
revoke all on function public.rpc_classify_revision(uuid, text, jsonb, boolean, boolean, text) from public;
revoke all on function public.rpc_request_scope_change(uuid) from public;
revoke all on function public.rpc_accept_requote(uuid, text) from public;
revoke all on function public.rpc_appeal_revision_reason(uuid) from public;
