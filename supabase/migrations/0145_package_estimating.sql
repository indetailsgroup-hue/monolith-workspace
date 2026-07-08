-- Migration: package_estimating — ADR-051 Q1: Package Estimating v1 (Costimator pattern — สูตรของเราเอง)
-- Depends on: 0128 (packages/stages), 0129 (estimated_cost — เดิมกรอกมือ), 0120 (job_cost_config เรท),
--             0139 (package_materials — วัสดุจาก BOM)
--
--   estimated_cost = วัสดุ (BOM ที่มีราคา หรือระบุเอง) + Σ(ชั่วโมงประเมินต่อขั้นผลิต 7–10 × เรทแรงงาน) + machine allowance
--   calibration: เทียบ estimate vs actual (job_cost ref_id) สะสมต่อ package ที่จบ — B4 เห็น bias ตัวเอง แม่นขึ้นทุกบ้าน
--   ห้าม copy สูตร MTI/Costimator — library นี้สร้างจากเรทจริง DAPH (ADR-051); เรทไม่มี = fail-safe no-guess

create table if not exists public.package_estimates (
  package_id uuid primary key references public.work_packages(id),
  material_est numeric not null default 0 check (material_est >= 0),
  material_source text not null default 'manual' check (material_source in ('manual', 'bom')),
  stage_hours jsonb not null default '{}'::jsonb,   -- {"machining": 4, "assembly": 6, "finishing": 3, "qc_shop": 1}
  labor_rate_snapshot numeric not null,
  machine_allowance numeric not null default 0 check (machine_allowance >= 0),
  total_est numeric not null,
  estimated_by text not null default public.resolve_actor(),
  estimated_at timestamptz not null default timezone('utc', now())
);
alter table public.package_estimates enable row level security;
create policy package_estimates_sel on public.package_estimates for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));
-- ชั้นต้นทุน = ภายใน (R-2) — member ไม่เห็น

create or replace function public.rpc_factory_estimate_package(
  p_package_id uuid,
  p_stage_hours jsonb,                       -- ชั่วโมงต่อขั้นผลิต (คีย์ = stage ขั้น 7–10)
  p_material_est numeric default null,       -- null = ดึงจากราคา BOM ที่รับแล้ว
  p_machine_allowance numeric default 0)
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

  -- ตรวจ stage keys = ขั้นผลิต 7–10 เท่านั้น + รวมชั่วโมง
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

  insert into public.package_estimates (package_id, material_est, material_source, stage_hours,
    labor_rate_snapshot, machine_allowance, total_est, estimated_by, estimated_at)
  values (p_package_id, v_material, v_mat_source, coalesce(p_stage_hours, '{}'::jsonb),
    v_rate, coalesce(p_machine_allowance, 0), v_total, public.resolve_actor(), timezone('utc', now()))
  on conflict (package_id) do update set
    material_est = excluded.material_est, material_source = excluded.material_source,
    stage_hours = excluded.stage_hours, labor_rate_snapshot = excluded.labor_rate_snapshot,
    machine_allowance = excluded.machine_allowance, total_est = excluded.total_est,
    estimated_by = excluded.estimated_by, estimated_at = excluded.estimated_at;

  -- sync เข้า cost-to-complete เดิม (0129 ใช้ estimated_cost อยู่แล้ว)
  update public.work_packages set estimated_cost = v_total where id = p_package_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('package_estimated', v_w.project_id, v_w.site_code,
    jsonb_build_object('package_id', p_package_id, 'code', v_w.code,
      'material', v_material, 'material_source', v_mat_source, 'hours', v_hours,
      'rate', v_rate, 'allowance', coalesce(p_machine_allowance, 0), 'total', v_total));
  return jsonb_build_object('package_id', p_package_id, 'total_est', v_total,
    'material', v_material, 'material_source', v_mat_source,
    'labor', round(v_hours * v_rate, 2), 'hours', v_hours);
end; $$;

-- calibration: estimate vs actual ต่อ package ที่จบ + bias รวม — B4 เห็นว่าตัวเองเพี้ยนทางไหน
create or replace function public.rpc_factory_estimate_calibration(p_limit int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'packages', coalesce((select jsonb_agg(row_to_json(k) order by k.done_at desc) from (
      select w.code, p.name as project_name, e.total_est,
        coalesce((select sum(coalesce(j.amount, 0)) from public.job_cost_entries j
          where j.ref_id = w.id), 0) as actual_cost,
        (select max(s.done_at) from public.package_stages s where s.package_id = w.id) as done_at
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      join public.package_estimates e on e.package_id = w.id
      where w.status = 'done'
        and (public.is_governance_role() or public.has_site_access(p.site_code))
      limit p_limit) k), '[]'::jsonb),
    -- bias รวม: actual/estimate เฉลี่ย (>1 = ประเมินต่ำไป, <1 = เผื่อเยอะไป)
    'bias_ratio', (select round(avg(actual / nullif(est, 0)), 3) from (
      select e.total_est as est,
        coalesce((select sum(coalesce(j.amount, 0)) from public.job_cost_entries j
          where j.ref_id = w.id), 0) as actual
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      join public.package_estimates e on e.package_id = w.id
      where w.status = 'done' and e.total_est > 0
        and (public.is_governance_role() or public.has_site_access(p.site_code))) b
      where b.actual > 0));
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_estimate_package(uuid, jsonb, numeric, numeric)',
    'rpc_factory_estimate_calibration(int)'
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
