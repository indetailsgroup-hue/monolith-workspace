-- Migration: payment_plan — J2.3 (ADR-041 มติ 5/5.1 + ADR-042)
-- Depends on: 0107 (milestones — trigger งวด 3), 0098 (acceptance — trigger งวด 4), 0090 (projects), 0095 (groups)
--
-- โครงงวด default **50/30/15/5** (owner ยืนยัน 7 ก.ค.) ผูก 4 เหตุการณ์:
--   1 เซ็นสัญญา 50% · 2 เซ็นแบบ final G3 30% · 3 ก่อนจัดส่ง (Packing gate approved) 15% · 4 ตรวจรับ 5%
-- กลไก: ถึงเหตุการณ์ → การ์ดแจ้งงวดเข้ากลุ่มลูกค้าอัตโนมัติ → ลูกค้าโอน → F3 กดบันทึกรับ
-- Soft gate (มติ 5): เข้าไลน์ผลิต (รายงานสถานีแรก) ทั้งที่งวดก่อนผลิตยังไม่จ่าย → ต้อง override
--   โดย PM/governance พร้อมเหตุผล (ลง audit) — ไม่ hard block (exception มีจริง; hard = ไล่คนออกนอกระบบ)

create table if not exists public.payment_installments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  site_code text null,
  seq int not null check (seq between 1 and 9),
  label text not null,
  percent numeric not null check (percent > 0 and percent <= 100),
  amount numeric null,   -- คำนวณจากราคาสัญญา (ปรับได้ต่อสัญญา — มติ 5.1)
  trigger_event text not null check (trigger_event in ('contract_signed','g3_approved','pre_delivery','acceptance')),
  status text not null default 'pending' check (status in ('pending','notified','paid')),
  notified_at timestamptz null,
  paid_at timestamptz null,
  paid_recorded_by text null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, seq)
);
alter table public.payment_installments enable row level security;
create policy payment_installments_sel on public.payment_installments
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));
-- การเงิน = เรื่องภายใน: member (ช่าง/external) มองไม่เห็น; เขียนผ่าน RPC เท่านั้น

-- ตั้งแผนงวด (default 50/30/15/5 หรือ custom ต่อสัญญา) — idempotent: มีแผนแล้ว = แทนที่เฉพาะงวดที่ยัง pending ทั้งหมด
create or replace function public.rpc_field_set_payment_plan(
  p_project_id uuid,
  p_total numeric,
  p_custom jsonb default null  -- [{seq,label,percent,trigger_event}] — null = default 50/30/15/5
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_plan jsonb;
  v_row jsonb;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_total, 0) <= 0 then
    raise exception 'ราคารวมต้องมากกว่า 0' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payment_installments i
             where i.project_id = p_project_id and i.status <> 'pending') then
    raise exception 'มีงวดที่แจ้ง/จ่ายแล้ว — แก้แผนไม่ได้ ต้องจัดการรายงวด' using errcode = 'check_violation';
  end if;

  v_plan := coalesce(p_custom, jsonb_build_array(
    jsonb_build_object('seq',1,'label','มัดจำ (เซ็นสัญญา)','percent',50,'trigger_event','contract_signed'),
    jsonb_build_object('seq',2,'label','ก่อนผลิต (เซ็นแบบ final)','percent',30,'trigger_event','g3_approved'),
    jsonb_build_object('seq',3,'label','ก่อนจัดส่ง','percent',15,'trigger_event','pre_delivery'),
    jsonb_build_object('seq',4,'label','ส่งมอบ (ตรวจรับ)','percent',5,'trigger_event','acceptance')));

  if (select sum((x->>'percent')::numeric) from jsonb_array_elements(v_plan) x) <> 100 then
    raise exception 'เปอร์เซ็นต์รวมต้องเท่ากับ 100' using errcode = 'check_violation';
  end if;

  delete from public.payment_installments where project_id = p_project_id;
  for v_row in select jsonb_array_elements(v_plan) loop
    insert into public.payment_installments (project_id, site_code, seq, label, percent, amount, trigger_event)
    values (p_project_id, v_p.site_code, (v_row->>'seq')::int, v_row->>'label',
            (v_row->>'percent')::numeric, round(p_total * (v_row->>'percent')::numeric / 100, 2),
            v_row->>'trigger_event');
  end loop;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('payment_plan_set', p_project_id, v_p.site_code, jsonb_build_object('total', p_total, 'plan', v_plan));
  return v_plan;
end; $$;

-- ยิงงวดตามเหตุการณ์ → การ์ดแจ้งงวดเข้ากลุ่มลูกค้า (idempotent: ยิงแล้วไม่ยิงซ้ำ)
create or replace function public.fn_payment_fire(p_project_id uuid, p_event text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_name text;
begin
  select i.* into v_i from public.payment_installments i
  where i.project_id = p_project_id and i.trigger_event = p_event and i.status = 'pending'
  order by i.seq limit 1 for update;
  if v_i.id is null then return; end if;  -- ไม่มีแผน/ยิงแล้ว = เงียบ (บ้านที่ไม่ตั้งแผนไม่พัง)

  update public.payment_installments set status = 'notified', notified_at = timezone('utc', now())
  where id = v_i.id;

  select name into v_name from public.installation_projects where id = p_project_id;
  perform public.fn_prod_curated(p_project_id, 'tpl_payment_due', jsonb_build_object(
    'project_name', coalesce(v_name, '-'), 'label', v_i.label,
    'amount', to_char(v_i.amount, 'FM999,999,999')));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('payment_notified', p_project_id, v_i.site_code,
    jsonb_build_object('seq', v_i.seq, 'event', p_event, 'amount', v_i.amount));
end; $$;
revoke all on function public.fn_payment_fire(uuid, text) from public;

-- งวด 1: Sale กด mark สัญญาเซ็นแล้ว (SJ-3 template generate ตามมาทีหลัง — จุดกดคงเดิม)
create or replace function public.rpc_field_mark_contract_signed(p_project_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_site text;
begin
  select site_code into v_site from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_site)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('contract_signed', p_project_id, v_site, '{}'::jsonb);
  perform public.fn_payment_fire(p_project_id, 'contract_signed');
end; $$;

-- งวด 2: G3 approved — trigger บน work_item (awaiting_approval → in_progress ที่ 3D_Rendering_Final)
create or replace function public.fn_payment_on_g3()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  if old.status = 'awaiting_approval' and new.status = 'in_progress' and new.current_step = '3D_Rendering_Final' then
    select id into v_project from public.installation_projects where work_item_id = new.id;
    if v_project is not null then
      perform public.fn_payment_fire(v_project, 'g3_approved');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_payment_g3 on public.work_item;
create trigger trg_payment_g3 after update on public.work_item
  for each row execute function public.fn_payment_on_g3();

-- งวด 3: Packing gate approved (0107) — trigger บน production_milestones
create or replace function public.fn_payment_on_packing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.station = 'packing' and new.approved_at is not null and old.approved_at is null then
    perform public.fn_payment_fire(new.project_id, 'pre_delivery');
  end if;
  return new;
end; $$;
drop trigger if exists trg_payment_packing on public.production_milestones;
create trigger trg_payment_packing after update on public.production_milestones
  for each row execute function public.fn_payment_on_packing();

-- งวด 4: ตรวจรับ approved (0098) — trigger บน installation_approvals
create or replace function public.fn_payment_on_acceptance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subject = 'customer_acceptance' and new.result = 'approved' and old.result is null then
    perform public.fn_payment_fire(new.project_id, 'acceptance');
  end if;
  return new;
end; $$;
drop trigger if exists trg_payment_acceptance on public.installation_approvals;
create trigger trg_payment_acceptance after update on public.installation_approvals
  for each row execute function public.fn_payment_on_acceptance();

-- F3 บันทึกรับชำระ (เช็คยอดเข้าแล้วกด — คลิกเดียวต่องวด)
create or replace function public.rpc_finance_record_payment(p_installment_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_i record;
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
end; $$;

create or replace function public.rpc_field_payment_status(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'seq', i.seq, 'label', i.label, 'percent', i.percent, 'amount', i.amount,
    'status', i.status, 'notified_at', i.notified_at, 'paid_at', i.paid_at) order by i.seq), '[]'::jsonb)
  from public.payment_installments i
  where i.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(i.site_code));
$$;

-- Soft gate ปล่อยผลิต (มติ 5): รายงานสถานีแรกทั้งที่งวดก่อนผลิต (g3_approved) ยังไม่ paid
-- → ต้อง override โดย PM/governance พร้อมเหตุผล — replace rpc_factory_report_station (rebase 0107 + gate)
create or replace function public.rpc_factory_report_station(
  p_project_id uuid, p_station text, p_note text default null,
  p_override_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_first boolean;
  v_gate boolean;
  v_id uuid;
  v_unpaid record;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  v_first := not exists (select 1 from public.production_milestones m where m.project_id = p_project_id);

  -- Soft gate (ADR-041 มติ 5): เข้าไลน์ครั้งแรกทั้งที่งวดก่อนผลิตยังไม่เข้า
  if v_first then
    select i.* into v_unpaid from public.payment_installments i
    where i.project_id = p_project_id and i.trigger_event = 'g3_approved' and i.status <> 'paid'
    limit 1;
    if v_unpaid.id is not null then
      if coalesce(btrim(p_override_reason), '') = '' then
        raise exception 'งวดก่อนผลิต (% บาท) ยังไม่บันทึกรับ — ปล่อยผลิตต้องมีเหตุผล override โดย PM/ผู้บริหาร', v_unpaid.amount
          using errcode = 'check_violation';
      end if;
      if not (public.is_governance_role() or public.has_any_app_role(array['project_manager'])) then
        raise exception 'override ปล่อยผลิตก่อนเงินเข้า ทำได้เฉพาะ PM/ผู้บริหาร' using errcode = 'insufficient_privilege';
      end if;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('production_release_override', p_project_id, v_p.site_code,
        jsonb_build_object('unpaid_seq', v_unpaid.seq, 'amount', v_unpaid.amount, 'reason', btrim(p_override_reason)));
    end if;
  end if;

  v_gate := p_station in ('assembly', 'packing');
  insert into public.production_milestones (project_id, site_code, station, note, is_gate)
  values (p_project_id, v_p.site_code, p_station, p_note, v_gate)
  on conflict (project_id, station) do update set note = coalesce(excluded.note, production_milestones.note)
  returning id into v_id;

  if v_first then
    perform public.fn_prod_curated(p_project_id, 'tpl_prod_started', jsonb_build_object('project_name', v_p.name));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('production_station', p_project_id, v_p.site_code,
    jsonb_build_object('station', p_station, 'gate', v_gate, 'first', v_first));
  return jsonb_build_object('milestone_id', v_id, 'gate', v_gate);
end; $$;
drop function if exists public.rpc_factory_report_station(uuid, text, text);

-- template การ์ดแจ้งงวด (เลขบัญชีบริษัทเติมตอน ops ผ่าน governance update)
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_payment_due', null,
   '💰 งวดชำระของ {{project_name}} ครับ: {{label}} จำนวน {{amount}} บาท — โอนแล้วรบกวนส่งสลิปในแชทได้เลยครับ ทีมการเงินจะยืนยันให้ครับ 🙏',
   true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_payment_plan(uuid, numeric, jsonb)',
    'rpc_field_mark_contract_signed(uuid)',
    'rpc_finance_record_payment(uuid, text)',
    'rpc_field_payment_status(uuid)',
    'rpc_factory_report_station(uuid, text, text, text)'
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
