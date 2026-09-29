-- =============================================================================
-- Migration 0191 – rpc_bulk_reject_field_purchase_request
--
-- Atomically rejects multiple pending field purchase requests in a single
-- batch, setting status = 'rejected', recording the rejection_note, and
-- writing one supplementary audit entry per request with:
--
--   event_type = 'rejected'
--   metadata   = { rejection_note, bulk: true }
--
-- Note on audit rows:
--   fn_fpr_audit_transition fires AFTER UPDATE when OLD.status IS DISTINCT
--   FROM NEW.status, writing event_type = 'status_changed'.  The supplementary
--   INSERT below adds the richer 'rejected' event_type that downstream tooling
--   (dashboard, reports) keys off.  Both rows are committed atomically.
--
-- Atomicity contract (mirrors 0188 / 0189 / 0190):
--   • Any validation failure inside the per-row loop → immediate RETURN which
--     causes an implicit ROLLBACK of all preceding DML in this transaction.
--   • No partial rejections are possible.
--
-- Authority: installation_team_lead | project_manager | managing_director |
--            is_governance_role()
--
-- State guard: status must be 'pending'.  Any other status → 'invalid_state'.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_bulk_reject_field_purchase_request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_bulk_reject_field_purchase_request(
    p_request_ids    uuid[],
    p_rejection_note text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor         text;
    v_rec           RECORD;

    -- Accumulation array — filled during the validation lock loop
    v_ids_arr       uuid[] := '{}';

    -- Running count for the final payload
    v_rejected_count integer := 0;
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
    --    Mirrors 0185 (single escalate) / 0190 (bulk escalate).
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
            'hint', 'Caller must hold a field-purchase rejection role'
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

        -- 4b. State guard — only pending requests may be rejected
        IF v_rec.status <> 'pending' THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'invalid_state',
                'request_id', v_rec.id,
                'current',    v_rec.status,
                'hint',       'Only pending requests can be bulk-rejected'
            );
        END IF;

        -- Accumulate validated ID
        v_ids_arr := v_ids_arr || v_rec.id;
    END LOOP;

    -- ── 5. Verify all submitted IDs were found ────────────────────────────────
    --    Catches missing UUIDs and rows invisible due to RLS / site filter.
    IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'request_not_found',
            'hint', 'One or more request_ids were not found or not accessible'
        );
    END IF;

    -- ── 6. Batch UPDATE ───────────────────────────────────────────────────────
    --    Sets status = 'rejected' and records rejection_note.
    --    fn_fpr_audit_transition fires here (status_changed rows inserted by
    --    trigger); the supplementary batch INSERT in step 7 adds 'rejected'
    --    event rows with metadata.bulk = true.
    UPDATE field_purchase_request
       SET status         = 'rejected'::field_purchase_status,
           rejection_note = p_rejection_note,
           updated_at     = now()
     WHERE id = ANY(v_ids_arr);

    GET DIAGNOSTICS v_rejected_count = ROW_COUNT;

    -- ── 7. Supplementary batch INSERT audit entries ───────────────────────────
    --    fn_fpr_audit_transition has already inserted 'status_changed' rows.
    --    These supplementary rows carry event_type='rejected' + metadata.bulk=true
    --    so dashboard queries can key off the richer event type.
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
           'rejected',
           'pending'::field_purchase_status,
           'rejected'::field_purchase_status,
           jsonb_build_object(
               'rejection_note', p_rejection_note,
               'bulk',           true
           )
      FROM unnest(v_ids_arr) AS t(req_id);

    -- ── 8. Return success payload ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',             true,
        'rejected_count', v_rejected_count,
        'request_ids',    to_jsonb(v_ids_arr),
        'rejected_by',    v_actor,
        'rejection_note', p_rejection_note,
        'rejected_at',    now()
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION rpc_bulk_reject_field_purchase_request(uuid[], text)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_bulk_reject_field_purchase_request(uuid[], text)
    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION rpc_bulk_reject_field_purchase_request(uuid[], text) IS
'Atomically rejects multiple pending field purchase requests in a single batch.

Sets status = ''rejected'' and rejection_note on each request, then inserts a
supplementary audit row with event_type=''rejected'' and metadata.bulk=true.
(fn_fpr_audit_transition also inserts status_changed rows on UPDATE.)

Fail-all atomicity: any site-access or state-guard failure inside the validation
loop triggers an immediate RETURN, which causes an implicit ROLLBACK of all
preceding DML in this transaction.  No partial rejections are possible.

Authority: installation_team_lead | project_manager | managing_director | governance.
State guard: only ''pending'' requests may be bulk-rejected.

Mirror of 0188 (bulk_close), 0189 (bulk_reopen), 0190 (bulk_escalate).
Migration: 0191';

COMMIT;
