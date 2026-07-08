-- Migration: factory_queue — Phase BQ (ADR-047): คิวผลิต · BOM วัสดุจริง · capacity view · หน้า B4
-- Depends on: 0128 (packages/stages — rebase stage_done ที่นี่), 0112 (แผนติดตั้ง = คำสัญญาเรียงคิว),
--             0120/0129 (job_cost_entries), 0121 (rpc_field_raise_issue — ของขาด)

-- ---------------------------------------------------------------------------
-- (1) คิว: override ราย package + RPC จัดคิว (มติ 1)
-- ---------------------------------------------------------------------------
alter table public.work_packages add column if not exists queue_override numeric;

create or replace function public.rpc_factory_set_queue_rank(
  p_package_id uuid, p_rank numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_w record;
begin
  select w.id, w.code, w.project_id, p.site_code into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'override คิวต้องมีเหตุผล (ลง audit)' using errcode = 'check_violation';
  end if;
  update public.work_packages set queue_override = p_rank where id = p_package_id;
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('queue_overridden', v_w.project_id, v_w.site_code,
    jsonb_build_object('package_id', p_package_id, 'code', v_w.code, 'rank', p_rank,
      'reason', btrim(p_reason), 'by', public.resolve_actor()));
end; $$;

-- ---------------------------------------------------------------------------
-- (2) BOM: วัสดุจริงราย package (มติ 2)
-- ---------------------------------------------------------------------------
create table if not exists public.package_materials (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.work_packages(id),
  name text not null,
  qty numeric not null check (qty > 0),
  unit text not null default 'ชิ้น',
  status text not null default 'pending' check (status in ('pending', 'ordered', 'received')),
  cost numeric check (cost is null or cost >= 0),
  ordered_at timestamptz,
  received_at timestamptz,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.package_materials enable row level security;
create policy package_materials_sel on public.package_materials for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create or replace function public.rpc_factory_add_material(
  p_package_id uuid, p_name text, p_qty numeric, p_unit text default 'ชิ้น')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_w record;
  v_id uuid;
begin
  select w.id, p.site_code into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'ต้องมีชื่อวัสดุ' using errcode = 'check_violation';
  end if;
  insert into public.package_materials (package_id, name, qty, unit)
  values (p_package_id, btrim(p_name), p_qty, coalesce(nullif(btrim(p_unit), ''), 'ชิ้น'))
  returning id into v_id;
  return jsonb_build_object('material_id', v_id);
end; $$;

create or replace function public.rpc_factory_material_status(
  p_material_id uuid, p_status text, p_cost numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_m record;
begin
  select m.*, w.project_id, w.code as pkg_code, p.site_code as p_site into v_m
  from public.package_materials m
  join public.work_packages w on w.id = m.package_id
  join public.installation_projects p on p.id = w.project_id
  where m.id = p_material_id for update;
  if not found then raise exception 'material not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_m.p_site) or public.fn_installation_is_member(v_m.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('ordered', 'received') then
    raise exception 'สถานะต้องเป็น ordered หรือ received' using errcode = 'check_violation';
  end if;
  if v_m.status = 'received' then
    return jsonb_build_object('material_id', p_material_id, 'already', true);
  end if;

  update public.package_materials
  set status = p_status,
      cost = coalesce(p_cost, cost),
      ordered_at = case when p_status = 'ordered' then timezone('utc', now()) else ordered_at end,
      received_at = case when p_status = 'received' then timezone('utc', now()) else received_at end
  where id = p_material_id;

  -- รับของพร้อมราคา → Job Cost ราย package อัตโนมัติ (มติ 2)
  if p_status = 'received' and coalesce(p_cost, 0) > 0 then
    insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, ref_id, note)
    values (v_m.project_id, v_m.p_site, 'material', public.fn_business_date(), v_m.qty, null, p_cost,
      'bom_received', v_m.package_id, v_m.pkg_code || ': ' || v_m.name);
  end if;
  return jsonb_build_object('material_id', p_material_id, 'status', p_status, 'already', false);
end; $$;

-- ของขาด/ของผิด กดปุ่มเดียว → issue material เดิม (route E6/E2/E7 อัตโนมัติ — 0121)
create or replace function public.rpc_factory_material_shortage(p_material_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m record;
begin
  select m.*, w.project_id, w.code as pkg_code into v_m
  from public.package_materials m join public.work_packages w on w.id = m.package_id
  where m.id = p_material_id;
  if not found then raise exception 'material not found' using errcode = 'no_data_found'; end if;
  return public.rpc_field_raise_issue(v_m.project_id, 'material',
    v_m.pkg_code || ' — ' || v_m.name || ' (' || v_m.qty || ' ' || v_m.unit || ') ' || coalesce(btrim(p_note), 'ของขาด/ไม่ครบ'));
end; $$;

-- ---------------------------------------------------------------------------
-- (3) rebase rpc_field_package_stage_done (0128→0139): เริ่มตัดทั้งที่ของไม่ครบ = เตือน+audit ไม่ block
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_package_stage_done(
  p_package_id uuid, p_stage text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
  v_s record;
  v_prev_pending int;
  v_mat_missing int := 0;
begin
  select w.*, p.site_code as p_site into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id for update;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.p_site) or public.fn_installation_is_member(v_w.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select s.*, d.is_gate, d.label_th into v_s
  from public.package_stages s join public.millwork_stage_defs d on d.stage = s.stage
  where s.package_id = p_package_id and s.stage = p_stage;
  if not found then raise exception 'stage % ไม่อยู่ใน 12 ขั้น', p_stage using errcode = 'no_data_found'; end if;
  if v_s.status = 'done' then
    return jsonb_build_object('stage', p_stage, 'already', true);
  end if;

  select count(*) into v_prev_pending from public.package_stages s
  where s.package_id = p_package_id and s.seq < v_s.seq and s.status <> 'done';
  if v_prev_pending > 0 then
    raise exception 'ยังมี % ขั้นก่อนหน้าที่ไม่เสร็จ — ติ๊กตามลำดับ (ขั้นนี้: %)', v_prev_pending, v_s.label_th
      using errcode = 'check_violation';
  end if;

  -- ADR-047 มติ 2: เริ่มตัด (machining) ทั้งที่ของไม่ครบ = เตือน + audit (soft — ไม่ block)
  if p_stage = 'machining' then
    select count(*) into v_mat_missing from public.package_materials m
    where m.package_id = p_package_id and m.status <> 'received';
    if v_mat_missing > 0 then
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('machining_started_material_incomplete', v_w.project_id, v_w.p_site,
        jsonb_build_object('package_id', p_package_id, 'code', v_w.code, 'missing', v_mat_missing));
    end if;
  end if;

  update public.package_stages
  set status = 'done', done_by = public.resolve_actor(), done_at = timezone('utc', now()), note = p_note
  where id = v_s.id;

  if v_s.is_gate then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('package_gate_passed', v_w.project_id, v_w.p_site,
      jsonb_build_object('package_id', p_package_id, 'code', v_w.code, 'stage', p_stage,
        'by', public.resolve_actor(), 'note', left(coalesce(p_note, ''), 120)));
  end if;

  if not exists (select 1 from public.package_stages s
    where s.package_id = p_package_id and s.status <> 'done') then
    update public.work_packages set status = 'done' where id = p_package_id;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('package_done', v_w.project_id, v_w.p_site,
      jsonb_build_object('package_id', p_package_id, 'code', v_w.code));
  end if;

  return jsonb_build_object('stage', p_stage, 'already', false, 'is_gate', v_s.is_gate,
    'material_warning', case when v_mat_missing > 0 then 'ของยังไม่ครบ ' || v_mat_missing || ' รายการ (บันทึกใน audit แล้ว)' end);
end; $$;

-- ---------------------------------------------------------------------------
-- (4) คิว + โหลด + หน้า B4 (มติ 1/3/4)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_factory_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    -- ① คิว: override ก่อน → วันติดตั้งใกล้สุด → ไม่มีแผน = ท้ายคิว
    'queue', coalesce((select jsonb_agg(row_to_json(q) order by
        q.queue_override asc nulls last, q.install_date asc nulls last, q.created_at) from (
      select w.id as package_id, w.code, w.name, w.queue_override, w.created_at,
        p.id as project_id, p.name as project_name,
        (select pl.start_date from public.installation_plans pl
          where pl.project_id = p.id and pl.status = 'sent'
          order by pl.version desc limit 1) as install_date,
        (select d.label_th from public.package_stages s
          join public.millwork_stage_defs d on d.stage = s.stage
          where s.package_id = w.id and s.status = 'pending' order by s.seq limit 1) as current_stage,
        not exists (select 1 from public.package_materials m
          where m.package_id = w.id and m.status <> 'received') as materials_ready,
        (select count(*) from public.package_materials m where m.package_id = w.id) as material_count
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      where w.status = 'active'
        and (public.is_governance_role() or public.has_site_access(p.site_code))) q), '[]'::jsonb),
    -- ② วัสดุรอสั่ง/รอรับ
    'materials_pending', coalesce((select jsonb_agg(row_to_json(m) order by m.status desc, m.created_at) from (
      select pm.id as material_id, pm.name, pm.qty, pm.unit, pm.status, pm.created_at,
        w.code as package_code, p.name as project_name
      from public.package_materials pm
      join public.work_packages w on w.id = pm.package_id
      join public.installation_projects p on p.id = w.project_id
      where pm.status <> 'received' and w.status = 'active'
        and (public.is_governance_role() or public.has_site_access(p.site_code))) m), '[]'::jsonb),
    -- ③ โหลดต่อสถานีผลิต (ขั้น 7–10 ที่เป็นขั้นปัจจุบัน — คอขวดเห็นชัด)
    'load', coalesce((select jsonb_object_agg(l.label_th, l.n) from (
      select d.label_th, count(*) as n
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      cross join lateral (
        select s.stage from public.package_stages s
        where s.package_id = w.id and s.status = 'pending' order by s.seq limit 1
      ) cur
      join public.millwork_stage_defs d on d.stage = cur.stage
      where w.status = 'active' and d.seq between 7 and 10
        and (public.is_governance_role() or public.has_site_access(p.site_code))
      group by d.label_th, d.seq order by d.seq) l), '{}'::jsonb));
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_set_queue_rank(uuid, numeric, text)',
    'rpc_factory_add_material(uuid, text, numeric, text)',
    'rpc_factory_material_status(uuid, text, numeric)',
    'rpc_factory_material_shortage(uuid, text)',
    'rpc_factory_home()'
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
