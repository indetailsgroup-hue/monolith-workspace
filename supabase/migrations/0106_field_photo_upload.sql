-- Migration: field_photo_upload — Wave C photo + task 1.7 (เสียบ offline-queue spike 0.3 จริง)
-- Depends on: 0090 (installation_photos.client_submission_id UNIQUE), 0099 (bucket installation-media), 0105 (auth↔employee)
--
--   storage policies: ให้ authenticated upload/อ่าน bucket 'installation-media' ใต้ prefix field/
--   rpc_field_submit_photo: บันทึก metadata รูปของเลน — **duplicate-tolerant ตามสัญญา S3 (spike 0.3)**:
--     client_submission_id ซ้ำ = ตอบสำเร็จพร้อมใบเดิม (offline queue retry/race ข้าม context ปลอดภัย)

-- (1) storage policies (guard สำหรับ local db-only ที่ไม่มี storage schema — hosted มีเสมอ)
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy field_media_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'installation-media' and name like 'field/%')$p$;
    execute $p$create policy field_media_select on storage.objects
      for select to authenticated
      using (bucket_id = 'installation-media')$p$;
  else
    raise notice 'storage.objects not available — policies จะถูกสร้างตอน db push บน hosted';
  end if;
exception when duplicate_object then
  null; -- rerun ได้
end $$;

-- (2) บันทึกรูปของเลน (ช่างถ่ายจาก PWA) — ผูกห้อง/บ้านจาก task อัตโนมัติ (D-12: หลังบ้าน infer)
create or replace function public.rpc_field_submit_photo(
  p_task_id uuid,
  p_storage_path text,
  p_client_submission_id text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t record;
  v_emp uuid;
  v_id uuid;
begin
  if coalesce(p_client_submission_id, '') = '' or coalesce(p_storage_path, '') = '' then
    raise exception 'storage_path + client_submission_id required' using errcode = 'check_violation';
  end if;

  -- duplicate-tolerant: เคยบันทึกแล้ว = สำเร็จ (สัญญา SubmitFn — spike 0.3/scrutiny S3)
  select id into v_id from public.installation_photos where client_submission_id = p_client_submission_id;
  if v_id is not null then
    return jsonb_build_object('photo_id', v_id, 'already', true);
  end if;

  select t.id, t.room_id, t.site_code, r.project_id into v_t
  from public.installation_tasks t join public.installation_rooms r on r.id = t.room_id
  where t.id = p_task_id;
  if not found then raise exception 'lane not found' using errcode = 'no_data_found'; end if;

  select b.employee_id into v_emp from public.identity_binding b
  where b.auth_user_id = auth.uid() and b.is_active limit 1;
  if not (v_emp is not null or public.is_governance_role() or public.has_site_access(v_t.site_code)
          or public.fn_installation_is_member(v_t.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  insert into public.installation_photos (project_id, room_id, site_code, storage_path, meta, client_submission_id)
  values (v_t.project_id, v_t.room_id, v_t.site_code, p_storage_path,
          jsonb_build_object('task_id', p_task_id, 'via', 'field_pwa'),
          p_client_submission_id)
  on conflict (client_submission_id) where client_submission_id is not null do nothing
  returning id into v_id;

  if v_id is null then  -- แพ้ race พร้อมกัน = อีกฝั่งบันทึกแล้ว → สำเร็จเช่นกัน
    select id into v_id from public.installation_photos where client_submission_id = p_client_submission_id;
    return jsonb_build_object('photo_id', v_id, 'already', true);
  end if;

  return jsonb_build_object('photo_id', v_id, 'already', false);
end; $$;

revoke all on function public.rpc_field_submit_photo(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_submit_photo(uuid, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_submit_photo(uuid, text, text) to service_role';
  end if;
end $$;
