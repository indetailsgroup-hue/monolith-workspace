-- Migration: sender_image — PK-4 Wave 1 (ADR-045 Q2ก/Q3ก): sender รองรับ image + รูป curated เข้ากลุ่มลูกค้า
-- Depends on: 0098 (message_kind), 0107 (fn_prod_curated/curated pipeline), 0090 (installation_photos),
--             sender edge fn (LineImageMessage + createSignedMediaUrl — deploy คู่กัน)
--
--   image template: body ไม่ใช้ — รูปมาจาก slot `media_path` (path ใน bucket installation-media)
--   sender สร้าง signed URL อายุ 48 ชม. ตอนส่ง (รูปคง private ทั้งหมด — มติ Q2ก)
--   producer แรก: office/designer เลือกรูปจริงของบ้าน → ส่ง curated เข้ากลุ่มลูกค้า (+แคปชันแยก 1 ข้อความ)

-- ปลด CHECK message_kind ให้รับ 'image' (0098 เดิม: text|flex)
alter table public.line_oa_message_templates drop constraint if exists line_oa_message_templates_message_kind_check;
alter table public.line_oa_message_templates add constraint line_oa_message_templates_message_kind_check
  check (message_kind in ('text', 'flex', 'image'));

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_prod_photo', null, '', true, 'customer', 'image'),
  ('tpl_prod_photo_caption', null, '📸 {{caption}}', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

create or replace function public.rpc_field_send_photo_to_customer(
  p_project_id uuid, p_photo_id uuid, p_caption text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_ph record;
  v_group text;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  -- curated ถึงลูกค้า = office/designer (site access) — member ธรรมดาส่งเองไม่ได้ (คุมคุณภาพภาพที่ถึงลูกค้า)
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select id, storage_path into v_ph from public.installation_photos
  where id = p_photo_id and project_id = p_project_id;
  if not found then
    raise exception 'ไม่พบรูปนี้ในบ้านนี้' using errcode = 'no_data_found';
  end if;
  if coalesce(v_ph.storage_path, '') = '' then
    raise exception 'รูปนี้ยังไม่มีไฟล์ใน storage (อาจยังรอ media worker ดึง)' using errcode = 'check_violation';
  end if;

  select g.line_group_id into v_group from public.line_groups g
  where g.project_id = p_project_id and g.group_type = 'customer' and g.status = 'active';
  if v_group is null then
    raise exception 'บ้านนี้ยังไม่มีกลุ่มลูกค้าที่ผูกแล้ว' using errcode = 'no_data_found';
  end if;

  -- แคปชันก่อน (ถ้ามี) แล้วตามด้วยรูป — sender เดินตามลำดับ enqueue
  if coalesce(btrim(p_caption), '') <> '' then
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_prod_photo_caption',
      jsonb_build_object('caption', left(btrim(p_caption), 300)), 'group', v_group);
  end if;
  insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
  values ('push', 'pending', 'tpl_prod_photo',
    jsonb_build_object('media_path', v_ph.storage_path), 'group', v_group);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('curated_photo_sent', p_project_id, v_p.site_code,
    jsonb_build_object('photo_id', p_photo_id, 'caption', left(coalesce(p_caption, ''), 120),
      'by', public.resolve_actor()));
  return jsonb_build_object('photo_id', p_photo_id, 'queued', true);
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_field_send_photo_to_customer(uuid, uuid, text) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_send_photo_to_customer(uuid, uuid, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_send_photo_to_customer(uuid, uuid, text) to service_role';
  end if;
end $$;
