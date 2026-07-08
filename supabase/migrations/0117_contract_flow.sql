-- Migration: contract_flow — SJ-3 สัญญาจากข้อมูลก้อนเดียว (มติ Sale-3)
-- Depends on: 0103/0113 (requirement corrected_fields), 0108 (payment plan + mark_contract_signed + งวด 1),
--             0092 (capture spine), 0107 (fn_prod_curated)
--
--   หลักมติ: "สัญญากับระบบไม่มีวันขัดกันเพราะมาจากข้อมูลก้อนเดียว"
--   generate: ดึง requirement (ลูกค้า/scope) + แผนงวดจริง (0108) + ประกัน 1 ปี (AS-2.1) → snapshot data+body ต่อ version
--   ส่งเข้ากลุ่ม = การ์ดแจ้ง (ตัวสัญญาเซ็นกระดาษตอนเจอหน้า — มติปัดตก e-signature)
--   เซ็นแล้ว: รูปเข้า capture `signed_contract` (immutable) + mark signed + การ์ดงวดมัดจำยิงอัตโนมัติ ในจังหวะเดียว

-- ---------------------------------------------------------------------------
-- (1) capture type + ตารางสัญญา
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'signed_contract',
  jsonb_build_object('project_id','string','contract_version','string','note','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'รูปสัญญาที่ลูกค้าเซ็นจริง ตรงกับฉบับที่ระบบ generate',
    'guards_against', 'สัญญานอกระบบ/คนละฉบับตอน dispute — เงื่อนไขเงิน/scope ไม่ตรงกับที่ระบบเดินงาน',
    'method', 'Sale ถ่ายรูปสัญญาที่เซ็นครบทุกหน้า แนบเลข version ของฉบับที่ generate',
    'pfmea_ref', jsonb_build_object('source_file', 'position-journeys Sale-3', 'source_step', 'Quotation_Contract'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 9)
  )),
  'evidence_only',
  array['project_id','contract_version']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  version int not null,
  data jsonb not null,          -- snapshot ก้อนข้อมูลที่ใช้ generate (ลูกค้า/scope/งวด/ประกัน)
  body text not null,           -- ตัวสัญญาพร้อมพิมพ์ (โครงร่าง v1 — ทนาย review แก้ที่ skeleton ครั้งเดียว)
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'superseded')),
  signed_artifact_id uuid,
  created_by text not null default public.resolve_actor(),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, version)
);
alter table public.contract_documents enable row level security;
create policy contract_documents_sel on public.contract_documents for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- (2) generate: requirement + แผนงวดจริง + ประกัน → snapshot ต่อ version
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_generate_contract(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_req jsonb;
  v_plan jsonb;
  v_total numeric;
  v_ver int;
  v_id uuid;
  v_body text;
  v_line text := chr(10);
begin
  select id, site_code, name, work_item_id into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  -- ข้อมูลลูกค้า/scope จากใบ requirement (ground truth โดยมนุษย์ — ADR-033)
  select a.corrected_fields into v_req from public.capture_artifact a
  where a.capture_type = 'customer_requirement' and a.linked_entity_id = v_p.work_item_id
  order by a.created_at desc limit 1;
  if v_req is null then
    raise exception 'ยังไม่มีใบบันทึกความต้องการของบ้านนี้ — สัญญาต้อง generate จากข้อมูลจริง' using errcode = 'no_data_found';
  end if;

  -- แผนงวดจริงจาก 0108 (ไม่มี = ให้ตั้งก่อน — สัญญาต้องมีเงื่อนไขเงินตรงกับระบบ)
  select jsonb_agg(jsonb_build_object('seq', i.seq, 'label', i.label, 'percent', i.percent, 'amount', i.amount) order by i.seq),
         sum(i.amount)
  into v_plan, v_total
  from public.payment_installments i where i.project_id = p_project_id;
  if v_plan is null then
    raise exception 'ยังไม่ตั้งแผนชำระ — ตั้งแผน 4 งวดก่อน (การ์ดการเงินในหน้าบ้าน)' using errcode = 'no_data_found';
  end if;

  update public.contract_documents set status = 'superseded'
  where project_id = p_project_id and status = 'draft';
  select coalesce(max(version), 0) + 1 into v_ver from public.contract_documents where project_id = p_project_id;

  v_body :=
    'สัญญาว่าจ้างผลิตและติดตั้งเฟอร์นิเจอร์ (โครงร่าง v1 — รอทนาย review skeleton)' || v_line ||
    'ฉบับที่ ' || v_ver || ' · บ้าน: ' || v_p.name || v_line || v_line ||
    'ผู้ว่าจ้าง: ' || coalesce(v_req ->> 'customer_name', '-') ||
    ' · ติดต่อ: ' || coalesce(v_req ->> 'phone', v_req ->> 'line_id', '-') || v_line ||
    'ที่อยู่หน้างาน: ' || coalesce(v_req ->> 'address', '-') || v_line ||
    'ขอบเขตงาน: ' || coalesce(v_req ->> 'design_scope_areas', '-') ||
    ' (' || coalesce(v_req ->> 'design_scope_sqm', '-') || ' ตร.ม.)' || v_line ||
    'วัสดุ: โครง ' || coalesce(v_req ->> 'carcass_material', '-') ||
    ' · ผิว ' || coalesce(v_req ->> 'surface_material', '-') ||
    ' · อุปกรณ์ ' || coalesce(v_req ->> 'fitting_brand', '-') || v_line || v_line ||
    'มูลค่าสัญญารวม: ' || to_char(v_total, 'FM999,999,999') || ' บาท แบ่งชำระ:' || v_line ||
    (select string_agg('  งวด ' || (e ->> 'seq') || ' · ' || (e ->> 'label') || ' — ' ||
        (e ->> 'percent') || '%% = ' || to_char((e ->> 'amount')::numeric, 'FM999,999,999') || ' บาท', v_line order by (e ->> 'seq')::int)
      from jsonb_array_elements(v_plan) e) || v_line || v_line ||
    'ประกัน: งานติดตั้ง/โครงตู้ DAPH 1 ปีนับจากวันตรวจรับ · อุปกรณ์ฟิตติ้งตามประกันแบรนด์ผู้ผลิต' || v_line ||
    'เอกสารนี้ generate จากระบบ IIMOS — ข้อมูลชุดเดียวกับที่ใช้เดินงานและแจ้งงวดอัตโนมัติ';

  insert into public.contract_documents (project_id, site_code, version, data, body)
  values (p_project_id, v_p.site_code, v_ver,
    jsonb_build_object('requirement', v_req, 'installments', v_plan, 'total', v_total,
      'warranty', 'DAPH 1 ปี + ฟิตติ้งตามแบรนด์'),
    v_body)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('contract_generated', p_project_id, v_p.site_code,
    jsonb_build_object('doc_id', v_id, 'version', v_ver, 'total', v_total));
  return jsonb_build_object('doc_id', v_id, 'version', v_ver, 'body', v_body);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) ส่งการ์ดแจ้งลูกค้า (ตัวจริงเซ็นกระดาษตอนพบหน้า) + บันทึกรูปเซ็นแล้ว = mark signed + งวด 1 ยิง
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_send_contract(p_doc_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d record;
begin
  select d.*, p.name as p_name into v_d
  from public.contract_documents d join public.installation_projects p on p.id = d.project_id
  where d.id = p_doc_id for update;
  if not found then raise exception 'contract not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_d.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_d.status = 'sent' then return jsonb_build_object('doc_id', p_doc_id, 'already', true); end if;
  if v_d.status <> 'draft' then
    raise exception 'ฉบับนี้สถานะ % — ส่งได้เฉพาะ draft ล่าสุด', v_d.status using errcode = 'check_violation';
  end if;

  update public.contract_documents set status = 'superseded'
  where project_id = v_d.project_id and status = 'sent';
  update public.contract_documents set status = 'sent', sent_at = timezone('utc', now()) where id = p_doc_id;

  perform public.fn_prod_curated(v_d.project_id, 'tpl_contract_ready',
    jsonb_build_object('project_name', v_d.p_name, 'version', v_d.version::text));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('contract_sent', v_d.project_id, v_d.site_code,
    jsonb_build_object('doc_id', p_doc_id, 'version', v_d.version));
  return jsonb_build_object('doc_id', p_doc_id, 'already', false);
end; $$;

create or replace function public.rpc_field_submit_signed_contract(
  p_project_id uuid, p_client_key text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_doc record;
  v_artifact uuid;
  v_status text;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  -- ฉบับล่าสุดที่ส่งหรือเซ็นแล้ว (retry หลังเซ็น = doc เป็น signed แล้ว — ต้องยังเข้าเส้น idempotent ได้)
  select * into v_doc from public.contract_documents
  where project_id = p_project_id and status in ('sent', 'signed')
  order by version desc limit 1;
  if v_doc.id is null then
    raise exception 'ยังไม่มีสัญญาฉบับที่ส่งแล้วของบ้านนี้ — generate + ส่งก่อน' using errcode = 'no_data_found';
  end if;
  if v_doc.status = 'signed' and v_doc.signed_artifact_id is not null then
    return jsonb_build_object('artifact_id', v_doc.signed_artifact_id, 'doc_id', v_doc.id,
      'version', v_doc.version, 'already', true);
  end if;

  v_artifact := public.rpc_capture_ingest('signed_contract', 'app',
    'app://field/contract/' || coalesce(p_client_key, gen_random_uuid()::text),
    'contract-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'รูปสัญญาเซ็นแล้ว (field app)',
      jsonb_build_object('project_id', p_project_id::text,
        'contract_version', v_doc.version::text, 'note', coalesce(p_note, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  update public.contract_documents
  set status = 'signed', signed_at = timezone('utc', now()), signed_artifact_id = v_artifact
  where id = v_doc.id;

  -- จังหวะเดียวจบ: mark signed → fn_payment_fire('contract_signed') → การ์ดงวดมัดจำ (0108, idempotent)
  perform public.rpc_field_mark_contract_signed(p_project_id);

  return jsonb_build_object('artifact_id', v_artifact, 'doc_id', v_doc.id,
    'version', v_doc.version, 'already', false);
end; $$;

create or replace function public.rpc_field_list_contracts(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'doc_id', d.id, 'version', d.version, 'status', d.status, 'body', d.body,
    'total', d.data ->> 'total', 'sent_at', d.sent_at, 'signed_at', d.signed_at) order by d.version desc), '[]'::jsonb)
  from public.contract_documents d
  join public.installation_projects p on p.id = d.project_id
  where d.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(p.site_code)
         or public.fn_installation_is_member(p.id));
$$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_contract_ready', null, '📄 สัญญาของบ้าน {{project_name}} (ฉบับที่ {{version}}) พร้อมแล้วครับ ทีมงานจะนำไปให้เซ็นตอนนัดพบ/วัดหน้างาน — เงื่อนไขงวดชำระตรงกับที่ระบบจะแจ้งอัตโนมัติทุกงวดครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_generate_contract(uuid)',
    'rpc_field_send_contract(uuid)',
    'rpc_field_submit_signed_contract(uuid, text, text)',
    'rpc_field_list_contracts(uuid)'
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
