-- =============================================================================
-- Migration 0207: rpc_force_close_field_purchase_request (single-row)
-- Force-closes any non-cancelled, non-closed field_purchase_request → closed.
-- Sends one LINE push notification to the requester via identity_binding.
-- Follows: 0183 single-row close pattern, 0206 bulk force-close state guard.
-- Prerequisite migrations: 0176, 0183, 0206 (tpl_fpr_force_closed_flex_card already seeded).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_force_close_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_force_close_field_purchase_request(
  p_request_id  uuid,
  p_close_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor           text;
  v_row             public.field_purchase_request%ROWTYPE;
  v_now             timestamptz := now();
  v_previous_status text;
  v_line_user_id    text;
  v_notif_id        uuid;
  v_notification    jsonb := NULL;
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
  -- 3. Lock the row FOR UPDATE before any check (prevent race conditions)
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
  -- 5. State guard: blocked on already-closed or cancelled
  --    (same guard as rpc_bulk_force_close_field_purchase_request in 0206)
  -- ------------------------------------------------------------------
  IF v_row.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'cannot force-close a request in status=%s', v_row.status::text
      );
  END IF;

  v_previous_status := v_row.status::text;

  -- ------------------------------------------------------------------
  -- 6. SET LOCAL app.actor so fn_fpr_audit_transition captures correct actor
  --    (writes event_type='status_changed', old=previous, new='closed' automatically)
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 7. Transition status → closed
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status     = 'closed',
         updated_at = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 8. Supplementary audit entry (event_type = 'force_closed')
  --    Carries previous_status, close_note, site_code, and amount.
  --    Distinct from the trigger-generated status_changed entry.
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
    'force_closed',
    v_previous_status,
    'closed',
    jsonb_build_object(
      'close_note',      p_close_note,
      'closed_at',       v_now,
      'site_code',       v_row.site_code,
      'amount',          v_row.amount,
      'previous_status', v_previous_status
    )
  );

  -- ------------------------------------------------------------------
  -- 9. LINE push notification to requester (best-effort, non-blocking)
  --    Template tpl_fpr_force_closed_flex_card seeded in 0206 (crimson #DC2626).
  -- ------------------------------------------------------------------
  SELECT ib.line_user_id
    INTO v_line_user_id
    FROM public.identity_binding ib
   WHERE ib.employee_id = v_row.requester
     AND ib.is_active   = true
   LIMIT 1;

  IF v_line_user_id IS NOT NULL THEN
    INSERT INTO public.line_oa_outbound_messages (
      send_type,
      status,
      template_key,
      slot_values,
      target_type,
      target_id
    ) VALUES (
      'push',
      'pending',
      'tpl_fpr_force_closed_flex_card',
      jsonb_build_object(
        'request_id',      p_request_id::text,
        'site_code',       v_row.site_code,
        'amount',          v_row.amount::text,
        'close_note',      COALESCE(p_close_note, ''),
        'previous_status', v_previous_status,
        'forced_by',       v_actor,
        'closed_at',       v_now::text
      ),
      'user',
      v_line_user_id
    )
    RETURNING id INTO v_notif_id;

    v_notification := jsonb_build_object(
      'queued',      true,
      'outbound_id', v_notif_id,
      'target_id',   v_line_user_id
    );
  ELSE
    v_notification := jsonb_build_object(
      'queued', false,
      'reason', 'no_active_line_binding'
    );
  END IF;

  -- ------------------------------------------------------------------
  -- 10. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',              true,
    'request_id',      p_request_id,
    'status',          'closed',
    'forced_by',       v_actor,
    'close_note',      p_close_note,
    'previous_status', v_previous_status,
    'site_code',       v_row.site_code,
    'amount',          v_row.amount,
    'closed_at',       v_now,
    'notification',    v_notification
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_force_close_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_force_close_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_force_close_field_purchase_request(uuid, text) IS
  'Force-closes a single field_purchase_request from any non-cancelled/non-closed state to closed. '
  'Authority: project_manager, managing_director, or governance role. '
  'Uses SET LOCAL app.actor so fn_fpr_audit_transition records the correct actor. '
  'Writes supplementary audit entry (event_type=force_closed) with previous_status metadata. '
  'Queues one LINE push notification (tpl_fpr_force_closed_flex_card) to the requester '
  'via identity_binding. Template seeded in migration 0206. '
  'Migration 0207.';

COMMIT;
