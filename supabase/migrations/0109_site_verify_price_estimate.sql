-- Migration: site_verify_price_estimate — J2.4 (ADR-039 มติ 3 / ADR-041 มติ 3) + SJ-1 (Sale-1)
-- Depends on: 0092 (capture pattern evidence_only), 0090 (projects), 0103 (pattern ห่อ ingest→verify)
--
-- J2.4 ตรวจหน้างานร่วมก่อนผลิต: capture 'site_design_verification' (C2 ทีมวัด + B2 designer ที่บ้าน)
--      = เงื่อนไข **soft** ก่อนการ์ดเซ็นแบบ final G3 — enforcement: trigger audit เมื่องานเข้ารออนุมัติ
--      ที่ 3D_Rendering_Final โดยไม่มีผลตรวจ (ไม่ block — pattern T0; ยก hard ได้ภายหลังที่จุด handoff)
-- SJ-1 ช่วงราคาเบื้องต้น: ตารางเรทต่อ ตรม. ต่อเกรดวัสดุ (config โดย B4/PM) → ช่วง min–max
--      **ทุกตัวเลขที่คำนวณ = snapshot ลง audit** (ไม่มีราคาปากเปล่าลอยค้าง — มติ Sale-1)

-- ---------------------------------------------------------------------------
-- (1) J2.4: seed capture type (evidence_only — promote = emit+link เท่านั้น)
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'site_design_verification',
  jsonb_build_object('project_id','string','summary','string','issues_found','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'ทีมวัด + designer ตรวจแบบเทียบหน้างานจริงร่วมกันครบทุกจุด',
    'guards_against', 'แบบ final ที่ลูกค้าเซ็นไม่ตรงหน้างานจริง → ผลิตแล้วติดตั้งไม่ได้/แก้หน้างานแพง',
    'method', 'C2+B2 ไปบ้านลูกค้าพร้อมกัน เทียบทุกมิติ/จุดไฟ/ประปา; บันทึกสรุป + ประเด็นที่พบ',
    'pfmea_ref', jsonb_build_object('source_file', 'ADR-039', 'source_step', '3D_Rendering_Final'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
  )),
  'evidence_only',
  array['project_id','summary']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create or replace function public.rpc_field_submit_site_verification(
  p_project_id uuid, p_summary text, p_issues text default null, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_summary), '') = '' then
    raise exception 'ต้องมีสรุปผลการตรวจ' using errcode = 'check_violation';
  end if;

  v_artifact := public.rpc_capture_ingest('site_design_verification', 'app',
    'app://field/site-verify/' || coalesce(p_client_key, gen_random_uuid()::text),
    'site-verify-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'ตรวจหน้างานร่วม (field app)',
      jsonb_build_object('project_id', p_project_id::text, 'summary', p_summary, 'issues_found', coalesce(p_issues, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('site_design_verified', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'summary', left(p_summary, 120)));
  return jsonb_build_object('artifact_id', v_artifact, 'already', false);
end; $$;

-- soft enforcement (ADR-039 มติ 3): งานเข้ารอเซ็น G3 โดยไม่มีผลตรวจ → audit เตือน (ไม่ block)
create or replace function public.fn_audit_g3_without_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  if new.status = 'awaiting_approval' and old.status is distinct from 'awaiting_approval'
     and new.current_step = '3D_Rendering_Final' then
    select id into v_project from public.installation_projects where work_item_id = new.id;
    if v_project is not null and not exists (
      select 1 from public.capture_artifact a
      where a.capture_type = 'site_design_verification' and a.status = 'emitted'
        and a.linked_entity_id = v_project) then
      insert into public.installation_audit_log (event_type, project_id, detail)
      values ('g3_sent_without_site_verification', v_project,
        jsonb_build_object('work_item_id', new.id, 'note', 'soft warning — ADR-039 มติ 3'));
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_g3_site_verification on public.work_item;
create trigger trg_g3_site_verification after update on public.work_item
  for each row execute function public.fn_audit_g3_without_verification();

-- ---------------------------------------------------------------------------
-- (2) SJ-1: เรทราคา + ช่วงราคาเบื้องต้น (audit ทุกตัวเลข)
-- ---------------------------------------------------------------------------
create table if not exists public.price_rates (
  material_grade text primary key,        -- เกรดวัสดุปิดผิว/โครง (config โดย B4/PM)
  rate_min_per_sqm numeric not null check (rate_min_per_sqm > 0),
  rate_max_per_sqm numeric not null check (rate_max_per_sqm >= rate_min_per_sqm),
  updated_by text not null default public.resolve_actor(),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.price_rates enable row level security;
create policy price_rates_sel on public.price_rates for select to authenticated using (true);
-- แก้เรทผ่าน RPC (B4/PM = site access)

create or replace function public.rpc_field_set_price_rate(
  p_grade text, p_min numeric, p_max numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.price_rates (material_grade, rate_min_per_sqm, rate_max_per_sqm, updated_by, updated_at)
  values (btrim(p_grade), p_min, p_max, public.resolve_actor(), timezone('utc', now()))
  on conflict (material_grade) do update set
    rate_min_per_sqm = excluded.rate_min_per_sqm, rate_max_per_sqm = excluded.rate_max_per_sqm,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end; $$;

create or replace function public.rpc_field_price_estimate(
  p_sqm numeric, p_grade text, p_context text default null)  -- context เช่น ชื่อลูกค้า/lead อ้างอิง
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_min numeric; v_max numeric;
begin
  if coalesce(p_sqm, 0) <= 0 then
    raise exception 'พื้นที่ต้องมากกว่า 0 ตร.ม.' using errcode = 'check_violation';
  end if;
  select * into v_r from public.price_rates where material_grade = btrim(p_grade);
  if not found then
    raise exception 'ยังไม่มีเรทของเกรด "%" — ให้ B4/PM ตั้งเรทก่อน (fail-safe no-guess)', p_grade
      using errcode = 'no_data_found';
  end if;
  v_min := round(p_sqm * v_r.rate_min_per_sqm, -2);  -- ปัดร้อยบาท
  v_max := round(p_sqm * v_r.rate_max_per_sqm, -2);

  -- มติ Sale-1: ทุกตัวเลขที่ถึงหูลูกค้าต้องมี snapshot
  insert into public.installation_audit_log (event_type, detail)
  values ('price_estimate_issued', jsonb_build_object(
    'sqm', p_sqm, 'grade', btrim(p_grade), 'min', v_min, 'max', v_max,
    'rate_version', v_r.updated_at, 'context', left(coalesce(p_context, ''), 120)));

  return jsonb_build_object('min', v_min, 'max', v_max,
    'message', format('งานประมาณ %s–%s บาท (พื้นที่ %s ตร.ม. เกรด %s) — ราคายืนยันหลังวัดหน้างานจริงครับ',
      to_char(v_min, 'FM999,999,999'), to_char(v_max, 'FM999,999,999'), p_sqm, btrim(p_grade)));
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_submit_site_verification(uuid, text, text, text)',
    'rpc_field_set_price_rate(text, numeric, numeric)',
    'rpc_field_price_estimate(numeric, text, text)'
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
