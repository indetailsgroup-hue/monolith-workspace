-- Migration: job_cost_c6 — PK-2 ชั้นบัญชี C6 ภายใน (ADR-043 R-2)
-- Depends on: 0120 (job_cost_entries + config — labor จาก DJ-1), 0127 (rework จาก BJ-2), 0128 (packages),
--             0108 (payment_installments = ฝั่งรายรับ F3)
--
--   การเงินสองชั้น: ลูกค้า 50/30/15/5 = SSOT ยืน (ไม่แตะ) · ชั้นนี้ = วิเคราะห์ภายใน (margin จริงต่อบ้าน)
--   estimate vs actual ราย package + cost-to-complete + Project P&L (รายรับงวด F3 × ต้นทุนจริง)
--   + backfill เรทย้อนหลัง (entries ที่บันทึกก่อนตั้งเรท) + export ให้บัญชี; retainage = corporate option (ไม่สร้าง)
--   สิทธิ์ทั้งชั้น: governance/site access เท่านั้น (member ไม่เห็นต้นทุน — RLS 0120 สอดคล้องแล้ว)

alter table public.work_packages add column if not exists estimated_cost numeric
  check (estimated_cost is null or estimated_cost >= 0);

-- ---------------------------------------------------------------------------
-- (1) backfill เรทย้อนหลัง (F3 ตั้งเรทหลังงานเริ่ม — เก็บ qty ไว้แล้วตาม fail-safe 0120)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_backfill_labor_rates()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric;
  v_n int;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select labor_rate_per_hour into v_rate from public.job_cost_config where id = true;
  if v_rate is null then
    raise exception 'ยังไม่ตั้งเรทแรงงาน — ตั้งก่อน backfill' using errcode = 'no_data_found';
  end if;

  update public.job_cost_entries
  set rate = v_rate, amount = round(qty * v_rate, 2),
      note = coalesce(note, '') || ' [backfill เรท ' || v_rate || ']'
  where entry_type in ('labor', 'rework') and rate is null;
  get diagnostics v_n = row_count;

  insert into public.installation_audit_log (event_type, detail)
  values ('job_cost_backfilled', jsonb_build_object('entries', v_n, 'rate', v_rate));
  return jsonb_build_object('backfilled', v_n, 'rate', v_rate);
end; $$;

-- ---------------------------------------------------------------------------
-- (2) estimate ราย package + บันทึกต้นทุนตรง (วัสดุ/อื่น — B4/C6 กรอกยอดจริง)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_set_package_estimate(p_package_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_w record;
begin
  select w.id, p.site_code into v_w
  from public.work_packages w join public.installation_projects p on p.id = w.project_id
  where w.id = p_package_id;
  if not found then raise exception 'package not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_w.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_amount, -1) < 0 then
    raise exception 'estimate ต้อง ≥ 0' using errcode = 'check_violation';
  end if;
  update public.work_packages set estimated_cost = p_amount where id = p_package_id;
end; $$;

create or replace function public.rpc_field_add_job_cost(
  p_project_id uuid, p_entry_type text, p_amount numeric, p_note text default null, p_package_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_entry_type not in ('material', 'other') then
    raise exception 'บันทึกตรงได้เฉพาะ material/other (labor=DJ-1 · rework=BJ-2)' using errcode = 'check_violation';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'ยอดต้องมากกว่า 0' using errcode = 'check_violation';
  end if;
  if p_package_id is not null and not exists (
    select 1 from public.work_packages w where w.id = p_package_id and w.project_id = p_project_id) then
    raise exception 'package ไม่อยู่ในบ้านนี้' using errcode = 'check_violation';
  end if;

  insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, ref_id, note)
  values (p_project_id, v_p.site_code, p_entry_type, (timezone('utc', now()))::date, 1, null, p_amount,
    'manual_entry', p_package_id, p_note)
  returning id into v_id;
  return jsonb_build_object('entry_id', v_id, 'amount', p_amount);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) สรุป C6 ต่อบ้าน: by_type + by_package (estimate vs actual) + P&L
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_job_cost_summary(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_p record;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  -- ชั้นภายใน: ไม่มี member branch (R-2)
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'project_name', v_p.name,
    'cost_by_type', coalesce((select jsonb_object_agg(t.entry_type, t.total) from (
      select e.entry_type, sum(coalesce(e.amount, 0)) as total
      from public.job_cost_entries e where e.project_id = p_project_id
      group by e.entry_type) t), '{}'::jsonb),
    'total_cost', coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
      where e.project_id = p_project_id), 0),
    'unpriced_hours', coalesce((select sum(e.qty) from public.job_cost_entries e
      where e.project_id = p_project_id and e.rate is null and e.entry_type in ('labor', 'rework')), 0),
    'by_package', coalesce((select jsonb_agg(row_to_json(k) order by k.code) from (
      select w.code, w.name, w.estimated_cost,
        coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
          where e.ref_id = w.id), 0) as actual_cost,
        case when w.estimated_cost is not null then
          w.estimated_cost - coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
            where e.ref_id = w.id), 0) end as remaining_budget
      from public.work_packages w where w.project_id = p_project_id) k), '[]'::jsonb),
    'pnl', (select jsonb_build_object(
      'revenue_paid', coalesce(sum(i.amount) filter (where i.status = 'paid'), 0),
      'revenue_contract', coalesce(sum(i.amount), 0),
      'cost_actual', coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
        where e.project_id = p_project_id), 0),
      'margin_realized', coalesce(sum(i.amount) filter (where i.status = 'paid'), 0)
        - coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
          where e.project_id = p_project_id), 0),
      'margin_projected', coalesce(sum(i.amount), 0)
        - coalesce((select sum(coalesce(e.amount, 0)) from public.job_cost_entries e
          where e.project_id = p_project_id), 0))
      from public.payment_installments i where i.project_id = p_project_id));
end; $$;

-- ---------------------------------------------------------------------------
-- (4) export ให้บัญชี (accountant handoff — jsonb rows; CSV ประกอบฝั่ง client)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_job_cost_export(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_p record;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'cost_entries', coalesce((select jsonb_agg(jsonb_build_object(
        'date', e.work_date, 'type', e.entry_type, 'qty', e.qty, 'rate', e.rate,
        'amount', e.amount, 'source', e.source,
        'package', (select w.code from public.work_packages w where w.id = e.ref_id),
        'note', e.note) order by e.work_date, e.created_at)
      from public.job_cost_entries e where e.project_id = p_project_id), '[]'::jsonb),
    'installments', coalesce((select jsonb_agg(jsonb_build_object(
        'seq', i.seq, 'label', i.label, 'amount', i.amount, 'status', i.status,
        'notified_at', i.notified_at, 'paid_at', i.paid_at) order by i.seq)
      from public.payment_installments i where i.project_id = p_project_id), '[]'::jsonb));
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_backfill_labor_rates()',
    'rpc_field_set_package_estimate(uuid, numeric)',
    'rpc_field_add_job_cost(uuid, text, numeric, text, uuid)',
    'rpc_field_job_cost_summary(uuid)',
    'rpc_field_job_cost_export(uuid)'
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
