-- =============================================================================
-- Migration 0185: rpc_escalate_field_purchase_request
--
-- Bumps the approval_level of a pending field purchase request one tier up:
--   team_lead  →  project_manager  →  managing_director  (top — no further)
--
-- After updating the level, re-routes the LINE approval notification to the
-- new tier's approver via rpc_route_fpr_approval_notification.
--
-- Patterns: SECURITY DEFINER, fail-closed, FOR UPDATE lock, SET LOCAL app.actor,
--           manual audit INSERT (trigger only fires on status change, not level).
-- Prerequisite migrations: 0176 (core), 0177 (LINE flow / rpc_route_*).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tier progression map
--   team_lead         → project_manager
--   project_manager   → managing_director
--   managing_director → error (already at top)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_escalate_field_purchase_request(
  p_request_id      uuid,
  p_escalation_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor          text;
  v_row            public.field_purchase_request%ROWTYPE;
  v_previous_level public.field_purchase_level;
  v_new_level      public.field_purchase_level;
  v_now            timestamptz := now();
  v_notify_result  jsonb;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Resolve calling actor (fail-closed)
  -- ------------------------------------------------------------------
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Authority gate
  --    Any approver at the current or higher tier, plus governance.
  --    installation_team_lead may escalate away from their own level;
  --    project_manager and managing_director may escalate any level;
  --    governance roles bypass all gates.
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(
         ARRAY['installation_team_lead', 'project_manager', 'managing_director']
       )
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires installation_team_lead, project_manager, or managing_director role';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Lock the row FOR UPDATE before any state check
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
  -- 4. Site access check
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_site_access(v_row.site_code)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'no access to site';
  END IF;

  -- ------------------------------------------------------------------
  -- 5. State guard: only pending requests may be escalated
  -- ------------------------------------------------------------------
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'only pending requests can be escalated; current status=%s',
        v_row.status::text
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. Tier check: managing_director is the top tier; cannot go higher
  -- ------------------------------------------------------------------
  IF v_row.approval_level = 'managing_director' THEN
    RAISE EXCEPTION 'already_at_top_level'
      USING HINT = 'approval_level is already managing_director; cannot escalate further';
  END IF;

  -- ------------------------------------------------------------------
  -- 7. Compute new tier
  -- ------------------------------------------------------------------
  v_previous_level := v_row.approval_level;

  v_new_level := CASE v_row.approval_level
    WHEN 'team_lead'       THEN 'project_manager'::public.field_purchase_level
    WHEN 'project_manager' THEN 'managing_director'::public.field_purchase_level
    -- managing_director branch handled by guard above; this branch is unreachable
    ELSE v_row.approval_level
  END;

  -- ------------------------------------------------------------------
  -- 8. SET LOCAL app.actor so any future trigger in this transaction
  --    (e.g. a status-change trigger) records the correct actor.
  --    Note: fn_fpr_audit_transition only fires on status changes;
  --    it does NOT fire here (status stays pending, only level changes).
  --    We write the audit entry manually below.
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 9. Bump the approval level (status remains pending)
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET approval_level = v_new_level,
         updated_at     = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 10. Write audit entry (event_type = 'escalated')
  --     fn_fpr_audit_transition does NOT fire for level-only changes,
  --     so we insert the audit record explicitly.
  --     old_status / new_status both = 'pending' (status is unchanged).
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
    'escalated',
    'pending',
    'pending',
    jsonb_build_object(
      'previous_level',    v_previous_level,
      'new_level',         v_new_level,
      'escalation_note',   p_escalation_note,
      'escalated_at',      v_now,
      'site_code',         v_row.site_code,
      'amount',            v_row.amount
    )
  );

  -- ------------------------------------------------------------------
  -- 11. Re-route LINE approval notification to the new tier's approver
  --     rpc_route_fpr_approval_notification re-reads approval_level from
  --     field_purchase_request (which now holds v_new_level) and sends
  --     the Flex Card DM push to the correct approver.
  -- ------------------------------------------------------------------
  BEGIN
    v_notify_result := public.rpc_route_fpr_approval_notification(p_request_id);
  EXCEPTION WHEN OTHERS THEN
    -- Notification failure must not roll back the escalation itself.
    -- Surface the error in the return payload so callers can handle/retry.
    v_notify_result := jsonb_build_object(
      'ok',    false,
      'error', SQLERRM
    );
  END;

  -- ------------------------------------------------------------------
  -- 12. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',               true,
    'request_id',       p_request_id,
    'previous_level',   v_previous_level,
    'new_level',        v_new_level,
    'escalated_by',     v_actor,
    'escalation_note',  p_escalation_note,
    'site_code',        v_row.site_code,
    'amount',           v_row.amount,
    'escalated_at',     v_now,
    'notify_result',    v_notify_result
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_escalate_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_escalate_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_escalate_field_purchase_request(uuid, text) IS
  'Escalates a pending field_purchase_request one approval tier up '
  '(team_lead→project_manager→managing_director). '
  'Re-routes the LINE Flex Card notification to the new tier''s approver. '
  'Authority: installation_team_lead, project_manager, managing_director, or governance. '
  'Writes event_type=escalated audit entry. '
  'Notification failure is surfaced in notify_result but does not roll back. '
  'Migration 0185.';

COMMIT;
