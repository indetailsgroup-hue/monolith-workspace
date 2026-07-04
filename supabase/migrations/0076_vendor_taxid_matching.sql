-- Migration: vendor_taxid_matching — capture-spine (ADR-028: tax_id หลัก + ชื่อรอง)
-- Depends on: 0064 (vendor_master), 0065 (rpc_capture_set_extraction master validation), C12
--
-- ADR-028 (grill owner-decisions 3 ก.ค. 2026): จับคู่ vendor ด้วย tax_id เป็นหลัก (unique, ปลอมยาก);
--   OCR อ่าน tax_id ไม่ได้/เอกสารไม่มี → fallback จับคู่ด้วยชื่อ + mark unverified ตามเดิม (mark-not-block);
--   tax_id ตรงแต่ชื่อไม่ตรง → ผ่าน master check แต่เพิ่ม fraud signal 'name_mismatch' ให้มนุษย์ดู.
-- ADR-029 (บางส่วน): normalize_name() ใช้ร่วมทั้ง vendor name fallback และ material matching (0077).
-- additive-first: ไม่แก้ 0064/0065 — extend ด้วย index/UPDATE/CREATE OR REPLACE ที่นี่.

-- ---------------------------------------------------------------------------
-- normalize_name — trim + ยุบช่องว่างซ้ำ + case-fold (ใช้เทียบชื่อทั้ง vendor/material)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- vendor_master.tax_id — unique partial index (เลขผู้เสียภาษี 13 หลัก unique เมื่อมีค่า)
-- ---------------------------------------------------------------------------
create unique index if not exists ux_vendor_master_tax_id
  on public.vendor_master (tax_id) where tax_id is not null;

-- ---------------------------------------------------------------------------
-- expense_document: เพิ่ม field vendor_tax_id ใน field_schema + master_refs แบบ primary lookup
--   shape ใหม่ (backwards-compatible — ref เดิมที่ไม่มี primary_field ทำงานเหมือนเดิม):
--   {"vendor": {"table":"vendor_master","column":"name","normalize":true,
--               "primary_field":"vendor_tax_id","primary_column":"tax_id","mismatch_signal":"name_mismatch"}}
-- ---------------------------------------------------------------------------
update public.capture_type_config
  set field_schema = field_schema || jsonb_build_object('vendor_tax_id', 'string'),
      master_refs = jsonb_build_object('vendor', jsonb_build_object(
        'table', 'vendor_master', 'column', 'name', 'normalize', true,
        'primary_field', 'vendor_tax_id', 'primary_column', 'tax_id',
        'mismatch_signal', 'name_mismatch'))
  where capture_type = 'expense_document';

-- ---------------------------------------------------------------------------
-- rpc_capture_set_extraction — master validation รองรับ primary lookup (tax_id → name fallback)
--   ลอจิกต่อ ref:
--     1) มี primary_field + ค่า → lookup ด้วย primary_column:
--          พบ → เทียบชื่อ (normalize): ไม่ตรง → fraud signal mismatch_signal (ผ่าน master check)
--          ไม่พบ → mark unverified ที่ primary_field + fallback lookup ด้วยชื่อตามเดิม
--     2) ไม่มี primary → พฤติกรรมเดิม (lookup คอลัมน์เดียว; normalize ถ้า ref สั่ง)
--   คง authz/immutability/audit เดิมทุกประการ (0065). signature เดิม → CREATE OR REPLACE ได้.
-- ---------------------------------------------------------------------------
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
  v_extra_signals jsonb := '[]'::jsonb;
  v_signals jsonb;
  v_suspicious boolean;
  v_field text;
  v_ref jsonb;
  v_val text;
  v_primary_field text;
  v_primary_val text;
  v_found boolean;
  v_name_matches boolean;
  v_normalize boolean;
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

  -- Req 3.1/3.2 + ADR-028: master validation ตาม config (mark unverified — ไม่ block)
  select master_refs into v_master_refs from public.capture_type_config where capture_type = v_type;
  if v_master_refs is not null and jsonb_typeof(v_master_refs) = 'object' then
    for v_field, v_ref in select key, value from jsonb_each(v_master_refs) loop
      v_val := p_fields ->> v_field;
      v_normalize := coalesce((v_ref->>'normalize')::boolean, false);
      v_primary_field := v_ref->>'primary_field';
      v_primary_val := case when v_primary_field is not null then p_fields ->> v_primary_field else null end;

      if v_primary_val is not null and length(v_primary_val) > 0 and v_ref ? 'primary_column' then
        -- ADR-028: primary lookup (เช่น tax_id)
        execute format(
          'select exists(select 1 from public.%I where %I = $1 and coalesce(active, true))',
          v_ref->>'table', v_ref->>'primary_column'
        ) into v_found using v_primary_val;

        if v_found then
          -- primary ตรง → เทียบชื่อ; ไม่ตรง → signal mismatch (ผ่าน master check — ไม่ mark unverified)
          if v_val is not null and length(v_val) > 0 then
            execute format(
              'select exists(select 1 from public.%I where %I = $1 and public.normalize_name(%I) = public.normalize_name($2) and coalesce(active, true))',
              v_ref->>'table', v_ref->>'primary_column', v_ref->>'column'
            ) into v_name_matches using v_primary_val, v_val;
            if not v_name_matches then
              v_extra_signals := v_extra_signals || jsonb_build_array(jsonb_build_object(
                'signal', coalesce(v_ref->>'mismatch_signal', 'name_mismatch'),
                'field', v_field, 'value', v_val, 'primary_field', v_primary_field, 'primary_value', v_primary_val));
            end if;
          end if;
          continue;  -- primary พบ → ข้าม fallback
        else
          -- primary ไม่พบใน master → mark unverified ที่ primary_field แล้ว fallback ชื่อ (ADR-028)
          v_unverified := v_unverified || jsonb_build_object(
            'field', v_primary_field, 'value', v_primary_val, 'reason', 'not_in_master');
        end if;
      end if;

      -- fallback / พฤติกรรมเดิม: lookup ด้วยคอลัมน์หลักของ ref (normalize ตาม config)
      if v_val is not null and length(v_val) > 0 then
        if v_normalize then
          execute format(
            'select exists(select 1 from public.%I where public.normalize_name(%I) = public.normalize_name($1) and coalesce(active, true))',
            v_ref->>'table', v_ref->>'column'
          ) into v_found using v_val;
        else
          execute format(
            'select exists(select 1 from public.%I where %I = $1 and coalesce(active, true))',
            v_ref->>'table', v_ref->>'column'
          ) into v_found using v_val;
        end if;
        if not v_found then
          v_unverified := v_unverified || jsonb_build_object('field', v_field, 'value', v_val, 'reason', 'not_in_master');
        end if;
      end if;
    end loop;
  end if;

  -- รวม fraud signals: caller + master_not_found (จาก unverified) + mismatch (ADR-028) — Req 10.1
  v_signals := coalesce(p_fraud_signals, '[]'::jsonb);
  if jsonb_array_length(v_unverified) > 0 then
    v_signals := v_signals || (
      select coalesce(jsonb_agg(jsonb_build_object('signal', 'master_not_found', 'field', u->>'field', 'value', u->>'value')), '[]'::jsonb)
      from jsonb_array_elements(v_unverified) u
    );
  end if;
  v_signals := v_signals || v_extra_signals;
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

-- rpc_upsert_vendor: tax_id unique — conflict ที่ tax_id ให้ error ชัด (governance แก้เอง; ไม่ auto-merge)
comment on index public.ux_vendor_master_tax_id is
  'ADR-028: tax_id unique เมื่อมีค่า — insert vendor ซ้ำ tax_id จะ error ให้ governance ตรวจ (no auto-merge)';
