-- =============================================================================
-- Migration 0182: Organization Notification Settings
-- =============================================================================
-- Adds `notification_settings` JSONB column to `organizations` table.
-- Shape: {
--   "line_notify_token": "...",   -- LINE Notify personal access token
--   "email": "...",               -- notification email address
--   "notify_channel": "line"|"email"|"both"|"none"
-- }
--
-- Access:
--   SELECT  → rpc_get_org_notification_settings() — any authenticated org member
--   UPDATE  → rpc_update_org_notification_settings() — OWNER or ADMIN only
--             direct UPDATE on organizations is blocked by existing RLS
--
-- Depends on: migration 0172 (organizations, org_members tables)
-- =============================================================================

BEGIN;

-- ─── 1. Add column ────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS notification_settings JSONB
    NOT NULL
    DEFAULT '{"line_notify_token":null,"email":null,"notify_channel":"none"}'::jsonb;

COMMENT ON COLUMN public.organizations.notification_settings IS
  'Per-org notification configuration: {line_notify_token, email, notify_channel: line|email|both|none}';

-- ─── 2. CHECK constraint — validate notify_channel enum ──────────────────────

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_org_notify_channel;

ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_notify_channel CHECK (
    (notification_settings->>'notify_channel') IN ('line', 'email', 'both', 'none')
    OR (notification_settings->>'notify_channel') IS NULL
  );

-- ─── 3. Backfill existing rows with a safe default ──────────────────────────

UPDATE public.organizations
SET notification_settings = '{"line_notify_token":null,"email":null,"notify_channel":"none"}'::jsonb
WHERE notification_settings = '{}'::jsonb
   OR notification_settings IS NULL;

-- ─── 4. RLS — notification_settings inherits existing org-level policies ─────
-- Existing RLS on organizations:
--   org_select_own  → SELECT WHERE org_id = get_user_org_id()    ✅ already covers read
--   org_update_own  → UPDATE WHERE org_id = get_user_org_id()    (if exists)
--
-- We deliberately NOT allow direct UPDATE of notification_settings via RLS;
-- all writes go through rpc_update_org_notification_settings (SECURITY DEFINER).
-- This ensures role-level enforcement (OWNER/ADMIN only) cannot be bypassed.
-- No new RLS policies needed for the column itself.

-- ─── 5. Helper: get_user_role_in_org() ───────────────────────────────────────
-- Returns the caller's role string in their org. Used by RPCs below.

CREATE OR REPLACE FUNCTION public.get_user_role_in_org()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT role::text
  FROM   public.org_members
  WHERE  user_id = auth.uid()
    AND  org_id  = get_user_org_id()
  LIMIT  1;
$$;

COMMENT ON FUNCTION public.get_user_role_in_org() IS
  'Returns the current authenticated user''s role in their org (OWNER, ADMIN, etc.)';

-- ─── 6. RPC: rpc_update_org_notification_settings ────────────────────────────
-- OWNER or ADMIN only. Validates inputs, merges into JSONB, updates org row.

CREATE OR REPLACE FUNCTION public.rpc_update_org_notification_settings(
  p_line_notify_token TEXT    DEFAULT NULL,
  p_email             TEXT    DEFAULT NULL,
  p_notify_channel    TEXT    DEFAULT 'none'
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_org_id  UUID;
  v_role    TEXT;
  v_result  JSONB;
BEGIN
  -- 1. Resolve caller context
  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: user is not a member of any organization'
      USING ERRCODE = 'P0001';
  END IF;

  v_role := get_user_role_in_org();
  IF v_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'FORBIDDEN: only OWNER or ADMIN can update notification settings (role=%)', v_role
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate notify_channel
  IF p_notify_channel NOT IN ('line', 'email', 'both', 'none') THEN
    RAISE EXCEPTION 'INVALID: notify_channel must be one of: line, email, both, none (got: %)',
      p_notify_channel
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate email format (basic check)
  IF p_email IS NOT NULL AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID: email address format is invalid: %', p_email
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validate notify_channel vs provided tokens
  IF p_notify_channel IN ('line', 'both') AND (p_line_notify_token IS NULL OR p_line_notify_token = '') THEN
    RAISE EXCEPTION 'INVALID: line_notify_token is required when notify_channel is "%" ', p_notify_channel
      USING ERRCODE = 'P0001';
  END IF;

  IF p_notify_channel IN ('email', 'both') AND (p_email IS NULL OR p_email = '') THEN
    RAISE EXCEPTION 'INVALID: email is required when notify_channel is "%"', p_notify_channel
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Build new settings JSONB
  v_result := jsonb_build_object(
    'line_notify_token', p_line_notify_token,
    'email',             p_email,
    'notify_channel',    p_notify_channel
  );

  -- 6. Persist
  UPDATE public.organizations
  SET
    notification_settings = v_result,
    updated_at            = NOW()
  WHERE org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_update_org_notification_settings(TEXT, TEXT, TEXT) IS
  'Update org notification settings. OWNER or ADMIN only. Validates channel vs token/email presence.';

GRANT EXECUTE ON FUNCTION public.rpc_update_org_notification_settings(TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── 7. RPC: rpc_get_org_notification_settings ───────────────────────────────
-- Any authenticated member of the org can read settings.
-- Returns the JSONB blob (NOTE: includes line_notify_token — share only with OWNER/ADMIN in UI).

CREATE OR REPLACE FUNCTION public.rpc_get_org_notification_settings()
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: user is not a member of any organization'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT notification_settings
  INTO   v_result
  FROM   public.organizations
  WHERE  org_id = v_org_id;

  RETURN COALESCE(v_result, '{"line_notify_token":null,"email":null,"notify_channel":"none"}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.rpc_get_org_notification_settings() IS
  'Get current org notification settings. Any authenticated org member can call this.';

GRANT EXECUTE ON FUNCTION public.rpc_get_org_notification_settings()
  TO authenticated;

-- ─── 8. Index for JSON path queries ──────────────────────────────────────────
-- Supports WHERE (notification_settings->>'notify_channel') != 'none' in notify-overdue

CREATE INDEX IF NOT EXISTS idx_org_notification_channel
  ON public.organizations
  USING btree (((notification_settings->>'notify_channel')));

-- ─── 9. Helper SQL function: _etax_claim_batch ───────────────────────────────
-- Atomically claims N queued submissions by setting status='submitting'.
-- Called by the etax-submit-worker Edge Function using service_role.
-- Returns the claimed rows.

CREATE OR REPLACE FUNCTION public._etax_claim_batch(p_limit INT DEFAULT 10)
  RETURNS SETOF public.etax_submissions
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE public.etax_submissions
  SET
    status          = 'submitting',
    last_attempt_at = NOW(),
    attempt_count   = attempt_count + 1,
    updated_at      = NOW()
  WHERE id IN (
    SELECT id
    FROM   public.etax_submissions
    WHERE  status = 'queued'
    ORDER  BY created_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

COMMENT ON FUNCTION public._etax_claim_batch(INT) IS
  'Atomically claims up to N queued etax_submissions for processing. Called by etax-submit-worker.';

-- Service role only — this function must NOT be called by client-side code
REVOKE ALL ON FUNCTION public._etax_claim_batch(INT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public._etax_claim_batch(INT) TO service_role;

-- ─── 10. Update rpc_etax_mark_submitted to accept xml_payload + rd_response_code ─

CREATE OR REPLACE FUNCTION public.rpc_etax_mark_submitted(
  p_submission_id   UUID,
  p_rd_ref_no       TEXT,
  p_rd_response_code TEXT DEFAULT '200',
  p_xml_payload     TEXT DEFAULT NULL
)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.etax_submissions
  SET
    status            = 'submitted',
    rd_ref_no         = p_rd_ref_no,
    rd_response_code  = p_rd_response_code,
    submitted_at      = NOW(),
    xml_payload       = COALESCE(p_xml_payload, xml_payload),
    error_detail      = NULL,
    updated_at        = NOW()
  WHERE id = p_submission_id
    AND status = 'submitting';  -- guard: only advance from submitting

  IF NOT FOUND THEN
    RAISE WARNING 'rpc_etax_mark_submitted: no submitting row found for id=%', p_submission_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_mark_submitted(UUID, TEXT, TEXT, TEXT) IS
  'Mark an etax submission as submitted with RD reference number and optional XML payload.';

GRANT EXECUTE ON FUNCTION public.rpc_etax_mark_submitted(UUID, TEXT, TEXT, TEXT)
  TO service_role, authenticated;

COMMIT;

-- =============================================================================
-- Summary
-- =============================================================================
-- New column:
--   organizations.notification_settings JSONB
--     CHECK (notify_channel IN ('line','email','both','none'))
--
-- New RPCs:
--   rpc_update_org_notification_settings(token, email, channel) → JSONB
--     OWNER/ADMIN only, SECURITY DEFINER
--   rpc_get_org_notification_settings() → JSONB
--     any authenticated org member
--
-- New internal function:
--   _etax_claim_batch(limit) → etax_submissions[]
--     service_role only, called by etax-submit-worker Edge Function
--
-- Updated RPC:
--   rpc_etax_mark_submitted — adds p_rd_response_code + p_xml_payload params
--
-- New index:
--   idx_org_notification_channel on organizations(notification_settings->>'notify_channel')
-- =============================================================================
