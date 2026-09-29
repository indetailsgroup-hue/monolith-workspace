-- =============================================================================
-- Migration 0187: rpc_reopen_field_purchase_request
--
-- Reopens a closed field purchase request, reversing the final closure:
--   closed → purchased
--
-- Use case: an FPR was closed with incorrect details (wrong amount, bad receipt).
-- Returning it to 'purchased' lets the authorised actor call
-- rpc_close_field_purchase_request again with corrected information.
--
-- Design decisions:
--   • Authority gate mirrors rpc_close_field_purchase_request:
--     project_manager, managing_director, or governance role.
--   • SET LOCAL app.actor so fn_fpr_audit_transition automatically
--     writes a 'status_changed' entry (old='closed', new='purchased').
--   • A supplementary 'reopened' audit entry is also written explicitly,
--     carrying reopen_note, reopened_at, site_code, and amount —
--     the same metadata shape as the 'closed' entry in 0183.
--   • No LINE notification is re-routed on reopen; the authorised actor
--     who calls this RPC is expected to coordinate next steps directly.
--     A future migration may add optional notification.
--
-- Patterns: SECURITY DEFINER, fail-closed, FOR UPDATE lock,
--           SET LOCAL app.actor, manual audit INSERT, no client write path.
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0183 — rpc_close_field_purchase_request (introduces 'closed' status usage)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_reopen_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_reopen_field_purchase_request(
  p_request_id  uuid,
  p_reopen_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  text;
  v_row    public.field_purchase_request%ROWTYPE;
  v_now    timestamptz := now();
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Resolve calling actor (fail-closed: no auth → hard stop)
  -- ------------------------------------------------------------------
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Authority gate: project_manager, managing_director, or governance
  --    (identical gate to rpc_close_field_purchase_request — only actors
  --    who may close can also reopen)
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires project_manager or managing_director role';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Lock the row FOR UPDATE before any check (prevents race conditions)
  -- ------------------------------------------------------------------
  SELECT * INTO v_row
    FROM public.field_purchase_request
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING HINT = 'field_purchase_request not found';
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Site access check (governance bypasses, others must have access)
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_site_access(v_row.site_code)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'no access to site';
  END IF;

  -- ------------------------------------------------------------------
  -- 5. State guard: must be in closed state to reopen
  -- ------------------------------------------------------------------
  IF v_row.status <> 'closed' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'expected status=closed, actual=%s', v_row.status::text
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. SET LOCAL app.actor so fn_fpr_audit_transition captures the
  --    correct actor when it fires on the UPDATE below.
  --    The trigger writes event_type='status_changed',
  --    old_status='closed', new_status='purchased' automatically.
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 7. Transition status closed → purchased
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status     = 'purchased',
         updated_at = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 8. Supplementary audit entry (event_type = 'reopened')
  --    Distinct from the trigger-generated 'status_changed' entry.
  --    Carries reopen_note and metadata for audit trail completeness.
  -- ------------------------------------------------------------------
  INSERT INTO public.field_purchase_audit_log (
    request_id,
    actor,
    event_type,
    old_status,
    new_status,
    metadata
  ) VALUES (
    p_request_id,
    v_actor,
    'reopened',
    'closed',
    'purchased',
    jsonb_build_object(
      'reopen_note', p_reopen_note,
      'reopened_at', v_now,
      'site_code',   v_row.site_code,
      'amount',      v_row.amount
    )
  );

  -- ------------------------------------------------------------------
  -- 9. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',          true,
    'request_id',  p_request_id,
    'status',      'purchased',
    'reopened_by', v_actor,
    'reopen_note', p_reopen_note,
    'site_code',   v_row.site_code,
    'amount',      v_row.amount,
    'reopened_at', v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_reopen_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_reopen_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_reopen_field_purchase_request(uuid, text) IS
  'Reopens a closed field_purchase_request: transitions status closed → purchased. '
  'Intended for correction workflows where an FPR was closed with incorrect data. '
  'Authority: project_manager, managing_director, or governance role. '
  'Uses SET LOCAL app.actor so fn_fpr_audit_transition records the correct actor '
  'for the automatic status_changed entry. '
  'Also writes a supplementary audit entry (event_type=reopened) with reopen_note, '
  'reopened_at, site_code, and amount. '
  'Migration 0187.';

COMMIT;
