-- =============================================================================
-- Migration 0193 – rpc_bulk_approve_field_purchase_request (+ LINE notifications)
--
-- Replaces the 0192 version of rpc_bulk_approve_field_purchase_request to add
-- per-request LINE approval notifications after the batch is committed.
--
-- Notification pattern (mirrors rpc_route_fpr_approval_notification from 0177):
--   For each approved request, the function resolves the relevant approver's
--   LINE UID via identity_binding, signs an HMAC token (ADR-031), and queues
--   a tpl_fpr_approved_flex_card push into line_oa_outbound_messages.
--
--   Notification failures are NON-FATAL: if the LINE UID cannot be resolved
--   (no identity_binding, no project membership), the approval is still
--   committed and the failure is recorded in the 'notifications' response
--   array.  This preserves fail-safe behaviour for sites without LINE.
--
-- Return payload additions vs 0192:
--   notifications jsonb[]  — per-request [ { request_id, ok, reason? } ]
--
-- Atomicity contract (unchanged from 0192):
--   Any site-access or state-guard failure → immediate RETURN → implicit
--   ROLLBACK of all preceding DML.  Notification errors do NOT trigger rollback.
--
-- Authority: installation_team_lead | project_manager | managing_director |
--            is_governance_role()
--
-- State guard: status must be 'pending'.  Any other status → 'invalid_state'.
--
-- Depends on: 0177 (rpc_route_fpr_approval_notification, identity_binding,
--                    installation_memberships, line_oa_outbound_messages)
--             0192 (initial rpc_bulk_approve_field_purchase_request)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_bulk_approve_field_purchase_request  (0193 — with LINE notifications)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_bulk_approve_field_purchase_request(
    p_request_ids  uuid[],
    p_approve_note text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor          text;
    v_rec            RECORD;
    v_now            timestamptz;

    -- Accumulation array — filled during the validation lock loop
    v_ids_arr        uuid[] := '{}';

    -- Running count for the final payload
    v_approved_count integer := 0;

    -- Notification tracking
    v_notif_result   jsonb;
    v_notifications  jsonb  := '[]'::jsonb;
    v_req_id         uuid;
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
    v_now   := now();
    PERFORM set_config('app.actor', v_actor, true);

    -- ── 3. Authority gate ─────────────────────────────────────────────────────
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
            'hint', 'Caller must hold a field-purchase approval role'
        );
    END IF;

    -- ── 4. Per-row validation loop (deterministic lock order) ─────────────────
    FOR v_rec IN
        SELECT id,
               site_code,
               status
          FROM field_purchase_request
         WHERE id = ANY(p_request_ids)
         ORDER BY id          -- deterministic order prevents deadlocks on concurrent batches
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

        -- 4b. State guard — only pending requests may be approved
        IF v_rec.status <> 'pending' THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'invalid_state',
                'request_id', v_rec.id,
                'current',    v_rec.status,
                'hint',       'Only pending requests can be bulk-approved'
            );
        END IF;

        v_ids_arr := v_ids_arr || v_rec.id;
    END LOOP;

    -- ── 5. Verify all submitted IDs were found ────────────────────────────────
    IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'request_not_found',
            'hint', 'One or more request_ids were not found or not accessible'
        );
    END IF;

    -- ── 6. Batch UPDATE ───────────────────────────────────────────────────────
    --    fn_fpr_audit_transition fires (status_changed rows).
    UPDATE field_purchase_request
       SET status      = 'approved'::field_purchase_status,
           approver    = v_actor,
           approved_at = v_now,
           updated_at  = v_now
     WHERE id = ANY(v_ids_arr);

    GET DIAGNOSTICS v_approved_count = ROW_COUNT;

    -- ── 7. Supplementary batch audit INSERT ───────────────────────────────────
    --    event_type='approved' + metadata.bulk=true (mirrors 0191/0192 pattern).
    INSERT INTO field_purchase_audit_log (
        request_id,
        actor,
        event_type,
        old_status,
        new_status,
        metadata
    )
    SELECT req_id,
           v_actor,
           'approved',
           'pending'::field_purchase_status,
           'approved'::field_purchase_status,
           jsonb_build_object(
               'approve_note', p_approve_note,
               'approver',     v_actor,
               'approved_at',  v_now,
               'bulk',         true
           )
      FROM unnest(v_ids_arr) AS t(req_id);

    -- ── 8. Per-request LINE approval notifications ────────────────────────────
    --    Re-uses the rpc_route_fpr_approval_notification infrastructure from
    --    0177: resolve approver LINE UID → HMAC sign → queue flex card push.
    --    Failures are non-fatal; results recorded in v_notifications array.
    FOREACH v_req_id IN ARRAY v_ids_arr
    LOOP
        BEGIN
            -- Call the 0177 routing RPC.  It resolves the project-level approver
            -- (or MD fallback), signs the HMAC token, and inserts into
            -- line_oa_outbound_messages with template tpl_fpr_approval_flex_card.
            SELECT rpc_route_fpr_approval_notification(v_req_id)
              INTO v_notif_result;

            v_notifications := v_notifications || jsonb_build_array(
                jsonb_build_object(
                    'request_id', v_req_id,
                    'ok',         COALESCE((v_notif_result ->> 'ok')::boolean, false),
                    'detail',     v_notif_result
                )
            );

        EXCEPTION WHEN OTHERS THEN
            -- Non-fatal: log failure but do not roll back the approval
            v_notifications := v_notifications || jsonb_build_array(
                jsonb_build_object(
                    'request_id', v_req_id,
                    'ok',         false,
                    'reason',     SQLERRM
                )
            );
        END;
    END LOOP;

    -- ── 9. Return success payload ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',             true,
        'approved_count', v_approved_count,
        'request_ids',    to_jsonb(v_ids_arr),
        'approved_by',    v_actor,
        'approve_note',   p_approve_note,
        'approved_at',    v_now,
        'notifications',  v_notifications
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions (unchanged)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION rpc_bulk_approve_field_purchase_request(uuid[], text)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_bulk_approve_field_purchase_request(uuid[], text)
    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION rpc_bulk_approve_field_purchase_request(uuid[], text) IS
'Atomically approves multiple pending field purchase requests in a single batch,
then sends per-request LINE approval notifications via rpc_route_fpr_approval_notification.

DML behaviour (same as 0192):
  Sets status = ''approved'', stamps approver = resolve_actor() and approved_at = now().
  Inserts supplementary audit row: event_type=''approved'', metadata.bulk=true,
  metadata.approver, metadata.approved_at, metadata.approve_note.
  fn_fpr_audit_transition also inserts status_changed rows on UPDATE.

LINE notification behaviour (added in 0193):
  After the batch UPDATE is committed, calls rpc_route_fpr_approval_notification()
  per approved request.  Each call resolves the project-level approver LINE UID
  (ADR-038 identity_binding), signs an HMAC token (ADR-031), and queues a
  tpl_fpr_approval_flex_card push into line_oa_outbound_messages.
  Notification failures are NON-FATAL: the approval is committed regardless.
  Per-request notification outcomes are returned in the ''notifications'' array.

Fail-all atomicity (DML): any site-access or state-guard failure inside the
validation loop triggers an immediate RETURN, causing an implicit ROLLBACK of all
preceding DML in this transaction.  No partial approvals are possible.

Authority: installation_team_lead | project_manager | managing_director | governance.
State guard: only ''pending'' requests may be bulk-approved.

Depends on: 0177 (rpc_route_fpr_approval_notification), 0192 (initial bulk approve).
Migration: 0193';

COMMIT;
