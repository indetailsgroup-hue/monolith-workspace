-- Migration: after_sales — J2.9 Punch list + J2.10 Warranty lifecycle + J2.11 Review/Referral (ADR-042 AS-1/2/3)
-- Depends on: 0096 (issues), 0098 (postback approve → status completed), 0111 (rpc_request_customer_acceptance ล่าสุด), 0107 (fn_prod_curated), 0089 (pg_cron pattern)
--
--   J2.9  punch list = reuse installation_issues (source += customer_review/warranty) + gate "ทุกข้อ resolved
--         จึงส่งตรวจรับรอบใหม่ได้" (AS-1 มติชัด — hard, ไม่มี override) + แจ้งซ่อม = #ปัญหา ในกลุ่มเดิม (ไม่ดักแชท)
--   J2.10 ตรวจรับ → trigger ตั้ง accepted_at + warranty_until (+1 ปี) + การ์ดขอบคุณสรุปประกันสองชั้น
--         (DAPH 1 ปี / ฟิตติ้งตามแบรนด์ — AS-2.1); cron sweep หมดประกัน → การ์ดอำลา + archive กลุ่ม
--   J2.11 cron sweep รีวิว: 2 สัปดาห์หลังตรวจรับ + ไม่มี issue ค้าง (มี → เลื่อนจนปิด) → การ์ดรีวิว+แนะนำเพื่อน
--         (ref code ต่อบ้าน — วัด referral; incentive v1 ไม่มี)

-- ---------------------------------------------------------------------------
-- (1) J2.9: source ใหม่ + gate punch ใน rpc_request_customer_acceptance (rebase 0111)
-- ---------------------------------------------------------------------------
alter table public.installation_issues drop constraint if exists installation_issues_source_check;
alter table public.installation_issues add constraint installation_issues_source_check
  check (source in ('pwa', 'line_group', 'customer_review', 'warranty'));

alter table public.installation_projects add column if not exists accepted_at timestamptz;
alter table public.installation_projects add column if not exists warranty_until date;
alter table public.installation_projects add column if not exists review_card_sent_at timestamptz;

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
  v_punch int;
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

  -- J2.9 (AS-1 — hard, ไม่มี override): punch list ทุกข้อต้อง resolved ก่อนส่งตรวจรับ (รอบแรกและรอบใหม่)
  select count(*) into v_punch from public.installation_issues i
  where i.project_id = p_project_id and i.status <> 'resolved';
  if v_punch > 0 then
    raise exception 'มีรายการเก็บงานค้าง % ข้อ — ปิดให้ครบก่อนส่งตรวจรับ (ADR-042 AS-1)', v_punch
      using errcode = 'check_violation';
  end if;

  -- J2.6: QC (E5) ภายในต้องผ่านก่อนเชิญลูกค้า — ผลล่าสุดต้อง pass (override PM/governance + เหตุผล)
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
-- (2) J2.10: ตรวจรับ → ประกันเริ่ม + การ์ดขอบคุณสรุปประกันสองชั้น (AS-2.1)
-- ---------------------------------------------------------------------------
create or replace function public.fn_project_on_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.accepted_at is null then
    new.accepted_at := timezone('utc', now());
    new.warranty_until := (new.accepted_at + interval '1 year')::date;
    -- การ์ดขอบคุณ + ประกันสองชั้น + ช่องแจ้งซ่อมถาวร (#ปัญหา — reuse flow เดิม ไม่ดักแชท)
    perform public.fn_prod_curated(new.id, 'tpl_warranty_summary', jsonb_build_object(
      'project_name', new.name,
      'warranty_until', to_char(new.warranty_until, 'DD/MM/YYYY')));
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('warranty_started', new.id, new.site_code,
      jsonb_build_object('accepted_at', new.accepted_at, 'warranty_until', new.warranty_until));
  end if;
  return new;
end; $$;
drop trigger if exists trg_project_completed on public.installation_projects;
create trigger trg_project_completed before update on public.installation_projects
  for each row execute function public.fn_project_on_completed();

-- ---------------------------------------------------------------------------
-- (3) sweep รายวัน: หมดประกัน → การ์ดอำลา + archive กลุ่ม · ครบ 2 สัปดาห์+ไม่มี issue ค้าง → การ์ดรีวิว
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

  -- J2.11 (AS-3): 2 สัปดาห์หลังตรวจรับ + ไม่มี issue ค้าง (มี → sweep รอบหน้าเก็บเอง = เลื่อนอัตโนมัติ)
  for v_p in
    select p.id, p.site_code, p.name
    from public.installation_projects p
    where p.status = 'completed' and p.review_card_sent_at is null
      and p.accepted_at is not null
      and p.accepted_at + interval '14 days' <= timezone('utc', now())
      and (p.warranty_until is null or p.warranty_until >= (timezone('utc', now()))::date)
      and not exists (select 1 from public.installation_issues i
        where i.project_id = p.id and i.status <> 'resolved')
  loop
    perform public.fn_prod_curated(v_p.id, 'tpl_review_referral', jsonb_build_object(
      'project_name', v_p.name,
      'ref_code', upper(left(md5(v_p.id::text), 6))));  -- ref ต่อบ้าน — lead ใหม่แจ้งรหัสนี้ = วัด referral ได้
    update public.installation_projects set review_card_sent_at = timezone('utc', now()) where id = v_p.id;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('review_card_sent', v_p.id, v_p.site_code,
      jsonb_build_object('ref_code', upper(left(md5(v_p.id::text), 6))));
    v_reviews := v_reviews + 1;
  end loop;

  return jsonb_build_object('warranty_ended', v_ended, 'review_cards', v_reviews);
end; $$;

-- cron รายวัน 02:30 UTC (= 09:30 เวลาไทย — หลัง digest เช้า) — SQL ตรง ไม่ต้องผ่าน edge
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-after-sales-sweep';
    perform cron.schedule('wf-after-sales-sweep', '30 2 * * *', 'select public.fn_after_sales_sweep()');
  else
    raise notice 'pg_cron unavailable — after-sales sweep จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (4) templates (customer ทั้งหมด — ผ่าน guardrail G1)
-- ---------------------------------------------------------------------------
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_warranty_summary', null, '🎉 ขอบคุณที่ไว้วางใจ DAPH ครับ บ้าน {{project_name}} ส่งมอบเรียบร้อย\n🛡️ ประกันงานติดตั้ง/โครงตู้ 1 ปี ถึง {{warranty_until}}\n🔩 อุปกรณ์ฟิตติ้ง (บานพับ/ราง) ประกันตามแบรนด์ผู้ผลิต\nพบปัญหาแจ้งได้เลย: พิมพ์ #ปัญหา ตามด้วยรายละเอียดในกลุ่มนี้ ทีมจะรับเรื่องทันทีครับ', true, 'customer', 'text'),
  ('tpl_warranty_end', null, '🙏 บ้าน {{project_name}} ครบกำหนดประกัน 1 ปีแล้วครับ ขอบคุณที่ให้ DAPH ดูแลตลอดปีที่ผ่านมา\nหลังจากนี้ยังติดต่อเราได้ทาง LINE OA นี้เสมอ — กลุ่มนี้จะปิดการแจ้งเตือนครับ ขอบคุณครับ', true, 'customer', 'text'),
  ('tpl_review_referral', null, 'สวัสดีครับ บ้าน {{project_name}} เข้าอยู่ 2 สัปดาห์แล้ว เป็นอย่างไรบ้างครับ 😊\n⭐ ถ้าพอใจ ฝากรีวิวให้ทีมงานหน่อยนะครับ\n🏠 แนะนำเพื่อนที่กำลังแต่งบ้าน: ให้เพื่อนแจ้งรหัส {{ref_code}} กับทีมงานได้เลยครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
begin
  execute 'revoke all on function public.fn_after_sales_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_after_sales_sweep() to service_role';
  end if;
end $$;
