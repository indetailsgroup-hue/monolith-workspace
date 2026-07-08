-- Migration: scrutiny5_fixes — ผล scrutinize รอบ 5 (0116–0129)
--
-- S5-1 (0117): ตัวสัญญาถึงลูกค้าพิมพ์ "50%% = ..." — '%%' ใน string concat ธรรมดา (ไม่ใช่ format) → '%'
-- S5-2 (0116): lead ที่ site_code ยังไม่ resolve (สถานะ site_unresolved — ลูกค้าใหม่สุด) หายจาก list/sweep
--        และ assign/close โดน block (has_site_access(null)=false) → lead ตกหล่นตรงต้นทาง (ขัดมติ Sale-2 ตรงๆ)
-- S5-3 (0120/0122/0123): วันทำงานใช้วันที่ UTC — เข้างาน 06:50 น.ไทย = work_date เมื่อวาน → เย็นเลิกงานไม่ได้
--        → business date = Asia/Bangkok ทั้งครอบครัว (checkin/checkout/today/daily report/lead home)
-- S5-4 (0126): คิว "ต้องนัดตรวจหน้างานร่วม" ค้างถาวรหลัง G3 อนุมัติ (in_progress ที่ step เดิมแยกไม่ออก)
--        → ตัดออกเมื่องวด g3_approved ยิงแล้ว (สัญญาณอนุมัติที่มีจริงในระบบ)

-- ---------------------------------------------------------------------------
-- S5-3: helper วันทำงานไทย + default ของตารางวัน
-- ---------------------------------------------------------------------------
create or replace function public.fn_business_date()
returns date language sql stable as $$
  select (timezone('Asia/Bangkok', now()))::date;
$$;
grant execute on function public.fn_business_date() to public;

alter table public.site_checkins alter column work_date set default public.fn_business_date();
alter table public.daily_reports alter column report_date set default public.fn_business_date();

create or replace function public.rpc_field_team_checkin(
  p_project_id uuid, p_members jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
  v_n int;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  v_n := coalesce(jsonb_array_length(p_members), 0);
  if v_n = 0 then
    raise exception 'ติ๊กรายชื่อทีมที่มาอย่างน้อย 1 คน' using errcode = 'check_violation';
  end if;

  select id into v_id from public.site_checkins
  where project_id = p_project_id and work_date = public.fn_business_date();
  if v_id is not null then
    return jsonb_build_object('checkin_id', v_id, 'already', true);
  end if;

  insert into public.site_checkins (project_id, site_code, members, member_count)
  values (p_project_id, v_p.site_code, p_members, v_n)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('team_checked_in', p_project_id, v_p.site_code,
    jsonb_build_object('checkin_id', v_id, 'member_count', v_n));
  return jsonb_build_object('checkin_id', v_id, 'member_count', v_n, 'already', false);
end; $$;

create or replace function public.rpc_field_team_checkout(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_rate numeric;
  v_hours numeric;
  v_man_hours numeric;
begin
  select c.*, p.site_code as p_site into v_c
  from public.site_checkins c join public.installation_projects p on p.id = c.project_id
  where c.project_id = p_project_id and c.work_date = public.fn_business_date()
  for update;
  if not found then
    raise exception 'วันนี้ยังไม่ได้กดเข้างานของบ้านนี้' using errcode = 'no_data_found';
  end if;
  if not (public.is_governance_role() or public.has_site_access(v_c.p_site) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_c.checked_out_at is not null then
    return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_c.man_hours, 'already', true);
  end if;

  v_hours := round(extract(epoch from (timezone('utc', now()) - v_c.checked_in_at)) / 3600.0, 2);
  v_man_hours := round(v_hours * v_c.member_count, 2);
  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;

  update public.site_checkins
  set checked_out_at = timezone('utc', now()), man_hours = v_man_hours
  where id = v_c.id;

  insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, ref_id, note)
  values (p_project_id, v_c.p_site, 'labor', v_c.work_date, v_man_hours, v_rate,
    case when v_rate is not null then round(v_man_hours * v_rate, 2) end,
    'checkin', v_c.id,
    case when v_rate is null then 'เรทแรงงานยังไม่ตั้ง — F3 ตั้งแล้ว backfill (PK-2)' end);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('team_checked_out', p_project_id, v_c.p_site,
    jsonb_build_object('checkin_id', v_c.id, 'hours', v_hours,
      'member_count', v_c.member_count, 'man_hours', v_man_hours, 'rate', v_rate));
  return jsonb_build_object('checkin_id', v_c.id, 'man_hours', v_man_hours,
    'amount', case when v_rate is not null then round(v_man_hours * v_rate, 2) end, 'already', false);
end; $$;

create or replace function public.rpc_field_today_checkin(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
      'checkin_id', c.id, 'checked_in_at', c.checked_in_at, 'checked_out_at', c.checked_out_at,
      'member_count', c.member_count, 'man_hours', c.man_hours)
    from public.site_checkins c
    join public.installation_projects p on p.id = c.project_id
    where c.project_id = p_project_id and c.work_date = public.fn_business_date()
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))), 'null'::jsonb);
$$;

create or replace function public.rpc_field_draft_daily_report(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_today date := public.fn_business_date();
  v_day_start timestamptz;
  v_draft jsonb;
  v_existing record;
  v_id uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  v_day_start := v_today::timestamp at time zone 'Asia/Bangkok';  -- เที่ยงคืนไทยของวันนี้

  select id, status into v_existing from public.daily_reports
  where project_id = p_project_id and report_date = v_today;
  if v_existing.status = 'sent' then
    raise exception 'รายงานวันนี้ส่งแล้ว — แก้ไม่ได้ (ฉบับที่ส่ง = snapshot)' using errcode = 'check_violation';
  end if;

  v_draft := jsonb_build_object(
    'project_name', v_p.name,
    'date', v_today,
    'lanes', (select jsonb_build_object(
        'total', count(*),
        'done', count(*) filter (where t.status = 'done'),
        'in_progress', count(*) filter (where t.status = 'in_progress'))
      from public.installation_tasks t
      join public.installation_rooms r on r.id = t.room_id
      where r.project_id = p_project_id),
    'checklist', (select jsonb_build_object(
        'ticked', coalesce(sum((select count(*) from jsonb_each(coalesce(t.checklist_state, '{}'::jsonb)) e
                                where e.value = 'true'::jsonb)), 0))
      from public.installation_tasks t
      join public.installation_rooms r on r.id = t.room_id
      where r.project_id = p_project_id),
    'photos_today', (select count(*) from public.installation_photos ph
      where ph.project_id = p_project_id and ph.created_at >= v_day_start),
    'issues_today', (select count(*) from public.installation_issues i
      where i.project_id = p_project_id and i.created_at >= v_day_start),
    'issues_open', (select count(*) from public.installation_issues i
      where i.project_id = p_project_id and i.status <> 'resolved'),
    'man_hours', (select c.man_hours from public.site_checkins c
      where c.project_id = p_project_id and c.work_date = v_today),
    'member_count', (select c.member_count from public.site_checkins c
      where c.project_id = p_project_id and c.work_date = v_today));

  if v_existing.id is not null then
    update public.daily_reports set draft = v_draft where id = v_existing.id returning id into v_id;
  else
    insert into public.daily_reports (project_id, site_code, draft)
    values (p_project_id, v_p.site_code, v_draft) returning id into v_id;
  end if;
  return jsonb_build_object('report_id', v_id, 'draft', v_draft);
end; $$;

create or replace function public.rpc_field_lead_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_today date := public.fn_business_date();
  v_result jsonb;
begin
  select b.employee_id into v_emp from public.identity_binding b
  where b.auth_user_id = auth.uid() and b.is_active limit 1;

  if not (v_emp is not null or public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(h order by (h ->> 'urgency')::int asc, h ->> 'name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'project_id', p.id, 'name', p.name, 'status', p.status,
      'open_issues', s.open_issues, 'unacked_issues', s.unacked,
      'lanes_done', s.lanes_done, 'lanes_total', s.lanes_total,
      'checkin', s.ck,
      'urgency', s.urgency,
      'next_action', case
        when s.urgency = 1 then jsonb_build_object('key', 'issues', 'label', '🔴 ดูปัญหา (' || s.unacked || ' เรื่องยังไม่มีคนรับ)')
        when s.urgency = 2 then jsonb_build_object('key', 'close_house', 'label', '🏁 งานช่างครบแล้ว — ส่งปิดบ้าน')
        when s.urgency = 3 then jsonb_build_object('key', 'checkin', 'label', '🌅 กดเข้างาน + ติ๊กทีม')
        when s.urgency = 4 then jsonb_build_object('key', 'checkout_report', 'label', '🌇 เลิกงาน + ส่งรายงานวันนี้')
        when s.urgency = 5 then jsonb_build_object('key', 'send_report', 'label', '📋 ส่งรายงานวันนี้')
        else jsonb_build_object('key', 'ok', 'label', '✅ วันนี้เรียบร้อย')
      end) as h
    from public.installation_projects p
    cross join lateral (
      select
        (select count(*) from public.installation_issues i
          where i.project_id = p.id and i.status <> 'resolved') as open_issues,
        (select count(*) from public.installation_issues i
          where i.project_id = p.id and i.status = 'open' and i.acked_at is null) as unacked,
        (select count(*) from public.installation_tasks t join public.installation_rooms r on r.id = t.room_id
          where r.project_id = p.id and t.status = 'done') as lanes_done,
        (select count(*) from public.installation_tasks t join public.installation_rooms r on r.id = t.room_id
          where r.project_id = p.id) as lanes_total,
        (select jsonb_build_object('checked_in', c.checked_in_at is not null, 'checked_out', c.checked_out_at is not null)
          from public.site_checkins c where c.project_id = p.id and c.work_date = v_today) as ck,
        (select d.status from public.daily_reports d
          where d.project_id = p.id and d.report_date = v_today) as report_status
    ) base
    cross join lateral (
      select base.*, case
        when base.unacked > 0 then 1
        when p.status = 'active' and base.lanes_total > 0 and base.lanes_done = base.lanes_total then 2
        when base.ck is null then 3
        when (base.ck ->> 'checked_out')::boolean is not true then 4
        when coalesce(base.report_status, 'none') <> 'sent' then 5
        else 6
      end as urgency
    ) s
    where p.status in ('active', 'customer_review')
      and (
        (v_emp is not null and p.foreman_employee_id = v_emp)
        or (v_emp is not null and not exists (
              select 1 from public.installation_projects p2 where p2.foreman_employee_id = v_emp
                and p2.status in ('active', 'customer_review'))
            and public.fn_installation_is_member(p.id))
        or (v_emp is null)
      )
  ) houses;

  return v_result;
end; $$;

-- ---------------------------------------------------------------------------
-- S5-2: lead ต้องเห็นตั้งแต่ site ยังไม่ resolve (rebase 0116 ทั้งครอบครัว)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_assign_lead(
  p_conversation_id uuid, p_employee_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_emp uuid := p_employee_id;
begin
  select id, site_code into v_c from public.line_oa_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found' using errcode = 'no_data_found'; end if;
  -- site ยังไม่ resolve = lead ต้นทาง — staff ที่มี site access ใดๆ ดูแลได้
  if not (public.is_governance_role()
          or (v_c.site_code is not null and public.has_site_access(v_c.site_code))
          or (v_c.site_code is null and exists (
                select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code)))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_emp is null then
    select b.employee_id into v_emp from public.identity_binding b
    where b.auth_user_id = auth.uid() and b.is_active limit 1;
    if v_emp is null then
      raise exception 'ยังไม่ผูกตัวตน — ระบุ employee id หรือผูก LINE ก่อน' using errcode = 'no_data_found';
    end if;
  end if;
  update public.line_oa_conversations set lead_owner_employee_id = v_emp where id = p_conversation_id;
  return jsonb_build_object('conversation_id', p_conversation_id, 'lead_owner', v_emp);
end; $$;

create or replace function public.rpc_field_close_lead(
  p_conversation_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c record;
begin
  select id, site_code, lead_closed_at into v_c from public.line_oa_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role()
          or (v_c.site_code is not null and public.has_site_access(v_c.site_code))
          or (v_c.site_code is null and exists (
                select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code)))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_reason not in ('too_expensive', 'went_quiet', 'competitor', 'other') then
    raise exception 'เหตุผลต้องเป็น: too_expensive / went_quiet / competitor / other' using errcode = 'check_violation';
  end if;
  if v_c.lead_closed_at is not null then
    return jsonb_build_object('conversation_id', p_conversation_id, 'already', true);
  end if;

  update public.line_oa_conversations
  set lead_closed_at = timezone('utc', now()), lead_lost_reason = p_reason, lead_lost_note = p_note
  where id = p_conversation_id;

  insert into public.installation_audit_log (event_type, site_code, detail)
  values ('lead_closed', v_c.site_code,
    jsonb_build_object('conversation_id', p_conversation_id, 'reason', p_reason,
      'note', left(coalesce(p_note, ''), 200), 'by', public.resolve_actor()));
  return jsonb_build_object('conversation_id', p_conversation_id, 'already', false);
end; $$;

create or replace function public.rpc_field_list_leads()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(row_to_json(l)) from (
    select c.id as conversation_id, c.site_code, c.lead_owner_employee_id,
      c.last_activity_at, (c.status = 'site_unresolved') as site_unresolved,
      floor(extract(epoch from (timezone('utc', now()) - c.last_activity_at)) / 86400)::int as days_silent
    from public.line_oa_conversations c
    where c.status in ('open', 'site_unresolved') and c.lead_closed_at is null
      and not exists (
        select 1 from public.work_item w
        join public.line_oa_customer_identity ci on ci.customer_id = w.primary_customer_id
        where ci.line_user_id = c.line_user_id)
    order by c.last_activity_at asc
  ) l), '[]'::jsonb);
end; $$;

create or replace function public.fn_lead_followup_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_l record;
  v_days int;
  v_pushed int := 0;
  v_escalated int := 0;
  v_unowned int := 0;
begin
  select * into v_cfg from public.lead_followup_config where id = true;

  for v_l in
    select c.id, c.site_code, c.line_user_id, c.lead_owner_employee_id,
      c.last_activity_at, c.last_followup_push_at, c.escalated_at
    from public.line_oa_conversations c
    where c.status in ('open', 'site_unresolved') and c.lead_closed_at is null
      and c.last_activity_at < timezone('utc', now()) - make_interval(days => v_cfg.quiet_days)
      and not exists (
        select 1 from public.work_item w
        join public.line_oa_customer_identity ci on ci.customer_id = w.primary_customer_id
        where ci.line_user_id = c.line_user_id)
  loop
    v_days := floor(extract(epoch from (timezone('utc', now()) - v_l.last_activity_at)) / 86400)::int;

    if v_days >= v_cfg.escalate_days and v_l.escalated_at is null and v_cfg.h1_employee_id is not null then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_cfg.h1_employee_id),
          'fyi', 'lead_followup', 'tpl_lead_escalate',
          jsonb_build_object('days', v_days::text, 'ref', right(v_l.line_user_id, 4)),
          false, null, true, null, v_l.site_code);
        update public.line_oa_conversations set escalated_at = timezone('utc', now()) where id = v_l.id;
        v_escalated := v_escalated + 1;
      exception when others then null;
      end;
    end if;

    if v_l.lead_owner_employee_id is null then
      v_unowned := v_unowned + 1;
    elsif v_l.last_followup_push_at is null or v_l.last_followup_push_at < v_l.last_activity_at then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_l.lead_owner_employee_id),
          'personal_responsibility', 'lead_followup', 'tpl_lead_quiet',
          jsonb_build_object('days', v_days::text, 'ref', right(v_l.line_user_id, 4)),
          false, null, true, null, v_l.site_code);
        update public.line_oa_conversations set last_followup_push_at = timezone('utc', now()) where id = v_l.id;
        v_pushed := v_pushed + 1;
      exception when others then null;
      end;
    end if;
  end loop;

  return jsonb_build_object('pushed', v_pushed, 'escalated', v_escalated, 'unowned', v_unowned);
end; $$;

-- ---------------------------------------------------------------------------
-- S5-1: สัญญา '%%' → '%' (rebase rpc_field_generate_contract จาก 0117 — แก้บรรทัดเดียว)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_generate_contract(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_req jsonb;
  v_plan jsonb;
  v_total numeric;
  v_ver int;
  v_id uuid;
  v_body text;
  v_line text := chr(10);
begin
  select id, site_code, name, work_item_id into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select a.corrected_fields into v_req from public.capture_artifact a
  where a.capture_type = 'customer_requirement' and a.linked_entity_id = v_p.work_item_id
  order by a.created_at desc limit 1;
  if v_req is null then
    raise exception 'ยังไม่มีใบบันทึกความต้องการของบ้านนี้ — สัญญาต้อง generate จากข้อมูลจริง' using errcode = 'no_data_found';
  end if;

  select jsonb_agg(jsonb_build_object('seq', i.seq, 'label', i.label, 'percent', i.percent, 'amount', i.amount) order by i.seq),
         sum(i.amount)
  into v_plan, v_total
  from public.payment_installments i where i.project_id = p_project_id;
  if v_plan is null then
    raise exception 'ยังไม่ตั้งแผนชำระ — ตั้งแผน 4 งวดก่อน (การ์ดการเงินในหน้าบ้าน)' using errcode = 'no_data_found';
  end if;

  update public.contract_documents set status = 'superseded'
  where project_id = p_project_id and status = 'draft';
  select coalesce(max(version), 0) + 1 into v_ver from public.contract_documents where project_id = p_project_id;

  v_body :=
    'สัญญาว่าจ้างผลิตและติดตั้งเฟอร์นิเจอร์ (โครงร่าง v1 — รอทนาย review skeleton)' || v_line ||
    'ฉบับที่ ' || v_ver || ' · บ้าน: ' || v_p.name || v_line || v_line ||
    'ผู้ว่าจ้าง: ' || coalesce(v_req ->> 'customer_name', '-') ||
    ' · ติดต่อ: ' || coalesce(v_req ->> 'phone', v_req ->> 'line_id', '-') || v_line ||
    'ที่อยู่หน้างาน: ' || coalesce(v_req ->> 'address', '-') || v_line ||
    'ขอบเขตงาน: ' || coalesce(v_req ->> 'design_scope_areas', '-') ||
    ' (' || coalesce(v_req ->> 'design_scope_sqm', '-') || ' ตร.ม.)' || v_line ||
    'วัสดุ: โครง ' || coalesce(v_req ->> 'carcass_material', '-') ||
    ' · ผิว ' || coalesce(v_req ->> 'surface_material', '-') ||
    ' · อุปกรณ์ ' || coalesce(v_req ->> 'fitting_brand', '-') || v_line || v_line ||
    'มูลค่าสัญญารวม: ' || to_char(v_total, 'FM999,999,999') || ' บาท แบ่งชำระ:' || v_line ||
    (select string_agg('  งวด ' || (e ->> 'seq') || ' · ' || (e ->> 'label') || ' — ' ||
        (e ->> 'percent') || '% = ' || to_char((e ->> 'amount')::numeric, 'FM999,999,999') || ' บาท', v_line order by (e ->> 'seq')::int)
      from jsonb_array_elements(v_plan) e) || v_line || v_line ||
    'ประกัน: งานติดตั้ง/โครงตู้ DAPH 1 ปีนับจากวันตรวจรับ · อุปกรณ์ฟิตติ้งตามประกันแบรนด์ผู้ผลิต' || v_line ||
    'เอกสารนี้ generate จากระบบ IIMOS — ข้อมูลชุดเดียวกับที่ใช้เดินงานและแจ้งงวดอัตโนมัติ';

  insert into public.contract_documents (project_id, site_code, version, data, body)
  values (p_project_id, v_p.site_code, v_ver,
    jsonb_build_object('requirement', v_req, 'installments', v_plan, 'total', v_total,
      'warranty', 'DAPH 1 ปี + ฟิตติ้งตามแบรนด์'),
    v_body)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('contract_generated', p_project_id, v_p.site_code,
    jsonb_build_object('doc_id', v_id, 'version', v_ver, 'total', v_total));
  return jsonb_build_object('doc_id', v_id, 'version', v_ver, 'body', v_body);
end; $$;

-- ---------------------------------------------------------------------------
-- S5-4: verify_pending ตัดบ้านที่ G3 อนุมัติแล้ว (สัญญาณ = งวด g3_approved ยิงแล้ว)
-- (rebase rpc_field_designer_home จาก 0126 — เพิ่มเงื่อนไขเดียว)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_designer_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
begin
  select b.employee_id into v_emp from public.identity_binding b
  where b.auth_user_id = auth.uid() and b.is_active limit 1;
  if not (v_emp is not null or public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'gates', coalesce((select jsonb_agg(row_to_json(g) order by g.waiting_minutes desc) from (
      select m.id as milestone_id, p.id as project_id, p.name, m.station,
        floor(extract(epoch from (timezone('utc', now()) - m.reported_at)) / 60)::int as waiting_minutes,
        c.sla_minutes,
        p.work_item_id
      from public.production_milestones m
      join public.installation_projects p on p.id = m.project_id
      join public.factory_gate_config c on c.station = m.station
      where m.is_gate and m.approved_at is null and m.reported_at is not null
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) g), '[]'::jsonb),

    'verify_pending', coalesce((select jsonb_agg(row_to_json(v)) from (
      select p.id as project_id, p.name, p.work_item_id
      from public.installation_projects p
      join public.work_item w on w.id = p.work_item_id
      where w.current_step = '3D_Rendering_Final'
        and not exists (select 1 from public.capture_artifact a
          where a.capture_type = 'site_design_verification' and a.status = 'emitted'
            and a.linked_entity_id = p.id)
        -- S5-4: G3 อนุมัติแล้ว (งวด g3_approved ยิงแล้ว) = พ้นช่วงตรวจก่อนเซ็น — ไม่ค้างคิว
        and not exists (select 1 from public.payment_installments i
          where i.project_id = p.id and i.trigger_event = 'g3_approved' and i.status <> 'pending')
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) v), '[]'::jsonb),

    'awaiting_sign', coalesce((select jsonb_agg(row_to_json(s) order by s.age_days desc) from (
      select p.id as project_id, p.name, p.work_item_id,
        floor(extract(epoch from (timezone('utc', now()) - w.created_at)) / 86400)::int as age_days
      from public.installation_projects p
      join public.work_item w on w.id = p.work_item_id
      where w.status = 'awaiting_approval' and w.current_step = '3D_Rendering_Final'
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) s), '[]'::jsonb),

    'design_issues', coalesce((select jsonb_agg(row_to_json(i) order by i.created_at) from (
      select i.id as issue_id, p.id as project_id, p.name, i.description, i.created_at,
        (i.acked_at is not null) as acked
      from public.installation_issues i
      join public.installation_projects p on p.id = i.project_id
      where i.category = 'design' and i.status <> 'resolved'
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) i), '[]'::jsonb));
end; $$;
