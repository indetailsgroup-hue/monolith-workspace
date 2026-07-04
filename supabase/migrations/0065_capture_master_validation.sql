-- Migration: capture_master_validation — capture-spine (L2 wire, Req 3.1/3.2)
-- Depends on: 0058 (rpc_capture_set_extraction), 0064 (vendor_master + master_refs + unverified_fields), C12
--
-- L2: set_extraction ตรวจ extracted field กับ master ตาม capture_type_config.master_refs (config-driven, Property 9) →
--   ไม่พบใน master → mark unverified (Req 3.2, ไม่ block) + เพิ่ม fraud signal 'master_not_found' → is_suspicious (Req 10.1)
--   → verify บังคับ human confirm (Req 10.2). ใช้ EXECUTE format %I (table/column จาก config = admin-set, quote ปลอดภัย).
-- คง authz (L1, 0058) + content-immutability (proposed-only).

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
  v_master_refs jsonb;
  v_unverified jsonb := '[]'::jsonb;
  v_signals jsonb;
  v_suspicious boolean;
  v_field text;
  v_ref jsonb;
  v_val text;
  v_found boolean;
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
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to set extraction' using errcode = 'insufficient_privilege';
  end if;
  if v_status <> 'proposed' then
    raise exception 'capture: cannot set extraction on status % (content immutable)', v_status using errcode = 'check_violation';
  end if;

  -- Req 3.1/3.2: master validation ตาม config (mark unverified ที่ไม่พบ — ไม่ block)
  select master_refs into v_master_refs from public.capture_type_config where capture_type = v_type;
  if v_master_refs is not null and jsonb_typeof(v_master_refs) = 'object' then
    for v_field, v_ref in select key, value from jsonb_each(v_master_refs) loop
      v_val := p_fields ->> v_field;
      if v_val is not null and length(v_val) > 0 then
        execute format(
          'select exists(select 1 from public.%I where %I = $1 and coalesce(active, true))',
          v_ref->>'table', v_ref->>'column'
        ) into v_found using v_val;
        if not v_found then
          v_unverified := v_unverified || jsonb_build_object('field', v_field, 'value', v_val, 'reason', 'not_in_master');
        end if;
      end if;
    end loop;
  end if;

  -- รวม fraud signals: ของ caller + master_not_found (จาก unverified) — Req 10.1
  v_signals := coalesce(p_fraud_signals, '[]'::jsonb);
  if jsonb_array_length(v_unverified) > 0 then
    v_signals := v_signals || (
      select coalesce(jsonb_agg(jsonb_build_object('signal', 'master_not_found', 'field', u->>'field', 'value', u->>'value')), '[]'::jsonb)
      from jsonb_array_elements(v_unverified) u
    );
  end if;
  v_suspicious := jsonb_array_length(v_signals) > 0;

  update public.capture_artifact set
    ocr_text = p_ocr_text,
    ai_payload = coalesce(p_fields, '{}'::jsonb),
    confidence = coalesce(p_confidence, '{}'::jsonb),
    ai_provider = p_ai_provider,
    model_version = p_model_version,
    fraud_signals = v_signals,
    is_suspicious = v_suspicious,
    unverified_fields = v_unverified
  where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'extract', v_principal, 'proposed', 'proposed',
    jsonb_build_object('ai_provider', p_ai_provider, 'model_version', p_model_version,
      'is_suspicious', v_suspicious, 'unverified_count', jsonb_array_length(v_unverified)));
end;
$$;

revoke all on function public.rpc_capture_set_extraction(uuid, text, jsonb, jsonb, text, text, jsonb) from public;
