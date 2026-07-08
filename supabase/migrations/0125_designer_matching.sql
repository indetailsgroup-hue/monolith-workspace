-- Migration: designer_matching — BJ-3 profile + matching list เต็มรูป (มติ B2-3)
-- Depends on: 0110 (rpc_field_designer_candidates v1 — **rebase ที่นี่**), 0113 (requirement mood_tone),
--             0121 (issues category 'design'), 0110 (roster design = ประวัติต่อบ้าน)
--
--   tag สไตล์ต่อ designer (B1 กรอกครั้งแรก ~10 นาที/ทีม) → ระบบเรียง:
--   tag ตรง Mood&Tone ของบ้าน > สถิติ rework น้อย > ประวัติบ้านที่จบมาก > งานในมือน้อย (กันจับคู่คนล้นมือ)
--   → B1 เลือก+approve เหมือนเดิม (ADR-041 manual); ข้อมูลโตเองทุกบ้านที่จบ
--   rework v1 = จำนวน issue ประเภท 'design' บนบ้านที่ designer คนนั้นอยู่ใน roster (BJ-2 จะเติม Job Cost จริง)

create table if not exists public.designer_profiles (
  employee_id uuid primary key,
  style_tags text[] not null default '{}',   -- เช่น {โมเดิร์น, มินิมอล, ลอฟท์}
  notes text,
  updated_by text not null default public.resolve_actor(),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.designer_profiles enable row level security;
create policy designer_profiles_sel on public.designer_profiles for select to authenticated using (true);

create or replace function public.rpc_field_set_designer_profile(
  p_employee_id uuid, p_style_tags text[], p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- B1/หัวหน้าฝ่าย = site access หรือ governance (pattern เดียวกับ approve roster)
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.designer_profiles (employee_id, style_tags, notes, updated_by, updated_at)
  values (p_employee_id, coalesce(p_style_tags, '{}'), p_notes, public.resolve_actor(), timezone('utc', now()))
  on conflict (employee_id) do update set
    style_tags = excluded.style_tags, notes = excluded.notes,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end; $$;

-- ---------------------------------------------------------------------------
-- rebase rpc_field_designer_candidates (0110→0125): + Mood&Tone matching + ประวัติ + rework
-- (signature เปลี่ยน — drop ของเดิมก่อน; เรียกแบบไม่ส่ง arg ได้เหมือนเดิมผ่าน default)
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_field_designer_candidates();
create or replace function public.rpc_field_designer_candidates(p_project_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mood text;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  -- Mood&Tone ของบ้านจากใบ requirement (ถ้าระบุบ้าน)
  if p_project_id is not null then
    select a.corrected_fields ->> 'mood_tone' into v_mood
    from public.installation_projects p
    join public.capture_artifact a on a.linked_entity_id = p.work_item_id
      and a.capture_type = 'customer_requirement'
    where p.id = p_project_id
    order by a.created_at desc limit 1;
  end if;

  return coalesce((select jsonb_agg(row_to_json(c)
      order by c.tag_matches desc, c.rework_count asc, c.completed_houses desc, c.active_houses asc, c.display_name) from (
    select
      b.employee_id,
      coalesce((select t.display_name from public.staff_bind_tokens t
        where t.employee_id = b.employee_id order by t.created_at desc limit 1), 'Designer') as display_name,
      coalesce(pf.style_tags, '{}') as style_tags,
      -- tag ตรง Mood&Tone (นับ tag ที่โผล่ในข้อความ mood_tone ของบ้าน)
      case when v_mood is null then 0 else
        (select count(*) from unnest(coalesce(pf.style_tags, '{}')) tag
         where v_mood ilike '%' || tag || '%') end as tag_matches,
      -- ประวัติบ้านที่จบ (roster design + project completed)
      (select count(*) from public.phase_rosters r
        join public.installation_projects p on p.id = r.project_id
        where r.employee_id = b.employee_id and r.phase = 'design' and p.status = 'completed') as completed_houses,
      -- rework v1: issue ประเภท design บนบ้านที่อยู่ใน roster (BJ-2 เติม Job Cost จริง)
      (select count(*) from public.installation_issues i
        where i.category = 'design' and i.project_id in (
          select r.project_id from public.phase_rosters r
          where r.employee_id = b.employee_id and r.phase = 'design')) as rework_count,
      -- งานในมือ (กันจับคู่คนล้นมือ)
      (select count(*) from public.phase_rosters r
        join public.installation_projects p on p.id = r.project_id
        where r.employee_id = b.employee_id and r.phase = 'design'
          and r.status in ('approved', 'active') and p.status in ('active', 'customer_review')) as active_houses
    from public.identity_binding b
    left join public.designer_profiles pf on pf.employee_id = b.employee_id
    where b.is_active and (b.department ilike 'design%' or lower(coalesce(b.app_role, '')) in ('designer', 'b2'))
  ) c), '[]'::jsonb);
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_designer_profile(uuid, text[], text)',
    'rpc_field_designer_candidates(uuid)'
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
