-- 0170: S18 l6 — jobs list บอกความจริงที่โรงงานใช้ได้: ชื่องาน จำนวนชิ้น hash ย่อ
--
-- FactoryApp dashboard เคยได้แค่ jobId/state — คนหน้างานไม่รู้ว่างานไหนคือฉลากไหน
-- ชื่องาน/จำนวนชิ้นเป็น display metadata จาก manifest ตอน Designer อัปโหลด packet
-- (factory-api ส่งต่อหลัง sanitize) — ไม่ใช่ authority data และไม่แตะ trust boundary 0162
-- packetShaShort = 12 ตัวแรกของ packet_sha256 พอให้เทียบสายตากับฉลาก/ใบงาน
-- (ตรวจจริงยังต้องผ่าน /verify เท่านั้น)
--
-- DEPLOY ORDER (ADR-066 human apply) — ลำดับบังคับ:
--   1) apply 0170 (ไฟล์นี้) ก่อน   2) ค่อย deploy edge factory-api ตัวใหม่
-- เหตุผล: edge ใหม่ส่ง p_job_name/p_piece_count เสมอ (ค่า null ได้) และ PostgREST
-- จับ RPC ด้วยชุดชื่อ argument — ถ้า DB ยังเป็น signature 10 ตัว ทุก packet upload
-- จะพังด้วย signature mismatch · ทางกลับปลอดภัย: edge เก่า (ไม่ส่ง 2 ตัวใหม่)
-- เรียก function ใหม่ได้เพราะทั้งคู่มี default null
-- (เทสยึดสัญญานี้: factory-api/index.test.ts "deploy-order gate")

alter table public.factory_jobs
  add column if not exists job_name text,
  add column if not exists piece_count integer
    check (piece_count is null or piece_count >= 0);

-- Drop-then-create ตามแบบ 0162: PostgREST ห้ามเห็น overload กำกวมของ record_packet
drop function if exists public.rpc_factory_job_record_packet(text, text, text, text, text, text[], text[], text, text, text);

create function public.rpc_factory_job_record_packet(
  p_job_id text,
  p_packet_sha256 text,
  p_manifest_sha256 text,
  p_storage_path text,
  p_actor_subject_id text,
  p_actor_roles text[],
  p_actor_site_codes text[],
  p_authorization_context_id text,
  p_actor_role text,
  p_actor_name text,
  p_job_name text default null,
  p_piece_count integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_actor_subject_id), '') = ''
     or coalesce(array_length(p_actor_roles, 1), 0) = 0
     or coalesce(btrim(p_authorization_context_id), '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_actor_role, '') not in ('DESIGNER', 'ADMIN') then
    raise exception 'invalid server actor context' using errcode = 'check_violation';
  end if;
  if p_piece_count is not null and p_piece_count < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid piece count');
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  if v.spec_state <> 'RELEASED' then
    return jsonb_build_object('ok', false, 'error',
      'cannot record packet: spec must be RELEASED', 'specState', v.spec_state);
  end if;

  update public.factory_jobs set
    packet_sha256 = p_packet_sha256,
    manifest_sha256 = p_manifest_sha256,
    packet_storage_path = p_storage_path,
    -- metadata ใหม่ทับของเดิมเฉพาะเมื่อ packet รอบนี้พกมา — ค่าที่รู้แล้วไม่ถูกลบทิ้ง
    job_name = coalesce(nullif(btrim(p_job_name), ''), job_name),
    piece_count = coalesce(p_piece_count, piece_count),
    actor_role = p_actor_role,
    actor_name = p_actor_subject_id,
    actor_subject_id = p_actor_subject_id,
    actor_roles = p_actor_roles,
    actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
    authorization_context_id = p_authorization_context_id,
    updated_at = timezone('utc', now())
  where job_id = v.job_id;

  insert into public.factory_job_events (
    job_id, event, actor_role, actor_name, actor_subject_id,
    actor_roles, actor_site_codes, authorization_context_id, detail
  ) values (
    v.job_id, 'packet_recorded', p_actor_role, p_actor_subject_id, p_actor_subject_id,
    p_actor_roles, coalesce(p_actor_site_codes, '{}'::text[]), p_authorization_context_id,
    jsonb_build_object('packet_sha256', p_packet_sha256, 'storage_path', p_storage_path,
      'job_name', nullif(btrim(p_job_name), ''), 'piece_count', p_piece_count)
  );

  return jsonb_build_object('ok', true, 'jobId', v.job_id,
    'packetSha256', p_packet_sha256, 'storagePath', p_storage_path);
end; $$;

-- jobs list เติม field จริง — โครง/ลำดับเดิมจาก 0157 คงไว้ทุกตัว
create or replace function public.rpc_factory_jobs_list()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', j.job_id,
    'jobName', j.job_name,
    'pieceCount', j.piece_count,
    'specState', j.spec_state,
    'revisionId', j.revision_id,
    'packetShaShort', left(j.packet_sha256, 12),
    'createdAt', j.created_at,
    'updatedAt', j.updated_at,
    'frozenAt', j.frozen_at,
    'releasedAt', j.released_at,
    'eventCount', (select count(*) from public.factory_job_events e where e.job_id = j.job_id)
  ) order by j.updated_at desc), '[]'::jsonb) into v
  from public.factory_jobs j;
  return jsonb_build_object('ok', true, 'jobs', v);
end; $$;

revoke all on function public.rpc_factory_job_record_packet(
  text, text, text, text, text, text[], text[], text, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.rpc_factory_jobs_list() from public, anon, authenticated;

grant execute on function public.rpc_factory_job_record_packet(
  text, text, text, text, text, text[], text[], text, text, text, text, integer
) to service_role;
grant execute on function public.rpc_factory_jobs_list() to service_role;
