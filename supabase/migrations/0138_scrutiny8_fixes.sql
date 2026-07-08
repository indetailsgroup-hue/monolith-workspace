-- Migration: scrutiny8_fixes — ผล scrutinize รอบ 8 (0137 + FinanceHome)
--
-- S8-1 (0137): rpc_finance_home ไม่กรอง site ต่อแถว — F3 สิทธิ์ site A เห็นงวด/ยอดของ site B ทุก section
--   (หน้า home อื่นกรองด้วย roster/foreman อยู่แล้ว — หน้าเงินคือหน้าเดียวที่หลุด) → เติม has_site_access ต่อแถว
-- S8-2 = ฝั่ง UI (FinanceHome เพิ่มอัปโหลดรูปสลิปจริง — path ใต้ field/finance/ ตาม policy 0106)
-- ข้อสังเกตจดไว้ไม่แก้: บ้านไม่มีกลุ่ม → การ์ดเตือนถูกข้ามแต่ mark reminded (pattern เดียวกับการ์ดงวดเดิม —
--   payment flow ต้องมีกลุ่มก่อนโดยธรรมชาติ) · งวดที่ paid ก่อน 0137 ไม่มีใบเสร็จย้อนหลัง (ออกมือได้ถ้าต้องการ)

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
      where i.status = 'notified'
        and (public.is_governance_role() or public.has_site_access(p.site_code))) a), '[]'::jsonb),
    'overdue', coalesce((select jsonb_agg(row_to_json(o) order by o.days_waiting desc) from (
      select i.id as installment_id, p.id as project_id, p.name, i.seq, i.label, i.amount,
        floor(extract(epoch from (timezone('utc', now()) - i.notified_at)) / 86400)::int as days_waiting
      from public.payment_installments i
      join public.installation_projects p on p.id = i.project_id
      join public.finance_config c on c.id = true
      where i.status = 'notified'
        and i.notified_at < timezone('utc', now()) - make_interval(days => c.remind_days)
        and (public.is_governance_role() or public.has_site_access(p.site_code))) o), '[]'::jsonb),
    'received_today', (select jsonb_build_object(
      'count', count(*), 'total', coalesce(sum(i.amount), 0))
      from public.payment_installments i
      where i.status = 'paid'
        and i.paid_at >= (public.fn_business_date()::timestamp at time zone 'Asia/Bangkok')
        and (public.is_governance_role() or public.has_site_access(i.site_code))));
end; $$;
