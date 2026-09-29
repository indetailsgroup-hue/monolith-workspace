-- =============================================================================
-- Migration 0200 – rpc_bulk_cancel_field_purchase_request
--
-- Atomically cancels multiple pending field purchase requests in a single
-- batch, setting status = 'cancelled', recording the cancel_reason, and
-- writing one supplementary audit entry per request with:
--
--   event_type = 'cancelled'
--   metadata   = { cancel_reason, bulk: true, self_cancel: false }
--
-- Note on audit rows:
--   fn_fpr_audit_transition fires AFTER UPDATE when OLD.status IS DISTINCT
--   FROM NEW.status, writing event_type = 'status_changed'.  The supplementary
--   INSERT below adds the richer 'cancelled' event_type that downstream tooling
--   (dashboard, reports) keys off.  Both rows are committed atomically.
--
--   self_cancel is always false in the bulk audit metadata — bulk cancel is a
--   managerial batch action.  Per-row self_cancel precision is handled by the
--   single rpc_cancel_field_purchase_request (migration 0199).
--
-- Atomicity contract (mirrors 0188 / 0189 / 0190 / 0191):
--   • Any validation failure inside the per-row loop → immediate RETURN which
--     causes an implicit ROLLBACK of all preceding DML in this transaction.
--   • No partial cancellations are possible.
--
-- Authority:
--   • project_manager | managing_director | is_governance_role()  — may cancel
--     any pending request at an accessible site.
--   • Any authenticated caller whose actor matches ALL requester fields in the
--     submitted batch (self-cancel) — allows a technician to cancel their own
--     pending requests in bulk.
--   • installation_team_lead is NOT in the authority gate (mirrors 0199).
--
-- State guard: status must be 'pending'.  Any other status → 'invalid_state'.
--
-- 'cancelled' ENUM value:
--   Added idempotently here in case migrations are applied out of order or
--   0199 is rolled back.  PostgreSQL ignores ADD VALUE IF NOT EXISTS when the
--   value already exists, so this is always safe to run.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure 'cancelled' exists in the status enum (idempotent, mirrors 0199)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    ALTER TYPE field_purchase_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'closed';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_bulk_cancel_field_purchase_request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_bulk_cancel_field_purchase_request(
    p_request_ids  uuid[],
    p_cancel_reason text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor           text;
    v_is_manager      boolean;
    v_all_self        boolean;
    v_rec             RECORD;

    -- Accumulation array — filled during the validation lock loop
    v_ids_arr         uuid[] := '{}';

    -- Running count for the final payload
    v_cancelled_count integer := 0;
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
    --    Two permitted paths:
    --      A) Actor holds PM / MD / governance role  → can cancel any pending
    --         request at an accessible site (site check enforced in loop).
    --      B) Actor is the requester of EVERY row in the batch (self-cancel)
    --         → allowed regardless of role; site check still enforced in loop.
    --
    --    installation_team_lead is NOT in the authority gate — mirrors 0199.
    v_is_manager := (
        has_any_app_role(ARRAY['project_manager', 'managing_director'])
        OR is_governance_role()
    );

    IF NOT v_is_manager THEN
        -- Self-cancel path: ALL submitted rows must belong to the calling actor.
        -- We read from field_purchase_request without locking here — a benign
        -- TOCTOU window; the state guard in the lock loop is the authoritative
        -- check.  If any row has a different requester the gate rejects early.
        SELECT bool_and(requester = v_actor)
          INTO v_all_self
          FROM field_purchase_request
         WHERE id = ANY(p_request_ids);

        IF v_all_self IS NULL OR NOT v_all_self THEN
            RETURN jsonb_build_object(
                'ok',   false,
                'code', 'insufficient_privilege',
                'hint', 'Caller must be the requester of all selected requests, or hold project_manager / managing_director / governance role'
            );
        END IF;
    END IF;

    -- ── 4. Per-row validation loop (deterministic lock order) ─────────────────
    FOR v_rec IN
        SELECT id,
               site_code,
               status,
               requester
          FROM field_purchase_request
         WHERE id = ANY(p_request_ids)
         ORDER BY id          -- deterministic order prevents deadlocks on concurrent batches
           FOR UPDATE
    LOOP
        -- 4a. Site access guard (applies to both manager and self-cancel paths)
        IF NOT has_site_access(v_rec.site_code) THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'site_access_denied',
                'request_id', v_rec.id,
                'site_code',  v_rec.site_code
            );
        END IF;

        -- 4b. State guard — only pending requests may be cancelled
        IF v_rec.status <> 'pending' THEN
            RETURN jsonb_build_object(
                'ok',         false,
                'code',       'invalid_state',
                'request_id', v_rec.id,
                'current',    v_rec.status,
                'hint',       'Only pending requests can be bulk-cancelled'
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
    --    Sets status = 'cancelled' and records cancel_reason.
    --    fn_fpr_audit_transition fires here (status_changed rows inserted by
    --    trigger); the supplementary batch INSERT in step 7 adds 'cancelled'
    --    event rows with metadata.bulk = true.
    UPDATE field_purchase_request
       SET status      = 'cancelled'::field_purchase_status,
           updated_at  = now()
     WHERE id = ANY(v_ids_arr);

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- ── 7. Supplementary batch INSERT audit entries ───────────────────────────
    --    fn_fpr_audit_transition has already inserted 'status_changed' rows.
    --    These supplementary rows carry event_type='cancelled' + metadata.bulk=true
    --    so dashboard queries can key off the richer event type.
    --    cancel_reason is stored in metadata (no dedicated column on the table).
    --    self_cancel is always false here — bulk cancel is a managerial action;
    --    per-row self_cancel precision belongs to rpc_cancel_field_purchase_request.
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
           'cancelled',
           'pending'::field_purchase_status,
           'cancelled'::field_purchase_status,
           jsonb_build_object(
               'cancel_reason', p_cancel_reason,
               'bulk',          true,
               'self_cancel',   false
           )
      FROM unnest(v_ids_arr) AS t(req_id);

    -- ── 8. Return success payload ─────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',              true,
        'cancelled_count', v_cancelled_count,
        'request_ids',     to_jsonb(v_ids_arr),
        'cancelled_by',    v_actor,
        'cancel_reason',   p_cancel_reason,
        'cancelled_at',    now()
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text)
    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text) IS
'Atomically cancels multiple pending field purchase requests in a single batch.

Sets status = ''cancelled'' on each request, then inserts a supplementary audit
row with event_type=''cancelled'', metadata.bulk=true, metadata.self_cancel=false,
and metadata.cancel_reason=p_cancel_reason.
(fn_fpr_audit_transition also inserts status_changed rows on UPDATE.)

Fail-all atomicity: any site-access or state-guard failure inside the validation
loop triggers an immediate RETURN, which causes an implicit ROLLBACK of all
preceding DML in this transaction.  No partial cancellations are possible.

Authority:
  • project_manager | managing_director | is_governance_role()  — can cancel any
    pending request at a site the caller can access.
  • Self-cancel path — if the caller is the requester of ALL rows in the batch,
    cancellation proceeds regardless of role (installation_team_lead included when
    acting as requester).

State guard: only ''pending'' requests may be cancelled.

Mirror of 0188 (bulk_close), 0189 (bulk_reopen), 0190 (bulk_escalate), 0191
(bulk_reject).  Authority differs: team_lead is excluded; self-cancel is added.
Migration: 0200';

COMMIT;
