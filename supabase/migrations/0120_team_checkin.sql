-- Migration: team_checkin — DJ-1 check-in/out รวมทีมต่อบ้านต่อวัน (มติ D4-2)
-- Depends on: 0110 (roster — รายชื่อให้ติ๊ก), PK-2 (Job Cost — วางฐาน job_cost_entries ที่นี่)
--
--   หัวหน้ากดคนเดียว: เช้า "เข้างาน"+ติ๊กใครมา (จาก roster) · เย็น "เลิกงาน" — ช่างไม่ต้องทำอะไร (UX tenet)
--   ชั่วโมง×คน ต่อบ้าน → คูณเรทเข้า job_cost_entries อัตโนมัติ = P&L ต่อบ้านฝั่งแรงงานจริง
--   เรทยังไม่ตั้ง = บันทึก man-hours ไว้ก่อน amount ว่าง (fail-safe no-guess — F3 ตั้งเรทแล้ว PK-2 backfill ได้)
--   ปัดตกแล้ว: ช่างกดเอง+GPS (friction + PDPA พนักงาน)

-- ---------------------------------------------------------------------------
-- (1) ตาราง check-in ต่อบ้านต่อวัน + ฐาน Job Cost + config เรทแรงงาน
-- ---------------------------------------------------------------------------
create table if not exists public.site_checkins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  work_date date not null default (timezone('utc', now()))::date,
  checked_in_at timestamptz not null default timezone('utc', now()),
  checked_out_at timestamptz,
  members jsonb not null default '[]'::jsonb,   -- [{employee_id, display_name}] ติ๊กจาก roster
  member_count int not null default 0,
  man_hours numeric,                            -- คำนวณตอน checkout
  created_by text not null default public.resolve_actor(),
  unique (project_id, work_date)
);
alter table public.site_checkins enable row level security;
create policy site_checkins_sel on public.site_checkins for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create table if not exists public.job_cost_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  entry_type text not null check (entry_type in ('labor', 'material', 'rework', 'other')),
  work_date date not null,
  qty numeric not null,                 -- labor = man-hours
  rate numeric,                         -- null = เรทยังไม่ตั้งตอนบันทึก (backfill ได้)
  amount numeric,                       -- qty × rate
  source text not null,                 -- 'checkin' | 'rework_assessment' | ...
  ref_id uuid,
  note text,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.job_cost_entries enable row level security;
create policy job_cost_entries_sel on public.job_cost_entries for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));
-- Job Cost = ชั้นภายใน (ADR-043 R-2) — member ธรรมดาไม่เห็นต้นทุน

create table if not exists public.job_cost_config (
  id boolean primary key default true check (id),
  labor_rate_per_hour numeric check (labor_rate_per_hour is null or labor_rate_per_hour > 0),
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);
insert into public.job_cost_config (id) values (true) on conflict do nothing;
alter table public.job_cost_config enable row level security;
create policy job_cost_config_sel on public.job_cost_config for select to authenticated using (true);

create or replace function public.rpc_field_set_labor_rate(p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  update public.job_cost_config
  set labor_rate_per_hour = p_rate, updated_by = public.resolve_actor(), updated_at = timezone('utc', now())
  where id = true;
end; $$;

-- ---------------------------------------------------------------------------
-- (2) เช้า: เข้างาน + ติ๊กใครมา (idempotent ต่อวัน)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_team_checkin(
  p_project_id uuid, p_members jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
  v_n int;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  v_n := coalesce(jsonb_array_length(p_members), 0);
  if v_n = 0 then
    raise exception 'ติ๊กรายชื่อทีมที่มาอย่างน้อย 1 คน' using errcode = 'check_violation';
  end if;

  select id into v_id from public.site_checkins
  where project_id = p_project_id and work_date = (timezone('utc', now()))::date;
  if v_id is not null then
    return jsonb_build_object('checkin_id', v_id, 'already', true);
  end if;

  insert into public.site_checkins (project_id, site_code, members, member_count)
  values (p_project_id, v_p.site_code, p_members, v_n)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('team_checked_in', p_project_id, v_p.site_code,
    jsonb_build_object('checkin_id', v_id, 'member_count', v_n));
  return jsonb_build_object('checkin_id', v_id, 'member_count', v_n, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) เย็น: เลิกงาน → man-hours × เรท เข้า Job Cost อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_team_checkout(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_rate numeric;
  v_hours numeric;
  v_man_hours numeric;
begin
  select c.*, p.site_code as p_site into v_c
  from public.site_checkins c join public.installation_projects p on p.id = c.project_id
  where c.project_id = p_project_id and c.work_date = (timezone('utc', now()))::date
  for update;
  if not found then
    raise exception 'วันนี้ยังไม่ได้กดเข้างานของบ้านนี้' using errcode = 'no_data_found';
  end if;
  if not (public.is_governance_role() or public.has_site_access(v_c.p_site) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_c.checked_out_at is not null then
    return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_c.man_hours, 'already', true);
  end if;

  v_hours := round(extract(epoch from (timezone('utc', now()) - v_c.checked_in_at)) / 3600.0, 2);
  v_man_hours := round(v_hours * v_c.member_count, 2);
  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;

  update public.site_checkins
  set checked_out_at = timezone('utc', now()), man_hours = v_man_hours
  where id = v_c.id;

  insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, ref_id, note)
  values (p_project_id, v_c.p_site, 'labor', v_c.work_date, v_man_hours, v_rate,
    case when v_rate is not null then round(v_man_hours * v_rate, 2) end,
    'checkin', v_c.id,
    case when v_rate is null then 'เรทแรงงานยังไม่ตั้ง — F3 ตั้งแล้ว backfill (PK-2)' end);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('team_checked_out', p_project_id, v_c.p_site,
    jsonb_build_object('checkin_id', v_c.id, 'hours', v_hours,
      'member_count', v_c.member_count, 'man_hours', v_man_hours, 'rate', v_rate));
  return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_man_hours,
    'amount', case when v_rate is not null then round(v_man_hours * v_rate, 2) end, 'already', false);
end; $$;

-- สถานะวันนี้ (ป้อนปุ่ม next-action DJ-4: เช้า→เข้างาน / เย็น→เลิกงาน)
create or replace function public.rpc_field_today_checkin(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
      'checkin_id', c.id, 'checked_in_at', c.checked_in_at, 'checked_out_at', c.checked_out_at,
      'member_count', c.member_count, 'man_hours', c.man_hours)
    from public.site_checkins c
    join public.installation_projects p on p.id = c.project_id
    where c.project_id = p_project_id and c.work_date = (timezone('utc', now()))::date
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))), 'null'::jsonb);
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_labor_rate(numeric)',
    'rpc_field_team_checkin(uuid, jsonb)',
    'rpc_field_team_checkout(uuid)',
    'rpc_field_today_checkin(uuid)'
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
