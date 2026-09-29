-- =============================================================================
-- Migration 0195 — pg_net Patch
-- File   : 01952_b_etax_risk_tier_notify_pgnet.sql
-- Purpose: Extends fn_check_risk_tier_changes (created in 0195) to invoke the
--          etax-risk-notify Edge Function via pg_net HTTP POST immediately after
--          firing pg_notify — removes dependency on poll-mode fallback for
--          real-time alert delivery.
-- Depends: pg_net extension, 0195_etax_risk_tier_notify.sql already applied
-- Author : MONOLITH Platform Team
-- Date   : 2026-09-01
-- =============================================================================

BEGIN;

-- ─── 0. Guard ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION
      'pg_net extension is not installed. Install it first: CREATE EXTENSION pg_net;';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_check_risk_tier_changes' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'fn_check_risk_tier_changes not found. Apply 0195_etax_risk_tier_notify.sql first.';
  END IF;
END $$;

-- ─── 1. Store Edge Function URL + secret in a config table ───────────────────
-- We use app.settings so the function can read them without hard-coding URLs.
DO $$
BEGIN
  -- Create config table if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_config'
  ) THEN
    CREATE TABLE public.platform_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    COMMENT ON TABLE public.platform_config IS
      'Platform-level configuration key/value pairs (read by trigger functions, edge functions).';
    GRANT SELECT ON public.platform_config TO service_role;
  END IF;
END $$;

-- Insert or update the etax-risk-notify endpoint config.
-- Operators must set these to the real values on each environment.
INSERT INTO public.platform_config (key, value) VALUES
  ('etax_risk_notify_url',    COALESCE(current_setting('app.etax_risk_notify_url',    true), '')),
  ('etax_risk_notify_secret', COALESCE(current_setting('app.etax_risk_notify_secret', true), ''))
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = NOW()
WHERE public.platform_config.value IS DISTINCT FROM EXCLUDED.value;

COMMENT ON TABLE public.platform_config IS
  'Set etax_risk_notify_url and etax_risk_notify_secret via:
   ALTER DATABASE postgres SET app.etax_risk_notify_url = ''https://<ref>.supabase.co/functions/v1/etax-risk-notify'';
   ALTER DATABASE postgres SET app.etax_risk_notify_secret = ''<function_secret>'';';

-- ─── 2. Replace fn_check_risk_tier_changes with pg_net version ────────────────
CREATE OR REPLACE FUNCTION public.fn_check_risk_tier_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_org_name          TEXT;
  v_new_tier          TEXT;
  v_prev_tier         TEXT;
  v_health_score      INTEGER;
  v_risk_rank         INTEGER;
  v_health_status     TEXT;
  v_is_priority       BOOLEAN;
  v_payload           JSONB;
  v_notify_url        TEXT;
  v_notify_secret     TEXT;
  v_request_id        BIGINT;
BEGIN
  -- ── Resolve new values from v_etax_org_risk_ranking ───────────────────────
  SELECT
    o.name,
    v.risk_tier,
    v.health_score,
    v.risk_rank,
    v.health_status
  INTO
    v_org_name,
    v_new_tier,
    v_health_score,
    v_risk_rank,
    v_health_status
  FROM public.v_etax_org_risk_ranking v
  JOIN public.organizations o ON o.id = v.org_id
  WHERE v.org_id = NEW.org_id;

  IF NOT FOUND THEN
    RETURN NEW;  -- org has no submissions yet — no alert needed
  END IF;

  -- Resolve previous tier from state table (BEFORE upsert)
  v_prev_tier := COALESCE(OLD.risk_tier, 'HEALTHY');

  -- Skip if tier has not actually changed
  IF v_new_tier = v_prev_tier THEN
    RETURN NEW;
  END IF;

  v_is_priority := (v_new_tier = 'CRITICAL');

  -- ── Build pg_notify payload (9 canonical fields) ──────────────────────────
  v_payload := jsonb_build_object(
    'org_id',             NEW.org_id,
    'org_name',           COALESCE(v_org_name, NEW.org_id::TEXT),
    'previous_tier',      v_prev_tier,
    'new_tier',           v_new_tier,
    'health_score',       COALESCE(v_health_score, 0),
    'risk_rank',          COALESCE(v_risk_rank, 0),
    'health_status',      COALESCE(v_health_status, 'unknown'),
    'is_priority_review', v_is_priority,
    'transitioned_at',    NOW()
  );

  -- ── 1. pg_notify (existing — kept for Realtime subscribers) ───────────────
  PERFORM pg_notify('etax_risk_rank_changed', v_payload::TEXT);

  -- ── 2. pg_net HTTP POST → etax-risk-notify Edge Function ──────────────────
  BEGIN
    -- Read config at runtime so URL/secret can be changed without redeploy
    v_notify_url := COALESCE(
      (SELECT value FROM public.platform_config WHERE key = 'etax_risk_notify_url'),
      current_setting('app.etax_risk_notify_url', true)
    );
    v_notify_secret := COALESCE(
      (SELECT value FROM public.platform_config WHERE key = 'etax_risk_notify_secret'),
      current_setting('app.etax_risk_notify_secret', true)
    );

    IF v_notify_url IS NOT NULL AND v_notify_url <> '' THEN
      SELECT net.http_post(
        url     := v_notify_url,
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || COALESCE(v_notify_secret, ''),
                     'X-Monolith-Event', 'etax_risk_rank_changed'
                   ),
        body    := v_payload
      ) INTO v_request_id;

      RAISE LOG
        'etax-risk-notify HTTP POST queued: request_id=% org=% % → %',
        v_request_id, NEW.org_id, v_prev_tier, v_new_tier;
    ELSE
      RAISE LOG
        'etax-risk-notify: URL not configured — pg_notify only for org=%', NEW.org_id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- pg_net failure must NEVER abort the transaction
    RAISE WARNING
      'etax-risk-notify pg_net call failed (non-fatal): % — org=% % → %',
      SQLERRM, NEW.org_id, v_prev_tier, v_new_tier;
  END;

  -- ── 3. Update etax_risk_tier_state (the upsert target) ────────────────────
  -- Already handled by the ON CONFLICT DO UPDATE in the calling statement.
  -- The trigger fires AFTER the upsert so state is already written.

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.fn_check_risk_tier_changes() IS
  'Fires on INSERT/UPDATE to etax_risk_tier_state.
   Sends pg_notify(etax_risk_rank_changed) for Realtime subscribers AND
   an HTTP POST via pg_net to the etax-risk-notify Edge Function for
   immediate LINE Notify / webhook delivery.
   pg_net failures are non-fatal (WARNING log only).
   Patched by 01952_b_etax_risk_tier_notify_pgnet.sql';

-- ─── 3. Helper: check net.http_post request status ────────────────────────────
-- Useful for debugging failed deliveries from the pg_net queue.
CREATE OR REPLACE FUNCTION public.rpc_etax_notify_request_status(
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  request_id      BIGINT,
  status_code     INTEGER,
  timed_out       BOOLEAN,
  created         TIMESTAMPTZ,
  url             TEXT,
  response_body   TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- net._http_response has no 'url' column; return NULL for url
  -- and use 'content' (pg_net's actual column) for response body
  SELECT
    r.id,
    r.status_code,
    r.timed_out,
    r.created,
    NULL::text,
    r.content
  FROM net._http_response r
  ORDER BY r.created DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_etax_notify_request_status(INT) TO service_role;
COMMENT ON FUNCTION public.rpc_etax_notify_request_status(INT) IS
  'Returns the last N pg_net HTTP responses for etax-risk-notify calls.
   Use to debug failed alert deliveries.';

-- ─── 4. Verify triggers are still attached ────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   pg_trigger
  WHERE  tgname IN (
    'trg_check_risk_tier_on_compliance_refresh',
    'trg_check_risk_tier_on_health_trend_refresh'
  );

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'Risk-tier change triggers not found (trg_check_risk_tier_on_compliance_refresh / '
      'trg_check_risk_tier_on_health_trend_refresh). '
      'Was 0195_etax_risk_tier_notify.sql applied?';
  END IF;
  RAISE NOTICE 'Risk-tier change triggers active (% found) ✓', v_count;
END $$;

COMMIT;
