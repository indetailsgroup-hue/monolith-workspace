-- Migration: cron_schedules — monolith-workflow-copilot (runbook Wave2 B3, มติ grill Q2: schedule เป็น code ใน repo)
-- Depends on: 0086 (fn_wf_in_quiet_hours — digest เวลาไทย), edge functions notification-retry-worker / sla-sweep-scheduler
--
-- pg_cron + pg_net เรียก Edge Functions ตามคาบ (มติ grill-with-docs 2026-07-06):
--   wf-notification-retry  ทุก 1 นาที   → notification-retry-worker (POST {})
--   wf-sla-sweep           ทุก 15 นาที  → sla-sweep-scheduler (POST {})
--   wf-daily-digest        0 1 * * * UTC (= 08:00 เวลาไทย ตาม glossary) → sla-sweep-scheduler (POST {"assemble_digest": true})
--
-- Secrets: ห้าม hardcode — อ่านจาก Vault ตอน "รัน" (ไม่ใช่ตอน migrate) ผ่าน fn_wf_cron_invoke_edge:
--   vault secret 'wf_edge_base_url'    = URL โปรเจกต์ เช่น https://<ref>.supabase.co
--   vault secret 'wf_edge_service_key' = service role key
--   → ops seed สองค่านี้ในขั้น C3 ของ runbook (Dashboard → Vault); migration นี้ apply ได้ก่อน seed
--     (job จะ audit 'cron_secrets_missing' แล้วข้าม — ไม่ error spam)
--
-- Local dev: ถ้าไม่มี pg_cron/pg_net → ข้ามการ schedule (raise notice) — `supabase db reset` ไม่พัง

-- (1) extensions — guard แยกตัว (hosted มีทั้งคู่; local อาจไม่มี)
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable (%) — cron schedules will be skipped', sqlerrm;
  end;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net unavailable (%) — cron schedules will be skipped', sqlerrm;
  end;
end $$;

-- (2) helper: อ่าน Vault → ยิง Edge Function (จุดเดียวที่แตะ secret; คืน request id ของ pg_net)
create or replace function public.fn_wf_cron_invoke_edge(
  p_path text,                          -- ชื่อ edge function เช่น 'sla-sweep-scheduler'
  p_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_req bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'wf_edge_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'wf_edge_service_key';

  if v_url is null or v_key is null then
    -- ยัง provision ไม่ครบ (runbook C3) — บันทึกแล้วข้าม ไม่ throw (กัน cron error spam ทุกนาที)
    insert into public.workflow_audit_log (event_type, performed_by, detail)
    values ('notification', 'pg_cron',
      jsonb_build_object('result', 'cron_secrets_missing', 'path', p_path,
        'hint', 'seed vault: wf_edge_base_url + wf_edge_service_key (runbook Wave2 C3)'));
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body := coalesce(p_body, '{}'::jsonb)
  ) into v_req;

  return v_req;  -- ผลลัพธ์ HTTP ดูได้ที่ net._http_response (pg_net เก็บ async)
end;
$$;

revoke all on function public.fn_wf_cron_invoke_edge(text, jsonb) from public;

comment on function public.fn_wf_cron_invoke_edge(text, jsonb) is
  'B3 (runbook Wave2): cron → Edge Function ผ่าน pg_net; secret จาก Vault เท่านั้น (ADR-036 bridge, ห้าม hardcode)';

-- (3) schedules — idempotent (unschedule ชื่อเดิมก่อน) และทำเฉพาะเมื่อ extensions พร้อม
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then

    perform cron.unschedule(jobid)
    from cron.job
    where jobname in ('wf-notification-retry', 'wf-sla-sweep', 'wf-daily-digest');

    -- retry worker ทุก 1 นาที (backoff จริงคุมด้วย next_attempt_at ใน claim v3 — 0084)
    perform cron.schedule('wf-notification-retry', '* * * * *',
      $job$select public.fn_wf_cron_invoke_edge('notification-retry-worker')$job$);

    -- SLA sweep ทุก 15 นาที (Req 13.2–13.4)
    perform cron.schedule('wf-sla-sweep', '*/15 * * * *',
      $job$select public.fn_wf_cron_invoke_edge('sla-sweep-scheduler')$job$);

    -- Daily_Digest 08:00 เวลาไทย = 01:00 UTC (glossary; มติ grill 2026-07-06)
    perform cron.schedule('wf-daily-digest', '0 1 * * *',
      $job$select public.fn_wf_cron_invoke_edge('sla-sweep-scheduler', '{"assemble_digest": true}'::jsonb)$job$);

  else
    raise notice 'pg_cron/pg_net not installed — wf-* schedules not created (expected on local dev; hosted จะสร้างตอน db push)';
  end if;
end $$;
