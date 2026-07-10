-- 0161: Factory packet store — ปิดลูป design→factory (ADR-061 ภาคต่อ)
-- Designer Freeze/Export แล้ว packet ZIP ขึ้น bucket (ผ่าน factory-api, service key)
-- โรงงานดึงผ่าน /export (signed URL) + /verify (hash เทียบ anchor ใน factory_jobs)
-- ทุกอย่าง service_role-only เหมือนตระกูล rpc_factory_* เดิม

-- (1) bucket private (local guard แบบ 0099)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('factory-packets', 'factory-packets', false)
    on conflict (id) do nothing;
  else
    raise notice 'storage.buckets not available — bucket factory-packets จะถูกสร้างบน hosted';
  end if;
end $$;

-- (2) เก็บ storage path บน factory_jobs
alter table public.factory_jobs
  add column if not exists packet_storage_path text;

-- (3) บันทึก packet ที่อัปโหลด (anchor hash + path) — เรียกโดย factory-api หลังเก็บไฟล์
create or replace function public.rpc_factory_job_record_packet(
  p_job_id text,
  p_packet_sha256 text,
  p_manifest_sha256 text,
  p_storage_path text,
  p_actor_role text default 'DESIGNER',
  p_actor_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  -- packet ผูกกับ spec ที่ล็อกแล้วเท่านั้น (กัน packet ลอยจาก DRAFT)
  if v.spec_state = 'DRAFT' then
    return jsonb_build_object('ok', false, 'error', 'cannot record packet: spec is DRAFT');
  end if;
  update public.factory_jobs set
    packet_sha256 = p_packet_sha256,
    manifest_sha256 = p_manifest_sha256,
    packet_storage_path = p_storage_path,
    updated_at = timezone('utc', now())
  where job_id = v.job_id;

  insert into public.factory_job_events (job_id, event, actor_role, actor_name, detail)
  values (v.job_id, 'packet_recorded', p_actor_role, p_actor_name,
    jsonb_build_object('packet_sha256', p_packet_sha256, 'storage_path', p_storage_path));

  return jsonb_build_object('ok', true, 'jobId', v.job_id,
    'packetSha256', p_packet_sha256, 'storagePath', p_storage_path);
end; $$;

-- (4) ข้อมูลสำหรับ export/verify (path + anchors)
create or replace function public.rpc_factory_job_packet_info(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id);
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  return jsonb_build_object('ok', true, 'jobId', v.job_id,
    'specState', v.spec_state, 'revisionId', v.revision_id,
    'packetSha256', v.packet_sha256, 'manifestSha256', v.manifest_sha256,
    'storagePath', v.packet_storage_path,
    'canExport', v.spec_state in ('FROZEN', 'RELEASED') and v.packet_storage_path is not null);
end; $$;

-- (5) ผล verify ลง event log (โรงงานเห็นประวัติทุกครั้ง)
create or replace function public.rpc_factory_job_verify_result(
  p_job_id text, p_verdict text, p_computed_sha256 text,
  p_actor_role text default 'FACTORY', p_actor_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_verdict not in ('PASS', 'FAIL') then
    return jsonb_build_object('ok', false, 'error', 'invalid verdict');
  end if;
  insert into public.factory_job_events (job_id, event, actor_role, actor_name, detail)
  values (btrim(p_job_id), 'verify', p_actor_role, p_actor_name,
    jsonb_build_object('verdict', p_verdict, 'computed_sha256', p_computed_sha256));
  return jsonb_build_object('ok', true, 'verdict', p_verdict);
end; $$;

revoke all on function public.rpc_factory_job_record_packet(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_packet_info(text) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_verify_result(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_factory_job_record_packet(text, text, text, text, text, text) to service_role;
grant execute on function public.rpc_factory_job_packet_info(text) to service_role;
grant execute on function public.rpc_factory_job_verify_result(text, text, text, text, text) to service_role;
