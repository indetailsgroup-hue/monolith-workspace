-- Migration: qc_gate_acceptance — J2.6 (journey v2: ตรวจรับสองชั้น — QC E5 ภายในผ่านก่อน แล้วค่อยเชิญลูกค้า)
-- Depends on: 0098 (rpc_request_customer_acceptance — **ตรวจแล้วเป็น version ล่าสุด**), 0092 (capture spine), 0096 (issues), 0108 (pattern override)
--
--   qc_inspections: ผล QC ต่อบ้าน (pass/fail) ผ่าน capture wrapper (evidence spine เดียวกับ site verification)
--   fail → เปิด installation_issues อัตโนมัติ (โยง punch flow เดิม — หัวหน้าแก้ → QC ตรวจซ้ำ)
--   gate ที่ rpc_request_customer_acceptance: ผล QC ล่าสุดต้อง pass — block พร้อม override PM/governance + เหตุผล (pattern 0108)
--   (จุดนี้เป็น handoff ถึงลูกค้า = hard gate เหมาะสม ไม่ใช่ conditional checklist)

-- ---------------------------------------------------------------------------
-- (1) capture type + ตารางผล QC
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'qc_inspection',
  jsonb_build_object('project_id','string','result','string','notes','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'QC (E5) ตรวจคุณภาพงานติดตั้งทั้งบ้านก่อนเชิญลูกค้าตรวจรับ',
    'guards_against', 'ลูกค้าเจอ defect ตอนตรวจรับ → เสียความเชื่อมั่น + งวดสุดท้ายค้าง',
    'method', 'E5 ไล่ตรวจทุกห้องตาม SOP; ไม่ผ่าน = เปิด issue ให้หัวหน้าทีมแก้แล้วตรวจซ้ำ',
    'pfmea_ref', jsonb_build_object('source_file', 'customer-journey-v2', 'source_step', 'Installation'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
  )),
  'evidence_only',
  array['project_id','result']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create table if not exists public.qc_inspections (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,  -- ลำดับแน่นอน (created_at ซ้ำได้ใน txn เดียว)
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  result text not null check (result in ('pass', 'fail')),
  notes text,
  artifact_id uuid,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.qc_inspections enable row level security;
create policy qc_inspections_sel on public.qc_inspections for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- (2) ส่งผล QC (E5) — fail = เปิด issue อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_submit_qc_inspection(
  p_project_id uuid, p_pass boolean, p_notes text default null, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_id uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if not p_pass and coalesce(btrim(p_notes), '') = '' then
    raise exception 'QC ไม่ผ่านต้องระบุสิ่งที่พบ' using errcode = 'check_violation';
  end if;

  v_artifact := public.rpc_capture_ingest('qc_inspection', 'app',
    'app://field/qc/' || coalesce(p_client_key, gen_random_uuid()::text),
    'qc-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    select id into v_id from public.qc_inspections where artifact_id = v_artifact;
    return jsonb_build_object('inspection_id', v_id, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'QC ตรวจก่อนตรวจรับ (field app)',
      jsonb_build_object('project_id', p_project_id::text,
        'result', case when p_pass then 'pass' else 'fail' end, 'notes', coalesce(p_notes, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  insert into public.qc_inspections (project_id, site_code, result, notes, artifact_id)
  values (p_project_id, v_p.site_code, case when p_pass then 'pass' else 'fail' end, p_notes, v_artifact)
  returning id into v_id;

  if not p_pass then
    insert into public.installation_issues (project_id, site_code, source, reported_by, description)
    values (p_project_id, v_p.site_code, 'pwa', public.resolve_actor(), 'QC: ' || btrim(p_notes));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('qc_inspection', p_project_id, v_p.site_code,
    jsonb_build_object('inspection_id', v_id, 'result', case when p_pass then 'pass' else 'fail' end,
      'notes', left(coalesce(p_notes, ''), 120)));
  return jsonb_build_object('inspection_id', v_id, 'already', false,
    'result', case when p_pass then 'pass' else 'fail' end);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) gate ที่จุดส่งการ์ดตรวจรับ — rebase จาก 0098 (เพิ่ม param → drop signature เดิม)
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_request_customer_acceptance(uuid);
create or replace function public.rpc_request_customer_acceptance(
  p_project_id uuid, p_override_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_group text;
  v_appr record;
  v_qc text;
begin
  select p.id, p.site_code, p.name, p.status into v_p
  from public.installation_projects p where p.id = p_project_id for update;
  if not found then raise exception 'installation project not found' using errcode = 'no_data_found'; end if;

  if not (public.is_governance_role() or (v_p.site_code is not null and public.has_site_access(v_p.site_code))) then
    raise exception 'insufficient permission to request customer acceptance' using errcode = 'insufficient_privilege';
  end if;
  if v_p.status not in ('active', 'customer_review') then
    raise exception 'project status % — ส่งตรวจรับได้เฉพาะงานที่ยังไม่ปิด', v_p.status using errcode = 'check_violation';
  end if;

  -- J2.6: QC (E5) ภายในต้องผ่านก่อนเชิญลูกค้า — ผลล่าสุดต้อง pass
  select q.result into v_qc from public.qc_inspections q
  where q.project_id = p_project_id order by q.seq desc limit 1;
  if v_qc is distinct from 'pass' then
    if coalesce(btrim(p_override_reason), '') = '' then
      raise exception 'QC ยังไม่ผ่าน (%) — ให้ E5 ตรวจก่อน หรือ PM ยืนยันข้ามพร้อมเหตุผล',
        coalesce(v_qc, 'ยังไม่ตรวจ') using errcode = 'check_violation';
    end if;
    if not (public.is_governance_role() or public.has_any_app_role(array['project_manager'])) then
      raise exception 'ข้าม QC ได้เฉพาะ PM/governance' using errcode = 'insufficient_privilege';
    end if;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('acceptance_qc_override', p_project_id, v_p.site_code,
      jsonb_build_object('qc_latest', coalesce(v_qc, 'none'), 'reason', btrim(p_override_reason),
        'by', public.resolve_actor()));
  end if;

  select g.line_group_id into v_group
  from public.line_groups g
  where g.project_id = p_project_id and g.group_type = 'customer' and g.status = 'active';
  if v_group is null then
    raise exception 'บ้านนี้ยังไม่มีกลุ่มลูกค้าที่ผูกแล้ว — ผูกกลุ่มก่อนส่งตรวจรับ (D-5)' using errcode = 'no_data_found';
  end if;

  -- idempotent: มีใบ pending อยู่ → คืนใบเดิม (การ์ดเดิมยังกดได้ — ไม่ส่งซ้ำให้ลูกค้ารำคาญ)
  select a.id into v_appr
  from public.installation_approvals a
  where a.project_id = p_project_id and a.subject = 'customer_acceptance' and a.result is null
  limit 1;
  if v_appr.id is not null then
    return v_appr.id;
  end if;

  update public.installation_projects set status = 'customer_review' where id = p_project_id;

  insert into public.installation_approvals (project_id, site_code, subject, channel)
  values (p_project_id, v_p.site_code, 'customer_acceptance', 'line')
  returning id, approve_token into v_appr;

  insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
  values ('push', 'pending', 'tpl_inst_approval_request',
    jsonb_build_object('project_name', v_p.name, 'approval_id', v_appr.id::text, 'approve_token', v_appr.approve_token::text),
    'group', v_group);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('customer_acceptance_requested', p_project_id, v_p.site_code,
    jsonb_build_object('approval_id', v_appr.id, 'group', v_group));

  return v_appr.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- (4) grants
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_submit_qc_inspection(uuid, boolean, text, text)',
    'rpc_request_customer_acceptance(uuid, text)'
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
