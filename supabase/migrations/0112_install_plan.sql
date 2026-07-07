-- Migration: install_plan — J2.7 แผนติดตั้งฉบับลูกค้า (ADR-041 มติ 4)
-- Depends on: 0090 (projects), 0107 (fn_prod_curated), 0095 (line_groups)
--
--   E7 (โลจิสติกส์ — คนรู้คิวจริง) ร่างแผน: วันเริ่ม/วันเสร็จ/วันส่งมอบ → ระบบเก็บ version ทุกฉบับ
--   D1 PM กดยืนยันส่งคลิกเดียว (คำสัญญาภายนอกต้องมีเจ้าของมนุษย์ — pattern ใบปิดบ้าน/ส่งตรวจรับ)
--   snapshot ทุกฉบับลง audit — เลื่อนกี่ครั้งวัดได้จาก version

create table if not exists public.installation_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  version int not null,
  start_date date not null,
  finish_date date not null,
  handover_date date not null,
  note text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'superseded')),
  drafted_by text not null default public.resolve_actor(),
  sent_by text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, version),
  check (finish_date >= start_date and handover_date >= finish_date)
);
alter table public.installation_plans enable row level security;
create policy installation_plans_sel on public.installation_plans for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- E7 ร่างแผน (version ใหม่ทุกครั้ง — ฉบับ draft เดิมถูก supersede)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_draft_install_plan(
  p_project_id uuid, p_start date, p_finish date, p_handover date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_ver int;
  v_id uuid;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_start is null or p_finish is null or p_handover is null then
    raise exception 'ต้องมีวันเริ่ม/วันเสร็จ/วันส่งมอบครบ' using errcode = 'check_violation';
  end if;
  if p_finish < p_start or p_handover < p_finish then
    raise exception 'ลำดับวันไม่ถูก (เริ่ม ≤ เสร็จ ≤ ส่งมอบ)' using errcode = 'check_violation';
  end if;

  update public.installation_plans set status = 'superseded'
  where project_id = p_project_id and status = 'draft';

  select coalesce(max(version), 0) + 1 into v_ver
  from public.installation_plans where project_id = p_project_id;

  insert into public.installation_plans (project_id, site_code, version, start_date, finish_date, handover_date, note)
  values (p_project_id, v_p.site_code, v_ver, p_start, p_finish, p_handover, p_note)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('install_plan_drafted', p_project_id, v_p.site_code,
    jsonb_build_object('plan_id', v_id, 'version', v_ver,
      'start_date', p_start, 'finish_date', p_finish, 'handover_date', p_handover,
      'note', left(coalesce(p_note, ''), 120)));
  return jsonb_build_object('plan_id', v_id, 'version', v_ver);
end; $$;

-- ---------------------------------------------------------------------------
-- D1 PM กดยืนยันส่ง (คลิกเดียว) — ฉบับ sent เดิมถูก supersede + การ์ดเข้ากลุ่มลูกค้า
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_send_install_plan(p_plan_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pl record;
  v_group text;
begin
  select pl.*, p.name as p_name into v_pl
  from public.installation_plans pl join public.installation_projects p on p.id = pl.project_id
  where pl.id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'no_data_found'; end if;
  -- คำสัญญาภายนอก = เจ้าของโครงการเท่านั้น (D1 PM / governance)
  if not (public.is_governance_role() or public.has_any_app_role(array['project_manager'])) then
    raise exception 'ส่งแผนถึงลูกค้าได้เฉพาะ PM/governance' using errcode = 'insufficient_privilege';
  end if;
  if v_pl.status = 'sent' then
    return jsonb_build_object('plan_id', p_plan_id, 'version', v_pl.version, 'already', true);
  end if;
  if v_pl.status = 'superseded' then
    raise exception 'ฉบับนี้ถูกแทนด้วย version ใหม่แล้ว — ส่งฉบับล่าสุด' using errcode = 'check_violation';
  end if;

  select g.line_group_id into v_group from public.line_groups g
  where g.project_id = v_pl.project_id and g.group_type = 'customer' and g.status = 'active';
  if v_group is null then
    raise exception 'บ้านนี้ยังไม่มีกลุ่มลูกค้าที่ผูกแล้ว — ผูกกลุ่มก่อนส่งแผน' using errcode = 'no_data_found';
  end if;

  update public.installation_plans set status = 'superseded'
  where project_id = v_pl.project_id and status = 'sent';

  update public.installation_plans
  set status = 'sent', sent_by = public.resolve_actor(), sent_at = timezone('utc', now())
  where id = p_plan_id;

  perform public.fn_prod_curated(v_pl.project_id, 'tpl_install_plan', jsonb_build_object(
    'project_name', v_pl.p_name,
    'start_date', to_char(v_pl.start_date, 'DD/MM/YYYY'),
    'finish_date', to_char(v_pl.finish_date, 'DD/MM/YYYY'),
    'handover_date', to_char(v_pl.handover_date, 'DD/MM/YYYY')));

  -- snapshot ฉบับที่ส่งจริง — เลื่อนกี่ครั้งวัดได้จาก version ใน audit
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('install_plan_sent', v_pl.project_id, v_pl.site_code,
    jsonb_build_object('plan_id', p_plan_id, 'version', v_pl.version,
      'start_date', v_pl.start_date, 'finish_date', v_pl.finish_date,
      'handover_date', v_pl.handover_date, 'sent_by', public.resolve_actor()));
  return jsonb_build_object('plan_id', p_plan_id, 'version', v_pl.version, 'already', false);
end; $$;

create or replace function public.rpc_field_list_install_plans(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'plan_id', pl.id, 'version', pl.version, 'status', pl.status,
    'start_date', pl.start_date, 'finish_date', pl.finish_date, 'handover_date', pl.handover_date,
    'note', pl.note, 'sent_at', pl.sent_at) order by pl.version desc), '[]'::jsonb)
  from public.installation_plans pl
  join public.installation_projects p on p.id = pl.project_id
  where pl.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(p.site_code)
         or public.fn_installation_is_member(p.id));
$$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_install_plan', null, '🗓️ แผนติดตั้งของบ้าน {{project_name}} ครับ\n• เริ่มติดตั้ง {{start_date}}\n• งานเสร็จ {{finish_date}}\n• ส่งมอบ {{handover_date}}\nทีมจะเข้าตามนัดหมายนี้ หากมีเปลี่ยนแปลงจะแจ้งล่วงหน้าครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_draft_install_plan(uuid, date, date, date, text)',
    'rpc_field_send_install_plan(uuid)',
    'rpc_field_list_install_plans(uuid)'
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
