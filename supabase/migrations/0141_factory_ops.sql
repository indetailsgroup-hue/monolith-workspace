-- Migration: factory_ops — Phase EQ (ADR-049): check-in โรงงานรวม (overhead กลาง) · หน้าโรงงานวันนี้ E2
-- Depends on: 0120 (pattern check-in + job_cost_config เรท), 0139 (rpc_factory_home — คิวเดียวกัน),
--             0107 (milestones — reported_by มีอยู่แล้ว), 0130 (fn_business_date)
--
--   รายงานสถานีคงเปิดใครก็ได้ (ไลน์ต้องไหล) — วินัยจากความ visible: E2 เห็นสรุปวันนี้
--   check-in รวมโรงงานต่อวัน ไม่ผูกบ้าน → man-hours = overhead กลาง (C6 กระจายตอนวิเคราะห์ — R-2)

-- ---------------------------------------------------------------------------
-- (1) check-in โรงงานรวมต่อวัน (E2 กดคนเดียว — ไม่ผูกบ้าน)
-- ---------------------------------------------------------------------------
create table if not exists public.factory_checkins (
  id uuid primary key default gen_random_uuid(),
  site_code text not null,
  work_date date not null default public.fn_business_date(),
  checked_in_at timestamptz not null default timezone('utc', now()),
  checked_out_at timestamptz,
  members jsonb not null default '[]'::jsonb,
  member_count int not null default 0,
  man_hours numeric,
  rate numeric,                          -- snapshot เรทตอน checkout (overhead กลาง — ไม่เข้า job_cost_entries รายบ้าน)
  amount numeric,
  created_by text not null default public.resolve_actor(),
  unique (site_code, work_date)
);
alter table public.factory_checkins enable row level security;
create policy factory_checkins_sel on public.factory_checkins for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

create or replace function public.rpc_factory_team_checkin(
  p_site_code text, p_members jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int;
begin
  if not (public.is_governance_role() or public.has_site_access(p_site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  v_n := coalesce(jsonb_array_length(p_members), 0);
  if v_n = 0 then
    raise exception 'ติ๊กรายชื่อทีมที่มาอย่างน้อย 1 คน' using errcode = 'check_violation';
  end if;
  select id into v_id from public.factory_checkins
  where site_code = p_site_code and work_date = public.fn_business_date();
  if v_id is not null then
    return jsonb_build_object('checkin_id', v_id, 'already', true);
  end if;
  insert into public.factory_checkins (site_code, members, member_count)
  values (p_site_code, p_members, v_n)
  returning id into v_id;
  insert into public.installation_audit_log (event_type, site_code, detail)
  values ('factory_checked_in', p_site_code, jsonb_build_object('checkin_id', v_id, 'member_count', v_n));
  return jsonb_build_object('checkin_id', v_id, 'member_count', v_n, 'already', false);
end; $$;

create or replace function public.rpc_factory_team_checkout(p_site_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_rate numeric;
  v_hours numeric;
  v_man numeric;
begin
  if not (public.is_governance_role() or public.has_site_access(p_site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from public.factory_checkins
  where site_code = p_site_code and work_date = public.fn_business_date() for update;
  if not found then
    raise exception 'วันนี้ยังไม่ได้กดเข้างานโรงงาน' using errcode = 'no_data_found';
  end if;
  if v_c.checked_out_at is not null then
    return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_c.man_hours, 'already', true);
  end if;
  v_hours := round(extract(epoch from (timezone('utc', now()) - v_c.checked_in_at)) / 3600.0, 2);
  v_man := round(v_hours * v_c.member_count, 2);
  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;
  update public.factory_checkins
  set checked_out_at = timezone('utc', now()), man_hours = v_man, rate = v_rate,
      amount = case when v_rate is not null then round(v_man * v_rate, 2) end
  where id = v_c.id;
  insert into public.installation_audit_log (event_type, site_code, detail)
  values ('factory_checked_out', p_site_code,
    jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_man, 'rate', v_rate,
      'note', 'overhead กลางโรงงาน — C6 กระจายตอนวิเคราะห์ (ADR-049)'));
  return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_man,
    'amount', case when v_rate is not null then round(v_man * v_rate, 2) end, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (2) หน้าแรก E2 "โรงงานวันนี้": คิวเดียวกับ B4 · gate รอนานสุด · รายงานวันนี้ · เข้างานวันนี้
-- ---------------------------------------------------------------------------
create or replace function public.rpc_factory_ops_home(p_site_code text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site text := p_site_code;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_site is null then
    select s.site_code into v_site from public.get_active_site_codes() s
    where public.has_site_access(s.site_code) limit 1;
  end if;

  return jsonb_build_object(
    'queue', (public.rpc_factory_home()) -> 'queue',   -- ภาพเดียวกับ B4 (มติ 3)
    'gates_waiting', coalesce((select jsonb_agg(row_to_json(g) order by g.waiting_minutes desc) from (
      select m.id as milestone_id, p.name, m.station,
        floor(extract(epoch from (timezone('utc', now()) - m.reported_at)) / 60)::int as waiting_minutes
      from public.production_milestones m
      join public.installation_projects p on p.id = m.project_id
      where m.is_gate and m.approved_at is null and m.reported_at is not null
        and (public.is_governance_role() or public.has_site_access(m.site_code))) g), '[]'::jsonb),
    'today_reports', coalesce((select jsonb_agg(row_to_json(t) order by t.reported_at desc) from (
      select p.name, m.station, m.reported_by, m.reported_at
      from public.production_milestones m
      join public.installation_projects p on p.id = m.project_id
      where m.reported_at >= (public.fn_business_date()::timestamp at time zone 'Asia/Bangkok')
        and (public.is_governance_role() or public.has_site_access(m.site_code))) t), '[]'::jsonb),
    'checkin', coalesce((select jsonb_build_object(
        'checkin_id', c.id, 'member_count', c.member_count,
        'checked_out', c.checked_out_at is not null, 'man_hours', c.man_hours)
      from public.factory_checkins c
      where c.site_code = v_site and c.work_date = public.fn_business_date()), 'null'::jsonb),
    'site_code', v_site);
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_team_checkin(text, jsonb)',
    'rpc_factory_team_checkout(text)',
    'rpc_factory_ops_home(text)'
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
