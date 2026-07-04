-- Migration: rpc_capture_ingest — capture-spine Phase 2 (task 3.1)
-- Depends on: 0049 (capture_artifact/capture_type_config), 0050 (audit), C12
--
-- สร้าง proposed + resolve_actor + raw_uri on-prem; idempotent ตาม idempotency_key (Req 1.1/1.2/Property 3).
-- mirror src/capture/idempotency.ts (decideIngest). audit 'ingest'.

create or replace function public.rpc_capture_ingest(
  p_capture_type text,
  p_source text,
  p_raw_uri text,
  p_idempotency_key text,
  p_site_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_id uuid;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.capture_type_config where capture_type = p_capture_type and active) then
    raise exception 'capture: unknown/inactive capture_type %', p_capture_type using errcode = 'no_data_found';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'capture: idempotency_key required' using errcode = 'check_violation';
  end if;

  -- idempotent: idempotency_key UNIQUE → ส่งซ้ำ → คืน artifact เดิม (Req 1.2)
  insert into public.capture_artifact (capture_type, status, source, principal, site_code, raw_uri, idempotency_key)
  values (p_capture_type, 'proposed', p_source::public.capture_source, v_principal, p_site_code, p_raw_uri, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- duplicate → คืนตัวเดิม (ไม่ audit ซ้ำ)
    select id into v_id from public.capture_artifact where idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status)
  values (v_id, p_capture_type, 'ingest', v_principal, null, 'proposed');

  return v_id;
end;
$$;

revoke all on function public.rpc_capture_ingest(text, text, text, text, text) from public;
