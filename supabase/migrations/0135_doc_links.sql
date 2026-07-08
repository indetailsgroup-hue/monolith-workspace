-- Migration: doc_links — PK-4b Wave 2 (ADR-045 Q1ก/Q4ก): ลิงก์เอกสารเงินหน้าเว็บ + token 30 วัน + audit การเปิด
-- Depends on: 0117/0130 (contract body), 0132/0133 (VO body), 0108 (installments + fn_payment_fire — rebase ที่นี่),
--             0089 (pattern อ่าน vault ใน DB), edge fn doc-view (deploy คู่กัน)
--
--   เอกสาร = ลิงก์หน้าเว็บอ่าน (มติ Q1ก — ไม่มี PDF engine): การ์ดเดิม + บรรทัด "อ่านเอกสาร: <url>"
--   token = uuid ลิงก์เดา่ยาก อายุ 30 วัน (มติ Q4ก) — หมดแล้วออกใหม่ได้; ทุกการเปิดลง audit
--   vault ยังไม่ seed base url → การ์ดส่งได้ปกติ slot doc_url = ข้อความสำรอง (fail-soft ไม่ block เงิน)

create table if not exists public.document_links (
  token uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  doc_type text not null check (doc_type in ('contract', 'variation_order', 'payment_notice')),
  ref_id uuid not null,
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 days',
  opened_count int not null default 0,
  last_opened_at timestamptz,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.document_links enable row level security;
create policy document_links_sel on public.document_links for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));

-- ---------------------------------------------------------------------------
-- (1) helper: ออก token + ประกอบ URL (vault ว่าง = null → caller ใส่ข้อความสำรอง)
-- ---------------------------------------------------------------------------
create or replace function public.fn_issue_doc_link(
  p_project_id uuid, p_doc_type text, p_ref_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
  v_base text;
  v_site text;
begin
  select site_code into v_site from public.installation_projects where id = p_project_id;
  insert into public.document_links (project_id, site_code, doc_type, ref_id)
  values (p_project_id, v_site, p_doc_type, p_ref_id)
  returning token into v_token;

  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'wf_edge_base_url';
  if v_base is null then
    return null;  -- ยัง provision ไม่ครบ — การ์ดใช้ข้อความสำรอง
  end if;
  return v_base || '/functions/v1/doc-view?token=' || v_token::text;
end; $$;
revoke all on function public.fn_issue_doc_link(uuid, text, uuid) from public;

-- ---------------------------------------------------------------------------
-- (2) resolve สำหรับ edge fn doc-view (service_role เท่านั้น) — นับการเปิด + audit
-- ---------------------------------------------------------------------------
create or replace function public.rpc_doc_view_resolve(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_l record;
  v_title text;
  v_body text;
  v_pname text;
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
revoke all on function public.rpc_doc_view_resolve(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_doc_view_resolve(uuid) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (3) เติม doc_url ในการ์ดเดิม 3 จุด — template body ต่อท้าย + rebase producers
-- ---------------------------------------------------------------------------
update public.line_oa_message_templates
set body = body || chr(10) || '📄 อ่านเอกสาร: {{doc_url}}'
where template_key in ('tpl_contract_ready', 'tpl_variation_order', 'tpl_payment_due')
  and body not like '%{{doc_url}}%';

-- rebase rpc_field_send_contract (0117→0135): + ออกลิงก์
create or replace function public.rpc_field_send_contract(p_doc_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_d record;
  v_url text;
begin
  select d.*, p.name as p_name into v_d
  from public.contract_documents d join public.installation_projects p on p.id = d.project_id
  where d.id = p_doc_id for update;
  if not found then raise exception 'contract not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_d.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_d.status = 'sent' then return jsonb_build_object('doc_id', p_doc_id, 'already', true); end if;
  if v_d.status <> 'draft' then
    raise exception 'ฉบับนี้สถานะ % — ส่งได้เฉพาะ draft ล่าสุด', v_d.status using errcode = 'check_violation';
  end if;

  update public.contract_documents set status = 'superseded'
  where project_id = v_d.project_id and status = 'sent';
  update public.contract_documents set status = 'sent', sent_at = timezone('utc', now()) where id = p_doc_id;

  v_url := public.fn_issue_doc_link(v_d.project_id, 'contract', p_doc_id);
  perform public.fn_prod_curated(v_d.project_id, 'tpl_contract_ready', jsonb_build_object(
    'project_name', v_d.p_name, 'version', v_d.version::text,
    'doc_url', coalesce(v_url, '(ขอลิงก์เอกสารจากทีมงานได้เลยครับ)')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('contract_sent', v_d.project_id, v_d.site_code,
    jsonb_build_object('doc_id', p_doc_id, 'version', v_d.version));
  return jsonb_build_object('doc_id', p_doc_id, 'already', false);
end; $$;

-- rebase rpc_field_send_variation (0132→0135): + ออกลิงก์
create or replace function public.rpc_field_send_variation(p_vo_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_v record;
  v_url text;
begin
  select v.*, p.name as p_name into v_v
  from public.variation_orders v join public.installation_projects p on p.id = v.project_id
  where v.id = p_vo_id for update;
  if not found then raise exception 'VO not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_v.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_v.status = 'sent' then return jsonb_build_object('vo_id', p_vo_id, 'already', true); end if;
  if v_v.status <> 'draft' then
    raise exception 'VO สถานะ % — ส่งได้เฉพาะ draft ล่าสุด', v_v.status using errcode = 'check_violation';
  end if;

  update public.variation_orders set status = 'sent', sent_at = timezone('utc', now()) where id = p_vo_id;

  v_url := public.fn_issue_doc_link(v_v.project_id, 'variation_order', p_vo_id);
  perform public.fn_prod_curated(v_v.project_id, 'tpl_variation_order', jsonb_build_object(
    'project_name', v_v.p_name, 'vo_number', lpad(v_v.vo_number::text, 3, '0'),
    'price_impact', case when v_v.price_impact > 0 then '+' else '' end || to_char(v_v.price_impact, 'FM999,999,999'),
    'doc_url', coalesce(v_url, '(ขอลิงก์เอกสารจากทีมงานได้เลยครับ)')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_sent', v_v.project_id, v_v.site_code,
    jsonb_build_object('vo_id', p_vo_id, 'vo_number', v_v.vo_number));
  return jsonb_build_object('vo_id', p_vo_id, 'already', false);
end; $$;

-- rebase fn_payment_fire (0108→0135): + ออกลิงก์ใบแจ้งงวด
create or replace function public.fn_payment_fire(p_project_id uuid, p_event text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_name text;
  v_url text;
begin
  select i.* into v_i from public.payment_installments i
  where i.project_id = p_project_id and i.trigger_event = p_event and i.status = 'pending'
  order by i.seq limit 1 for update;
  if v_i.id is null then return; end if;  -- ไม่มีแผน/ยิงแล้ว = เงียบ (บ้านที่ไม่ตั้งแผนไม่พัง)

  update public.payment_installments set status = 'notified', notified_at = timezone('utc', now())
  where id = v_i.id;

  select name into v_name from public.installation_projects where id = p_project_id;
  v_url := public.fn_issue_doc_link(p_project_id, 'payment_notice', v_i.id);
  perform public.fn_prod_curated(p_project_id, 'tpl_payment_due', jsonb_build_object(
    'project_name', coalesce(v_name, '-'), 'label', v_i.label,
    'amount', to_char(v_i.amount, 'FM999,999,999'),
    'doc_url', coalesce(v_url, '(ขอใบแจ้งงวดจากทีมงานได้เลยครับ)')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('payment_notified', p_project_id, v_i.site_code,
    jsonb_build_object('seq', v_i.seq, 'event', p_event, 'amount', v_i.amount));
end; $$;

-- รายการรูปของบ้าน (ป้อน UI ปุ่มส่งรูป — PK-4b)
create or replace function public.rpc_field_list_photos(p_project_id uuid, p_limit int default 30)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'photo_id', ph.id, 'storage_path', ph.storage_path, 'created_at', ph.created_at,
    'room', (select r.display_name from public.installation_rooms r where r.id = ph.room_id))
    order by ph.created_at desc), '[]'::jsonb)
  from (
    select * from public.installation_photos ph0
    where ph0.project_id = p_project_id and coalesce(ph0.storage_path, '') <> ''
    order by ph0.created_at desc limit p_limit
  ) ph
  where exists (
    select 1 from public.installation_projects p where p.id = p_project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id)));
$$;

do $$
begin
  execute 'revoke all on function public.rpc_field_list_photos(uuid, int) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_list_photos(uuid, int) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_list_photos(uuid, int) to service_role';
  end if;
end $$;
