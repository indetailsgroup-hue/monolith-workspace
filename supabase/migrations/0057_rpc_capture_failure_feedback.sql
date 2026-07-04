-- Migration: rpc_capture_failure_feedback — capture-spine Phase 2 (task 3.5)
-- Depends on: 0049/0050, C12
--
-- rpc_capture_log_failure: append failure-audit อย่างเดียว (caller-driven separate tx — Edge catch; ไม่ใช้ dblink/pg_background;
--   best-effort เหมือน workflow-copilot §1). ไม่แตะ business. scrub โดย caller.
-- rpc_capture_feedback: false-positive feedback (Req 10.3) — บันทึก ไม่ลงโทษผู้ส่ง; mirror fraud-signal.classifyFeedback.

create or replace function public.rpc_capture_log_failure(
  p_capture_artifact_id uuid,
  p_capture_type text,
  p_event_type text,            -- 'failure' (ingest/ocr/extract fail ฯลฯ ระบุใน detail)
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
begin
  v_principal := coalesce(public.resolve_actor(), 'system');
  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, detail)
  values (p_capture_artifact_id, p_capture_type, coalesce(p_event_type, 'failure'), v_principal, p_detail);
end;
$$;

revoke all on function public.rpc_capture_log_failure(uuid, text, text, jsonb) from public;

create or replace function public.rpc_capture_feedback(
  p_id uuid,
  p_is_false_positive boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_type text;
  v_site text;
  v_result text;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select capture_type, site_code into v_type, v_site
  from public.capture_artifact where id = p_id;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission for feedback' using errcode = 'insufficient_privilege';
  end if;

  -- mirror classifyFeedback (Req 10.3 — false positive ไม่ลงโทษผู้ส่ง; ใช้ปรับ signal)
  v_result := case when p_is_false_positive then 'false_positive_recorded' else 'confirmed_suspicious' end;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, detail)
  values (p_id, v_type, 'feedback', v_principal, jsonb_build_object('result', v_result, 'is_false_positive', p_is_false_positive));

  return v_result;
end;
$$;

revoke all on function public.rpc_capture_feedback(uuid, boolean) from public;
