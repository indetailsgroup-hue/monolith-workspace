-- Migration: turnkey_lead_source — ADR-055: Turnkey <3M productized + lead source attribution
-- Rebase: rpc_field_list_leads 0130 (+lead_source) · rpc_field_sales_summary 0119 (+by_source)
--
-- Q1: turnkey_offers 3 tier — attach เข้าบ้าน = stamp ราคา+วันส่งมอบสัญญา+scope snapshot (ตอบ Time-based Risk
--     ของ Gen Y/Z ที่งานวิจัยชี้เป็นตัวยับยั้งอันดับหนึ่ง); ห้าม attach ซ้ำหลังสัญญาเซ็น
-- Q2: lead_source — วัด conversion ต่อช่องทางก่อนเทงบการตลาด (attribution เท่านั้น — pipeline/forecast = R-3 ห้าม)

-- ---------------------------------------------------------------------------
-- (1) Turnkey offers catalog + seed 3 tier (ราคากลางจาก playbook — เจ้าของแก้ผ่าน rpc)
-- ---------------------------------------------------------------------------
create table if not exists public.turnkey_offers (
  tier text primary key,
  name text not null,
  price numeric not null check (price > 0),
  scope jsonb not null default '[]'::jsonb,     -- รายการของที่รวม (array ของ text)
  delivery_days int not null check (delivery_days > 0),
  warranty_years int not null check (warranty_years > 0),
  is_active boolean not null default true,
  updated_by text not null default public.resolve_actor()
);
alter table public.turnkey_offers enable row level security;
create policy turnkey_offers_sel on public.turnkey_offers for select to authenticated using (true);

insert into public.turnkey_offers (tier, name, price, scope, delivery_days, warranty_years) values
  ('starter', 'Starter — เข้าอยู่ได้เลย', 55000, jsonb_build_array(
    'ครัวบิ้วอิน 1.8 ม. (ลามิเนต 4 สี)', 'ตู้เสื้อผ้า 1.5 ม. บานเปิด', 'ผนังหัวเตียงตกแต่ง 6 ตร.ม.',
    'ตู้ทีวี 1.5 ม.', 'ผ้าม่านทึบ 2 ห้อง'), 21, 5),
  ('standard', 'Standard — ครบทั้งห้อง', 100000, jsonb_build_array(
    'ครัวบิ้วอิน 2.4 ม. + ท็อปหินสังเคราะห์', 'ตู้เสื้อผ้า 2 ม. บานเลื่อน', 'ผนังหัวเตียง 8 ตร.ม. + wallpaper',
    'ตู้ทีวี 1.8 ม.', 'โต๊ะบิ้วอินพับได้', 'ผ้าม่านทึบ+โปร่ง 2 ห้อง'), 30, 10),
  ('plus', 'Plus — จัดเต็ม + walk-in ready', 175000, jsonb_build_array(
    'ครัวบิ้วอิน + ท็อปหินธรรมชาติ + soft-close ทั้งชุด', 'ตู้เสื้อผ้า 2.5 ม. walk-in ready',
    'ผนังหัวเตียงหุ้มหนัง + ไฟ LED ซ่อน', 'ตู้ทีวี 2.4 ม. + storage bench', 'โต๊ะบิ้วอิน + island',
    'ผ้าม่านทึบ+โปร่ง + wallpaper 3 จุด'), 45, 15)
on conflict (tier) do nothing;

create or replace function public.rpc_field_turnkey_offers()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tier', tier, 'name', name, 'price', price, 'scope', scope,
    'delivery_days', delivery_days, 'warranty_years', warranty_years) order by price), '[]'::jsonb)
  from public.turnkey_offers where is_active;
$$;

create or replace function public.rpc_field_set_turnkey_offer(
  p_tier text, p_name text, p_price numeric, p_scope jsonb,
  p_delivery_days int, p_warranty_years int, p_active boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.turnkey_offers (tier, name, price, scope, delivery_days, warranty_years, is_active, updated_by)
  values (btrim(p_tier), btrim(p_name), p_price, coalesce(p_scope, '[]'::jsonb),
    p_delivery_days, p_warranty_years, p_active, public.resolve_actor())
  on conflict (tier) do update set name = excluded.name, price = excluded.price, scope = excluded.scope,
    delivery_days = excluded.delivery_days, warranty_years = excluded.warranty_years,
    is_active = excluded.is_active, updated_by = excluded.updated_by;
end; $$;

-- snapshot ต่อบ้าน — แก้ catalog ทีหลังไม่เพี้ยนย้อนหลัง (pattern เดียวกับ package_addons 0150)
create table if not exists public.project_turnkey (
  project_id uuid primary key references public.installation_projects(id),
  tier text not null,
  price_snapshot numeric not null,
  scope_snapshot jsonb not null,
  delivery_days int not null,
  promised_date date not null,
  warranty_years int not null,
  attached_by text not null default public.resolve_actor(),
  attached_at timestamptz not null default timezone('utc', now())
);
alter table public.project_turnkey enable row level security;
create policy project_turnkey_sel on public.project_turnkey for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create or replace function public.rpc_field_attach_turnkey(p_project_id uuid, p_tier text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_o record;
  v_promised date;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  -- สัญญาเซ็นแล้ว = ราคา/ขอบเขตผูกพันแล้ว — เปลี่ยน package ต้องเข้าเส้น VO ไม่ใช่สลับ tier เงียบๆ
  if exists (select 1 from public.contract_documents d
    where d.project_id = p_project_id and d.status = 'signed') then
    raise exception 'สัญญาเซ็นแล้ว — เปลี่ยนขอบเขต/ราคา ต้องทำผ่าน VO เท่านั้น' using errcode = 'check_violation';
  end if;
  select * into v_o from public.turnkey_offers where tier = btrim(p_tier) and is_active;
  if not found then
    raise exception 'ไม่พบ tier "%" — ดูรายการจาก rpc_field_turnkey_offers', p_tier using errcode = 'no_data_found';
  end if;

  v_promised := fn_business_date() + v_o.delivery_days;

  insert into public.project_turnkey (project_id, tier, price_snapshot, scope_snapshot,
    delivery_days, promised_date, warranty_years, attached_by, attached_at)
  values (p_project_id, v_o.tier, v_o.price, v_o.scope, v_o.delivery_days, v_promised,
    v_o.warranty_years, public.resolve_actor(), timezone('utc', now()))
  on conflict (project_id) do update set tier = excluded.tier, price_snapshot = excluded.price_snapshot,
    scope_snapshot = excluded.scope_snapshot, delivery_days = excluded.delivery_days,
    promised_date = excluded.promised_date, warranty_years = excluded.warranty_years,
    attached_by = excluded.attached_by, attached_at = excluded.attached_at;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('turnkey_attached', p_project_id, v_p.site_code,
    jsonb_build_object('tier', v_o.tier, 'price', v_o.price, 'promised_date', v_promised,
      'delivery_days', v_o.delivery_days, 'warranty_years', v_o.warranty_years));
  return jsonb_build_object('tier', v_o.tier, 'price', v_o.price, 'promised_date', v_promised,
    'warranty_years', v_o.warranty_years, 'scope', v_o.scope);
end; $$;

create or replace function public.rpc_field_project_turnkey(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'tier', t.tier, 'price', t.price_snapshot, 'scope', t.scope_snapshot,
    'promised_date', t.promised_date, 'warranty_years', t.warranty_years)
    from public.project_turnkey t
    join public.installation_projects p on p.id = t.project_id
    where t.project_id = p_project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))), 'null'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- (2) lead source attribution
-- ---------------------------------------------------------------------------
alter table public.line_oa_conversations add column if not exists lead_source text
  check (lead_source is null or lead_source in
    ('developer', 'agent', 'tiktok', 'facebook', 'line_organic', 'referral', 'walk_in'));

create or replace function public.rpc_field_set_lead_source(p_conversation_id uuid, p_source text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select id, site_code into v_c from public.line_oa_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found' using errcode = 'no_data_found'; end if;
  update public.line_oa_conversations set lead_source = p_source where id = p_conversation_id;
  insert into public.installation_audit_log (event_type, site_code, detail)
  values ('lead_source_set', v_c.site_code,
    jsonb_build_object('conversation_id', p_conversation_id, 'source', p_source));
end; $$;

-- rebase rpc_field_list_leads จาก 0130: + lead_source
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
      c.lead_source,
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

-- rebase rpc_field_sales_summary จาก 0119: + by_source (สะสมทุกช่วงเวลา — conversation ไม่มี created_at
-- converted = มี work_item ผ่าน identity เดียวกับเงื่อนไข list_leads)
create or replace function public.rpc_field_sales_summary(
  p_from date default date_trunc('month', timezone('utc', now()))::date,
  p_to date default (timezone('utc', now()))::date + 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_to <= p_from then
    raise exception 'ช่วงเวลาไม่ถูก (from < to)' using errcode = 'check_violation';
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),

    'by_sale', coalesce((select jsonb_agg(row_to_json(s) order by s.signed_value desc nulls last) from (
      select
        coalesce(o.sale, c.sale) as sale,
        coalesce(o.houses_opened, 0) as houses_opened,
        coalesce(c.contracts_signed, 0) as contracts_signed,
        coalesce(c.signed_value, 0) as signed_value
      from
        (select p.created_by as sale, count(*) as houses_opened
         from public.installation_projects p
         where p.created_at >= p_from and p.created_at < p_to
         group by p.created_by) o
      full outer join
        (select d.created_by as sale, count(*) as contracts_signed,
                sum((d.data ->> 'total')::numeric) as signed_value
         from public.contract_documents d
         where d.status = 'signed' and d.signed_at >= p_from and d.signed_at < p_to
         group by d.created_by) c
      on c.sale = o.sale
    ) s), '[]'::jsonb),

    'lost_reasons', coalesce((select jsonb_agg(row_to_json(r) order by r.n desc) from (
      select a.detail ->> 'reason' as reason, count(*) as n
      from public.installation_audit_log a
      where a.event_type = 'lead_closed'
        and a.at >= p_from and a.at < p_to
      group by a.detail ->> 'reason'
    ) r), '[]'::jsonb),

    -- ADR-055: conversion ต่อช่องทาง (สะสม) — วัดก่อนเทงบการตลาด; attribution เท่านั้น (R-3)
    'by_source', coalesce((select jsonb_agg(row_to_json(b) order by b.total desc) from (
      select c.lead_source as source, count(*) as total,
        count(*) filter (where c.lead_closed_at is not null) as lost,
        count(*) filter (where exists (
          select 1 from public.work_item w
          join public.line_oa_customer_identity ci on ci.customer_id = w.primary_customer_id
          where ci.line_user_id = c.line_user_id)) as converted
      from public.line_oa_conversations c
      where c.lead_source is not null
      group by c.lead_source
    ) b), '[]'::jsonb),

    'totals', (select jsonb_build_object(
      'houses_opened', count(*) filter (where true),
      'contracts_signed', (select count(*) from public.contract_documents d
        where d.status = 'signed' and d.signed_at >= p_from and d.signed_at < p_to),
      'signed_value', coalesce((select sum((d.data ->> 'total')::numeric) from public.contract_documents d
        where d.status = 'signed' and d.signed_at >= p_from and d.signed_at < p_to), 0))
      from public.installation_projects p
      where p.created_at >= p_from and p.created_at < p_to));
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_turnkey_offers()',
    'rpc_field_set_turnkey_offer(text, text, numeric, jsonb, int, int, boolean)',
    'rpc_field_attach_turnkey(uuid, text)',
    'rpc_field_project_turnkey(uuid)',
    'rpc_field_set_lead_source(uuid, text)',
    'rpc_field_list_leads()',
    'rpc_field_sales_summary(date, date)'
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
