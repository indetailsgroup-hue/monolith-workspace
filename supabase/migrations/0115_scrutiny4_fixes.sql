-- Migration: scrutiny4_fixes — ผล scrutinize รอบ 4 (0109–0114)
--
-- S4-1 (0109): rpc_field_price_estimate ไม่มี permission check — ใครก็ตามที่ authenticated
--        ออกช่วงราคา+เขียน audit ได้ → เพิ่ม check เดียวกับ designer_candidates (governance หรือ site access)
-- S4-2 (0114): review sweep mark review_card_sent_at ทั้งที่ fn_prod_curated เงียบเมื่อไม่มีกลุ่ม active
--        → การ์ดรีวิวหายเงียบถาวร (mark แล้วไม่ retry) — เพิ่มเงื่อนไขกลุ่มต้องมีจริงก่อน mark
-- S4-3 (0110): สมาชิก roster ออกจากกลุ่มกลางเฟส (memberLeft → left_at) แต่ roster ค้าง 'active'
--        → "ตาม" ตาบอด: roster_status บอกครบทั้งที่คนไม่อยู่แล้ว — trigger ถอยกลับเป็น 'approved' + audit
-- ตรวจแล้วไม่เป็นบั๊ก: rejoin หลัง left (partial unique where left_at is null → insert แถวใหม่ trigger ยิง ✓),
--        punch×QC override interaction (แก้ issue ก่อนแล้ว override ได้ — ลำดับถูก), G1 audience ทุก template ใหม่ถูกชนิด

-- ---------------------------------------------------------------------------
-- S4-1: rebase rpc_field_price_estimate จาก 0109 (เพิ่ม permission check ปากทาง)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_price_estimate(
  p_sqm numeric, p_grade text, p_context text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_min numeric; v_max numeric;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
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

-- ---------------------------------------------------------------------------
-- S4-2: rebase fn_after_sales_sweep จาก 0114 (review ต้องมีกลุ่ม active ก่อน mark)
-- ---------------------------------------------------------------------------
create or replace function public.fn_after_sales_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_ended int := 0;
  v_reviews int := 0;
begin
  -- J2.10: หมดประกัน (จุดจบที่สง่างาม — ไม่หายเงียบ)
  for v_p in
    select p.id, p.site_code, p.name, p.warranty_until
    from public.installation_projects p
    where p.status = 'completed' and p.warranty_until is not null
      and p.warranty_until < (timezone('utc', now()))::date
      and exists (select 1 from public.line_groups g
        where g.project_id = p.id and g.group_type = 'customer' and g.status = 'active')
  loop
    perform public.fn_prod_curated(v_p.id, 'tpl_warranty_end',
      jsonb_build_object('project_name', v_p.name));
    update public.line_groups set status = 'archived'
    where project_id = v_p.id and group_type = 'customer' and status = 'active';
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('warranty_ended', v_p.id, v_p.site_code,
      jsonb_build_object('warranty_until', v_p.warranty_until));
    v_ended := v_ended + 1;
  end loop;

  -- J2.11 (AS-3): 2 สัปดาห์ + ไม่มี issue ค้าง + **มีกลุ่ม active จริง** (S4-2 — ไม่มีกลุ่ม = ไม่ mark, sweep รอบหน้าลองใหม่)
  for v_p in
    select p.id, p.site_code, p.name
    from public.installation_projects p
    where p.status = 'completed' and p.review_card_sent_at is null
      and p.accepted_at is not null
      and p.accepted_at + interval '14 days' <= timezone('utc', now())
      and (p.warranty_until is null or p.warranty_until >= (timezone('utc', now()))::date)
      and not exists (select 1 from public.installation_issues i
        where i.project_id = p.id and i.status <> 'resolved')
      and exists (select 1 from public.line_groups g
        where g.project_id = p.id and g.group_type = 'customer' and g.status = 'active')
  loop
    perform public.fn_prod_curated(v_p.id, 'tpl_review_referral', jsonb_build_object(
      'project_name', v_p.name,
      'ref_code', upper(left(md5(v_p.id::text), 6))));
    update public.installation_projects set review_card_sent_at = timezone('utc', now()) where id = v_p.id;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('review_card_sent', v_p.id, v_p.site_code,
      jsonb_build_object('ref_code', upper(left(md5(v_p.id::text), 6))));
    v_reviews := v_reviews + 1;
  end loop;

  return jsonb_build_object('warranty_ended', v_ended, 'review_cards', v_reviews);
end; $$;

-- ---------------------------------------------------------------------------
-- S4-3: สมาชิกออกจากกลุ่มกลางเฟส → roster ถอยกลับ 'approved' + audit (ให้ "ตาม" เห็นจริง)
-- ---------------------------------------------------------------------------
create or replace function public.fn_roster_on_member_left()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_g record;
  v_emp uuid;
  v_n int := 0;
begin
  if new.left_at is null or old.left_at is not null then return new; end if;
  select g.project_id, g.site_code into v_g from public.line_groups g where g.id = new.group_id;
  if v_g.project_id is null then return new; end if;

  select b.employee_id into v_emp from public.identity_binding b
  where b.line_user_id = new.line_user_id and b.is_active limit 1;
  if v_emp is null then return new; end if;

  update public.phase_rosters
  set status = 'approved', joined_at = null
  where project_id = v_g.project_id and employee_id = v_emp and status = 'active';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('roster_member_left', v_g.project_id, v_g.site_code,
      jsonb_build_object('employee_id', v_emp, 'line_user_id', new.line_user_id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_roster_member_left on public.line_group_members;
create trigger trg_roster_member_left after update on public.line_group_members
  for each row execute function public.fn_roster_on_member_left();
