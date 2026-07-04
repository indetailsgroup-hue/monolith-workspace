-- Migration: capture_commit_workitem — capture-spine Phase 2 (L3 — commit-target adapter #1)
-- Depends on: 0056 (rpc_capture_promote), 0033/0035 (rpc_complete_work_item), C12
--
-- L3: promote ของ capture_type ที่ commit_target='Work_Item complete' (installation_proof) → commit จริงเข้า business-layer
--   โดยเรียก rpc_complete_work_item(linked_entity_id) — reuse-not-fork (ไม่เขียน work_item เอง).
-- atomic: mark emitted ก่อน (no-commit-until-emitted Property 1) → commit; ถ้า complete ล้มเหลว (work_item ไม่พร้อม) →
--   raise → ทั้ง tx rollback (capture ไม่ emitted ด้วย) = either-both-or-neither.
-- idempotent: emitted แล้ว → return early (ไม่ commit ซ้ำ); rpc_complete_work_item เองก็ idempotent.

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
  v_wi_version int;
  v_complete_result text;
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

  if v_status = 'emitted' then
    return 'emitted';  -- idempotent: ไม่ commit ซ้ำ
  end if;
  if v_status <> 'approved' then
    raise exception 'capture: cannot promote status % (approve-before-promote)', v_status using errcode = 'check_violation';
  end if;
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to promote' using errcode = 'insufficient_privilege';
  end if;

  select commit_target into v_commit_target from public.capture_type_config where capture_type = v_type;

  -- mark emitted + link (no-commit-until-emitted: business-layer เปลี่ยนหลังจุดนี้)
  update public.capture_artifact
    set status = 'emitted', linked_entity_type = p_linked_entity_type, linked_entity_id = p_linked_entity_id
    where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'emit', v_principal, 'approved', 'emitted',
    jsonb_build_object('commit_target', v_commit_target, 'linked_entity_type', p_linked_entity_type, 'linked_entity_id', p_linked_entity_id));

  -- L3 commit-target adapter: 'Work_Item complete' → เรียก rpc_complete_work_item จริง (atomic ใน tx เดียว)
  if v_commit_target = 'Work_Item complete' then
    if p_linked_entity_type is distinct from 'work_item' or p_linked_entity_id is null then
      raise exception 'capture: Work_Item complete requires linked_entity_type=work_item + linked_entity_id'
        using errcode = 'check_violation';
    end if;
    select version into v_wi_version from public.work_item where id = p_linked_entity_id for update;
    if not found then
      raise exception 'capture: linked work_item % not found', p_linked_entity_id using errcode = 'no_data_found';
    end if;
    -- complete จริง; ถ้า work_item ยังไม่ถึงขั้นสุดท้าย/gate ค้าง → raise → ทั้ง tx (รวม emit) rollback
    v_complete_result := public.rpc_complete_work_item(p_linked_entity_id, v_wi_version);
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'work_item_id', p_linked_entity_id, 'complete_result', v_complete_result));
  end if;

  return 'emitted';
end;
$$;

revoke all on function public.rpc_capture_promote(uuid, text, uuid) from public;
