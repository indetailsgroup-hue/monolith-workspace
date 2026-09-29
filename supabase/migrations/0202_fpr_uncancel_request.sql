-- =============================================================================
-- Migration 0202: rpc_uncancel_field_purchase_request
--
-- Reverses a cancellation, returning a cancelled field purchase request to
-- the pending state so it can re-enter the approval workflow:
--   cancelled → pending
--
-- Use case: a request was cancelled by mistake, or the underlying reason for
-- cancellation was resolved. Returning to 'pending' lets the normal approval
-- chain resume without requiring a new submission.
--
-- Design decisions:
--   • Authority gate mirrors the cancel gate (0199):
--     project_manager, managing_director, or governance role.
--     (No self-uncancel — authority to undo a cancellation is intentionally
--     limited to supervising roles to prevent requester abuse.)
--   • SET LOCAL app.actor so fn_fpr_audit_transition automatically writes
--     a 'status_changed' entry (old='cancelled', new='pending').
--   • A supplementary 'uncancelled' audit entry is also written explicitly,
--     carrying uncancel_note, uncancelled_at, site_code, and amount —
--     mirroring the 'reopened' metadata shape in migration 0187.
--   • No LINE notification is re-routed on uncancel; the authorised actor
--     who calls this RPC is expected to coordinate next steps directly.
--     A future migration may add optional requester notification.
--
-- Patterns: SECURITY DEFINER, fail-closed, FOR UPDATE lock,
--           SET LOCAL app.actor, manual audit INSERT, no client write path.
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0199 — rpc_cancel_field_purchase_request (introduces 'cancelled' status usage)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_uncancel_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_uncancel_field_purchase_request(
  p_request_id    uuid,
  p_uncancel_note text DEFAULT NULL
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
  --    Mirrors the supervising-role check in rpc_cancel_field_purchase_request
  --    (0199) minus self-cancel, which is intentionally excluded here to
  --    prevent requester self-service reversal of a manager-issued cancel.
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
  -- 4. Site access check (governance bypasses; others must have access)
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_site_access(v_row.site_code)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'no access to site';
  END IF;

  -- ------------------------------------------------------------------
  -- 5. State guard: must be in cancelled state to uncancel
  -- ------------------------------------------------------------------
  IF v_row.status <> 'cancelled' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'expected status=cancelled, actual=%s', v_row.status::text
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. SET LOCAL app.actor so fn_fpr_audit_transition captures the
  --    correct actor when it fires on the UPDATE below.
  --    The trigger writes event_type='status_changed',
  --    old_status='cancelled', new_status='pending' automatically.
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 7. Transition status: cancelled → pending
  --    Reset approval fields so the request re-enters the queue cleanly.
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status         = 'pending',
         approver       = NULL,
         approved_at    = NULL,
         rejection_note = NULL,
         updated_at     = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 8. Supplementary audit entry (event_type = 'uncancelled')
  --    Distinct from the trigger-generated 'status_changed' entry.
  --    Carries uncancel_note and metadata for audit trail completeness.
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
    'uncancelled',
    'cancelled',
    'pending',
    jsonb_build_object(
      'uncancel_note',  p_uncancel_note,
      'uncancelled_at', v_now,
      'site_code',      v_row.site_code,
      'amount',         v_row.amount
    )
  );

  -- ------------------------------------------------------------------
  -- 9. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',             true,
    'request_id',     p_request_id,
    'status',         'pending',
    'uncancelled_by', v_actor,
    'uncancel_note',  p_uncancel_note,
    'site_code',      v_row.site_code,
    'amount',         v_row.amount,
    'uncancelled_at', v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_uncancel_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_uncancel_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_uncancel_field_purchase_request(uuid, text) IS
  'Reverses a cancellation on a field_purchase_request: transitions status '
  'cancelled → pending so the request re-enters the normal approval workflow. '
  'Approval fields (approver, approved_at, rejection_note) are cleared on '
  'transition so the request is treated as a fresh pending submission. '
  'Authority: project_manager, managing_director, or governance role. '
  'Self-uncancel is intentionally excluded — only supervising roles can '
  'reverse a cancellation to prevent requester abuse. '
  'Uses SET LOCAL app.actor so fn_fpr_audit_transition records the correct '
  'actor for the automatic status_changed entry. '
  'Also writes a supplementary audit entry (event_type=uncancelled) with '
  'uncancel_note, uncancelled_at, site_code, and amount. '
  'Migration 0202.';

COMMIT;
