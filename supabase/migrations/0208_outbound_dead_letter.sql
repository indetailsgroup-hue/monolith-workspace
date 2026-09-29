-- =============================================================================
-- Migration 0208: line_oa_outbound_messages dead-letter support
--
-- Changes:
--   0. ALTER TYPE line_oa_outbound_status ADD VALUE IF NOT EXISTS 'dead' (pre-BEGIN).
--   1. ADD COLUMN retried_count int4 DEFAULT 0 NOT NULL to line_oa_outbound_messages.
--   2. CREATE fn_outbound_mark_failed(p_id uuid) SECURITY DEFINER:
--        - Atomically increments retried_count.
--        - Sets status='dead' if retried_count >= 3, else status='failed'.
--        - Lost-race guard: WHERE status='pending' (only mark rows that are still pending).
--        - Returns jsonb {ok, id, status, retried_count}.
--   3. UPDATE rpc_retry_fpr_notifications to skip 'dead' rows in eligibility filter.
--
-- Prerequisite migrations: 0196 (rpc_retry_fpr_notifications), 0197 (pg_notify trigger).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extend enum: add 'dead' value for dead-letter status
--    Must run OUTSIDE the main transaction block (ALTER TYPE ADD VALUE
--    is not allowed inside a multi-statement transaction in PostgreSQL < 12,
--    and the value must be committed before use).
-- ---------------------------------------------------------------------------
ALTER TYPE public.line_oa_outbound_status ADD VALUE IF NOT EXISTS 'dead';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add retried_count column (idempotent guard)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'line_oa_outbound_messages'
       AND column_name  = 'retried_count'
  ) THEN
    ALTER TABLE public.line_oa_outbound_messages
      ADD COLUMN retried_count int4 NOT NULL DEFAULT 0;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. fn_outbound_mark_failed — atomic increment + dead-letter gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_outbound_mark_failed(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_count  int4;
  v_new_status text;
  v_updated    int4;
BEGIN
  -- Increment retried_count and decide next status atomically.
  -- WHERE status='pending' is the lost-race guard: if another worker already
  -- moved the row to 'sent' or 'dead', this UPDATE matches 0 rows and we no-op.
  UPDATE public.line_oa_outbound_messages
     SET retried_count = retried_count + 1,
         status = CASE
                    WHEN retried_count + 1 >= 3 THEN 'dead'
                    ELSE 'failed'
                  END
   WHERE id     = p_id
     AND status = 'pending'
  RETURNING retried_count, status
  INTO v_new_count, v_new_status;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Lost race or row doesn't exist — return no-op indicator.
    RETURN jsonb_build_object(
      'ok',           false,
      'id',           p_id,
      'reason',       'lost_race_or_not_found',
      'retried_count', NULL,
      'status',       NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'id',           p_id,
    'status',       v_new_status,
    'retried_count', v_new_count
  );
END;
$$;

-- Permissions: called from SECURITY DEFINER dispatch worker — no direct client access
REVOKE ALL ON FUNCTION public.fn_outbound_mark_failed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_outbound_mark_failed(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_outbound_mark_failed(uuid) IS
  'Atomically increments retried_count on a pending line_oa_outbound_messages row. '
  'Sets status=dead when retried_count reaches 3, otherwise status=failed. '
  'Lost-race-safe: WHERE status=pending guard means concurrent workers no-op gracefully. '
  'Called by the dispatch worker instead of a direct status PATCH when dispatch fails. '
  'Migration 0208.';

-- ---------------------------------------------------------------------------
-- 3. UPDATE rpc_retry_fpr_notifications to exclude 'dead' rows
--    Replaces the 0196 version — only the eligibility filter and p_older_than
--    default change (5 min → 10 min).
--    p_site_code retains DEFAULT NULL (matches 0196 signature; CREATE OR REPLACE
--    cannot remove a parameter default — 42P13).
--    DROP retained for a clean replacement in case of schema drift.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_retry_fpr_notifications(text, interval);

CREATE OR REPLACE FUNCTION public.rpc_retry_fpr_notifications(
  p_site_code  text  DEFAULT NULL,
  p_older_than interval DEFAULT interval '10 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        text;
  v_cutoff       timestamptz;
  v_retry_count  int4 := 0;
BEGIN
  -- Resolve actor
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- Authority gate: project_manager, managing_director, or governance
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires project_manager or managing_director role';
  END IF;

  -- p_older_than must be at least 1 minute (prevents runaway retries)
  IF p_older_than < interval '1 minute' THEN
    RAISE EXCEPTION 'invalid_argument'
      USING HINT = 'p_older_than must be >= 1 minute';
  END IF;

  v_cutoff := now() - p_older_than;

  -- Site access check
  IF NOT (
    public.is_governance_role()
    OR public.has_site_access(p_site_code)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'no access to site';
  END IF;

  -- Reset eligible failed rows back to pending so the dispatch worker picks them up.
  -- Eligibility (0208 update): exclude 'dead' rows (retried_count >= 3).
  WITH eligible AS (
    SELECT m.id
      FROM public.line_oa_outbound_messages m
      JOIN public.field_purchase_request fpr
           ON fpr.id::text = (m.slot_values->>'request_id')
     WHERE m.status  = 'failed'
       AND m.status <> 'dead'           -- 0208: skip dead-lettered rows
       AND fpr.site_code    = p_site_code
       AND fpr.status       = 'approved'
       AND fpr.approved_at  < v_cutoff
  )
  UPDATE public.line_oa_outbound_messages
     SET status        = 'pending',
         retried_count = COALESCE(retried_count, 0)   -- preserve existing count
   WHERE id IN (SELECT id FROM eligible);

  GET DIAGNOSTICS v_retry_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',           true,
    'retried_count', v_retry_count,
    'cutoff',        v_cutoff,
    'site_code',     p_site_code,
    'older_than',    p_older_than::text,
    'actor',         v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_retry_fpr_notifications(text, interval)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_retry_fpr_notifications(text, interval)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_retry_fpr_notifications(text, interval) IS
  'Resets eligible failed line_oa_outbound_messages rows back to pending for redispatch. '
  'Updated in 0208: dead rows (retried_count >= 3) are excluded from reset. '
  'Authority: project_manager, managing_director, or governance role. '
  'Migration 0208 (supersedes 0196).';

COMMIT;

