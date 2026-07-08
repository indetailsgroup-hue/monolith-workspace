-- Migration: market_bands_wet_area — ADR-052: C18 ราคากลางตลาด + กติกาวัสดุพื้นที่เปียก
-- Rebase: rpc_field_price_estimate จาก 0115 · rpc_factory_estimate_package จาก 0145 (4→6 param, drop เก่า)
--         rpc_field_submit_cabinet_wall_list จาก 0144 (+wet-area rule)
--
-- (1) market_price_bands = กรอบราคาขายตลาด (C18 2568-69) — sanity check ไม่ใช่ราคาเรา
--     เรทจริง DAPH (job_cost_config/price_rates) คือความจริง; band มี effective_date ตลาดเปลี่ยนอัปเดตผ่าน rpc
-- (2) hard rule: ครัว/ห้องน้ำ + PB/พาร์ติเคิล/MDF(ไม่ HMR) = block (พังจริง 1-3 ปี = รื้อทำใหม่)

create table if not exists public.market_price_bands (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  grade_label text not null,              -- C/B/A/Premium/มาตรฐาน/พรีเมียม
  unit text not null check (unit in ('m', 'sqm')),
  price_min numeric not null check (price_min > 0),
  price_max numeric not null check (price_max >= price_min),
  source text not null default 'C18 Thailand Built-In Pricing Research',
  effective_date date not null default '2026-07-08',
  updated_by text not null default public.resolve_actor(),
  unique (category, grade_label)
);
alter table public.market_price_bands enable row level security;
create policy market_price_bands_sel on public.market_price_bands for select to authenticated using (true);

insert into public.market_price_bands (category, grade_label, unit, price_min, price_max) values
  ('ตู้สูง ไม่มีหน้าบาน',        'C', 'm', 13000, 15000),
  ('ตู้สูง ไม่มีหน้าบาน',        'B', 'm', 16000, 17000),
  ('ตู้สูง ไม่มีหน้าบาน',        'A', 'm', 18000, 19000),
  ('ตู้สูง ไม่มีหน้าบาน',        'Premium', 'm', 23000, 23000),
  ('ตู้สูง หน้าบานตอนเดียว',    'C', 'm', 18000, 19000),
  ('ตู้สูง หน้าบานตอนเดียว',    'B', 'm', 20000, 22000),
  ('ตู้สูง หน้าบานตอนเดียว',    'A', 'm', 22000, 24000),
  ('ตู้สูง หน้าบานตอนเดียว',    'Premium', 'm', 32000, 32000),
  ('ตู้สูง หน้าบาน 2-3 ตอน',    'C', 'm', 20000, 20000),
  ('ตู้สูง หน้าบาน 2-3 ตอน',    'B', 'm', 22000, 23000),
  ('ตู้สูง หน้าบาน 2-3 ตอน',    'A', 'm', 24000, 25000),
  ('ตู้สูง หน้าบาน 2-3 ตอน',    'Premium', 'm', 34000, 34000),
  ('ตู้เตี้ย/ตู้ลอย ไม่มีหน้าบาน', 'C', 'm', 8000, 8000),
  ('ตู้เตี้ย/ตู้ลอย ไม่มีหน้าบาน', 'B', 'm', 9000, 9000),
  ('ตู้เตี้ย/ตู้ลอย ไม่มีหน้าบาน', 'A', 'm', 10000, 10000),
  ('ตู้เตี้ย/ตู้ลอย ไม่มีหน้าบาน', 'Premium', 'm', 13000, 13000),
  ('ชุดตู้เตี้ย + ตู้แขวน',      'C', 'm', 9000, 10000),
  ('ชุดตู้เตี้ย + ตู้แขวน',      'B', 'm', 11000, 12000),
  ('ชุดตู้เตี้ย + ตู้แขวน',      'A', 'm', 12000, 14000),
  ('ชุดตู้เตี้ย + ตู้แขวน',      'Premium', 'm', 19000, 19000),
  ('เคาน์เตอร์/โต๊ะแต่งตัว',     'C', 'm', 10000, 15000),
  ('เคาน์เตอร์/โต๊ะแต่งตัว',     'B', 'm', 14000, 17000),
  ('เคาน์เตอร์/โต๊ะแต่งตัว',     'A', 'm', 16000, 20000),
  ('เคาน์เตอร์/โต๊ะแต่งตัว',     'Premium', 'm', 25000, 25000),
  ('ชุดตู้ครัว (บน+ล่าง)',       'C', 'm', 20000, 20000),
  ('ชุดตู้ครัว (บน+ล่าง)',       'B', 'm', 22000, 24000),
  ('ชุดตู้ครัว (บน+ล่าง)',       'A', 'm', 25000, 26000),
  ('ชุดตู้ครัว (บน+ล่าง)',       'Premium', 'm', 36000, 36000),
  ('ตู้เสื้อผ้า',                'มาตรฐาน', 'm', 6000, 12000),
  ('ตู้เสื้อผ้า',                'พรีเมียม', 'm', 18000, 25000),
  ('ตู้/ผนังทีวี',               'มาตรฐาน', 'm', 8000, 20000),
  ('ตู้/ผนังทีวี',               'พรีเมียม', 'm', 20000, 35000),
  ('ผนังปิดผิวลามิเนต',          'ทั่วไป', 'sqm', 1500, 8500),
  ('ผนังทำสีพ่นอุตสาหกรรม',      'ทั่วไป', 'sqm', 3000, 4000),
  ('ผนังวีเนียร์ทำสีย้อม',        'ทั่วไป', 'sqm', 3000, 8000),
  ('ผนังไม้จริง/ระแนง',           'ทั่วไป', 'sqm', 5500, 8500),
  ('ผนังบุฟองน้ำหุ้มผ้า/หนัง',    'ทั่วไป', 'sqm', 4000, 8000),
  ('ตกแต่งเต็มพื้นที่ (ภาพรวม)',   'ทั่วไป', 'sqm', 8000, 25000)
on conflict (category, grade_label) do nothing;

-- อัปเดต band เมื่อตลาดเปลี่ยน (governance เท่านั้น — ตัวเลขนี้ไปโผล่ตอน SJ คุยลูกค้า)
create or replace function public.rpc_field_set_market_band(
  p_category text, p_grade text, p_unit text, p_min numeric, p_max numeric,
  p_source text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.market_price_bands (category, grade_label, unit, price_min, price_max, source, effective_date, updated_by)
  values (btrim(p_category), btrim(p_grade), p_unit, p_min, p_max,
    coalesce(p_source, 'manual update'), fn_business_date(), public.resolve_actor())
  on conflict (category, grade_label) do update set
    unit = excluded.unit, price_min = excluded.price_min, price_max = excluded.price_max,
    source = excluded.source, effective_date = excluded.effective_date, updated_by = excluded.updated_by;
end; $$;

create or replace function public.rpc_field_market_bands(p_unit text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(row_to_json(b) order by b.category, b.price_min) from (
    select category, grade_label, unit, price_min, price_max, effective_date
    from public.market_price_bands
    where p_unit is null or unit = p_unit) b), '[]'::jsonb);
end; $$;

-- ---------------------------------------------------------------------------
-- rebase rpc_field_price_estimate จาก 0115: + market bands (sqm) + hidden-cost reminder
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_price_estimate(
  p_sqm numeric, p_grade text, p_context text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_min numeric; v_max numeric;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_sqm, 0) <= 0 then
    raise exception 'พื้นที่ต้องมากกว่า 0 ตร.ม.' using errcode = 'check_violation';
  end if;
  select * into v_r from public.price_rates where material_grade = btrim(p_grade);
  if not found then
    raise exception 'ยังไม่มีเรทของเกรด "%" — ให้ B4/PM ตั้งเรทก่อน (fail-safe no-guess)', p_grade
      using errcode = 'no_data_found';
  end if;
  v_min := round(p_sqm * v_r.rate_min_per_sqm, -2);  -- ปัดร้อยบาท
  v_max := round(p_sqm * v_r.rate_max_per_sqm, -2);

  -- มติ Sale-1: ทุกตัวเลขที่ถึงหูลูกค้าต้องมี snapshot
  insert into public.installation_audit_log (event_type, detail)
  values ('price_estimate_issued', jsonb_build_object(
    'sqm', p_sqm, 'grade', btrim(p_grade), 'min', v_min, 'max', v_max,
    'rate_version', v_r.updated_at, 'context', left(coalesce(p_context, ''), 120)));

  return jsonb_build_object('min', v_min, 'max', v_max,
    'message', format('งานประมาณ %s–%s บาท (พื้นที่ %s ตร.ม. เกรด %s) — ราคายืนยันหลังวัดหน้างานจริงครับ',
      to_char(v_min, 'FM999,999,999'), to_char(v_max, 'FM999,999,999'), p_sqm, btrim(p_grade)),
    -- ADR-052: กรอบตลาด (sqm) ให้ SJ เทียบตอนคุย + เตือนต้นทุนแฝงก่อนออกใบเสนอราคา
    'market_bands_sqm', (select coalesce(jsonb_agg(jsonb_build_object(
        'category', category, 'min', price_min, 'max', price_max) order by price_min), '[]'::jsonb)
      from public.market_price_bands where unit = 'sqm'),
    'hidden_cost_note', 'ตัวเลขนี้ยังไม่รวม: ค่าดำเนินการ ~10% · VAT 7% · ต่างจังหวัด +20% — เช็คให้ครบก่อนออกใบเสนอราคา (C18)');
end; $$;

-- ---------------------------------------------------------------------------
-- rebase rpc_factory_estimate_package จาก 0145 (4→6 param): + band sanity check
-- ---------------------------------------------------------------------------
create or replace function public.rpc_factory_estimate_package(
  p_package_id uuid,
  p_stage_hours jsonb,
  p_material_est numeric default null,
  p_machine_allowance numeric default 0,
  p_band_category text default null,        -- หมวดใน market_price_bands (unit m)
  p_length_m numeric default null)          -- ความยาวเมตรวิ่งของ package
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
  v_rate numeric;
  v_hours numeric := 0;
  v_kv record;
  v_material numeric;
  v_mat_source text := 'manual';
  v_total numeric;
  v_band record;
  v_per_m numeric;
  v_band_warning text := null;
begin
  select w.id, w.code, w.project_id, p.site_code into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;
  if v_rate is null then
    raise exception 'ยังไม่ตั้งเรทแรงงาน — ประเมินไม่ได้ (fail-safe no-guess): rpc_field_set_labor_rate ก่อน'
      using errcode = 'no_data_found';
  end if;

  for v_kv in select key, value from jsonb_each_text(coalesce(p_stage_hours, '{}'::jsonb)) loop
    if not exists (select 1 from public.millwork_stage_defs d
      where d.stage = v_kv.key and d.seq between 7 and 10) then
      raise exception 'stage "%" ไม่ใช่ขั้นผลิต (7–10: machining/assembly/finishing/qc_shop)', v_kv.key
        using errcode = 'check_violation';
    end if;
    if v_kv.value::numeric < 0 then
      raise exception 'ชั่วโมงติดลบไม่ได้ (%)', v_kv.key using errcode = 'check_violation';
    end if;
    v_hours := v_hours + v_kv.value::numeric;
  end loop;
  if v_hours = 0 then
    raise exception 'ต้องมีชั่วโมงประเมินอย่างน้อย 1 ขั้น' using errcode = 'check_violation';
  end if;

  if p_material_est is not null then
    v_material := p_material_est;
  else
    select coalesce(sum(m.cost), 0) into v_material
    from public.package_materials m
    where m.package_id = p_package_id and m.cost is not null;
    v_mat_source := 'bom';
  end if;

  v_total := round(v_material + (v_hours * v_rate) + coalesce(p_machine_allowance, 0), 2);

  -- ADR-052: sanity check กับกรอบราคาขายตลาด (เตือน+audit ไม่ block — เรทจริงเราคือความจริง)
  if p_band_category is not null and coalesce(p_length_m, 0) > 0 then
    select min(price_min) as band_min, max(price_max) as band_max into v_band
    from public.market_price_bands where category = btrim(p_band_category) and unit = 'm';
    if v_band.band_min is null then
      raise exception 'ไม่พบหมวด "%" ใน market_price_bands — ดูรายการจาก rpc_field_market_bands', p_band_category
        using errcode = 'no_data_found';
    end if;
    v_per_m := round(v_total / p_length_m, 2);
    if v_per_m > v_band.band_max then
      v_band_warning := format('ต้นทุน %s บาท/เมตร สูงกว่าราคาขายตลาดทุกเกรด (%s–%s) — ขายไม่ได้กำไรแน่ ทบทวนก่อน',
        to_char(v_per_m, 'FM999,999,999'), to_char(v_band.band_min, 'FM999,999,999'), to_char(v_band.band_max, 'FM999,999,999'));
    elsif v_per_m > v_band.band_min then
      v_band_warning := format('ต้นทุน %s บาท/เมตร อยู่ในกรอบราคาขายตลาด (%s–%s) — margin บาง เช็คก่อนเสนอราคา',
        to_char(v_per_m, 'FM999,999,999'), to_char(v_band.band_min, 'FM999,999,999'), to_char(v_band.band_max, 'FM999,999,999'));
    end if;
    if v_band_warning is not null then
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('estimate_market_band_check', v_w.project_id, v_w.site_code,
        jsonb_build_object('package_id', p_package_id, 'category', btrim(p_band_category),
          'per_m', v_per_m, 'band_min', v_band.band_min, 'band_max', v_band.band_max));
    end if;
  end if;

  insert into public.package_estimates (package_id, material_est, material_source, stage_hours,
    labor_rate_snapshot, machine_allowance, total_est, estimated_by, estimated_at)
  values (p_package_id, v_material, v_mat_source, coalesce(p_stage_hours, '{}'::jsonb),
    v_rate, coalesce(p_machine_allowance, 0), v_total, public.resolve_actor(), timezone('utc', now()))
  on conflict (package_id) do update set
    material_est = excluded.material_est, material_source = excluded.material_source,
    stage_hours = excluded.stage_hours, labor_rate_snapshot = excluded.labor_rate_snapshot,
    machine_allowance = excluded.machine_allowance, total_est = excluded.total_est,
    estimated_by = excluded.estimated_by, estimated_at = excluded.estimated_at;

  update public.work_packages set estimated_cost = v_total where id = p_package_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('package_estimated', v_w.project_id, v_w.site_code,
    jsonb_build_object('package_id', p_package_id, 'code', v_w.code,
      'material', v_material, 'material_source', v_mat_source, 'hours', v_hours,
      'rate', v_rate, 'allowance', coalesce(p_machine_allowance, 0), 'total', v_total));
  return jsonb_build_object('package_id', p_package_id, 'total_est', v_total,
    'material', v_material, 'material_source', v_mat_source,
    'labor', round(v_hours * v_rate, 2), 'hours', v_hours,
    'band_warning', v_band_warning);
end; $$;

drop function if exists public.rpc_factory_estimate_package(uuid, jsonb, numeric, numeric);

-- ---------------------------------------------------------------------------
-- rebase rpc_field_submit_cabinet_wall_list จาก 0144: + wet-area material rule (Q2)
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
    -- ADR-052 Q2: พื้นที่เปียก + วัสดุไม่ทนชื้น = block (PB พังจริง 1-3 ปี = รื้อทำใหม่)
    v_room := lower(coalesce(v_item ->> 'room', ''));
    v_mat := lower(v_item ->> 'material');
    if v_room ~ 'ครัว|kitchen|ห้องน้ำ|bath|แพนทรี่|pantry' then
      if v_mat ~ '(^|[^a-z])pb([^a-z]|$)|particle|พาร์ติ' or (v_mat ~ 'mdf' and v_mat !~ 'hmr') then
        raise exception 'ชิ้นที่ % (%): ห้องเปียกใช้ "%" ไม่ได้ — พังใน 1-3 ปี ต้อง HMR / ไม้อัด / พลาสวูด (ADR-052)',
          v_i, v_item ->> 'room', v_item ->> 'material' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

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
  return jsonb_build_object('artifact_id', v_artifact, 'count', jsonb_array_length(p_items), 'already', false);
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_market_band(text, text, text, numeric, numeric, text)',
    'rpc_field_market_bands(text)',
    'rpc_field_price_estimate(numeric, text, text)',
    'rpc_factory_estimate_package(uuid, jsonb, numeric, numeric, text, numeric)',
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
