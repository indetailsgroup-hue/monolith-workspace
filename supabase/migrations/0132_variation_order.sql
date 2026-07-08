-- Migration: variation_order — R-4 (ADR-044): เอกสาร scope change ของจริง ปิดวรรค "ห้ามตกลงปากเปล่า"
-- Depends on: 0117 (pattern generate จากข้อมูลก้อนเดียว + เซ็น→capture), 0092 (capture spine), 0107 (fn_prod_curated)
--
--   ที่มา: C10-04 Variation Order (kit) — กฎตรงมติเดิมทุกข้อ: ไม่เริ่มงานส่วนที่เปลี่ยนจนกว่าอนุมัติ ·
--   price/time impact ชัด · แนบหลักฐาน; เชื่อมเส้น requote ADR-037 (DJ-3 scope issue / BJ-2 shop drawing
--   กระทบของที่ลูกค้าเซ็น → จุดจบที่ถูกต้องคือ VO ใบนี้)
--   การปรับงวดหลัง approve = F3 ปรับแผนผ่านเส้น 0108 เดิม (ลูกค้า 50/30/15/5 SSOT ยืน — R-2)

-- ---------------------------------------------------------------------------
-- (1) capture type + ตาราง VO
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'signed_variation_order',
  jsonb_build_object('project_id','string','vo_number','string','note','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'รูปใบ Variation Order ที่ลูกค้าเซ็นจริง ตรงกับฉบับที่ระบบ generate',
    'guards_against', 'งานเพิ่มที่ไม่เคยถูกคิดเงิน / ตกลงปากเปล่าแล้วเถียงกันตอน dispute (รูรั่วคลาสสิก D4-4)',
    'method', 'Sale/PM ถ่ายรูป VO ที่เซ็นครบ แนบเลขที่ VO',
    'pfmea_ref', jsonb_build_object('source_file', 'ADR-044 R-4', 'source_step', 'Scope_Change'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 9)
  )),
  'evidence_only',
  array['project_id','vo_number']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create table if not exists public.variation_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  vo_number int not null,
  reason text not null check (reason in
    ('client_request', 'hidden_condition', 'design_change', 'substitution', 'schedule', 'other')),
  description text not null,
  price_impact numeric not null default 0,     -- + เพิ่ม / - ลด / 0 ไม่มีผลราคา
  time_impact_days int not null default 0,
  body text not null,                          -- เอกสารพร้อมพิมพ์ (snapshot)
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'superseded')),
  signed_artifact_id uuid,
  created_by text not null default public.resolve_actor(),
  sent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, vo_number)
);
alter table public.variation_orders enable row level security;
create policy variation_orders_sel on public.variation_orders for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- (2) generate จากข้อมูลก้อนเดียว (pattern 0117)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_create_variation(
  p_project_id uuid, p_reason text, p_description text,
  p_price_impact numeric default 0, p_time_impact_days int default 0)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_no int;
  v_id uuid;
  v_body text;
  v_line text := chr(10);
  v_reason_th text;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'ต้องมีรายละเอียดสิ่งที่เปลี่ยนจาก scope ที่อนุมัติ' using errcode = 'check_violation';
  end if;
  v_reason_th := case p_reason
    when 'client_request' then 'ลูกค้าขอเปลี่ยน/เพิ่ม'
    when 'hidden_condition' then 'สภาพหน้างานที่ซ่อนอยู่'
    when 'design_change' then 'ปรับแบบ'
    when 'substitution' then 'เปลี่ยนวัสดุ/สินค้าทดแทน'
    when 'schedule' then 'เร่ง/เลื่อนกำหนดการ'
    when 'other' then 'อื่นๆ' end;
  if v_reason_th is null then
    raise exception 'เหตุผลต้องเป็น: client_request / hidden_condition / design_change / substitution / schedule / other'
      using errcode = 'check_violation';
  end if;

  update public.variation_orders set status = 'superseded'
  where project_id = p_project_id and status = 'draft';
  select coalesce(max(vo_number), 0) + 1 into v_no
  from public.variation_orders where project_id = p_project_id;

  v_body :=
    'ใบสั่งเปลี่ยนแปลงงาน (Variation Order) — VO-' || lpad(v_no::text, 3, '0') || v_line ||
    'บ้าน: ' || v_p.name || ' · วันที่ออก: ' || to_char(public.fn_business_date(), 'DD/MM/YYYY') || v_line || v_line ||
    'เหตุผล: ' || v_reason_th || v_line ||
    'รายละเอียดที่เปลี่ยนจาก scope ที่อนุมัติ:' || v_line || '  ' || btrim(p_description) || v_line || v_line ||
    'ผลกระทบราคา: ' || case when p_price_impact > 0 then '+' else '' end ||
      to_char(p_price_impact, 'FM999,999,999') || ' บาท' ||
      case when p_price_impact <> 0 then ' (การปรับงวดชำระจะแจ้งเป็นลายลักษณ์อักษรโดยฝ่ายการเงิน)' else '' end || v_line ||
    'ผลกระทบเวลา: ' || case when p_time_impact_days > 0 then '+' || p_time_impact_days || ' วัน'
      when p_time_impact_days < 0 then p_time_impact_days || ' วัน' else 'ไม่กระทบ' end || v_line || v_line ||
    '⚠️ เงื่อนไขสำคัญ: งานส่วนที่เปลี่ยนแปลงจะเริ่มดำเนินการหลังจากลูกค้าลงนามอนุมัติใบนี้เท่านั้น' || v_line ||
    'เอกสารนี้ generate จากระบบ IIMOS — เชื่อมกับบันทึกโครงการและแผนงวดชุดเดียวกัน';

  insert into public.variation_orders (project_id, site_code, vo_number, reason, description,
    price_impact, time_impact_days, body)
  values (p_project_id, v_p.site_code, v_no, p_reason, btrim(p_description),
    coalesce(p_price_impact, 0), coalesce(p_time_impact_days, 0), v_body)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_created', p_project_id, v_p.site_code,
    jsonb_build_object('vo_id', v_id, 'vo_number', v_no, 'reason', p_reason,
      'price_impact', p_price_impact, 'time_impact_days', p_time_impact_days));
  return jsonb_build_object('vo_id', v_id, 'vo_number', v_no, 'body', v_body);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) ส่งแจ้งลูกค้า + บันทึกรูปเซ็น = approved (idempotent — pattern 0117/0130)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_send_variation(p_vo_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_v record;
begin
  select v.*, p.name as p_name into v_v
  from public.variation_orders v join public.installation_projects p on p.id = v.project_id
  where v.id = p_vo_id for update;
  if not found then raise exception 'VO not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_v.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_v.status = 'sent' then return jsonb_build_object('vo_id', p_vo_id, 'already', true); end if;
  if v_v.status <> 'draft' then
    raise exception 'VO สถานะ % — ส่งได้เฉพาะ draft ล่าสุด', v_v.status using errcode = 'check_violation';
  end if;

  update public.variation_orders set status = 'sent', sent_at = timezone('utc', now()) where id = p_vo_id;

  perform public.fn_prod_curated(v_v.project_id, 'tpl_variation_order', jsonb_build_object(
    'project_name', v_v.p_name, 'vo_number', lpad(v_v.vo_number::text, 3, '0'),
    'price_impact', case when v_v.price_impact > 0 then '+' else '' end || to_char(v_v.price_impact, 'FM999,999,999')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_sent', v_v.project_id, v_v.site_code,
    jsonb_build_object('vo_id', p_vo_id, 'vo_number', v_v.vo_number));
  return jsonb_build_object('vo_id', p_vo_id, 'already', false);
end; $$;

create or replace function public.rpc_field_submit_signed_variation(
  p_project_id uuid, p_client_key text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_v record;
  v_artifact uuid;
  v_status text;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v_v from public.variation_orders
  where project_id = p_project_id and status in ('sent', 'approved')
  order by vo_number desc limit 1;
  if v_v.id is null then
    raise exception 'ยังไม่มี VO ฉบับที่ส่งแล้วของบ้านนี้ — สร้าง + ส่งก่อน' using errcode = 'no_data_found';
  end if;
  if v_v.status = 'approved' and v_v.signed_artifact_id is not null then
    return jsonb_build_object('artifact_id', v_v.signed_artifact_id, 'vo_id', v_v.id,
      'vo_number', v_v.vo_number, 'already', true);
  end if;

  v_artifact := public.rpc_capture_ingest('signed_variation_order', 'app',
    'app://field/vo/' || coalesce(p_client_key, gen_random_uuid()::text),
    'vo-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'รูป VO เซ็นแล้ว (field app)',
      jsonb_build_object('project_id', p_project_id::text,
        'vo_number', v_v.vo_number::text, 'note', coalesce(p_note, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  update public.variation_orders
  set status = 'approved', approved_at = timezone('utc', now()), signed_artifact_id = v_artifact
  where id = v_v.id;

  -- snapshot ครบใน audit — F3 ใช้ปรับแผนงวดผ่านเส้น 0108 (SSOT ยืน — R-2)
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_approved', p_project_id, v_p.site_code,
    jsonb_build_object('vo_id', v_v.id, 'vo_number', v_v.vo_number,
      'price_impact', v_v.price_impact, 'time_impact_days', v_v.time_impact_days,
      'note', 'ปรับงวด = F3 ผ่าน rpc_field_set_payment_plan/บันทึกรับ เส้น 0108 เดิม'));
  return jsonb_build_object('artifact_id', v_artifact, 'vo_id', v_v.id,
    'vo_number', v_v.vo_number, 'already', false);
end; $$;

create or replace function public.rpc_field_list_variations(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'vo_id', v.id, 'vo_number', v.vo_number, 'reason', v.reason, 'status', v.status,
    'price_impact', v.price_impact, 'time_impact_days', v.time_impact_days,
    'body', v.body, 'sent_at', v.sent_at, 'approved_at', v.approved_at) order by v.vo_number desc), '[]'::jsonb)
  from public.variation_orders v
  join public.installation_projects p on p.id = v.project_id
  where v.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(p.site_code)
         or public.fn_installation_is_member(p.id));
$$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_variation_order', null, '📋 บ้าน {{project_name}} มีใบสั่งเปลี่ยนแปลงงาน VO-{{vo_number}} (ผลกระทบราคา {{price_impact}} บาท) ครับ ทีมจะนำเอกสารให้ลงนาม — งานส่วนที่เปลี่ยนจะเริ่มหลังอนุมัติครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_create_variation(uuid, text, text, numeric, int)',
    'rpc_field_send_variation(uuid)',
    'rpc_field_submit_signed_variation(uuid, text, text)',
    'rpc_field_list_variations(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;
