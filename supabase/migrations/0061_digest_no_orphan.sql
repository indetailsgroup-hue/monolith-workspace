-- Migration: digest_no_orphan — monolith-workflow-copilot (scrutinize D1, fix N10)
-- Depends on: 0060 (rpc_assemble_daily_digest), C12
--
-- N10 (MEDIUM): digest_pending ที่ site_code IS NULL (หรือ site ที่ไม่อยู่ใน active) orphan ถาวร
--   เพราะ assemble filter `site_code = p_site_code` (ไม่ match null) + scheduler loop เฉพาะ active sites.
-- แก้: (1) assemble ใช้ `IS NOT DISTINCT FROM` (รองรับ null); (2) เพิ่ม rpc_assemble_pending_digests() กวาด
--   ทุก distinct site (รวม null) ที่มี digest_pending → ไม่เหลือ orphan (Req 6.4).

-- (1) รองรับ null-site
create or replace function public.rpc_assemble_daily_digest(p_site_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
  v_cats jsonb;
  v_digest_id uuid;
begin
  select array_agg(id) into v_ids
  from (
    select id from public.notification
    where site_code is not distinct from p_site_code and status = 'digest_pending'  -- N10: รองรับ null
    order by created_at
    for update skip locked
    limit 500
  ) sub;

  if v_ids is null then
    return null;
  end if;

  v_count := array_length(v_ids, 1);
  select jsonb_agg(distinct category) into v_cats from public.notification where id = any(v_ids);

  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (p_site_code, jsonb_build_object('site_code', p_site_code), 'group_message', 'digest', false, 'tpl_daily_digest',
    jsonb_build_object('count', v_count, 'categories', coalesce(v_cats, '[]'::jsonb)), 'queued')
  returning id into v_digest_id;

  update public.notification set status = 'sent' where id = any(v_ids);

  insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
  values ('notification', p_site_code, public.resolve_actor(),
    jsonb_build_object('result', 'digest_assembled', 'count', v_count, 'digest_id', v_digest_id));

  return v_digest_id;
end;
$$;

revoke all on function public.rpc_assemble_daily_digest(text) from public;

-- (2) กวาดทุก distinct site (รวม null) ที่มี digest_pending → ไม่ orphan
create or replace function public.rpc_assemble_pending_digests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  r record;
begin
  for r in
    select distinct site_code from public.notification where status = 'digest_pending'
  loop
    if public.rpc_assemble_daily_digest(r.site_code) is not null then
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.rpc_assemble_pending_digests() from public;
