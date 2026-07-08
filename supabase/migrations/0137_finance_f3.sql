-- Migration: finance_f3 — Phase FJ (ADR-046): สลิป · ใบเสร็จอัตโนมัติ · เตือนค้างสุภาพ · หน้าเงิน F3
-- Depends on: 0108 (installments + rpc_finance_record_payment — rebase ที่นี่), 0135/0136 (doc-view — doc_type += receipt),
--             0092 (capture spine), 0107 (fn_prod_curated), 0121 (ops_contacts — += 'F3')

-- ---------------------------------------------------------------------------
-- (1) FJ-1: สลิปลูกค้า = capture evidence ผูกงวด (F3 กระทบยอดมือ — มติ 1)
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'payment_slip',
  jsonb_build_object('project_id','string','installment_seq','string','storage_path','string','note','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'สลิปโอนของลูกค้าถูกผูกกับงวดที่ถูกต้อง ก่อน F3 กระทบยอดกับแบงก์',
    'guards_against', 'เงินเข้าแต่ไม่รู้ของบ้านไหน/งวดไหน — บันทึกรับผิดงวดตอน dispute',
    'method', 'F3 แนบรูปสลิป + ระบุงวด → เช็คยอดแบงก์เอง → ค่อยกดบันทึกรับ',
    'pfmea_ref', jsonb_build_object('source_file', 'ADR-046', 'source_step', 'Payment'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
  )),
  'evidence_only',
  array['project_id','installment_seq']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create or replace function public.rpc_finance_submit_slip(
  p_installment_id uuid, p_storage_path text default null, p_note text default null, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_artifact uuid;
  v_status text;
begin
  select * into v_i from public.payment_installments where id = p_installment_id;
  if not found then raise exception 'installment not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_i.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  v_artifact := public.rpc_capture_ingest('payment_slip', 'app',
    'app://finance/slip/' || coalesce(p_client_key, gen_random_uuid()::text),
    'slip-' || coalesce(p_client_key, p_installment_id::text),
    v_i.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'สลิปโอน (finance)',
      jsonb_build_object('project_id', v_i.project_id::text, 'installment_seq', v_i.seq::text,
        'storage_path', coalesce(p_storage_path, ''), 'note', coalesce(p_note, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', v_i.project_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('payment_slip_recorded', v_i.project_id, v_i.site_code,
    jsonb_build_object('installment_id', p_installment_id, 'seq', v_i.seq, 'artifact_id', v_artifact));
  return jsonb_build_object('artifact_id', v_artifact, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (2) FJ-2: ใบเสร็จอัตโนมัติหลังบันทึกรับ (มติ 2) — rebase rpc_finance_record_payment (0108→0137)
-- ---------------------------------------------------------------------------
alter table public.document_links drop constraint if exists document_links_doc_type_check;
alter table public.document_links add constraint document_links_doc_type_check
  check (doc_type in ('contract', 'variation_order', 'payment_notice', 'customer_doc', 'daily_report', 'receipt'));

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  receipt_no text unique not null,
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  installment_id uuid not null unique,          -- 1 งวด = 1 ใบเสร็จ (บันทึกรับซ้ำ = idempotent)
  amount numeric not null,
  label text not null,
  body text not null,
  issued_by text not null default public.resolve_actor(),
  issued_at timestamptz not null default timezone('utc', now())
);
alter table public.receipts enable row level security;
create policy receipts_sel on public.receipts for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));

create or replace function public.rpc_finance_record_payment(p_installment_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_name text;
  v_rno text;
  v_rid uuid;
  v_body text;
  v_url text;
  v_line text := chr(10);
begin
  select * into v_i from public.payment_installments where id = p_installment_id for update;
  if not found then raise exception 'installment not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_i.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_i.status = 'paid' then return; end if;
  update public.payment_installments
    set status = 'paid', paid_at = timezone('utc', now()), paid_recorded_by = public.resolve_actor()
  where id = p_installment_id;
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('payment_received', v_i.project_id, v_i.site_code,
    jsonb_build_object('seq', v_i.seq, 'amount', v_i.amount, 'note', p_note));

  -- ใบเสร็จ: เลขรัน RC-YYYY-run + snapshot จากงวดจริง (มติ 2; ฟอร์มผ่าน checklist บัญชี/ทนาย PK-5 ก่อนใช้จริง)
  select name into v_name from public.installation_projects where id = v_i.project_id;
  v_body :=
    'ใบเสร็จรับเงิน (โครงร่าง v1 — รอบัญชี/ทนาย review ฟอร์มก่อนใช้เป็นเอกสารภาษี)' || v_line || v_line ||
    'บ้าน: ' || coalesce(v_name, '-') || v_line ||
    'รายการ: งวดที่ ' || v_i.seq || ' · ' || v_i.label || ' (' || v_i.percent || '%)' || v_line ||
    'จำนวนเงินที่รับ: ' || to_char(v_i.amount, 'FM999,999,999') || ' บาท' || v_line ||
    'วันที่รับชำระ: ' || to_char(public.fn_business_date(), 'DD/MM/YYYY') || v_line ||
    'ผู้บันทึกรับ: ฝ่ายการเงิน DAPH' ||
    case when coalesce(btrim(p_note), '') <> '' then v_line || 'หมายเหตุ: ' || btrim(p_note) else '' end;

  insert into public.receipts (receipt_no, project_id, site_code, installment_id, amount, label, body)
  values ('RC-' || to_char(public.fn_business_date(), 'YYYY') || '-' ||
          lpad(nextval(pg_get_serial_sequence('public.receipts', 'seq'))::text, 5, '0'),
    v_i.project_id, v_i.site_code, p_installment_id, v_i.amount, v_i.label, v_body)
  returning id, receipt_no into v_rid, v_rno;
  update public.receipts set body = 'เลขที่: ' || v_rno || chr(10) || body where id = v_rid;

  v_url := public.fn_issue_doc_link(v_i.project_id, 'receipt', v_rid);
  perform public.fn_prod_curated(v_i.project_id, 'tpl_receipt', jsonb_build_object(
    'project_name', coalesce(v_name, '-'), 'label', v_i.label,
    'amount', to_char(v_i.amount, 'FM999,999,999'),
    'doc_url', coalesce(v_url, '(ขอใบเสร็จจากทีมงานได้เลยครับ)')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('receipt_issued', v_i.project_id, v_i.site_code,
    jsonb_build_object('receipt_no', v_rno, 'installment_id', p_installment_id, 'amount', v_i.amount));
end; $$;

-- ---------------------------------------------------------------------------
-- (3) FJ-3: เตือนค้างสุภาพครั้งเดียว → เกินอีกขั้นแจ้งภายใน (มติ 3)
-- ---------------------------------------------------------------------------
alter table public.payment_installments add column if not exists reminded_at timestamptz;
alter table public.payment_installments add column if not exists overdue_escalated_at timestamptz;

create table if not exists public.finance_config (
  id boolean primary key default true check (id),
  remind_days int not null default 5 check (remind_days > 0),
  escalate_days int not null default 10 check (escalate_days > 0),
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);
insert into public.finance_config (id) values (true) on conflict do nothing;
alter table public.finance_config enable row level security;
create policy finance_config_sel on public.finance_config for select to authenticated using (true);

create or replace function public.rpc_finance_set_config(p_remind_days int, p_escalate_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  update public.finance_config set remind_days = p_remind_days, escalate_days = p_escalate_days,
    updated_by = public.resolve_actor(), updated_at = timezone('utc', now()) where id = true;
end; $$;

create or replace function public.fn_payment_overdue_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_i record;
  v_f3 uuid;
  v_reminded int := 0;
  v_escalated int := 0;
begin
  select * into v_cfg from public.finance_config where id = true;
  select employee_id into v_f3 from public.ops_contacts where role = 'F3';

  for v_i in
    select i.*, p.name as p_name, p.created_by as sale_owner
    from public.payment_installments i
    join public.installation_projects p on p.id = i.project_id
    where i.status = 'notified'
  loop
    -- เตือนสุภาพในกลุ่ม 1 ครั้งเดียว (มติ 3 — ห้ามทวงซ้ำ)
    if v_i.reminded_at is null
       and v_i.notified_at < timezone('utc', now()) - make_interval(days => v_cfg.remind_days) then
      perform public.fn_prod_curated(v_i.project_id, 'tpl_payment_remind', jsonb_build_object(
        'project_name', v_i.p_name, 'label', v_i.label));
      update public.payment_installments set reminded_at = timezone('utc', now()) where id = v_i.id;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('payment_reminded', v_i.project_id, v_i.site_code,
        jsonb_build_object('seq', v_i.seq, 'days', v_cfg.remind_days));
      v_reminded := v_reminded + 1;
    -- เกินขั้นสอง → แจ้งภายใน F3 (Sale เจ้าของบันทึกใน audit — mapping email→employee = follow-up)
    elsif v_i.overdue_escalated_at is null
       and v_i.notified_at < timezone('utc', now()) - make_interval(days => v_cfg.escalate_days) then
      if v_f3 is not null then
        begin
          perform public.rpc_dispatch_notification(
            jsonb_build_object('employee_id', v_f3),
            'personal_responsibility', 'payment_overdue', 'tpl_payment_overdue_internal',
            jsonb_build_object('project_name', v_i.p_name, 'label', v_i.label,
              'amount', to_char(v_i.amount, 'FM999,999,999'),
              'days', floor(extract(epoch from (timezone('utc', now()) - v_i.notified_at)) / 86400)::int::text),
            false, null, true, null, v_i.site_code);
        exception when others then null;
        end;
      end if;
      update public.payment_installments set overdue_escalated_at = timezone('utc', now()) where id = v_i.id;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('payment_overdue_escalated', v_i.project_id, v_i.site_code,
        jsonb_build_object('seq', v_i.seq, 'sale_owner', v_i.sale_owner,
          'note', 'ประสาน Sale เจ้าของบ้านโทรตาม — ไม่ทวงซ้ำในกลุ่ม'));
      v_escalated := v_escalated + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'escalated', v_escalated);
end; $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-payment-overdue-sweep';
    perform cron.schedule('wf-payment-overdue-sweep', '45 3 * * *', 'select public.fn_payment_overdue_sweep()');
  else
    raise notice 'pg_cron unavailable — payment overdue sweep จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (4) FJ-4: หน้าแรก F3 "งานเงินของฉันวันนี้" (มติ 4)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_finance_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'awaiting', coalesce((select jsonb_agg(row_to_json(a) order by a.notified_at) from (
      select i.id as installment_id, p.id as project_id, p.name, i.seq, i.label, i.amount, i.notified_at,
        floor(extract(epoch from (timezone('utc', now()) - i.notified_at)) / 86400)::int as days_waiting,
        exists (select 1 from public.capture_artifact ca
          where ca.capture_type = 'payment_slip' and ca.status = 'emitted'
            and ca.linked_entity_id = p.id
            and ca.corrected_fields ->> 'installment_seq' = i.seq::text) as has_slip
      from public.payment_installments i
      join public.installation_projects p on p.id = i.project_id
      where i.status = 'notified') a), '[]'::jsonb),
    'overdue', coalesce((select jsonb_agg(row_to_json(o) order by o.days_waiting desc) from (
      select i.id as installment_id, p.id as project_id, p.name, i.seq, i.label, i.amount,
        floor(extract(epoch from (timezone('utc', now()) - i.notified_at)) / 86400)::int as days_waiting
      from public.payment_installments i
      join public.installation_projects p on p.id = i.project_id
      join public.finance_config c on c.id = true
      where i.status = 'notified'
        and i.notified_at < timezone('utc', now()) - make_interval(days => c.remind_days)) o), '[]'::jsonb),
    'received_today', (select jsonb_build_object(
      'count', count(*), 'total', coalesce(sum(i.amount), 0))
      from public.payment_installments i
      where i.status = 'paid' and i.paid_at >= (public.fn_business_date()::timestamp at time zone 'Asia/Bangkok')));
end; $$;

-- rebase rpc_doc_view_resolve (0136→0137): + receipt
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
  elsif v_l.doc_type = 'receipt' then
    select 'ใบเสร็จรับเงิน ' || r.receipt_no, r.body into v_title, v_body
    from public.receipts r where r.id = v_l.ref_id;
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

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_receipt', null, '🙏 รับชำระ{{label}} ของบ้าน {{project_name}} จำนวน {{amount}} บาท เรียบร้อยแล้ว ขอบคุณครับ' || chr(10) || '🧾 ใบเสร็จ: {{doc_url}}', true, 'customer', 'text'),
  ('tpl_payment_remind', null, 'เรียนคุณลูกค้าบ้าน {{project_name}} ครับ — ฝากตรวจสอบ{{label}}ที่แจ้งไว้ด้วยนะครับ หากชำระแล้วรบกวนส่งสลิปในกลุ่มนี้ได้เลย ขอบคุณครับ 🙏', true, 'customer', 'text'),
  ('tpl_payment_overdue_internal', null, '💰 บ้าน {{project_name}} — {{label}} ({{amount}} บาท) ค้างชำระ {{days}} วันแล้ว: ประสาน Sale เจ้าของบ้านโทรตามครับ (ไม่ทวงซ้ำในกลุ่ม)', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_finance_submit_slip(uuid, text, text, text)',
    'rpc_finance_record_payment(uuid, text)',
    'rpc_finance_set_config(int, int)',
    'rpc_finance_home()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  execute 'revoke all on function public.fn_payment_overdue_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_payment_overdue_sweep() to service_role';
  end if;
end $$;
