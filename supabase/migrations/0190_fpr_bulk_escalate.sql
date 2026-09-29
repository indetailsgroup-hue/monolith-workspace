-- =============================================================================
-- Migration 0190 – rpc_bulk_escalate_field_purchase_request
--
-- Atomically escalates multiple pending field purchase requests one approval
-- tier up (team_lead → project_manager → managing_director) in a single batch.
--
-- Status remains 'pending' throughout; only approval_level is bumped.
-- Because fn_fpr_audit_transition fires ONLY on status changes, audit rows are
-- inserted manually with event_type = 'escalated' and metadata.bulk = true.
--
-- Atomicity contract (mirrors 0188/0189):
--   • Any validation failure inside the per-row loop → full ROLLBACK (fail-all).
--   • LINE notifications fire per row but are non-fatal (errors collected).
--
-- Authority: installation_team_lead | project_manager | managing_director |
--            is_governance_role()
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_bulk_escalate_field_purchase_request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_bulk_escalate_field_purchase_request(
    p_request_ids     uuid[],
    p_escalation_note text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor          text;
    v_rec            RECORD;

    -- Parallel-indexed accumulation arrays (populated during validation loop)
    v_ids_arr        uuid[]                 := '{}';
    v_prev_arr       field_purchase_level[] := '{}';
    v_new_arr        field_purchase_level[] := '{}';

    v_next_level     field_purchase_level;
    v_notify_errors  jsonb                  := '[]'::jsonb;
    v_notify_result  jsonb;
    v_i              integer;
BEGIN
    -- ── 1. Input guard ────────────────────────────────────────────────────────
    IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'empty_request_list',
            'hint', 'p_request_ids must contain at least one element'
        );
    END IF;

    -- ── 2. Resolve & record actor ─────────────────────────────────────────────
    v_actor := resolve_actor();
    PERFORM set_config('app.actor', v_actor, true);

    -- ── 3. Authority gate ─────────────────────────────────────────────────────
    --    Same gate as the single-row rpc_escalate_field_purchase_request (0185).
    IF NOT (
        has_any_app_role(ARRAY[
            'installation_team_lead',
            'project_manager',
            'managing_director'
        ])
        OR is_governance_role()
    ) THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'insufficient_privilege',
            'hint', 'Caller must hold a field-purchase escalation role'
        );
    END IF;

    -- ── 4. Per-row validation loop (deterministic lock order) ─────────────────
    FOR v_rec IN
        SELECT id,
               site_code,
               status,
               approval_level
          FROM field_purchase_request
         WHERE id = ANY(p_request_ids)
         ORDER BY id          -- deterministic order avoids deadlocks on concurrent batches
           FOR UPDATE
    LOOP
        -- 4a. Site access guard
        IF NOT has_site_access(v_rec.site_code) THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'site_access_denied',
                'request_id', v_rec.id,
                'site_code',  v_rec.site_code
            );
        END IF;

        -- 4b. State guard — only pending requests may be escalated
        IF v_rec.status <> 'pending' THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'invalid_state',
                'request_id', v_rec.id,
                'current',    v_rec.status,
                'hint',       'Only pending requests can be escalated'
            );
        END IF;

        -- 4c. Top-level guard — managing_director is the approval ceiling
        IF v_rec.approval_level = 'managing_director' THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'already_at_top_level',
                'request_id', v_rec.id,
                'hint',       'Request is already at managing_director level'
            );
        END IF;

        -- 4d. Compute next tier
        v_next_level := CASE v_rec.approval_level
            WHEN 'team_lead'       THEN 'project_manager'::field_purchase_level
            WHEN 'project_manager' THEN 'managing_director'::field_purchase_level
        END;

        -- Accumulate into parallel arrays
        v_ids_arr  := v_ids_arr  || v_rec.id;
        v_prev_arr := v_prev_arr || v_rec.approval_level;
        v_new_arr  := v_new_arr  || v_next_level;
    END LOOP;

    -- ── 5. Verify all submitted IDs were found ────────────────────────────────
    --    If the loop produced fewer entries than the input array, at least one
    --    UUID was not found (or not accessible due to RLS / site filter).
    IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'request_not_found',
            'hint', 'One or more request_ids were not found or not accessible'
        );
    END IF;

    -- ── 6. Batch UPDATE — approval_level only; status stays 'pending' ─────────
    --    The CASE expression is safe: all rows were validated in step 4 and are
    --    either team_lead or project_manager (managing_director excluded in 4c).
    UPDATE field_purchase_request
       SET approval_level = CASE approval_level
                                WHEN 'team_lead'       THEN 'project_manager'::field_purchase_level
                                WHEN 'project_manager' THEN 'managing_director'::field_purchase_level
                            END,
           updated_at     = now()
     WHERE id = ANY(v_ids_arr);

    -- ── 7. Batch INSERT audit entries ─────────────────────────────────────────
    --    fn_fpr_audit_transition does NOT fire (no status change), so we insert
    --    manually.  Parallel unnest keeps the three arrays in lock-step.
    INSERT INTO field_purchase_audit_log (
        request_id,
        actor,
        event_type,
        old_status,
        new_status,
        metadata
    )
    SELECT t.req_id,
           v_actor,
           'escalated',
           'pending'::field_purchase_status,   -- status is unchanged; record for context
           'pending'::field_purchase_status,
           jsonb_build_object(
               'previous_level',  t.prev_lvl,
               'new_level',       t.new_lvl,
               'escalation_note', p_escalation_note,
               'bulk',            true
           )
      FROM unnest(v_ids_arr, v_prev_arr, v_new_arr)
        AS t(req_id, prev_lvl, new_lvl);

    -- ── 8. Per-row LINE notification (non-fatal; errors collected) ────────────
    FOR v_i IN 1 .. array_length(v_ids_arr, 1)
    LOOP
        BEGIN
            SELECT rpc_route_fpr_approval_notification(v_ids_arr[v_i])
              INTO v_notify_result;
        EXCEPTION WHEN OTHERS THEN
            v_notify_errors := v_notify_errors || jsonb_build_object(
                'request_id', v_ids_arr[v_i],
                'error',      SQLERRM
            );
        END;
    END LOOP;

    -- ── 9. Return success payload ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',               true,
        'escalated_count',  array_length(v_ids_arr, 1),
        'request_ids',      to_jsonb(v_ids_arr),
        'escalated_by',     v_actor,
        'escalation_note',  p_escalation_note,
        'escalated_at',     now(),
        'notify_errors',    v_notify_errors
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION rpc_bulk_escalate_field_purchase_request(uuid[], text)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_bulk_escalate_field_purchase_request(uuid[], text)
    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION rpc_bulk_escalate_field_purchase_request(uuid[], text) IS
'Atomically escalates multiple pending field purchase requests one tier up.
 team_lead → project_manager, project_manager → managing_director.

 Fail-all atomicity: any site-access, state, or already_at_top_level failure
 inside the validation loop triggers an immediate RETURN (implicit ROLLBACK of
 all preceding changes in this transaction).

 Audit rows are inserted manually with event_type=escalated and metadata.bulk=true
 because fn_fpr_audit_transition only fires on status changes and status remains
 pending throughout.

 LINE approval notifications are sent per row after the batch UPDATE; individual
 notification errors are collected in notify_errors and do not abort the
 transaction.

 Mirror of 0188 (bulk_close) and 0189 (bulk_reopen).
 Migration: 0190';

COMMIT;
