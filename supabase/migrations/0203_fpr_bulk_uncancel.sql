-- =============================================================================
-- Migration 0203: rpc_bulk_uncancel_field_purchase_request
--
-- Atomically uncancels multiple cancelled field purchase requests in a single
-- batch, returning each to the pending state so they can re-enter the approval
-- workflow:
--   cancelled → pending  (for each row in p_request_ids)
--
-- Design decisions:
--   • Canonical bulk pattern (mirrors 0191 bulk_reject): input guard,
--     resolve_actor, authority gate, FOR UPDATE per-row validation loop,
--     batch UPDATE, supplementary batch audit INSERT, return payload.
--   • Authority: project_manager, managing_director, or governance role.
--     Self-uncancel is intentionally excluded (same as single-row 0202) to
--     prevent requester self-service reversal of a manager-issued cancel.
--   • State guard: only 'cancelled' rows may be bulk-uncancelled.
--   • Approval fields (approver, approved_at, rejection_note) are cleared on
--     each row so the request re-enters the queue as a fresh pending submission.
--   • Supplementary audit rows: event_type='uncancelled', metadata.bulk=true
--     (fn_fpr_audit_transition also fires on the batch UPDATE, writing
--     status_changed rows automatically).
--   • Empty-array guard: returns immediately with code='empty_request_list'.
--   • Not-found guard: if the number of locked rows differs from the input
--     array length, returns code='request_not_found' before any mutation.
--   • Fail-all atomicity: any guard failure inside the validation loop triggers
--     an immediate RETURN, which causes an implicit ROLLBACK of all preceding
--     DML so no partial uncancels are possible.
--   • SECURITY DEFINER / SET LOCAL app.actor so fn_fpr_audit_transition
--     captures the correct actor.
--
-- Return payload:
--   { ok, uncancelled_count, request_ids, uncancelled_by,
--     uncancel_note, uncancelled_at }
--
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0191 — canonical bulk pattern (0203 mirrors it exactly)
--   0199 — rpc_cancel_field_purchase_request (introduces 'cancelled' usage)
--   0202 — rpc_uncancel_field_purchase_request (single-row reference)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- DROP the stub from 0203 if it was created before (idempotent guard).
-- 0204 will CREATE OR REPLACE this function with notifications; if this
-- migration is applied first, 0204 will safely replace it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_bulk_uncancel_field_purchase_request(
  p_request_ids  uuid[],
  p_uncancel_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor           text;
  v_now             timestamptz := now();
  v_ids_arr         uuid[]      := '{}';
  v_rec             public.field_purchase_request%ROWTYPE;
  v_uncancelled_count int;
BEGIN
  -- ── 1. Input guard ─────────────────────────────────────────────────────────
  IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'empty_request_list',
      'hint', 'p_request_ids must be a non-empty array of UUIDs'
    );
  END IF;

  -- ── 2. Resolve calling actor (fail-closed) ─────────────────────────────────
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- ── 3. Authority gate ───────────────────────────────────────────────────────
  --    project_manager, managing_director, or governance role.
  --    Mirrors 0202 single-row authority gate (no self-uncancel in bulk).
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  ) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'insufficient_privilege',
      'hint', 'requires project_manager or managing_director role'
    );
  END IF;

  -- ── 4. SET LOCAL app.actor for fn_fpr_audit_transition ────────────────────
  PERFORM set_config('app.actor', v_actor, true);

  -- ── 5. Per-row validation loop (FOR UPDATE) ────────────────────────────────
  FOR v_rec IN
    SELECT *
      FROM public.field_purchase_request
     WHERE id = ANY(p_request_ids)
     ORDER BY id
       FOR UPDATE
  LOOP
    -- 5a. Site access check (governance bypasses; others must have access)
    IF NOT (
      public.is_governance_role()
      OR public.has_site_access(v_rec.site_code)
    ) THEN
      RETURN jsonb_build_object(
        'ok',         false,
        'code',       'insufficient_privilege',
        'request_id', v_rec.id,
        'hint',       format('no access to site %s', v_rec.site_code)
      );
    END IF;

    -- 5b. State guard: must be in 'cancelled' state to uncancel
    IF v_rec.status <> 'cancelled' THEN
      RETURN jsonb_build_object(
        'ok',         false,
        'code',       'invalid_state',
        'request_id', v_rec.id,
        'current',    v_rec.status::text,
        'hint',       format(
          'expected status=cancelled for request %s, actual=%s',
          v_rec.id, v_rec.status::text
        )
      );
    END IF;

    -- Accumulate validated ID
    v_ids_arr := v_ids_arr || v_rec.id;
  END LOOP;

  -- ── 6. Not-found guard ─────────────────────────────────────────────────────
  --    Fires if any UUID in p_request_ids does not exist in the table.
  IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'request_not_found',
      'hint', 'one or more request_ids were not found in field_purchase_request'
    );
  END IF;

  -- ── 7. Batch UPDATE ────────────────────────────────────────────────────────
  --    Transitions all validated rows: cancelled → pending.
  --    Clears approver fields so each request re-enters the queue cleanly.
  --    fn_fpr_audit_transition fires here, inserting 'status_changed' rows.
  UPDATE public.field_purchase_request
     SET status         = 'pending'::field_purchase_status,
         approver       = NULL,
         approved_at    = NULL,
         rejection_note = NULL,
         updated_at     = v_now
   WHERE id = ANY(v_ids_arr);

  GET DIAGNOSTICS v_uncancelled_count = ROW_COUNT;

  -- ── 8. Supplementary batch INSERT audit entries ───────────────────────────
  --    fn_fpr_audit_transition has already inserted 'status_changed' rows.
  --    These supplementary rows carry event_type='uncancelled' + metadata.bulk=true
  --    so audit queries can key off the richer event type.
  INSERT INTO public.field_purchase_audit_log (
    request_id,
    actor,
    event_type,
    old_status,
    new_status,
    metadata
  )
  SELECT req_id,
         v_actor,
         'uncancelled',
         'cancelled'::field_purchase_status,
         'pending'::field_purchase_status,
         jsonb_build_object(
           'uncancel_note', p_uncancel_note,
           'bulk',          true,
           'uncancelled_at', v_now
         )
    FROM unnest(v_ids_arr) AS t(req_id);

  -- ── 9. Return success payload ──────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                true,
    'uncancelled_count', v_uncancelled_count,
    'request_ids',       to_jsonb(v_ids_arr),
    'uncancelled_by',    v_actor,
    'uncancel_note',     p_uncancel_note,
    'uncancelled_at',    v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_bulk_uncancel_field_purchase_request(uuid[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE
   ON FUNCTION public.rpc_bulk_uncancel_field_purchase_request(uuid[], text)
   TO authenticated;

COMMENT ON FUNCTION public.rpc_bulk_uncancel_field_purchase_request(uuid[], text) IS
'Atomically uncancels multiple cancelled field purchase requests in a single batch.

Transitions each row: cancelled → pending.  Clears approver, approved_at, and
rejection_note so each request re-enters the approval queue as a fresh pending
submission.

Inserts a supplementary audit row per request with event_type=''uncancelled'' and
metadata.bulk=true.  (fn_fpr_audit_transition also fires on the batch UPDATE,
writing status_changed rows automatically.)

Fail-all atomicity: any site-access or state-guard failure inside the validation
loop triggers an immediate RETURN (implicit ROLLBACK of all preceding DML).
No partial uncancels are possible.

Authority: project_manager, managing_director, or governance role.
Self-uncancel is intentionally excluded — only supervising roles can reverse a
cancellation (mirrors single-row 0202).
State guard: only ''cancelled'' requests may be bulk-uncancelled.
Empty-array guard: returns code=''empty_request_list'' immediately.
Not-found guard: returns code=''request_not_found'' if any UUID is unknown.

Migration 0203.  Superseded with LINE notifications by migration 0204.';

COMMIT;
