-- =============================================================================
-- Migration 0183: rpc_close_field_purchase_request
-- Transitions field_purchase_request status: purchased → closed.
-- Writes a supplementary "closed" audit entry (the final audit entry).
-- Follows: SECURITY DEFINER, fail-closed, SET LOCAL app.actor, FOR UPDATE lock.
-- Prerequisite migrations: 0176 (core tables/ENUMs), 0180 (purchased status).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_close_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_close_field_purchase_request(
  p_request_id  uuid,
  p_close_note  text DEFAULT NULL
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
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires project_manager or managing_director role';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Lock the row FOR UPDATE before any check to prevent race conditions
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
  -- 5. State guard: must be in purchased state
  -- ------------------------------------------------------------------
  IF v_row.status <> 'purchased' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'expected status=purchased, actual=%s', v_row.status::text
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. SET LOCAL app.actor so the existing trigger fn_fpr_audit_transition
  --    captures the correct actor (writes event_type='status_changed',
  --    old='purchased', new='closed' automatically).
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 7. Transition status purchased → closed
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status     = 'closed',
         updated_at = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 8. Supplementary final audit entry (event_type = 'closed')
  --    This is the explicit "final audit entry" distinct from the
  --    trigger-generated status_changed entry, and carries close_note,
  --    closed_at, site_code, and amount in metadata for reporting.
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
    'closed',
    'purchased',
    'closed',
    jsonb_build_object(
      'close_note', p_close_note,
      'closed_at',  v_now,
      'site_code',  v_row.site_code,
      'amount',     v_row.amount
    )
  );

  -- ------------------------------------------------------------------
  -- 9. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',         true,
    'request_id', p_request_id,
    'status',     'closed',
    'closed_by',  v_actor,
    'close_note', p_close_note,
    'site_code',  v_row.site_code,
    'amount',     v_row.amount,
    'closed_at',  v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_close_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_close_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_close_field_purchase_request(uuid, text) IS
  'Transitions a field_purchase_request from purchased → closed. '
  'Authority: project_manager, managing_director, or governance role. '
  'Uses SET LOCAL app.actor so fn_fpr_audit_transition records the correct actor. '
  'Also writes a supplementary audit entry (event_type=closed) with close_note and metadata. '
  'Migration 0183.';

COMMIT;
