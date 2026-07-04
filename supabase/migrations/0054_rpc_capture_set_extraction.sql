-- Migration: rpc_capture_set_extraction — capture-spine Phase 2 (task 3.2)
-- Depends on: 0049/0050, C12
--
-- บันทึก Stage1/Stage2 output (ocr_text/fields/confidence/provenance) + fraud_signals → is_suspicious;
-- **ไม่เติม placeholder** (Req 6.1 — caller ส่ง field ที่สกัดไม่ได้เป็น null, RPC ไม่เดา).
-- อนุญาตเฉพาะ status='proposed' (content immutable หลัง verify — Req 5.4). audit 'extract'.

create or replace function public.rpc_capture_set_extraction(
  p_id uuid,
  p_ocr_text text,
  p_fields jsonb,
  p_confidence jsonb,
  p_ai_provider text,
  p_model_version text,
  p_fraud_signals jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_status public.capture_status;
  v_type text;
  v_suspicious boolean;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select status, capture_type into v_status, v_type
  from public.capture_artifact where id = p_id for update;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;
  -- content แก้ได้เฉพาะ proposed (Req 5.4 content immutability หลัง verify/emit)
  if v_status <> 'proposed' then
    raise exception 'capture: cannot set extraction on status % (content immutable)', v_status
      using errcode = 'check_violation';
  end if;

  -- is_suspicious จาก fraud_signals (ไม่ auto-reject — Req 10.1); ไม่เติม placeholder ให้ fields
  v_suspicious := jsonb_array_length(coalesce(p_fraud_signals, '[]'::jsonb)) > 0;

  update public.capture_artifact set
    ocr_text = p_ocr_text,
    ai_payload = coalesce(p_fields, '{}'::jsonb),
    confidence = coalesce(p_confidence, '{}'::jsonb),
    ai_provider = p_ai_provider,
    model_version = p_model_version,
    fraud_signals = coalesce(p_fraud_signals, '[]'::jsonb),
    is_suspicious = v_suspicious
  where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'extract', v_principal, 'proposed', 'proposed',
    jsonb_build_object('ai_provider', p_ai_provider, 'model_version', p_model_version, 'is_suspicious', v_suspicious));
end;
$$;

revoke all on function public.rpc_capture_set_extraction(uuid, text, jsonb, jsonb, text, text, jsonb) from public;
