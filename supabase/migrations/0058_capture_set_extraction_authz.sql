-- Migration: capture_set_extraction_authz — capture-spine Phase 2 (scrutinize Wave 2, fix L1)
-- Depends on: 0054 (rpc_capture_set_extraction), C12
--
-- L1 (MEDIUM): set_extraction เป็น write RPC แต่ไม่ re-check บทบาท (ขัด Req 8.2) → ผู้ใช้ authenticated เขียน
--   extraction ทับ artifact ข้ามไซต์ได้. แก้: เพิ่ม authz governance|has_site_access(site) (เทียบเท่า verify/promote).
--   (signature เดิม → CREATE OR REPLACE)
-- L2 (track): master validation / unverified mark (Req 3.1/3.2) ยังไม่ทำ — รอ vendor/material master tables.

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
  v_site text;
  v_suspicious boolean;
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

  -- L1 fix (Req 8.2): write RPC ต้อง re-check บทบาท — governance หรือ has_site_access(site)
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to set extraction' using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'proposed' then
    raise exception 'capture: cannot set extraction on status % (content immutable)', v_status
      using errcode = 'check_violation';
  end if;

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
