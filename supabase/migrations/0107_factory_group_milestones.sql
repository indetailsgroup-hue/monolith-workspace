-- Migration: factory_group_milestones — J2.1 + J2.2 (ADR-041 มติ 1/2)
-- Depends on: 0095/0101 (line_groups + handler ล่าสุด — ตรวจ chain: 0097→0098→0100→0101), 0094 (pattern RACI gate),
--             0090 (projects), 0085 (templates seed pattern)
--
-- J2.1 กลุ่มโรงงานถาวรกลุ่มเดียว (ไม่ผูกบ้าน): group_type += 'factory' (project_id null) + unique active เดียว
--      ผูกด้วย '#ผูก โรงงาน' (staff identity — กลุ่มระดับบริษัท)
-- J2.2 Production milestones: รายงาน 6 สถานี (FYI — ผ่าน PWA โดย E2/หัวหน้าสถานี; bot ขาเข้าโรงงาน = Phase หลัง)
--      + designer gate 2 จุด (Assembly/Packing — ผู้ approve ตรวจกับ RACI ขั้น Designer แบบเดียวกับ 0094)
--      + curated 3 จังหวะเข้ากลุ่มลูกค้าอัตโนมัติ: เริ่มผลิต → ตู้เสร็จ (หลัง approve Assembly) → พร้อมส่ง (หลัง approve Packing)
--      หมายเหตุ: curated รอบแรกเป็น text — รูปจริงตามมาเมื่อ sender รองรับ image message (จดใน tasks)

-- ---------------------------------------------------------------------------
-- (1) J2.1: line_groups รองรับ factory (กลุ่มระดับบริษัท ไม่ผูกบ้าน)
-- ---------------------------------------------------------------------------
alter table public.line_groups alter column project_id drop not null;
alter table public.line_groups drop constraint if exists line_groups_group_type_check;
alter table public.line_groups
  add constraint line_groups_group_type_check check (group_type in ('internal', 'customer', 'factory'));
alter table public.line_groups
  add constraint line_groups_project_shape check (
    (group_type = 'factory' and project_id is null)
    or (group_type in ('internal', 'customer') and project_id is not null));
create unique index if not exists ux_line_groups_factory_single
  on public.line_groups (group_type) where group_type = 'factory' and status = 'active';

-- ---------------------------------------------------------------------------
-- (2) J2.2: production_milestones — 6 สถานีจริง + gate 2 จุด
-- ---------------------------------------------------------------------------
create table if not exists public.production_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  site_code text null,
  station text not null check (station in ('laminate','cutting','edging','cnc','assembly','packing')),
  note text null,
  reported_by text not null default public.resolve_actor(),
  reported_at timestamptz not null default timezone('utc', now()),
  -- gate (เฉพาะ assembly/packing): pending → approved โดย designer ตาม RACI
  is_gate boolean not null default false,
  approved_by text null,
  approved_at timestamptz null,
  unique (project_id, station)  -- สถานีละครั้งต่อบ้าน (รายงานซ้ำ = update note)
);
alter table public.production_milestones enable row level security;
create policy production_milestones_sel on public.production_milestones
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
-- เขียนผ่าน RPC เท่านั้น

-- helper: enqueue curated text เข้ากลุ่มลูกค้าของบ้าน (มีกลุ่ม active เท่านั้น — ไม่มีก็เงียบ + audit)
create or replace function public.fn_prod_curated(p_project_id uuid, p_template text, p_slots jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_group text;
begin
  select g.line_group_id into v_group from public.line_groups g
  where g.project_id = p_project_id and g.group_type = 'customer' and g.status = 'active';
  if v_group is not null then
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', p_template, p_slots, 'group', v_group);
  end if;
end; $$;
revoke all on function public.fn_prod_curated(uuid, text, jsonb) from public;

create or replace function public.rpc_factory_report_station(
  p_project_id uuid, p_station text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_first boolean;
  v_gate boolean;
  v_id uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  v_first := not exists (select 1 from public.production_milestones m where m.project_id = p_project_id);
  v_gate := p_station in ('assembly', 'packing');

  insert into public.production_milestones (project_id, site_code, station, note, is_gate)
  values (p_project_id, v_p.site_code, p_station, p_note, v_gate)
  on conflict (project_id, station) do update set note = coalesce(excluded.note, production_milestones.note)
  returning id into v_id;

  -- จังหวะที่ 1: สถานีแรกของบ้าน → "เริ่มผลิตแล้ว" (ADR-041 มติ 2)
  if v_first then
    perform public.fn_prod_curated(p_project_id, 'tpl_prod_started', jsonb_build_object('project_name', v_p.name));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('production_station', p_project_id, v_p.site_code,
    jsonb_build_object('station', p_station, 'gate', v_gate, 'first', v_first));
  return jsonb_build_object('milestone_id', v_id, 'gate', v_gate);
end; $$;

create or replace function public.rpc_factory_approve_gate(p_milestone_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_p record;
  v_knowledge jsonb;
  v_refs text[];
begin
  select m.*, p.name as project_name into v_m
  from public.production_milestones m join public.installation_projects p on p.id = m.project_id
  where m.id = p_milestone_id for update;
  if not found then raise exception 'milestone not found' using errcode = 'no_data_found'; end if;
  if not v_m.is_gate then raise exception 'สถานีนี้ไม่ใช่จุด approve' using errcode = 'check_violation'; end if;
  if v_m.approved_at is not null then return; end if;  -- idempotent

  -- ผู้ approve = designer ตาม RACI ขั้น Designer (แหล่งเดียวกับ resolver — pattern 0094) หรือ governance
  if not public.is_governance_role() then
    select ki.payload into v_knowledge from public.knowledge_import ki where ki.is_current limit 1;
    select array_agg(r) into v_refs
      from jsonb_array_elements_text(coalesce(public.wf_approvers_for_step(v_knowledge, 'Designer', 'unanimous'), '[]'::jsonb)) r;
    if v_refs is null then
      raise exception 'ไม่พบ RACI Designer — fail-safe block' using errcode = 'insufficient_privilege';
    end if;
    if not public.has_any_app_role(v_refs) then
      raise exception 'gate นี้ approve ได้เฉพาะ designer ตาม RACI (ADR-041 มติ 2)' using errcode = 'insufficient_privilege';
    end if;
  end if;

  update public.production_milestones
    set approved_by = public.resolve_actor(), approved_at = timezone('utc', now())
  where id = p_milestone_id;

  -- จังหวะที่ 2/3: curated เข้ากลุ่มลูกค้า
  if v_m.station = 'assembly' then
    perform public.fn_prod_curated(v_m.project_id, 'tpl_prod_assembled', jsonb_build_object('project_name', v_m.project_name));
  elsif v_m.station = 'packing' then
    perform public.fn_prod_curated(v_m.project_id, 'tpl_prod_shipped', jsonb_build_object('project_name', v_m.project_name));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('production_gate_approved', v_m.project_id, v_m.site_code,
    jsonb_build_object('station', v_m.station, 'milestone_id', p_milestone_id));
end; $$;

create or replace function public.rpc_factory_list_milestones(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'station', m.station, 'is_gate', m.is_gate, 'note', m.note,
    'reported_at', m.reported_at, 'approved_at', m.approved_at) order by m.reported_at), '[]'::jsonb)
  from public.production_milestones m
  where m.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(m.site_code) or public.fn_installation_is_member(m.project_id));
$$;

-- ---------------------------------------------------------------------------
-- (3) Templates curated 3 จังหวะ (customer, text — รูปตามมาเมื่อ sender รองรับ image)
-- ---------------------------------------------------------------------------
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_prod_started', null, '🏭 เริ่มผลิตเฟอร์นิเจอร์ของ {{project_name}} แล้วครับ ทีมจะอัปเดตความคืบหน้าให้เป็นระยะครับ', true, 'customer', 'text'),
  ('tpl_prod_assembled', null, '🎉 ตู้ของ {{project_name}} ประกอบเสร็จแล้วครับ ดีไซเนอร์ตรวจความเรียบร้อยผ่านแล้ว — ขั้นต่อไป: แพ็คและเตรียมจัดส่งครับ', true, 'customer', 'text'),
  ('tpl_prod_shipped', null, '🚚 เฟอร์นิเจอร์ของ {{project_name}} แพ็คเสร็จพร้อมจัดส่งแล้วครับ เดี๋ยวทีมนัดหมายวันติดตั้งให้เร็ว ๆ นี้ครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_report_station(uuid, text, text)',
    'rpc_factory_approve_gate(uuid)',
    'rpc_factory_list_milestones(uuid)'
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


-- ---------------------------------------------------------------------------
-- (4) fn_line_handle_group_event — '#ผูก โรงงาน' (body เดิมจาก 0101 ทุกบรรทัด + branch เดียว)
-- ---------------------------------------------------------------------------
create or replace function public.fn_line_handle_group_event(
  p_event jsonb,
  p_vertical text,
  p_actor text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_group_line_id text;
  v_user text;
  v_g record;
  v_msg_type text;
  v_text text;
  v_parts text[];
  v_code record;
  v_group_type text;
  v_kind text;
  v_member jsonb;
  v_desc text;
  v_project record;
  v_capture_id uuid;
  -- 1.8c postback branch (0098)
  v_pb jsonb;
  v_appr record;
  v_decision text;
  v_internal_group text;
begin
  v_type := p_event ->> 'type';
  v_group_line_id := p_event #>> '{source,groupId}';
  v_user := p_event #>> '{source,userId}';

  select g.id, g.project_id, g.group_type, g.status, g.site_code
    into v_g
  from public.line_groups g where g.line_group_id = v_group_line_id;

  -- ---- bot เข้ากลุ่ม ----
  if v_type = 'join' then
    if v_g.id is not null then
      return 'join_already_bound';
    end if;
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_bind_prompt', '{}'::jsonb, 'group', v_group_line_id);
    return 'join_prompted';
  end if;

  -- ---- bot ออก/โดนเอาออก → archive (ประวัติคงอยู่; ผูกใหม่ได้เพราะ unique เฉพาะ active) ----
  if v_type = 'leave' then
    if v_g.id is not null then
      update public.line_groups set status = 'archived' where id = v_g.id;
      return 'bot_left_archived';
    end if;
    return 'bot_left_unbound';
  end if;

  -- ---- member sync ----
  if v_type = 'memberJoined' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    for v_member in select jsonb_array_elements(coalesce(p_event #> '{joined,members}', '[]'::jsonb)) loop
      v_kind := case
        when exists (select 1 from public.identity_binding b
                     where b.line_user_id = v_member ->> 'userId' and b.is_active) then 'staff'
        when exists (select 1 from public.line_oa_customer_identity ci
                     where ci.line_user_id = v_member ->> 'userId') then 'customer'
        else 'guest'
      end;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      values (v_g.id, v_member ->> 'userId', v_kind)
      on conflict (group_id, line_user_id) where left_at is null do nothing;
    end loop;
    return 'members_joined';
  end if;

  if v_type = 'memberLeft' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    update public.line_group_members m
       set left_at = timezone('utc', now())
     where m.group_id = v_g.id and m.left_at is null
       and m.line_user_id in (
         select x ->> 'userId' from jsonb_array_elements(coalesce(p_event #> '{left,members}', '[]'::jsonb)) x);
    return 'members_left';
  end if;

  -- ---- ข้อความในกลุ่ม ----
  if v_type = 'message' then
    v_msg_type := p_event #>> '{message,type}';

    -- (ก) '#ผูก <code> <ทีม|ลูกค้า>' — ทำงานเฉพาะกลุ่มที่ยังไม่ผูก
    if v_msg_type = 'text' and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ผูก%' then
      if v_g.id is not null then
        select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_ok',
          jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
        return 'bind_already_bound';
      end if;

      v_parts := regexp_split_to_array(btrim(p_event #>> '{message,text}'), '\s+');

      -- J2.1 (0107): '#ผูก โรงงาน' — กลุ่มโรงงานถาวรระดับบริษัท (ไม่ใช้รหัสบ้าน; unique active เดียว)
      if v_parts[2] = 'โรงงาน' then
        if v_user is null or not exists (select 1 from public.identity_binding b where b.line_user_id = v_user and b.is_active) then
          insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
          values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
          return 'bind_factory_failed_identity';
        end if;
        begin
          insert into public.line_groups (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
          values (v_group_line_id, null, null, 'factory', p_vertical, 'line:' || v_user);
        exception when unique_violation then
          insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
          values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
          return 'bind_factory_failed_exists';
        end;
        insert into public.line_group_members (group_id, line_user_id, member_kind)
        select g.id, v_user, 'staff' from public.line_groups g where g.line_group_id = v_group_line_id
        on conflict (group_id, line_user_id) where left_at is null do nothing;
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_ok', jsonb_build_object('project_name', 'กลุ่มโรงงาน DAPH'), 'group', v_group_line_id);
        return 'bound_factory';
      end if;
      v_group_type := case v_parts[3] when 'ทีม' then 'internal' when 'ลูกค้า' then 'customer' end;

      -- validate: ผู้พิมพ์ต้องมี staff identity (รหัส = capability token ที่ออฟฟิศแจก — ดู comment ตาราง)
      if v_user is null
         or not exists (select 1 from public.identity_binding b where b.line_user_id = v_user and b.is_active)
         or array_length(v_parts, 1) < 3 or v_group_type is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_identity_or_format';
      end if;

      select c.code, c.project_id into v_code
      from public.line_bind_codes c
      where c.code = v_parts[2] and c.expires_at > timezone('utc', now()) and c.uses_left > 0
      for update;

      if v_code.code is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_code';
      end if;

      select p.id, p.site_code, p.name into v_project
      from public.installation_projects p where p.id = v_code.project_id;

      begin
        insert into public.line_groups (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
        values (v_group_line_id, v_project.id, v_project.site_code, v_group_type, p_vertical, 'line:' || v_user);
      exception when unique_violation then
        -- S4 (scrutiny รอบ 3): บ้านนี้มีกลุ่มชนิดนี้ active อยู่แล้ว — ตอบให้คนผูกรู้ ไม่ใช่เงียบ
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_already_has_group';
      end;
      update public.line_bind_codes set uses_left = uses_left - 1 where code = v_code.code;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      select g.id, v_user, 'staff' from public.line_groups g where g.line_group_id = v_group_line_id
      on conflict (group_id, line_user_id) where left_at is null do nothing;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_bind_ok',
        jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
      return 'bound_' || v_group_type;
    end if;

    -- ต่อจากนี้ทำงานเฉพาะกลุ่มที่ผูกแล้ว + ยัง active
    if v_g.id is null then return 'plain_unbound_ignored'; end if;
    if v_g.status <> 'active' then return 'plain_archived_ignored'; end if;

    -- (ข) '#ปัญหา <ข้อความ>' — เฉพาะกลุ่ม internal (Req: เก็บเป็นหลักฐาน + แจ้งหัวหน้างาน)
    if v_msg_type = 'text' and v_g.group_type = 'internal'
       and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ปัญหา%' then
      v_desc := btrim(substr(btrim(p_event #>> '{message,text}'), length('#ปัญหา') + 1));
      if v_desc = '' then return 'issue_empty_ignored'; end if;

      insert into public.installation_issues (project_id, site_code, source, reported_by, line_user_id, description)
      values (v_g.project_id, v_g.site_code, 'line_group', 'line:' || coalesce(v_user, 'unknown'), v_user, v_desc);

      select p.name, p.foreman_employee_id into v_project
      from public.installation_projects p where p.id = v_g.project_id;
      if v_project.foreman_employee_id is not null then
        -- direct push ถึงหัวหน้างาน — resolution ผ่าน identity_binding (0084: target employee_id)
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_project.foreman_employee_id),
          'personal_responsibility', 'field_issue', 'tpl_inst_issue_alert',
          jsonb_build_object('project_name', v_project.name, 'detail', left(v_desc, 80)),
          false, null, true, null, v_g.site_code);
      end if;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_issue_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'issue_created';
    end if;

    -- (ค) รูปในกลุ่ม internal → capture รูปจบเลน (ADR-039 ข้อ 3); เลือกห้อง/เลนใน UI ภายหลัง (1.6b)
    if v_msg_type = 'image' and v_g.group_type = 'internal' then
      v_capture_id := public.rpc_capture_ingest(
        'installation_room_proof', 'line',
        'line-message://' || coalesce(p_event #>> '{message,id}', 'unknown'),
        p_event ->> 'webhookEventId',
        v_g.site_code);
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_photo_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'photo_captured';
    end if;

    -- (ง) แชทธรรมดา/สื่ออื่น → ไม่เก็บ (PDPA v1 — §8)
    return 'plain_ignored';
  end if;

  -- ---- postback จากการ์ดตรวจรับ (0098 — D-5) ----
  if v_type = 'postback' then
    if v_g.id is null then return 'postback_unbound_ignored'; end if;
    begin
      v_pb := (p_event #>> '{postback,data}')::jsonb;
      if coalesce(v_pb ->> 't', '') <> 'inst_approval' then
        return 'postback_unknown_ignored';
      end if;
      v_decision := case v_pb ->> 'd' when 'approve' then 'approved' when 'reject' then 'rejected' end;
      if v_decision is null then return 'postback_malformed_ignored'; end if;

      select a.id, a.project_id, a.approve_token, a.result into v_appr
      from public.installation_approvals a
      where a.id = (v_pb ->> 'id')::uuid
      for update;
    exception when others then
      return 'postback_malformed_ignored';
    end;

    if v_appr.id is null then return 'postback_stale_ignored'; end if;
    if v_appr.project_id <> v_g.project_id then return 'postback_wrong_group_ignored'; end if;
    if v_appr.approve_token::text <> coalesce(v_pb ->> 'k', '') then return 'postback_token_mismatch'; end if;
    if v_appr.result is not null then return 'postback_already_decided'; end if;

    update public.installation_approvals
       set result = v_decision,
           decided_by = 'line:' || coalesce(v_user, 'unknown'),
           decided_at = timezone('utc', now()),
           postback_id = p_event ->> 'webhookEventId'
     where id = v_appr.id;

    select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;

    if v_decision = 'approved' then
      -- ADR-039 มติ 5: ตรวจรับผ่าน = ปิดโปรเจกต์ (work item ปิดไปแล้วตอนใบปิดบ้าน)
      update public.installation_projects
         set status = 'completed'
       where id = v_g.project_id and status = 'customer_review';
    end if;
    -- reject: คง customer_review — ทีมคุย punch list แล้วส่งตรวจรับใหม่ (ไม่ reopen work item)

    -- ack ลูกค้าในกลุ่มเดิม + แจ้งผลเข้ากลุ่ม internal ของบ้านเดียวกัน (ถ้าผูกไว้)
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_acceptance_ack', '{}'::jsonb, 'group', v_group_line_id);

    select g2.line_group_id into v_internal_group
    from public.line_groups g2
    where g2.project_id = v_g.project_id and g2.group_type = 'internal' and g2.status = 'active';
    if v_internal_group is not null then
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_acceptance_result',
        jsonb_build_object('project_name', coalesce(v_project.name, '-'),
          'result_text', case v_decision when 'approved' then 'รับงานเรียบร้อย ✅' else 'ขอแก้ไขงานก่อนรับ 🙏' end),
        'group', v_internal_group);
    end if;

    insert into public.installation_audit_log (event_type, project_id, site_code, performed_by, detail)
    values ('customer_acceptance_decided', v_g.project_id, v_g.site_code, 'line:' || coalesce(v_user, 'unknown'),
      jsonb_build_object('approval_id', v_appr.id, 'result', v_decision));

    return 'inst_approval_' || v_decision;
  end if;

  return 'ignored_event_type';
exception
  when others then
    -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว — บันทึกแล้วไปต่อ (inbound row + audit จะเก็บหลักฐาน)
    return 'handler_error:' || sqlerrm;
end;
$$;
