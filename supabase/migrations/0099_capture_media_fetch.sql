-- Migration: capture_media_fetch — installation-pm task 1.4 (D-4 ครึ่ง load-bearing: fetch + store + นับ baseline)
-- Depends on: 0053 (capture_artifact), 0097 (รูปจากกลุ่ม → raw_uri 'line-message://<id>'), 0089 (cron pattern)
--
-- ปัญหาที่ต้องปิดก่อน dogfood: รูปที่ช่างส่งใน LINE ถูก capture เป็น raw_uri 'line-message://<id>'
--   ซึ่ง**ชี้ไปที่ content บนเซิร์ฟเวอร์ LINE ที่มีอายุจำกัด** — ต้องมี worker ดึงเข้า Storage ของเราก่อนหาย
-- สโคป 1.4 รอบนี้: fetch → Storage bucket + นับ bytes (storage baseline ต้นทุน — D-4);
--   compress/thumbnail = follow-up (จดใน tasks — ไม่ block dogfood เพราะรูปต้นฉบับปลอดภัยแล้ว)
--
-- Worker = Edge Function 'capture-media-worker' (แก้คู่กันใน commit นี้) — DB คุยผ่าน 2 RPC ข้างล่าง
-- (สถาปัตยกรรม RPC-only: API roles ไม่มี table DML — ดู memory/scrutiny 2026-07-06)

-- ---------------------------------------------------------------------------
-- (1) Storage bucket สำหรับ media หน้างาน (private — เข้าถึงผ่าน signed URL จาก PWA)
-- ---------------------------------------------------------------------------
-- local db-only ไม่มี storage schema (storage-api ไม่ได้รัน) → guard ข้าม; hosted มีเสมอ
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('installation-media', 'installation-media', false)
    on conflict (id) do nothing;
  else
    raise notice 'storage.buckets not available — bucket installation-media จะถูกสร้างตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (2) คอลัมน์ media บน capture_artifact (additive ทั้งหมด)
-- ---------------------------------------------------------------------------
alter table public.capture_artifact
  add column if not exists media_storage_path text null,
  add column if not exists media_bytes bigint null,
  add column if not exists media_content_type text null,
  add column if not exists media_fetched_at timestamptz null,
  add column if not exists media_fetch_attempts int not null default 0,
  add column if not exists media_fetch_error text null;

comment on column public.capture_artifact.media_storage_path is
  '1.4: path ใน bucket installation-media หลัง worker ดึง content จาก LINE สำเร็จ (raw_uri เดิมคงไว้เป็นที่มา)';
comment on column public.capture_artifact.media_bytes is
  '1.4/D-4: ขนาดไฟล์จริง — แหล่งข้อมูล storage baseline ต้นทุน (รวมต่อ site/เดือนได้จากคอลัมน์นี้)';

-- คิวรอดึง: line-message ที่ยังไม่ fetch และยังไม่เกิน max attempts
create index if not exists ix_capture_media_pending
  on public.capture_artifact (created_at)
  where raw_uri like 'line-message://%' and media_fetched_at is null and media_fetch_attempts < 5;

-- ---------------------------------------------------------------------------
-- (3) RPC: claim งานรอดึง (คืน token ref ของ channel — worker ไป resolve จาก Vault เอง; ไม่มี secret ในผล)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_claim_line_media_fetches(p_limit int default 20)
returns table (
  artifact_id uuid,
  line_message_id text,
  site_code text,
  token_ref text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    substr(a.raw_uri, length('line-message://') + 1),
    a.site_code,
    -- dogfood: channel active ตัวแรก (single-channel); multi-channel ค่อย scope ต่อ vertical
    (select c.channel_access_token_ref from public.line_oa_channels c where c.is_active limit 1)
  from public.capture_artifact a
  where a.raw_uri like 'line-message://%'
    and a.media_fetched_at is null
    and a.media_fetch_attempts < 5
  order by a.created_at
  limit greatest(p_limit, 1);
$$;

revoke all on function public.rpc_claim_line_media_fetches(int) from public;

-- ---------------------------------------------------------------------------
-- (4) RPC: บันทึกผลดึง (สำเร็จ = path+bytes+type; ล้มเหลว = นับ attempt + error สั้น ๆ ไม่มี secret)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_media_fetch_result(
  p_artifact_id uuid,
  p_storage_path text,
  p_bytes bigint,
  p_content_type text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_error is null then
    update public.capture_artifact
       set media_storage_path = p_storage_path,
           media_bytes = p_bytes,
           media_content_type = p_content_type,
           media_fetched_at = timezone('utc', now()),
           media_fetch_error = null
     where id = p_artifact_id;
  else
    update public.capture_artifact
       set media_fetch_attempts = media_fetch_attempts + 1,
           media_fetch_error = left(p_error, 200)
     where id = p_artifact_id;
  end if;
  if not found then
    raise exception 'capture artifact % not found', p_artifact_id using errcode = 'no_data_found';
  end if;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  select p_artifact_id, a.capture_type, 'media_fetch', public.resolve_actor(), a.status::text, a.status::text,
         case when p_error is null
           then jsonb_build_object('result', 'fetched', 'bytes', p_bytes, 'path', p_storage_path)
           else jsonb_build_object('result', 'failed', 'attempts', a.media_fetch_attempts, 'error', left(p_error, 200))
         end
  from public.capture_artifact a where a.id = p_artifact_id;
end;
$$;

revoke all on function public.rpc_record_media_fetch_result(uuid, text, bigint, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_claim_line_media_fetches(int) to service_role';
    execute 'grant execute on function public.rpc_record_media_fetch_result(uuid, text, bigint, text, text) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (5) cron: ดึงทุก 5 นาที (LINE content มีอายุ — ช้าเกิน = รูปหาย; pattern เดียวกับ 0089)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-media-fetch';
    perform cron.schedule('wf-media-fetch', '*/5 * * * *',
      $job$select public.fn_wf_cron_invoke_edge('capture-media-worker')$job$);
  else
    raise notice 'pg_cron/pg_net not installed — wf-media-fetch not scheduled (local dev)';
  end if;
end $$;
