-- Migration: field_submit_requirement — Wave A (c) (ADR-040; ฟอร์มใบบันทึกความต้องการของ Sale)
-- Depends on: 0053 (ingest — idempotent ตาม key), 0078 (verify + corrected_fields), 0094/0100 (promote ล่าสุด:
--             work_item_open + ผูก primary_customer_id), 0102 (field RPC ชุดแรก)
--
-- "Sale กรอกจบ = งานเปิด" — ห่อสามก้าวของ capture spine ใน tx เดียว (reuse-not-fork):
--   ingest ('customer_requirement','app') → verify ('approved', human_confirmed, corrected_fields=ฟอร์ม)
--   → promote (adapter 0092/0100: เปิด work_item + ผูกลูกค้า + PDPA แยกชั้น)
-- Manual entry ตาม ADR-033 (cloud_allowed=false): ค่าจากฟอร์ม = corrected_fields (ground truth โดยมนุษย์)
-- Idempotent ด้วย p_client_key (offline queue ของ PWA retry ได้ — ใบเดิม งานเดิม ไม่ซ้ำ)

create or replace function public.rpc_field_submit_requirement(
  p_fields jsonb,          -- ฟิลด์ตาม capture_type_config.customer_requirement (+customer_id optional)
  p_site_code text,
  p_client_key text        -- idempotency key จากฝั่ง client (uuid ต่อการกดส่งหนึ่งครั้ง)
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_artifact uuid;
  v_status text;
  v_wi uuid;
begin
  if not (public.is_governance_role() or (p_site_code is not null and public.has_site_access(p_site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_client_key, '') = '' then
    raise exception 'client key required (idempotency)' using errcode = 'check_violation';
  end if;

  -- fail-safe critical fields ที่ปากทาง (PFMEA Sale: เก็บไม่ครบ = Scrap 100%) — adapter เช็คซ้ำชั้นในอีกที
  if coalesce(btrim(p_fields ->> 'customer_name'), '') = '' then
    raise exception 'ต้องมีชื่อลูกค้า' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_fields ->> 'phone'), '') = '' and coalesce(btrim(p_fields ->> 'line_id'), '') = '' then
    raise exception 'ต้องมีช่องทางติดต่อ (เบอร์โทร หรือ LINE ID)' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_fields ->> 'project_name'), '') = '' then
    raise exception 'ต้องมีชื่อโครงการ/บ้าน' using errcode = 'check_violation';
  end if;

  -- ingest (idempotent ตาม key — เรียกซ้ำได้ใบเดิม)
  v_artifact := public.rpc_capture_ingest(
    'customer_requirement', 'app',
    'app://field/requirement/' || p_client_key,
    'field-req-' || p_client_key,
    p_site_code);

  select status::text into v_status from public.capture_artifact where id = v_artifact;

  -- retry หลังสำเร็จแล้ว → คืนผลเดิม (offline queue กดซ้ำ = no-op)
  if v_status = 'emitted' then
    select linked_entity_id into v_wi from public.capture_artifact where id = v_artifact;
    return jsonb_build_object('artifact_id', v_artifact, 'work_item_id', v_wi, 'already', true);
  end if;

  -- verify: มนุษย์ (Sale) ยืนยันเอง — ฟอร์มบังคับ critical แล้ว; ค่าเข้า corrected_fields (ADR-033)
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'field form (manual entry)', p_fields);
  end if;

  -- promote → เปิด work_item + ผูก primary_customer_id (0100)
  perform public.rpc_capture_promote(v_artifact);
  select linked_entity_id into v_wi from public.capture_artifact where id = v_artifact;

  return jsonb_build_object('artifact_id', v_artifact, 'work_item_id', v_wi, 'already', false);
end; $$;

revoke all on function public.rpc_field_submit_requirement(jsonb, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_submit_requirement(jsonb, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_submit_requirement(jsonb, text, text) to service_role';
  end if;
end $$;
