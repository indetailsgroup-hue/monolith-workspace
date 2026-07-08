-- Migration: customer_docs — PK-4c Wave 3 (ADR-045 Q3ก / ADR-044 R-7): เอกสารลูกค้า C7 + รายงานแบบลิงก์
-- Depends on: 0135 (document_links + doc-view + rpc_doc_view_resolve — rebase ที่นี่), 0122/0130 (daily report),
--             0095 (line_groups — trigger welcome ตอนผูกกลุ่ม), 0107 (fn_prod_curated)
--
--   เนื้อหา 3 เอกสาร (Welcome Pack / Investment Guide / Journey Timeline) ปรับจาก C7 เข้าบริบทระบบจริง
--   (journey v2 + งวด 50/30/15/5 + ประกัน 1 ปี) — owner/ทีมแก้เนื้อหาได้ผ่าน RPC (governance)
--   **ผูกกลุ่มลูกค้าสำเร็จ → Welcome Pack ส่งเข้ากลุ่มอัตโนมัติ** (trigger — ไม่แตะ handler)
--   รายงานประจำวัน → D1/D2/D3 ได้ลิงก์อ่านฉบับเต็ม (สรุปย่อในการ์ดเหมือนเดิม)

-- ---------------------------------------------------------------------------
-- (1) เนื้อหาเอกสารลูกค้า + doc_type ใหม่
-- ---------------------------------------------------------------------------
alter table public.document_links drop constraint if exists document_links_doc_type_check;
alter table public.document_links add constraint document_links_doc_type_check
  check (doc_type in ('contract', 'variation_order', 'payment_notice', 'customer_doc', 'daily_report'));

create table if not exists public.customer_docs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text not null,
  updated_by text not null default public.resolve_actor(),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.customer_docs enable row level security;
create policy customer_docs_sel on public.customer_docs for select to authenticated using (true);

insert into public.customer_docs (slug, title, body) values
  ('welcome', 'ยินดีต้อนรับสู่ครอบครัว DAPH',
   'ยินดีต้อนรับครับ 🏠' || chr(10) || chr(10) ||
   'กลุ่ม LINE นี้คือช่องทางเดียวที่ท่านต้องใช้ตลอดโครงการ — ทีมที่เกี่ยวข้องกับบ้านของท่านอยู่ในนี้ครบ' || chr(10) ||
   'สิ่งที่ระบบจะส่งให้อัตโนมัติ: ความคืบหน้าการผลิตเป็นระยะ · แผนติดตั้ง · ใบแจ้งงวดชำระ · การ์ดตรวจรับ' || chr(10) ||
   'สิ่งที่ท่านทำได้ในกลุ่ม: สอบถามได้ทุกเรื่อง · แจ้งปัญหาพิมพ์ #ปัญหา ตามด้วยรายละเอียด ทีมรับเรื่องทันที' || chr(10) || chr(10) ||
   'ความเป็นส่วนตัว: ระบบเก็บเฉพาะรูปงานและเรื่องที่แจ้งผ่าน #ปัญหา — บทสนทนาทั่วไปไม่ถูกเก็บ'),
  ('journey', 'เส้นทางของบ้านคุณ ตั้งแต่วันนี้ถึงวันส่งมอบ',
   'บ้านของท่านจะเดินผ่าน 8 ช่วงหลัก:' || chr(10) ||
   '1. คุยความต้องการ + ประเมินช่วงราคาเบื้องต้น' || chr(10) ||
   '2. วัดหน้างานจริงโดยทีมวัด' || chr(10) ||
   '3. ออกแบบ 3D โดยดีไซเนอร์ที่จับคู่ตามสไตล์ของท่าน' || chr(10) ||
   '4. ตรวจแบบเทียบหน้างานจริงร่วมกัน แล้วท่านเซ็นอนุมัติแบบ' || chr(10) ||
   '5. ผลิตในโรงงาน (6 สถานี — ท่านได้เห็นความคืบหน้าเป็นระยะ)' || chr(10) ||
   '6. นัดหมายติดตั้งตามแผนที่ส่งให้ล่วงหน้า' || chr(10) ||
   '7. QC ภายในตรวจก่อน แล้วเชิญท่านตรวจรับผ่านการ์ดในกลุ่มนี้' || chr(10) ||
   '8. ส่งมอบ + เริ่มประกัน 1 ปีเต็ม' || chr(10) || chr(10) ||
   'ทุกก้าวสำคัญจะมีการ์ดแจ้งในกลุ่มนี้ — ท่านไม่ต้องตามงานเอง ระบบตามให้'),
  ('investment', 'การชำระเงินและการประกัน',
   'การแบ่งชำระมาตรฐาน 4 งวด (ปรับได้ตามสัญญา):' || chr(10) ||
   '• งวดที่ 1 — 50% เมื่อเซ็นสัญญา (เริ่มงานออกแบบ-ผลิต)' || chr(10) ||
   '• งวดที่ 2 — 30% เมื่อเซ็นอนุมัติแบบ 3D final' || chr(10) ||
   '• งวดที่ 3 — 15% ก่อนจัดส่ง-ติดตั้ง' || chr(10) ||
   '• งวดที่ 4 — 5% เมื่อตรวจรับงานเรียบร้อย' || chr(10) || chr(10) ||
   'ทุกงวดระบบส่งใบแจ้งอัตโนมัติในกลุ่ม — ตัวเลขตรงกับสัญญาเสมอเพราะมาจากข้อมูลชุดเดียวกัน' || chr(10) || chr(10) ||
   'การประกัน: งานติดตั้ง/โครงตู้ DAPH ประกัน 1 ปีนับจากวันตรวจรับ · อุปกรณ์ฟิตติ้ง (บานพับ/รางลิ้นชัก) ตามประกันแบรนด์ผู้ผลิต')
on conflict (slug) do nothing;

create or replace function public.rpc_field_set_customer_doc(p_slug text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  update public.customer_docs
  set title = p_title, body = p_body, updated_by = public.resolve_actor(), updated_at = timezone('utc', now())
  where slug = p_slug;
  if not found then
    insert into public.customer_docs (slug, title, body) values (p_slug, p_title, p_body);
  end if;
end; $$;

-- ---------------------------------------------------------------------------
-- (2) rebase rpc_doc_view_resolve (0135→0136): + customer_doc + daily_report
-- ---------------------------------------------------------------------------
create or replace function public.rpc_doc_view_resolve(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_l record;
  v_title text;
  v_body text;
begin
  select l.*, p.name as p_name into v_l
  from public.document_links l join public.installation_projects p on p.id = l.project_id
  where l.token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_l.expires_at < timezone('utc', now()) then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('doc_link_opened', v_l.project_id, v_l.site_code,
      jsonb_build_object('token', p_token, 'doc_type', v_l.doc_type, 'result', 'expired'));
    return jsonb_build_object('ok', false, 'reason', 'expired', 'project_name', v_l.p_name);
  end if;

  if v_l.doc_type = 'contract' then
    select 'สัญญา ฉบับที่ ' || d.version, d.body into v_title, v_body
    from public.contract_documents d where d.id = v_l.ref_id;
  elsif v_l.doc_type = 'variation_order' then
    select 'ใบสั่งเปลี่ยนแปลงงาน VO-' || lpad(v.vo_number::text, 3, '0'), v.body into v_title, v_body
    from public.variation_orders v where v.id = v_l.ref_id;
  elsif v_l.doc_type = 'customer_doc' then
    select d.title, d.body into v_title, v_body
    from public.customer_docs d where d.id = v_l.ref_id;
  elsif v_l.doc_type = 'daily_report' then
    select 'รายงานประจำวัน ' || to_char(r.report_date, 'DD/MM/YYYY') || ' — ' || v_l.p_name,
      'บ้าน: ' || v_l.p_name || chr(10) ||
      'วันที่: ' || to_char(r.report_date, 'DD/MM/YYYY') || chr(10) || chr(10) ||
      'เลนงาน: เสร็จ ' || coalesce(r.draft #>> '{lanes,done}', '0') || '/' || coalesce(r.draft #>> '{lanes,total}', '0') ||
      ' (กำลังทำ ' || coalesce(r.draft #>> '{lanes,in_progress}', '0') || ')' || chr(10) ||
      'checklist ที่ติ๊กสะสม: ' || coalesce(r.draft #>> '{checklist,ticked}', '0') || ' รายการ' || chr(10) ||
      'รูปวันนี้: ' || coalesce(r.draft ->> 'photos_today', '0') ||
      ' · ปัญหาใหม่วันนี้: ' || coalesce(r.draft ->> 'issues_today', '0') ||
      ' · ปัญหาค้างรวม: ' || coalesce(r.draft ->> 'issues_open', '0') || chr(10) ||
      'ทีมวันนี้: ' || coalesce(r.draft ->> 'member_count', '-') || ' คน · ' ||
      coalesce(r.draft ->> 'man_hours', '-') || ' man-hours' || chr(10) || chr(10) ||
      'หมายเหตุหัวหน้า: ' || coalesce(r.remark, '-')
    into v_title, v_body
    from public.daily_reports r where r.id = v_l.ref_id;
  else
    select 'ใบแจ้งงวดชำระ — งวด ' || i.seq || ' · ' || i.label,
      'ใบแจ้งงวดชำระ' || chr(10) ||
      'บ้าน: ' || v_l.p_name || chr(10) ||
      'งวดที่ ' || i.seq || ' · ' || i.label || ' (' || i.percent || '%)' || chr(10) ||
      'ยอดชำระ: ' || to_char(i.amount, 'FM999,999,999') || ' บาท' || chr(10) ||
      'สถานะ: ' || case i.status when 'paid' then 'ชำระแล้ว ขอบคุณครับ'
        when 'notified' then 'รอชำระ' else 'รอถึงงวด' end || chr(10) || chr(10) ||
      'ช่องทางชำระและใบเสร็จ: ติดต่อฝ่ายการเงิน DAPH ผ่านกลุ่ม LINE ของบ้านท่านได้เลยครับ'
    into v_title, v_body
    from public.payment_installments i where i.id = v_l.ref_id;
  end if;
  if v_body is null then
    return jsonb_build_object('ok', false, 'reason', 'doc_missing');
  end if;

  update public.document_links
  set opened_count = opened_count + 1, last_opened_at = timezone('utc', now())
  where token = p_token;
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('doc_link_opened', v_l.project_id, v_l.site_code,
    jsonb_build_object('token', p_token, 'doc_type', v_l.doc_type,
      'opened_count', v_l.opened_count + 1));

  return jsonb_build_object('ok', true, 'title', v_title, 'body', v_body,
    'project_name', v_l.p_name, 'doc_type', v_l.doc_type);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) ผูกกลุ่มลูกค้าสำเร็จ → Welcome Pack อัตโนมัติ (trigger — ไม่แตะ handler)
-- ---------------------------------------------------------------------------
create or replace function public.fn_welcome_on_group_bind()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_welcome uuid;
  v_journey uuid;
  v_invest uuid;
  v_u1 text; v_u2 text; v_u3 text;
begin
  if new.group_type <> 'customer' or new.status <> 'active' or new.project_id is null then
    return new;
  end if;
  select name into v_name from public.installation_projects where id = new.project_id;
  select id into v_welcome from public.customer_docs where slug = 'welcome';
  select id into v_journey from public.customer_docs where slug = 'journey';
  select id into v_invest from public.customer_docs where slug = 'investment';
  if v_welcome is null then return new; end if;  -- ยังไม่ seed = ข้ามเงียบ

  v_u1 := public.fn_issue_doc_link(new.project_id, 'customer_doc', v_welcome);
  v_u2 := public.fn_issue_doc_link(new.project_id, 'customer_doc', v_journey);
  v_u3 := public.fn_issue_doc_link(new.project_id, 'customer_doc', v_invest);

  insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
  values ('push', 'pending', 'tpl_welcome_pack', jsonb_build_object(
    'project_name', coalesce(v_name, '-'),
    'welcome_url', coalesce(v_u1, '(ขอลิงก์จากทีมงานได้ครับ)'),
    'journey_url', coalesce(v_u2, '(ขอลิงก์จากทีมงานได้ครับ)'),
    'invest_url', coalesce(v_u3, '(ขอลิงก์จากทีมงานได้ครับ)')),
    'group', new.line_group_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('welcome_pack_sent', new.project_id, new.site_code,
    jsonb_build_object('group', new.line_group_id));
  return new;
end; $$;
drop trigger if exists trg_welcome_group_bind on public.line_groups;
create trigger trg_welcome_group_bind after insert on public.line_groups
  for each row execute function public.fn_welcome_on_group_bind();

-- ---------------------------------------------------------------------------
-- (4) รายงานประจำวัน → D1/D2/D3 ได้ลิงก์ฉบับเต็ม (rebase 0122/0130→0136)
-- ---------------------------------------------------------------------------
update public.line_oa_message_templates
set body = body || chr(10) || '📄 ฉบับเต็ม: {{doc_url}}'
where template_key = 'tpl_daily_report' and body not like '%{{doc_url}}%';

create or replace function public.rpc_field_send_daily_report(p_report_id uuid, p_remark text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_c record;
  v_sent int := 0;
  v_summary text;
  v_url text;
begin
  select d.*, p.name as p_name into v_r
  from public.daily_reports d join public.installation_projects p on p.id = d.project_id
  where d.id = p_report_id for update;
  if not found then raise exception 'report not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_r.site_code) or public.fn_installation_is_member(v_r.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_r.status = 'sent' then
    return jsonb_build_object('report_id', p_report_id, 'already', true);
  end if;

  update public.daily_reports
  set status = 'sent', remark = p_remark, sent_at = timezone('utc', now())
  where id = p_report_id;

  v_summary := 'เลนเสร็จ ' || coalesce(v_r.draft #>> '{lanes,done}', '0') || '/' || coalesce(v_r.draft #>> '{lanes,total}', '0')
    || ' · รูปวันนี้ ' || coalesce(v_r.draft ->> 'photos_today', '0')
    || ' · ปัญหาค้าง ' || coalesce(v_r.draft ->> 'issues_open', '0')
    || ' · ' || coalesce(v_r.draft ->> 'man_hours', '-') || ' man-hrs';
  v_url := public.fn_issue_doc_link(v_r.project_id, 'daily_report', p_report_id);

  for v_c in select role, employee_id from public.ops_contacts where role in ('D1', 'D2', 'D3') loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_c.employee_id),
        'fyi', 'daily_report', 'tpl_daily_report',
        jsonb_build_object('project_name', v_r.p_name, 'summary', v_summary,
          'remark', left(coalesce(p_remark, '-'), 120),
          'doc_url', coalesce(v_url, '(เปิดฉบับเต็มในระบบ)')),
        false, null, true, null, v_r.site_code);
      v_sent := v_sent + 1;
    exception when others then null;
    end;
  end loop;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('daily_report_sent', v_r.project_id, v_r.site_code,
    jsonb_build_object('report_id', p_report_id, 'summary', v_summary,
      'remark', left(coalesce(p_remark, ''), 200), 'sent_to', v_sent));
  return jsonb_build_object('report_id', p_report_id, 'sent_to', v_sent, 'already', false);
end; $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_welcome_pack', null, '🏠 ยินดีต้อนรับสู่ครอบครัว DAPH ครับ — บ้าน {{project_name}}' || chr(10) ||
   'กลุ่มนี้คือช่องทางเดียวที่ท่านต้องใช้ตลอดโครงการ ทีมงานอยู่ครบในนี้ครับ' || chr(10) ||
   '📘 คู่มือลูกค้า: {{welcome_url}}' || chr(10) ||
   '🗺️ เส้นทางของบ้านคุณ: {{journey_url}}' || chr(10) ||
   '💰 การชำระเงินและประกัน: {{invest_url}}', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
begin
  execute 'revoke all on function public.rpc_field_set_customer_doc(text, text, text) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_set_customer_doc(text, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_set_customer_doc(text, text, text) to service_role';
  end if;
end $$;
