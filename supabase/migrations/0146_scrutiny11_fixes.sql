-- Migration: scrutiny11_fixes — ผล scrutinize รอบ 11 (0145)
--
-- S11-1 (conceptual): calibration เทียบ total_est (รวมค่าแรง) กับ actual per package ที่ไม่มีค่าแรงเลย
--   (labor ผูกบ้าน/โรงงานกลางตาม ADR-049 — ไม่ผูก package) → bias ต่ำเสมอ B4 หลงลดตัวเลขประเมิน
--   (พิสูจน์: est ตรงเป๊ะทุกหมวดแต่ระบบบอก 0.885) → เทียบ like-for-like: bias จากวัสดุเท่านั้น
--   (est_material vs actual_material) + แสดง labor_est / actual_rework แยกเป็นข้อมูล + note ชัด
-- S11-2 (minor): limit ก่อน order → ได้ N ตัวมั่วแล้วค่อยเรียง → order by done_at desc ก่อน limit

create or replace function public.rpc_factory_estimate_calibration(p_limit int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'note', 'bias เทียบเฉพาะวัสดุ (like-for-like) — ค่าแรงจริงอยู่ระดับบ้าน/โรงงานกลาง (ADR-049) ไม่ผูก package; labor_est แสดงเป็นข้อมูลอ้างอิง',
    'packages', coalesce((select jsonb_agg(row_to_json(k) order by k.done_at desc) from (
      select w.code, p.name as project_name,
        e.total_est, e.material_est,
        round((select coalesce(sum(v.value::numeric), 0) from jsonb_each_text(e.stage_hours) v)
          * e.labor_rate_snapshot, 2) as labor_est,
        coalesce((select sum(coalesce(j.amount, 0)) from public.job_cost_entries j
          where j.ref_id = w.id and j.entry_type = 'material'), 0) as actual_material,
        coalesce((select sum(coalesce(j.amount, 0)) from public.job_cost_entries j
          where j.ref_id = w.id and j.entry_type = 'rework'), 0) as actual_rework,
        (select max(s.done_at) from public.package_stages s where s.package_id = w.id) as done_at
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      join public.package_estimates e on e.package_id = w.id
      where w.status = 'done'
        and (public.is_governance_role() or public.has_site_access(p.site_code))
      order by (select max(s.done_at) from public.package_stages s where s.package_id = w.id) desc nulls last
      limit p_limit) k), '[]'::jsonb),
    -- bias วัสดุ like-for-like: actual_material / material_est (>1 = ประเมินวัสดุต่ำไป)
    'material_bias_ratio', (select round(avg(actual_m / nullif(est_m, 0)), 3) from (
      select e.material_est as est_m,
        coalesce((select sum(coalesce(j.amount, 0)) from public.job_cost_entries j
          where j.ref_id = w.id and j.entry_type = 'material'), 0) as actual_m
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      join public.package_estimates e on e.package_id = w.id
      where w.status = 'done' and e.material_est > 0
        and (public.is_governance_role() or public.has_site_access(p.site_code))) b
      where b.actual_m > 0));
end; $$;
