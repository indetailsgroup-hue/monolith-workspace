-- Migration: line_token_rotation — S13-2: LINE channel access token (v2 oauth) อายุ 30 วัน
-- ไม่ refresh = outbound ทั้งระบบพังเงียบสิ้นเดือน → cron หมุน token อัตโนมัติทุก 10 วัน
-- (token ใหม่ไม่ revoke ตัวเก่า — ตัวเก่าหมดอายุเอง; ออกใหม่ทุก 10 วัน = คงค้างสูงสุด ~3 ใบ ห่างเพดาน LINE 30 ใบ)
--
-- เส้นทาง: pg_cron → fn_wf_cron_invoke_edge('line-token-refresh') (pattern 0089)
--   edge fn → rpc_line_token_rotation_creds() → LINE oauth → rpc_rotate_line_token(new)
-- Secrets อยู่ใน Vault เท่านั้น (line_messaging_channel_id seed ตอน provision — ไม่อยู่ใน migration)

-- (1) คืน creds สำหรับหมุน token — service_role เท่านั้น
create or replace function public.rpc_line_token_rotation_creds()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_secret text;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select decrypted_secret into v_id from vault.decrypted_secrets where name = 'line_messaging_channel_id';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'line_channel_secret';
  if v_id is null or v_secret is null then
    raise exception 'vault ยังไม่มี line_messaging_channel_id / line_channel_secret (seed ตอน provision)'
      using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('channel_id', v_id, 'channel_secret', v_secret);
end; $$;

-- (2) เก็บ token ใหม่ลง Vault + audit (ไม่เก็บค่า token ใน audit)
create or replace function public.rpc_rotate_line_token(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_token), '') = '' or length(p_token) < 50 then
    raise exception 'token ไม่ถูกต้อง' using errcode = 'check_violation';
  end if;
  perform vault.update_secret(
    (select id from vault.secrets where name = 'line_channel_access_token'), p_token);
  insert into public.installation_audit_log (event_type, detail)
  values ('line_token_rotated', jsonb_build_object('token_length', length(p_token)));
end; $$;

-- helper: ตรวจว่า JWT เป็น service_role (ถ้ายังไม่มีจาก migration ก่อนหน้า)
create or replace function public.fn_is_service_role()
returns boolean
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or current_user = 'postgres';
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_line_token_rotation_creds()',
    'rpc_rotate_line_token(text)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function public.%s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;

-- (3) cron ทุกวันที่ 1/11/21 เวลา 21:15 UTC (04:15 ไทย — นอกเวลางาน)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-line-token-refresh';
    perform cron.schedule('wf-line-token-refresh', '15 21 1,11,21 * *',
      $cron$ select public.fn_wf_cron_invoke_edge('line-token-refresh'); $cron$);
  else
    raise notice 'pg_cron not available — skip wf-line-token-refresh (local dev)';
  end if;
end $$;
