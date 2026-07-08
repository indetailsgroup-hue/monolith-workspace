-- Migration: sales_summary — SJ-4 สรุปยอดให้ H1 (มติ Sale-4)
-- Depends on: 0113 (created_by = คนกรอกใบ — attribution เกิดเอง), 0117 (contracts signed + มูลค่า), 0116 (lost-reason ใน audit)
--
--   v1 = attribution + หน้าสรุป: สัญญา/เดือน ต่อ Sale + มูลค่า + lost-reason — **ไม่มี target/commission**
--   (commission = มติแยก HR/การเงินเมื่อนโยบายนิ่ง — โครง attribution พร้อมรับแล้ว)

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

    -- ต่อ Sale: บ้านเปิดใหม่ + สัญญาเซ็น + มูลค่ารวมที่เซ็น
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

    -- lead ที่ปิดในช่วง แยกเหตุผล (ให้ H3/H4 ต่อ)
    'lost_reasons', coalesce((select jsonb_agg(row_to_json(r) order by r.n desc) from (
      select a.detail ->> 'reason' as reason, count(*) as n
      from public.installation_audit_log a
      where a.event_type = 'lead_closed'
        and a.at >= p_from and a.at < p_to
      group by a.detail ->> 'reason'
    ) r), '[]'::jsonb),

    -- ภาพรวมช่วง
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
begin
  execute 'revoke all on function public.rpc_field_sales_summary(date, date) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_sales_summary(date, date) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_sales_summary(date, date) to service_role';
  end if;
end $$;
