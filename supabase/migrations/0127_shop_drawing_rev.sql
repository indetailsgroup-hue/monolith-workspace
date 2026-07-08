-- Migration: shop_drawing_rev — BJ-2 แก้แบบกลางไลน์ แบ่งสองเคสตามเส้นเดิม (มติ B2-2)
-- Depends on: 0024/0083/0087 (rpc_classify_revision + revision_event — เกณฑ์ matches_signed_spec เดิม),
--             0071 (released_spec versioning ADR-031), 0107 (factory group), 0120 (job_cost_entries), 0121 (ops_contacts)
--
--   เคสเทคนิคภายใน (matches_signed_spec=true): classify ลง revision_event + แจ้งกลุ่มโรงงาน
--   "หยุดใช้ rev เดิม" + B4 ประเมิน rework → ต้นทุนเข้า Job Cost ราย package
--   เคสกระทบของที่ลูกค้าเซ็น (false): **บังคับเส้น requote ADR-037 — ห้ามแก้เงียบ** (flag + แจ้ง Sale/PM)
--   แต่ยังแจ้งโรงงานหยุด rev เดิมทันทีทั้งสองเคส (ผลิตต่อจากแบบที่กำลังเปลี่ยน = เสียทั้งชุด)
--   ตัว release rev ใหม่จริง = เส้น released_spec เดิมผ่าน capture spine (0071/0072 — ไม่ fork)

create or replace function public.rpc_field_shop_drawing_revision(
  p_project_id uuid, p_bible_code text, p_change_summary text, p_matches_signed_spec boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_next_rev int;
  v_factory text;
  v_pm uuid;
begin
  select p.id, p.site_code, p.name, p.work_item_id into v_p
  from public.installation_projects p where p.id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_bible_code), '') = '' or coalesce(btrim(p_change_summary), '') = '' then
    raise exception 'ต้องมี bible code + สรุปสิ่งที่แก้' using errcode = 'check_violation';
  end if;
  if v_p.work_item_id is null then
    raise exception 'บ้านนี้ยังไม่ผูก work item — เปิดจากใบ requirement ก่อน' using errcode = 'no_data_found';
  end if;

  -- เกณฑ์แยกสองเคส = classify เดิม (ADR-037 — บันทึก revision_event + billable ตามกติกาเดียวกับ workflow)
  -- changed_fields = array ชื่อ field (สัญญา 0024 — jsonb_array_elements_text)
  perform public.rpc_classify_revision(
    v_p.work_item_id, 'G4',
    jsonb_build_array('shop_drawing:' || btrim(p_bible_code)),
    p_matches_signed_spec, true, null);

  -- rev ถัดไปจาก released_spec versioning (ADR-031)
  select coalesce(max(version), 0) + 1 into v_next_rev
  from public.released_spec where bible_code = btrim(p_bible_code);

  -- แจ้งกลุ่มโรงงานถาวรทันทีทั้งสองเคส: หยุดใช้ rev เดิม
  select g.line_group_id into v_factory from public.line_groups g
  where g.group_type = 'factory' and g.status = 'active';
  if v_factory is not null then
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_shop_rev',
      jsonb_build_object('project_name', v_p.name, 'bible_code', btrim(p_bible_code),
        'next_rev', v_next_rev::text, 'summary', left(btrim(p_change_summary), 100)),
      'group', v_factory);
  end if;

  if not p_matches_signed_spec then
    -- กระทบของที่ลูกค้าเซ็น → บังคับ requote (เส้นเดียวกับ DJ-3 scope) + แจ้ง PM
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('scope_change_flagged', p_project_id, v_p.site_code,
      jsonb_build_object('bible_code', btrim(p_bible_code), 'summary', left(btrim(p_change_summary), 200),
        'note', 'shop drawing กระทบของที่ลูกค้าเซ็น — เข้าเส้น requote ADR-037 ห้ามแก้เงียบ'));
    select employee_id into v_pm from public.ops_contacts where role = 'D1';
    if v_pm is not null then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_pm),
          'personal_responsibility', 'shop_drawing', 'tpl_shop_rev_requote',
          jsonb_build_object('project_name', v_p.name, 'bible_code', btrim(p_bible_code)),
          false, null, true, null, v_p.site_code);
      exception when others then null;
      end;
    end if;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('shop_drawing_revision', p_project_id, v_p.site_code,
    jsonb_build_object('bible_code', btrim(p_bible_code), 'next_rev', v_next_rev,
      'matches_signed_spec', p_matches_signed_spec, 'summary', left(btrim(p_change_summary), 200)));

  return jsonb_build_object('next_rev', v_next_rev,
    'requote_required', not p_matches_signed_spec,
    'factory_notified', v_factory is not null);
end; $$;

-- B4 ประเมิน rework → ต้นทุนเข้า Job Cost ราย package (ของแถม: สถิติ rework ต่อ designer โผล่จาก Job Cost)
create or replace function public.rpc_field_assess_rework(
  p_project_id uuid, p_hours numeric, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_rate numeric;
  v_id uuid;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_hours, 0) <= 0 then
    raise exception 'ชั่วโมง rework ต้องมากกว่า 0' using errcode = 'check_violation';
  end if;

  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;
  insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, note)
  values (p_project_id, v_p.site_code, 'rework', (timezone('utc', now()))::date, p_hours, v_rate,
    case when v_rate is not null then round(p_hours * v_rate, 2) end,
    'rework_assessment',
    coalesce(p_note, '') || case when v_rate is null then ' [เรทยังไม่ตั้ง — backfill]' else '' end)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('rework_assessed', p_project_id, v_p.site_code,
    jsonb_build_object('entry_id', v_id, 'hours', p_hours, 'rate', v_rate,
      'note', left(coalesce(p_note, ''), 120)));
  return jsonb_build_object('entry_id', v_id, 'hours', p_hours,
    'amount', case when v_rate is not null then round(p_hours * v_rate, 2) end);
end; $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_shop_rev', null, '📐 บ้าน {{project_name}} — แบบ {{bible_code}} กำลังออก rev {{next_rev}}: {{summary}}\n⛔ หยุดใช้ rev เดิมทันที รอแบบใหม่ก่อนผลิตต่อครับ', true, 'internal', 'text'),
  ('tpl_shop_rev_requote', null, '💰 บ้าน {{project_name}} แบบ {{bible_code}} แก้แล้วกระทบของที่ลูกค้าเซ็น — ต้องเข้าเส้น requote ก่อนผลิตต่อ (ADR-037 ห้ามแก้เงียบ)', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_shop_drawing_revision(uuid, text, text, boolean)',
    'rpc_field_assess_rework(uuid, numeric, text)'
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
