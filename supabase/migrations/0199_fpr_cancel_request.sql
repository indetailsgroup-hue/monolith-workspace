-- =============================================================================
-- Migration 0199: rpc_cancel_field_purchase_request
-- Transitions field_purchase_request status: pending → cancelled.
--
-- Authority gate (self-cancel OR managerial/governance):
--   - The requester may cancel their own pending request (self-cancel).
--   - project_manager, managing_director, or a governance role may cancel
--     any pending request.
--
-- Site access check is only enforced for non-requester actors; the requester
-- always has implicit access to their own request.
--
-- State guard: only requests in status = 'pending' can be cancelled.
-- A request already in approved / rejected / purchased / closed / cancelled
-- raises invalid_state.
--
-- Follows Monolith patterns:
--   SECURITY DEFINER, fail-closed resolve_actor, SET LOCAL app.actor,
--   FOR UPDATE row lock, append-only audit, REVOKE ALL / GRANT TO authenticated.
--
-- Prerequisite migrations: 0176 (core tables + ENUMs), 0183 (close pattern).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend field_purchase_status ENUM
--    (IF NOT EXISTS guard — idempotent across re-runs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum
     WHERE enumlabel  = 'cancelled'
       AND enumtypid  = 'public.field_purchase_status'::regtype
  ) THEN
    ALTER TYPE public.field_purchase_status ADD VALUE 'cancelled';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. rpc_cancel_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_field_purchase_request(
  p_request_id    uuid,
  p_cancel_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       text;
  v_row         public.field_purchase_request%ROWTYPE;
  v_now         timestamptz := now();
  v_is_self     boolean;
  v_is_manager  boolean;
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
  -- 2. Lock the row FOR UPDATE before authority check to prevent races
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
  -- 3. Authority gate
  --    Option A (self-cancel): calling actor is the original requester.
  --    Option B (managerial):  project_manager, managing_director,
  --                            or any governance role.
  -- ------------------------------------------------------------------
  v_is_self    := (v_actor = v_row.requester);
  v_is_manager := (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  );

  IF NOT (v_is_self OR v_is_manager) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'only the requester or a project_manager / managing_director may cancel a request';
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Site access check
  --    Governance always passes.
  --    Requester (self-cancel) has implicit access to their own request.
  --    Non-requester managers must have explicit site access.
  -- ------------------------------------------------------------------
  IF NOT v_is_self AND NOT public.is_governance_role() THEN
    IF NOT public.has_site_access(v_row.site_code) THEN
      RAISE EXCEPTION 'insufficient_privilege'
        USING HINT = 'no access to site';
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- 5. State guard: only pending requests may be cancelled
  -- ------------------------------------------------------------------
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = format(
        'expected status=pending, actual=%s', v_row.status::text
      );
  END IF;

  -- ------------------------------------------------------------------
  -- 6. SET LOCAL app.actor so fn_fpr_audit_transition (the existing
  --    trigger) captures the correct actor for the status_changed entry
  --    (old='pending', new='cancelled').
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 7. Transition status: pending → cancelled
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status     = 'cancelled',
         updated_at = v_now
   WHERE id = p_request_id;

  -- ------------------------------------------------------------------
  -- 8. Supplementary audit entry (event_type = 'cancelled')
  --    Distinct from the trigger-generated status_changed entry.
  --    Records cancel_reason, cancelled_at, site_code, amount, and
  --    whether this was a self-cancel, for compliance reporting.
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
    'cancelled',
    'pending',
    'cancelled',
    jsonb_build_object(
      'cancel_reason', p_cancel_reason,
      'cancelled_at',  v_now,
      'self_cancel',   v_is_self,
      'site_code',     v_row.site_code,
      'amount',        v_row.amount
    )
  );

  -- ------------------------------------------------------------------
  -- 9. Return result payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',            true,
    'request_id',    p_request_id,
    'status',        'cancelled',
    'cancelled_by',  v_actor,
    'cancel_reason', p_cancel_reason,
    'self_cancel',   v_is_self,
    'site_code',     v_row.site_code,
    'amount',        v_row.amount,
    'cancelled_at',  v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_cancel_field_purchase_request(uuid, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_cancel_field_purchase_request(uuid, text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_cancel_field_purchase_request(uuid, text) IS
  'Transitions a field_purchase_request from pending → cancelled. '
  'Authority: the original requester (self-cancel) OR project_manager / managing_director / governance. '
  'Non-requester managers must have site access; requester has implicit access to their own request. '
  'Uses SET LOCAL app.actor so fn_fpr_audit_transition records the correct actor. '
  'Writes a supplementary audit entry (event_type=cancelled) with cancel_reason and self_cancel flag. '
  'Migration 0199.';

COMMIT;
