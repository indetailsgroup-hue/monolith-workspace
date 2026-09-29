-- =============================================================================
-- Migration 0184: Scheduled Jobs via pg_cron + pg_net
-- Purpose : Register cron jobs for etax-submit-worker and notify-overdue
--           edge functions. Requires pg_cron and pg_net extensions.
--
-- Supabase Pro/Team: enable pg_cron in Dashboard → Database → Extensions
-- Local dev:         already available in supabase start
-- =============================================================================

BEGIN;

-- Enable extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helper: project URL from env / vault
-- Replace 'https://YOUR_PROJECT_REF.supabase.co' with your actual project URL
-- or use: SELECT current_setting('app.settings.supabase_url', true)
--         after setting it with: ALTER DATABASE postgres SET app.settings.supabase_url = '...'
-- ---------------------------------------------------------------------------

-- Store project URL in DB settings for reuse
-- Run once manually or add to your CI environment setup:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_REF.supabase.co';
--   ALTER DATABASE postgres SET app.settings.cron_secret  = 'YOUR_CRON_SECRET';

-- ---------------------------------------------------------------------------
-- 1. etax-submit-worker  — every 5 minutes
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'etax-submit-worker',          -- job name (unique)
  '*/5 * * * *',                  -- every 5 minutes
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url', true)
                 || '/functions/v1/etax-submit-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body    := '{"source":"pg_cron"}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- 2. notify-overdue  — daily at 08:00 ICT (01:00 UTC)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'notify-overdue',
  '0 1 * * *',                    -- 01:00 UTC = 08:00 ICT
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url', true)
                 || '/functions/v1/notify-overdue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body    := '{"source":"pg_cron"}'::jsonb
    );
  $$
);

-- ---------------------------------------------------------------------------
-- 3. Verify registered jobs
-- ---------------------------------------------------------------------------
-- SELECT jobid, jobname, schedule, command, active
-- FROM   cron.job
-- WHERE  jobname IN ('etax-submit-worker', 'notify-overdue');

COMMIT;

-- =============================================================================
-- SETUP CHECKLIST
-- =============================================================================
-- After applying this migration:
--
-- 1. Set DB-level settings (run once per environment):
--    ALTER DATABASE postgres
--      SET app.settings.supabase_url  = 'https://YOUR_PROJECT_REF.supabase.co';
--    ALTER DATABASE postgres
--      SET app.settings.cron_secret   = 'YOUR_CRON_SECRET_VALUE';
--
-- 2. Set Supabase secrets (Edge Function env):
--    supabase secrets set ETAX_PROVIDER_URL=https://etax.rd.go.th/api/v1
--    supabase secrets set ETAX_API_KEY=<your-api-key>
--    supabase secrets set ETAX_SELLER_TAX_ID=<13-digit-tax-id>
--    supabase secrets set ETAX_SELLER_NAME=<company-name>
--    supabase secrets set LINE_NOTIFY_TOKEN=<line-notify-token>
--    supabase secrets set RESEND_API_KEY=<resend-api-key>
--    supabase secrets set CRON_SECRET=<same-value-as-above>
--
-- 3. Deploy Edge Functions:
--    supabase functions deploy etax-submit-worker
--    supabase functions deploy notify-overdue
--
-- 4. Verify cron is firing:
--    SELECT * FROM cron.job_run_details
--    ORDER BY start_time DESC LIMIT 20;
-- =============================================================================
