-- Migration: rpc_capture_promote — capture-spine Phase 2 (task 3.4)
-- Depends on: 0049/0050, C12
--
-- approved → emitted + link entity (commit Commit_Target). approve-before-promote (Req 5.2): สำเร็จเฉพาะ status='approved'.
-- no-commit-until-emitted (Property 1): business-layer เปลี่ยนเฉพาะตอน emitted. idempotent: emitted แล้ว → คืน 'emitted'.
-- หมายเหตุ: การ commit เข้า Commit_Target จริง (ledger/Work_Item) แตกต่างตาม commit_target — ที่นี่ mark emitted + link;
--   adapter ต่อ target จริงเป็น integration ภายหลัง (ไม่เปลี่ยน core; Req 9).

create or replace function public.rpc_capture_promote(
  p_id uuid,
  p_linked_entity_type text default null,
  p_linked_entity_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_status public.capture_status;
  v_type text;
  v_site text;
  v_commit_target text;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select status, capture_type, site_code into v_status, v_type, v_site
  from public.capture_artifact where id = p_id for update;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;

  -- idempotent: emitted แล้ว → คืนเดิม (ไม่ commit ซ้ำ)
  if v_status = 'emitted' then
    return 'emitted';
  end if;
  -- approve-before-promote (Req 5.2)
  if v_status <> 'approved' then
    raise exception 'capture: cannot promote status % (approve-before-promote)', v_status using errcode = 'check_violation';
  end if;

  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to promote' using errcode = 'insufficient_privilege';
  end if;

  select commit_target into v_commit_target from public.capture_type_config where capture_type = v_type;

  update public.capture_artifact
    set status = 'emitted', linked_entity_type = p_linked_entity_type, linked_entity_id = p_linked_entity_id
    where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'emit', v_principal, 'approved', 'emitted',
    jsonb_build_object('commit_target', v_commit_target, 'linked_entity_type', p_linked_entity_type, 'linked_entity_id', p_linked_entity_id));

  return 'emitted';
end;
$$;

revoke all on function public.rpc_capture_promote(uuid, text, uuid) from public;
