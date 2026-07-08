-- Migration: strategy_renovation_addons — ADR-054: Renovation-first + Smart add-on + E-grade
-- Rebase: rpc_field_create_project 0102 (+p_project_type) · rpc_field_survey_handoff 0142 (+renovation gate)
--         rpc_field_submit_cabinet_wall_list 0148 (+e_grade) · tpl_review_referral (+มุมรีโนเวท)
--
-- Q1: project_type + survey รีโนเวทบังคับเช็คสภาพเดิม/ไฟเก่า/ขอบเขตรื้อ (กัน hidden_condition = เหตุ VO อันดับต้น)
--     referral: การ์ด J2.11 มีอยู่แล้ว (0114/0115) → เสริมมุม "รีโนเวทห้องถัดไป ลูกค้าเก่าราคาพิเศษ"
-- Q2: addon_catalog 3 ตัวเริ่ม — SJ เสนอ upsell ท้าย quote (ticket +10–25% ไม่เพิ่มงานไม้)
-- Q3: E-grade ต่อชิ้นใน cabinet list — E2 = block (Nakhara: 4/5 เกินเกณฑ์ WHO), ไม่ระบุ = เตือน+audit

-- ---------------------------------------------------------------------------
-- (1) project_type + create_project rebase (0102)
-- ---------------------------------------------------------------------------
alter table public.installation_projects add column if not exists project_type text not null default 'new_build'
  check (project_type in ('new_build', 'renovation'));

create or replace function public.rpc_field_create_project(
  p_name text,
  p_site_code text,
  p_foreman_employee_id uuid default null,
  p_customer_work_item_id uuid default null,
  p_use_preset boolean default true,
  p_project_type text default 'new_build')   -- ADR-054: renovation = แกนกลยุทธ์ 2569
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_room record;
  v_room_id uuid;
  v_lane int;
  v_tpl text;
begin
  if not (public.is_governance_role() or (p_site_code is not null and public.has_site_access(p_site_code))) then
    raise exception 'insufficient permission to create installation project' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'project name required' using errcode = 'check_violation';
  end if;
  if p_project_type not in ('new_build', 'renovation') then
    raise exception 'project_type ต้องเป็น new_build หรือ renovation' using errcode = 'check_violation';
  end if;

  insert into public.installation_projects (site_code, name, foreman_employee_id, work_item_id, project_type)
  values (p_site_code, btrim(p_name), p_foreman_employee_id, p_customer_work_item_id, p_project_type)
  returning id into v_id;

  if p_use_preset then
    for v_room in select * from (values
      ('kitchen', 'ห้องครัว', 1), ('living', 'ห้องนั่งเล่น', 2),
      ('master_bedroom', 'ห้องนอนใหญ่', 3), ('bedroom_2', 'ห้องนอน 2', 4), ('bedroom_3', 'ห้องนอน 3', 5)
    ) as t(room_type, display_name, sort_order) loop
      insert into public.installation_rooms (project_id, site_code, room_type, display_name, sort_order)
      values (v_id, p_site_code, v_room.room_type, v_room.display_name, v_room.sort_order)
      returning id into v_room_id;

      for v_lane in 1..3 loop
        v_tpl := case when v_room.room_type = 'kitchen' then 'inst_kitchen_tech' else 'inst_room_tech' end || v_lane;
        insert into public.installation_tasks (room_id, site_code, lane, template_ref)
        values (v_room_id, p_site_code, v_lane, v_tpl);
      end loop;
    end loop;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('project_created', v_id, p_site_code,
    jsonb_build_object('name', btrim(p_name), 'preset', p_use_preset, 'foreman', p_foreman_employee_id,
      'project_type', p_project_type));
  return v_id;
end; $$;

-- ---------------------------------------------------------------------------
-- (2) survey_handoff rebase (0142): งานรีโนเวทต้องเช็ค 3 เรื่องก่อนส่งมอบ
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_survey_handoff(
  p_project_id uuid, p_summary text, p_client_key text default null,
  p_renovation_check jsonb default null)   -- {existing_structure, old_wiring, demolition_scope}
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_zones int;
  v_d record;
  v_missing text[];
begin
  select id, site_code, name, work_item_id, project_type into v_p
  from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_summary), '') = '' then
    raise exception 'ต้องมีสรุปผลการวัด' using errcode = 'check_violation';
  end if;

  -- ADR-054: รีโนเวท = hidden_condition คือเหตุ VO อันดับต้น — วัดให้เห็นก่อนเซ็น ไม่ใช่เจอตอนรื้อ
  if v_p.project_type = 'renovation' then
    select array_agg(f) into v_missing from unnest(array[
      'existing_structure', 'old_wiring', 'demolition_scope']) f
    where coalesce(btrim(coalesce(p_renovation_check, '{}'::jsonb) ->> f), '') = '';
    if v_missing is not null then
      raise exception 'งานรีโนเวทต้องเช็คก่อนส่งมอบ: % (สภาพโครงสร้างเดิม / ระบบไฟเก่า / ขอบเขตรื้อถอน — กันงานงอกที่ลูกค้าไม่ได้ตกลง)',
        array_to_string(v_missing, ', ') using errcode = 'check_violation';
    end if;
  end if;

  select count(*) into v_zones from public.site_survey_zone z
  join public.capture_artifact a on a.id = z.source_capture_id
  where a.linked_entity_id = v_p.work_item_id and z.superseded_by is null;

  v_artifact := public.rpc_capture_ingest('survey_handoff', 'app',
    'app://field/survey-handoff/' || coalesce(p_client_key, gen_random_uuid()::text),
    'svh-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'จบวัด–ส่งมอบ (C1)',
      jsonb_build_object('project_id', p_project_id::text, 'summary', btrim(p_summary),
        'zone_count', v_zones::text,
        'renovation_check', coalesce(p_renovation_check, '{}'::jsonb)::text));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  for v_d in
    select r.employee_id from public.phase_rosters r
    where r.project_id = p_project_id and r.phase = 'design' and r.status in ('approved', 'active')
  loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_d.employee_id),
        'personal_responsibility', 'survey_handoff', 'tpl_survey_ready',
        jsonb_build_object('project_name', v_p.name, 'zones', v_zones::text),
        false, null, true, null, v_p.site_code);
    exception when others then null;
    end;
  end loop;

  update public.appointments set status = 'done', done_at = timezone('utc', now())
  where project_id = p_project_id and kind = 'survey' and status = 'scheduled'
    and scheduled_at <= timezone('utc', now());

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('survey_handed_off', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'summary', left(btrim(p_summary), 120),
      'renovation_check', p_renovation_check is not null));
  return jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) Smart add-on catalog + ผูกกับ package (Q2)
-- ---------------------------------------------------------------------------
create table if not exists public.addon_catalog (
  code text primary key,
  name text not null,
  description text not null default '',
  price numeric not null check (price >= 0),
  is_active boolean not null default true,
  updated_by text not null default public.resolve_actor()
);
alter table public.addon_catalog enable row level security;
create policy addon_catalog_sel on public.addon_catalog for select to authenticated using (true);

insert into public.addon_catalog (code, name, description, price) values
  ('addon_sensor_light', 'ไฟ LED + sensor ในตู้', 'เปิดเองเมื่อเปิดบาน — ราคาต่อจุด/ตู้', 1500),
  ('addon_soft_close', 'อัปเกรด soft-close', 'บานพับ/รางลิ้นชักนุ่ม — ราคาต่อบาน/ใบ', 350),
  ('addon_smart_lock', 'Smart lock ตู้/ลิ้นชัก', 'ล็อกดิจิทัลของมีค่า — ราคาต่อจุด', 4500)
on conflict (code) do nothing;

create table if not exists public.package_addons (
  package_id uuid not null references public.work_packages(id),
  addon_code text not null references public.addon_catalog(code),
  qty int not null default 1 check (qty > 0),
  price_each numeric not null,      -- snapshot ราคาตอนเสนอ — แก้ catalog ทีหลังไม่เพี้ยนย้อนหลัง
  added_by text not null default public.resolve_actor(),
  added_at timestamptz not null default timezone('utc', now()),
  primary key (package_id, addon_code)
);
alter table public.package_addons enable row level security;
create policy package_addons_sel on public.package_addons for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create or replace function public.rpc_field_addon_catalog()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'name', name, 'description', description, 'price', price) order by price), '[]'::jsonb)
  from public.addon_catalog where is_active;
$$;

create or replace function public.rpc_field_set_addon(
  p_code text, p_name text, p_description text, p_price numeric, p_active boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.addon_catalog (code, name, description, price, is_active, updated_by)
  values (btrim(p_code), btrim(p_name), coalesce(p_description, ''), p_price, p_active, public.resolve_actor())
  on conflict (code) do update set name = excluded.name, description = excluded.description,
    price = excluded.price, is_active = excluded.is_active, updated_by = excluded.updated_by;
end; $$;

create or replace function public.rpc_field_toggle_package_addon(
  p_package_id uuid, p_code text, p_qty int default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
  v_price numeric;
  v_attached boolean;
  v_total numeric;
begin
  select w.id, w.project_id, p.site_code into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.site_code)
          or public.fn_installation_is_member(v_w.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.package_addons where package_id = p_package_id and addon_code = btrim(p_code)) then
    delete from public.package_addons where package_id = p_package_id and addon_code = btrim(p_code);
    v_attached := false;
  else
    select price into v_price from public.addon_catalog where code = btrim(p_code) and is_active;
    if v_price is null then
      raise exception 'ไม่พบ add-on "%" — ดูรายการจาก rpc_field_addon_catalog', p_code using errcode = 'no_data_found';
    end if;
    insert into public.package_addons (package_id, addon_code, qty, price_each)
    values (p_package_id, btrim(p_code), greatest(coalesce(p_qty, 1), 1), v_price);
    v_attached := true;
  end if;

  select coalesce(sum(qty * price_each), 0) into v_total
  from public.package_addons where package_id = p_package_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('package_addon_toggled', v_w.project_id, v_w.site_code,
    jsonb_build_object('package_id', p_package_id, 'code', btrim(p_code),
      'attached', v_attached, 'addons_total', v_total));
  return jsonb_build_object('attached', v_attached, 'addons_total', v_total);
end; $$;

create or replace function public.rpc_field_package_addons(p_package_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'code', a.addon_code, 'name', c.name, 'qty', a.qty, 'price_each', a.price_each) order by a.added_at)
      from public.package_addons a join public.addon_catalog c on c.code = a.addon_code
      where a.package_id = p_package_id
        and exists (select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
          where w.id = a.package_id and (public.is_governance_role() or public.has_site_access(p.site_code)
            or public.fn_installation_is_member(p.id)))), '[]'::jsonb),
    'total', coalesce((select sum(a.qty * a.price_each) from public.package_addons a
      where a.package_id = p_package_id
        and exists (select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
          where w.id = a.package_id and (public.is_governance_role() or public.has_site_access(p.site_code)
            or public.fn_installation_is_member(p.id)))), 0));
$$;

-- ---------------------------------------------------------------------------
-- (4) cabinet_wall_list rebase (0148): + E-grade (Q3)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_submit_cabinet_wall_list(
  p_project_id uuid, p_items jsonb, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_item jsonb;
  v_missing text[];
  v_i int := 0;
  v_room text;
  v_mat text;
  v_e text;
  v_no_grade text[] := '{}';
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'ต้องมีรายการตู้/ผนังอย่างน้อย 1 ชิ้น' using errcode = 'check_violation';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    select array_agg(f) into v_missing from unnest(array[
      'cabinet_number','wall_size_number','material','functions_detail',
      'drawers_detail','fitting_detail','shelves_detail']) f
    where coalesce(btrim(v_item ->> f), '') = '';
    if v_missing is not null then
      raise exception 'ชิ้นที่ % ขาด: % (7 fields ตาม Master Matrix — ไม่ครบ = ต้นทางสั่งของผิด SEV 10)',
        v_i, array_to_string(v_missing, ', ') using errcode = 'check_violation';
    end if;
    -- ADR-052 Q2 + S12: พื้นที่เปียก + วัสดุไม่ทนชื้น = block
    v_room := lower(coalesce(v_item ->> 'room', ''));
    v_mat := lower(v_item ->> 'material');
    if v_room ~ 'ครัว|kitchen|ห้องน้ำ|bath|แพนทรี่|pantry' then
      if v_mat ~ '(^|[^a-z])pb([^a-z]|$)|particle|พาร์ติ|ปาร์ติ|ชิปบอร์ด|chipboard'
         or ((v_mat ~ 'mdf|เอ็มดีเอฟ') and v_mat !~ 'hmr|กันชื้น|ทนชื้น|v313') then
        raise exception 'ชิ้นที่ % (%): ห้องเปียกใช้ "%" ไม่ได้ — พังใน 1-3 ปี ต้อง HMR / MDF กันชื้น V313 / ไม้อัด / พลาสวูด (ADR-052)',
          v_i, v_item ->> 'room', v_item ->> 'material' using errcode = 'check_violation';
      end if;
    end if;
    -- ADR-054 Q3: E-grade — E2 = block (Nakhara: HCHO สูง 2-3 เท่า, 4/5 โครงการเกินเกณฑ์ WHO), ไม่ระบุ = เตือน
    v_e := upper(replace(coalesce(v_item ->> 'e_grade', ''), ' ', ''));
    if v_e = 'E2' then
      raise exception 'ชิ้นที่ % (%): ไม้ E2 ใช้ไม่ได้ — HCHO สูงเกินเกณฑ์สุขภาพ ต้อง E0 หรือ E1 (ADR-054)',
        v_i, v_item ->> 'cabinet_number' using errcode = 'check_violation';
    elsif v_e = '' then
      v_no_grade := v_no_grade || (v_item ->> 'cabinet_number');
    elsif v_e not in ('E0', 'E1') then
      raise exception 'ชิ้นที่ %: e_grade "%" ไม่รู้จัก — ใช้ E0 / E1 (E2 ห้าม)', v_i, v_item ->> 'e_grade'
        using errcode = 'check_violation';
    end if;
  end loop;

  if array_length(v_no_grade, 1) > 0 then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('e_grade_missing', p_project_id, v_p.site_code,
      jsonb_build_object('cabinets', v_no_grade));
  end if;

  v_artifact := public.rpc_capture_ingest('cabinet_wall_list', 'app',
    'app://field/cwl/' || coalesce(p_client_key, gen_random_uuid()::text),
    'cwl-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'cabinet & wall list (designer)',
      jsonb_build_object('project_id', p_project_id::text, 'items', p_items::text));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('cabinet_wall_list_submitted', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'count', jsonb_array_length(p_items)));
  return jsonb_build_object('artifact_id', v_artifact, 'count', jsonb_array_length(p_items), 'already', false,
    'e_grade_warning', case when array_length(v_no_grade, 1) > 0
      then 'ยังไม่ระบุมาตรฐานไม้ (E0/E1) ชิ้น: ' || array_to_string(v_no_grade, ', ') || ' — บันทึกใน audit แล้ว ระบุให้ครบก่อนสั่งของ'
      end);
end; $$;

-- ---------------------------------------------------------------------------
-- (5) template referral + สคริปต์สุขภาพ (Q1/Q3)
-- ---------------------------------------------------------------------------
update public.line_oa_message_templates
set body = 'สวัสดีครับ บ้าน {{project_name}} เข้าอยู่ 2 สัปดาห์แล้ว เป็นอย่างไรบ้างครับ 😊\n⭐ ถ้าพอใจ ฝากรีวิวให้ทีมงานหน่อยนะครับ\n🏠 แนะนำเพื่อนที่กำลังแต่งบ้าน: ให้เพื่อนแจ้งรหัส {{ref_code}} กับทีมงานได้เลยครับ\n🛠️ อยากต่อเติมหรือรีโนเวทห้องถัดไป ทักมาได้เลยครับ — ทีมเดิมรู้บ้านคุณดีที่สุด ลูกค้าเก่ามีราคาพิเศษครับ'
where template_key = 'tpl_review_referral'
  and body not like '%รีโนเวทห้องถัดไป%';

update public.customer_docs
set body = body || chr(10) || chr(10) ||
  '【สคริปต์สุขภาพ — ขายไม้ E0/E1 (ADR-054)】' || chr(10) ||
  'ใช้เมื่อ: ลูกค้า Mid ขึ้นไป / บ้านมีเด็กเล็ก-ผู้สูงอายุ / ลูกค้าถามความต่างของวัสดุ' || chr(10) ||
  '"ไม้ที่เราใช้เป็นมาตรฐาน E0/E1 ครับ คือปล่อยสารฟอร์มัลดีไฮด์ต่ำกว่าไม้ทั่วไป 2-3 เท่า — งานวิจัยในไทยพบว่าบิ้วอินส่วนใหญ่ช่วงเดือนแรกหลังติดตั้งมีค่าสารระเหยเกินเกณฑ์ WHO บ้านที่มีเด็กเล็กเรื่องนี้สำคัญมากครับ เราเลยไม่ใช้ไม้ E2 เลยทั้งระบบ"' || chr(10) ||
  'ห้าม: อ้างว่า "ปลอดสาร 100%" (ไม่จริง) — พูดได้แค่ "มาตรฐานปล่อยสารต่ำ E0/E1"'
where slug = 'sale_scripts'
  and body not like '%【สคริปต์สุขภาพ —%';

-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_create_project(text, text, uuid, uuid, boolean, text)',
    'rpc_field_survey_handoff(uuid, text, text, jsonb)',
    'rpc_field_addon_catalog()',
    'rpc_field_set_addon(text, text, text, numeric, boolean)',
    'rpc_field_toggle_package_addon(uuid, text, int)',
    'rpc_field_package_addons(uuid)',
    'rpc_field_submit_cabinet_wall_list(uuid, jsonb, text)'
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

drop function if exists public.rpc_field_create_project(text, text, uuid, uuid, boolean);
drop function if exists public.rpc_field_survey_handoff(uuid, text, text);
