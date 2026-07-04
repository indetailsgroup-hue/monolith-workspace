-- Migration: capture_corrected_fields — capture-spine (ADR-033 exit criteria: ground truth สำหรับ dual-run)
-- Depends on: 0055 (rpc_capture_verify), 0049 (capture_artifact), C12
--
-- ADR-033 (amended จาก scrutinize 3 ก.ค. 2026): verify gate เดิมเก็บแค่ boolean confirm —
--   เพิ่ม corrected_fields jsonb เก็บ "ค่าที่มนุษย์แก้" ตอน approve เพื่อ:
--   (1) เป็น ground truth วัด accuracy ต่อ engine (dual-run Claude vs Typhoon — เกณฑ์สลับ ≥95%)
--   (2) ให้ promote ใช้ค่าที่ถูกต้อง (overlay ใน 0079) แทนค่า AI ที่ผิด
-- แยก provenance ชัด: ai_payload = ผลของ AI (immutable หลัง extract), corrected_fields = มนุษย์แก้
-- signature เปลี่ยน (เพิ่ม param) → DROP ก่อนสร้างใหม่ กัน overload กำกวมที่ PostgREST

alter table public.capture_artifact
  add column if not exists corrected_fields jsonb;

comment on column public.capture_artifact.corrected_fields is
  'ADR-033: ค่าที่มนุษย์แก้ตอน verify/approve (ground truth) — ai_payload คงผลของ AI ไว้เพื่อวัด accuracy ต่อ engine';

drop function if exists public.rpc_capture_verify(uuid, text, boolean, numeric, text);

create or replace function public.rpc_capture_verify(
  p_id uuid,
  p_decision text,                       -- 'approved' | 'rejected'
  p_human_confirmed boolean default false,
  p_confidence_threshold numeric default 0.7,
  p_review_notes text default null,
  p_corrected_fields jsonb default null  -- ADR-033: เฉพาะ field ที่มนุษย์แก้ (partial map)
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
  v_payload jsonb;
  v_conf jsonb;
  v_suspicious boolean;
  v_critical text[];
  v_min_conf numeric;
  v_has_critical_pending boolean;
  v_must_confirm boolean;
  v_effective jsonb;
  cf text;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'capture: invalid decision %', p_decision using errcode = 'check_violation';
  end if;
  if p_corrected_fields is not null and jsonb_typeof(p_corrected_fields) <> 'object' then
    raise exception 'capture: corrected_fields ต้องเป็น object' using errcode = 'check_violation';
  end if;

  select status, capture_type, site_code, ai_payload, confidence, is_suspicious
    into v_status, v_type, v_site, v_payload, v_conf, v_suspicious
  from public.capture_artifact where id = p_id for update;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;
  if v_status <> 'proposed' then
    raise exception 'capture: cannot verify status % (only proposed)', v_status using errcode = 'check_violation';
  end if;

  -- authz (Req 4.1 / 8.2): governance ข้ามได้; มิฉะนั้นต้อง has_site_access (site null → governance เท่านั้น)
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, detail)
    values (p_id, v_type, 'verify', v_principal, jsonb_build_object('result', 'insufficient_role'));
    raise exception 'capture: insufficient permission to verify' using errcode = 'insufficient_privilege';
  end if;

  if p_decision = 'rejected' then
    update public.capture_artifact
      set status = 'rejected', reviewed_by = v_principal, reviewed_at = timezone('utc', now()), review_notes = p_review_notes
      where id = p_id;
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status)
    values (p_id, v_type, 'verify', v_principal, 'proposed', 'rejected');
    return 'rejected';
  end if;

  -- approved path — ประเมิน Verify_Gate บน effective payload (ai_payload overlay ด้วยค่าที่มนุษย์แก้)
  v_effective := coalesce(v_payload, '{}'::jsonb) || coalesce(p_corrected_fields, '{}'::jsonb);

  select critical_fields into v_critical from public.capture_type_config where capture_type = v_type;

  v_has_critical_pending := false;
  if v_critical is not null then
    foreach cf in array v_critical loop
      if not (v_effective ? cf) or (v_effective ->> cf) is null then
        v_has_critical_pending := true;
        exit;
      end if;
    end loop;
  end if;

  select min(value::numeric) into v_min_conf from jsonb_each_text(coalesce(v_conf, '{}'::jsonb));

  -- มนุษย์แก้ค่า = มนุษย์ยืนยันเนื้อหาแล้วโดยพฤติกรรม แต่ยังคง explicit confirm ตามเดิม (ไม่ลดเกณฑ์)
  v_must_confirm := v_has_critical_pending
    or (v_min_conf is not null and v_min_conf < p_confidence_threshold)
    or coalesce(v_suspicious, false);

  if v_must_confirm and not p_human_confirmed then
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, detail)
    values (p_id, v_type, 'verify', v_principal,
      jsonb_build_object('result', 'confirm_required',
        'critical_pending', v_has_critical_pending, 'low_confidence', (v_min_conf is not null and v_min_conf < p_confidence_threshold),
        'suspicious', coalesce(v_suspicious, false)));
    raise exception 'capture: human confirm required (critical/low-confidence/suspicious)' using errcode = 'check_violation';
  end if;

  update public.capture_artifact
    set status = 'approved', reviewed_by = v_principal, reviewed_at = timezone('utc', now()),
        review_notes = p_review_notes, corrected_fields = p_corrected_fields
    where id = p_id;
  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'verify', v_principal, 'proposed', 'approved',
    jsonb_build_object('confirmed', p_human_confirmed,
      'corrected_count', case when p_corrected_fields is null then 0 else (select count(*) from jsonb_object_keys(p_corrected_fields)) end));
  return 'approved';
end;
$$;

revoke all on function public.rpc_capture_verify(uuid, text, boolean, numeric, text, jsonb) from public;
