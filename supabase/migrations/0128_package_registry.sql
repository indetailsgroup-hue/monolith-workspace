-- Migration: package_registry — PK-1 Package (MW-xxx) + millwork sub-process 12 ขั้น (ADR-043 R-1)
-- Depends on: 0090 (projects/work_item), 0120 (job_cost_entries.ref_id รับ package ได้), 0127 (shop drawing = gate G4 เดิม)
--
--   บ้านเดินด้วย 8 ขั้น canonical (คน/อนุมัติ/SLA — ไม่แตะ) · ชิ้นงานเดินด้วย 12 ขั้นใต้บ้าน (ของ/ต้นทุน/คุณภาพ)
--   Package ID (MW-xxx) เสียบ D-3 Packet Registry; data model อ้าง Home_Construction_Planner (takeoff/BOM/
--   cutlist/shop drawing log/finish schedule); shop drawing gate = G4 เดิม (0127); Production จริง = 6 สถานี (0107)
--   ลำดับขั้นบังคับ (ขั้นก่อนหน้าต้อง done) — เป็น checklist การผลิต ไม่ใช่ conditional gate

-- ---------------------------------------------------------------------------
-- (1) นิยาม 12 ขั้น (แก้ผ่าน migration เท่านั้น — schedule เป็น code ใน repo)
-- ---------------------------------------------------------------------------
create table if not exists public.millwork_stage_defs (
  seq int primary key check (seq between 1 and 12),
  stage text unique not null,
  label_th text not null,
  is_gate boolean not null default false   -- จุด review ราย stage (informational + audit)
);
insert into public.millwork_stage_defs (seq, stage, label_th, is_gate) values
  (1,  'takeoff',      'ถอดปริมาณ (takeoff)', false),
  (2,  'estimate',     'ประเมินต้นทุน', false),
  (3,  'shop_drawing', 'แบบผลิต (shop drawing — gate G4)', true),
  (4,  'drawing_approval', 'อนุมัติแบบผลิต', true),
  (5,  'bom',          'BOM / สั่งวัสดุ', false),
  (6,  'cutlist',      'ใบตัด (cutlist)', false),
  (7,  'machining',    'ตัด / CNC', false),
  (8,  'assembly',     'ประกอบ', false),
  (9,  'finishing',    'ทำสี / finish schedule', false),
  (10, 'qc_shop',      'QC โรงงาน', true),
  (11, 'delivery',     'จัดส่ง', false),
  (12, 'install_fit',  'ติดตั้ง / fit หน้างาน', true)
on conflict (seq) do update set stage = excluded.stage, label_th = excluded.label_th, is_gate = excluded.is_gate;
alter table public.millwork_stage_defs enable row level security;
create policy millwork_stage_defs_sel on public.millwork_stage_defs for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- (2) Package registry + สถานะขั้นราย package
-- ---------------------------------------------------------------------------
create table if not exists public.work_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  work_item_id uuid,
  site_code text,
  code text not null,                  -- 'MW-001' — เสียบ D-3 Packet Registry
  name text not null,                  -- เช่น 'ตู้ครัวล่าง ชุด L'
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, code)
);
alter table public.work_packages enable row level security;
create policy work_packages_sel on public.work_packages for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create table if not exists public.package_stages (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.work_packages(id),
  seq int not null,
  stage text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  done_by text,
  done_at timestamptz,
  note text,
  unique (package_id, stage)
);
alter table public.package_stages enable row level security;
create policy package_stages_sel on public.package_stages for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- (3) RPC: เปิด package (seed 12 ขั้น) · ติ๊กขั้น (บังคับลำดับ) · สถานะรวม
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_create_package(
  p_project_id uuid, p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
begin
  select id, site_code, work_item_id into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_code, '')) !~ '^MW-[0-9]{3}$' then
    raise exception 'รหัส package ต้องเป็นรูปแบบ MW-xxx (เช่น MW-001)' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'ต้องมีชื่อชิ้นงาน' using errcode = 'check_violation';
  end if;

  select id into v_id from public.work_packages
  where project_id = p_project_id and code = btrim(p_code);
  if v_id is not null then
    return jsonb_build_object('package_id', v_id, 'already', true);
  end if;

  insert into public.work_packages (project_id, work_item_id, site_code, code, name)
  values (p_project_id, v_p.work_item_id, v_p.site_code, btrim(p_code), btrim(p_name))
  returning id into v_id;

  insert into public.package_stages (package_id, seq, stage)
  select v_id, d.seq, d.stage from public.millwork_stage_defs d order by d.seq;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('package_created', p_project_id, v_p.site_code,
    jsonb_build_object('package_id', v_id, 'code', btrim(p_code), 'name', btrim(p_name)));
  return jsonb_build_object('package_id', v_id, 'already', false);
end; $$;

create or replace function public.rpc_field_package_stage_done(
  p_package_id uuid, p_stage text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w record;
  v_s record;
  v_prev_pending int;
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

  -- บังคับลำดับ: ขั้นก่อนหน้าต้อง done ครบ (checklist การผลิต — ข้ามขั้น = ของหาย/ต้นทุนหลุด)
  select count(*) into v_prev_pending from public.package_stages s
  where s.package_id = p_package_id and s.seq < v_s.seq and s.status <> 'done';
  if v_prev_pending > 0 then
    raise exception 'ยังมี % ขั้นก่อนหน้าที่ไม่เสร็จ — ติ๊กตามลำดับ (ขั้นนี้: %)', v_prev_pending, v_s.label_th
      using errcode = 'check_violation';
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

  -- ขั้นสุดท้ายเสร็จ → package done
  if not exists (select 1 from public.package_stages s
    where s.package_id = p_package_id and s.status <> 'done') then
    update public.work_packages set status = 'done' where id = p_package_id;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('package_done', v_w.project_id, v_w.p_site,
      jsonb_build_object('package_id', p_package_id, 'code', v_w.code));
  end if;

  return jsonb_build_object('stage', p_stage, 'already', false, 'is_gate', v_s.is_gate);
end; $$;

create or replace function public.rpc_field_package_status(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'package_id', w.id, 'code', w.code, 'name', w.name, 'status', w.status,
    'done_stages', (select count(*) from public.package_stages s where s.package_id = w.id and s.status = 'done'),
    'total_stages', (select count(*) from public.package_stages s where s.package_id = w.id),
    'current_stage', (select d.label_th from public.package_stages s
      join public.millwork_stage_defs d on d.stage = s.stage
      where s.package_id = w.id and s.status = 'pending' order by s.seq limit 1)
  ) order by w.code), '[]'::jsonb)
  from public.work_packages w
  join public.installation_projects p on p.id = w.project_id
  where w.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(p.site_code)
         or public.fn_installation_is_member(p.id));
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_create_package(uuid, text, text)',
    'rpc_field_package_stage_done(uuid, text, text)',
    'rpc_field_package_status(uuid)'
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
