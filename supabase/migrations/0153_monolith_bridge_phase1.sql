-- Migration: monolith_bridge_phase1 — ADR-057: cutlist จาก MONOLITH Factory Packet เข้า IIMOS
--
-- เส้นทาง: MONOLITH build FactoryPacket (มี manifest.contentHash SHA-256) → ส่ง cutlist aggregate
-- ตาม material → package_materials ของบ้านที่ผูกผ่าน work_item_id — content_hash ลง audit = ID-chain
-- (ADR-051 pattern spine ข้อ 1) เริ่มเดินจริง; idempotent ด้วย client_key + dedupe ชื่อวัสดุ

create or replace function public.rpc_bridge_import_cutlist(
  p_work_item_id uuid,
  p_package_code text,
  p_package_name text default null,
  p_items jsonb default '[]'::jsonb,      -- [{name, qty, unit?}] (aggregate จาก cutlist.byMaterial)
  p_content_hash text default null,       -- manifest.contentHash จาก FactoryPacket
  p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_pkg uuid;
  v_item jsonb;
  v_imported int := 0;
  v_skipped int := 0;
  v_name text;
  v_qty numeric;
begin
  select id, site_code, name into v_p from public.installation_projects
  where work_item_id = p_work_item_id;
  if not found then
    raise exception 'ไม่พบบ้านที่ผูกกับ work item นี้ — เปิดบ้านใน IIMOS แล้วผูก work_item ก่อน'
      using errcode = 'no_data_found';
  end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)
          or public.fn_installation_is_member(v_p.id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_package_code), '') = '' then
    raise exception 'ต้องมีรหัส package (เช่น MW-001)' using errcode = 'check_violation';
  end if;

  -- idempotent: client_key เดิม = ส่งซ้ำจาก retry — ไม่ import ซ้ำ
  if p_client_key is not null and exists (
    select 1 from public.installation_audit_log
    where event_type = 'bridge_cutlist_imported'
      and project_id = v_p.id
      and detail ->> 'client_key' = p_client_key) then
    return jsonb_build_object('already', true);
  end if;

  select id into v_pkg from public.work_packages
  where project_id = v_p.id and code = upper(btrim(p_package_code));
  if v_pkg is null then
    v_pkg := ((public.rpc_field_create_package(v_p.id, upper(btrim(p_package_code)),
      coalesce(nullif(btrim(p_package_name), ''), upper(btrim(p_package_code)) || ' (จาก MONOLITH)')))
      ->> 'package_id')::uuid;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_qty := coalesce(nullif(v_item ->> 'qty', '')::numeric, 0);
    if v_name = '' or v_qty <= 0 then
      raise exception 'รายการวัสดุไม่ครบ: ต้องมี name + qty > 0 (เจอ: %)', v_item::text
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.package_materials
      where package_id = v_pkg and name = v_name) then
      v_skipped := v_skipped + 1;   -- dedupe: ชื่อเดิมใน package เดิม = ไม่ทับ (B4 อาจแก้ราคา/สถานะไปแล้ว)
    else
      perform public.rpc_factory_add_material(v_pkg, v_name, v_qty,
        coalesce(nullif(btrim(v_item ->> 'unit'), ''), 'ชิ้น(ตัด)'));
      v_imported := v_imported + 1;
    end if;
  end loop;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('bridge_cutlist_imported', v_p.id, v_p.site_code,
    jsonb_build_object('package_id', v_pkg, 'code', upper(btrim(p_package_code)),
      'imported', v_imported, 'skipped', v_skipped,
      'content_hash', p_content_hash, 'client_key', p_client_key));
  return jsonb_build_object('package_id', v_pkg, 'imported', v_imported,
    'skipped', v_skipped, 'already', false);
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_bridge_import_cutlist(uuid, text, text, jsonb, text, text) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_bridge_import_cutlist(uuid, text, text, jsonb, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_bridge_import_cutlist(uuid, text, text, jsonb, text, text) to service_role';
  end if;
end $$;
