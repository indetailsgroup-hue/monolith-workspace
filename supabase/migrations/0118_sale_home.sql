-- Migration: sale_home — SJ-5 หน้าแรก Sale "งานขายของฉันวันนี้" (มติ Sale-5)
-- Depends on: 0116 (leads), 0117 (contracts), 0108 (installments), 0095 (groups), 0113 (created_by = คนกรอกใบ)
--
--   สูตรเดียวกับ "งานของฉันวันนี้" ของช่าง: ระบบสแกนแล้วสรุปว่า *คุณ* ค้างอะไร — ไม่ใช่ list รวมให้คิดเอง
--   ① lead ต้องตาม (เงียบนานสุดก่อน) ② บ้านที่กำลังเดิน เฉพาะจุดที่รอ Sale ③ (ปุ่มเปิดใบใหม่ = ฝั่ง UI)
--   attribution จาก created_by (คนกรอกใบ — มติ Sale-4 "เกิดเองแล้ว ศูนย์การกรอกเพิ่ม")

create or replace function public.rpc_field_sale_home(p_all boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public.resolve_actor();
  v_houses jsonb;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(h order by jsonb_array_length(h -> 'waiting_on') desc), '[]'::jsonb)
  into v_houses
  from (
    select jsonb_build_object(
      'project_id', p.id, 'name', p.name, 'status', p.status,
      'waiting_on', (
        select coalesce(jsonb_agg(w.item), '[]'::jsonb) from (
          -- ยังไม่ตั้งกลุ่ม LINE กับลูกค้า
          select jsonb_build_object('key', 'no_group', 'label', 'ยังไม่ตั้งกลุ่ม LINE — ออกรหัส #ผูก') as item
          where not exists (select 1 from public.line_groups g
            where g.project_id = p.id and g.group_type = 'customer' and g.status = 'active')
          union all
          -- ยังไม่ตั้งแผนชำระ
          select jsonb_build_object('key', 'no_plan', 'label', 'ยังไม่ตั้งแผนชำระ 4 งวด')
          where not exists (select 1 from public.payment_installments i where i.project_id = p.id)
          union all
          -- มีแผนแล้ว แต่สัญญายังไม่เซ็น
          select jsonb_build_object('key', 'contract_unsigned', 'label', 'สัญญายังไม่เซ็น/ยังไม่บันทึกรูปเซ็น')
          where exists (select 1 from public.payment_installments i where i.project_id = p.id)
            and not exists (select 1 from public.contract_documents d
              where d.project_id = p.id and d.status = 'signed')
          union all
          -- งวดแจ้งลูกค้าแล้วค้างเกิน 5 วัน
          select jsonb_build_object('key', 'installment_overdue',
            'label', 'งวด ' || i.seq || ' แจ้งแล้วค้าง ' ||
              floor(extract(epoch from (timezone('utc', now()) - i.notified_at)) / 86400)::int || ' วัน')
          from public.payment_installments i
          where i.project_id = p.id and i.status = 'notified'
            and i.notified_at < timezone('utc', now()) - interval '5 days'
        ) w
      )
    ) as h
    from public.installation_projects p
    where p.status in ('active', 'customer_review')
      and (p_all or p.created_by = v_actor)
  ) houses
  where jsonb_array_length(h -> 'waiting_on') > 0;  -- โชว์เฉพาะบ้านที่มีจุดรอ Sale จริง

  return jsonb_build_object(
    'leads', public.rpc_field_list_leads(),
    'houses', v_houses);
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_field_sale_home(boolean) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_sale_home(boolean) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_sale_home(boolean) to service_role';
  end if;
end $$;
