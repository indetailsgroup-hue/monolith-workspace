-- Migration: package_detail — RPC ประกอบ UI PackagePanel (ขั้นครบชุดพร้อม key — RPC-only ตามสถาปัตยกรรม)
-- Depends on: 0128 (packages/stages/defs)

create or replace function public.rpc_field_package_detail(p_package_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'package_id', w.id, 'code', w.code, 'name', w.name, 'status', w.status,
    'estimated_cost', w.estimated_cost,
    'stages', (select jsonb_agg(jsonb_build_object(
        'seq', s.seq, 'stage', s.stage, 'label', d.label_th, 'is_gate', d.is_gate,
        'status', s.status, 'done_at', s.done_at, 'note', s.note) order by s.seq)
      from public.package_stages s
      join public.millwork_stage_defs d on d.stage = s.stage
      where s.package_id = w.id))
  from public.work_packages w
  join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id
    and (public.is_governance_role() or public.has_site_access(p.site_code)
         or public.fn_installation_is_member(p.id));
$$;

do $$
begin
  execute 'revoke all on function public.rpc_field_package_detail(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_package_detail(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_package_detail(uuid) to service_role';
  end if;
end $$;
