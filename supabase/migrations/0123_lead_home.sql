-- Migration: lead_home — DJ-4 หน้าแรกหัวหน้า "บ้านของฉันทั้งหมด" + ปุ่มถัดไปที่ถูกต้องต่อบ้าน (มติ D4-1/D4-5)
-- Depends on: 0120 (checkin), 0121 (issues category/ack), 0122 (daily report), 0090 (lanes)
--
--   logic state→action ตารางเดียวหลังบ้าน (ปรัชญาเดียวทั้งแอป — หน้าบ้านแค่ render):
--   ① ปัญหาใหม่ยังไม่มีคนรับ → ดูปัญหา  ② เลนครบ → ส่งปิดบ้าน  ③ ยังไม่เข้างาน → เข้างาน
--   ④ เข้างานอยู่ → เลิกงาน+ส่งรายงาน  ⑤ เลิกแล้วรายงานยังไม่ส่ง → ส่งรายงาน  ⑥ เรียบร้อย
--   บ้านของฉัน = foreman_employee_id ตรง binding; ไม่มีเลย → บ้านที่เป็นสมาชิก (fallback)

create or replace function public.rpc_field_lead_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_today date := (timezone('utc', now()))::date;
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
        or (v_emp is null)  -- office/governance (ผ่าน permission ข้างบน) เห็นทุกบ้าน active
      )
  ) houses;

  return v_result;
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_field_lead_home() from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_lead_home() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_lead_home() to service_role';
  end if;
end $$;
