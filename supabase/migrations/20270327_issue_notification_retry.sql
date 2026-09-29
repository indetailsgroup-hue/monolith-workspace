-- Repair confirmed issue notification retry and outbound timestamp failures.
-- Regression evidence: PR #109, CI34706381704/job103587066241.
-- Queue receipts confirm persistence, not provider delivery.
BEGIN;
create or replace function public.rpc_field_raise_issue(
  p_project_id uuid, p_category text, p_description text, p_room_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_r record;
  v_id uuid;
  v_target record;
  v_notified int := 0;
  v_pm uuid;
  v_receipt uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v_r from public.issue_routing where category = p_category;
  if not found then
    raise exception 'ประเภทต้องเป็น: material / design / scope / safety' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'ต้องมีรายละเอียดปัญหา' using errcode = 'check_violation';
  end if;

  insert into public.installation_issues (project_id, room_id, site_code, source, reported_by, description, category)
  values (p_project_id, p_room_id, v_p.site_code, 'pwa', public.resolve_actor(),
    '[' || v_r.label_th || '] ' || btrim(p_description), p_category)
  returning id into v_id;

  -- route ถึงทุกคนที่ app_role ตรง (safety: bypass quiet hours = ส่งเดี๋ยวนี้)
  for v_target in
    select distinct b.employee_id from public.identity_binding b
    where b.is_active and lower(coalesce(b.app_role, '')) = any (select lower(r) from unnest(v_r.target_roles) r)
  loop
    begin
      v_receipt := public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_target.employee_id),
        'personal_responsibility', 'issue_routing', 'tpl_issue_routed',
        jsonb_build_object('project_name', v_p.name, 'category', v_r.label_th,
          'detail', left(btrim(p_description), 80)),
        false, case when v_r.bypass_quiet then false else null end, true, null, v_p.site_code);
      if v_receipt is not null then
        v_notified := v_notified + 1;
      end if;
    exception when others then null;
    end;
  end loop;

  -- มติ ADR-037: ลูกค้าขอเพิ่ม = flag เส้น requote — ห้ามตกลงปากเปล่า
  if p_category = 'scope' then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('scope_change_flagged', p_project_id, v_p.site_code,
      jsonb_build_object('issue_id', v_id, 'detail', left(btrim(p_description), 200),
        'note', 'เข้าเส้น requote ADR-037 — ห้ามตกลงปากเปล่า'));
  end if;

  -- fail-safe: ไม่มีคนตรง role เลย → ไต่ D1 ทันที
  if v_notified = 0 then
    select employee_id into v_pm from public.ops_contacts where role = 'D1';
    if v_pm is not null then
      begin
        v_receipt := public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_pm),
          'personal_responsibility', 'issue_routing', 'tpl_issue_escalated',
          jsonb_build_object('project_name', v_p.name, 'category', v_r.label_th,
            'detail', left(btrim(p_description), 80)),
          false, case when v_r.bypass_quiet then false else null end, true, null, v_p.site_code);
        if v_receipt is not null then
          update public.installation_issues set escalated_to_pm_at = timezone('utc', now()) where id = v_id;
        end if;
      exception when others then null;
      end;
    end if;

  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('issue_raised', p_project_id, v_p.site_code,
    jsonb_build_object('issue_id', v_id, 'category', p_category, 'notified', v_notified));
  return jsonb_build_object('issue_id', v_id, 'category', p_category, 'notified', v_notified);
end; $$;

create or replace function public.fn_issue_sla_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_pm uuid;
  v_receipt uuid;
  v_n int := 0;
begin
  select employee_id into v_pm from public.ops_contacts where role = 'D1';
  if v_pm is null then return jsonb_build_object('escalated', 0, 'note', 'ops_contacts D1 ยังไม่ตั้ง'); end if;

  for v_i in
    select i.id, i.project_id, i.site_code, i.category, i.description, p.name as p_name, r.bypass_quiet
    from public.installation_issues i
    join public.installation_projects p on p.id = i.project_id
    join public.issue_routing r on r.category = i.category
    where i.status = 'open' and i.acked_at is null and i.escalated_to_pm_at is null
      and i.created_at < timezone('utc', now()) - make_interval(mins => r.sla_minutes)
    for update of i skip locked
  loop
    begin
      v_receipt := public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_pm),
        'personal_responsibility', 'issue_routing', 'tpl_issue_escalated',
        jsonb_build_object('project_name', v_i.p_name,
          'category', (select label_th from public.issue_routing where category = v_i.category),
          'detail', left(v_i.description, 80)),
        false, case when v_i.bypass_quiet then false else null end, true, null, v_i.site_code);
      if v_receipt is null then continue; end if;
      update public.installation_issues set escalated_to_pm_at = timezone('utc', now()) where id = v_i.id;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('issue_sla_escalated', v_i.project_id, v_i.site_code,
        jsonb_build_object('issue_id', v_i.id, 'category', v_i.category));
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('escalated', v_n);
end; $$;
-- Supabase defaults granted these roles directly; PUBLIC-only revoke is insufficient.
REVOKE ALL ON FUNCTION public.fn_issue_sla_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_issue_sla_sweep() TO service_role;

-- The0197 pending-row trigger already publishes created_at, but the queue
-- canonical fresh schema omitted it; older bootstrap paths may already have it.
-- Preserve that existing function/payload contract and any existing values.
-- When adding the column, leave historical rows NULL without a backfill.
-- If it already exists, retain its values and constraints. Set the default
-- for future inserts only; existing creation times are never fabricated.
ALTER TABLE public.line_oa_outbound_messages ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.line_oa_outbound_messages ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
