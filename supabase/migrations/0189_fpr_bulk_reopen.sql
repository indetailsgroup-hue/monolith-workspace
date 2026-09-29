-- =============================================================================
-- Migration 0189: rpc_bulk_reopen_field_purchase_request
--
-- Atomically reopens multiple field_purchase_request rows (closed → purchased)
-- in a single batch.
--
-- Design decisions:
--   • Mirrors rpc_bulk_close_field_purchase_request (0188) exactly, with the
--     following inversions:
--       – State guard: every row must be in 'closed' state (not 'purchased').
--       – Batch UPDATE transitions status: 'closed' → 'purchased'.
--       – Supplementary audit event_type = 'reopened' (not 'closed').
--       – Parameter p_reopen_note replaces p_close_note.
--       – Return key 'reopened_count' replaces 'closed_count'.
--   • Fail-all atomicity: a single state-guard, site-access, or not-found
--     failure rolls back the ENTIRE batch — no partial commits.
--   • Per-row validation loop first (no mutations until all checks pass):
--       FOR UPDATE lock → site access → state guard (must be closed)
--   • Single batch UPDATE after validation loop passes.
--   • Single INSERT … SELECT for all supplementary 'reopened' audit entries
--     (metadata.bulk = true distinguishes them from single-reopen entries).
--   • SET LOCAL app.actor once at the top — fn_fpr_audit_transition uses it
--     for the trigger-generated 'status_changed' entries (one per row).
--   • Input guard: p_request_ids must be non-null and non-empty.
--   • Authority gate mirrors rpc_reopen_field_purchase_request (0187):
--     project_manager, managing_director, or governance only.
--
-- Patterns: SECURITY DEFINER, fail-closed, FOR UPDATE lock, SET LOCAL app.actor,
--           append-only audit, no client write path, idempotency via atomicity.
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0183 — rpc_close_field_purchase_request (introduces 'closed' status usage)
--   0187 — rpc_reopen_field_purchase_request (introduces authority gate pattern)
--   0188 — rpc_bulk_close_field_purchase_request (bulk pattern this mirrors)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rpc_bulk_reopen_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_bulk_reopen_field_purchase_request(
  p_request_ids  uuid[],
  p_reopen_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  text;
  v_now    timestamptz := now();
  v_rid    uuid;
  v_row    public.field_purchase_request%ROWTYPE;
  v_count  int  := 0;
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
  -- 2. Input guard: must supply at least one ID
  -- ------------------------------------------------------------------
  IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_argument'
      USING HINT = 'p_request_ids must contain at least one UUID';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Authority gate: project_manager, managing_director, or governance
  --    (mirrors rpc_reopen_field_purchase_request — 0187)
  -- ------------------------------------------------------------------
  IF NOT (
    public.is_governance_role()
    OR public.has_any_app_role(ARRAY['project_manager', 'managing_director'])
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'requires project_manager or managing_director role';
  END IF;

  -- ------------------------------------------------------------------
  -- 4. SET LOCAL app.actor so fn_fpr_audit_transition writes the correct
  --    actor on the trigger-generated 'status_changed' entries.
  -- ------------------------------------------------------------------
  PERFORM set_config('app.actor', v_actor, true);

  -- ------------------------------------------------------------------
  -- 5. Per-row validation loop — FOR UPDATE + site access + state guard.
  --
  --    All rows are locked and validated before any mutation.
  --    A single failure raises an exception and rolls back the transaction,
  --    guaranteeing fail-all atomicity.
  -- ------------------------------------------------------------------
  FOREACH v_rid IN ARRAY p_request_ids
  LOOP
    -- Lock the row to prevent concurrent state changes
    SELECT * INTO v_row
      FROM public.field_purchase_request
     WHERE id = v_rid
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found'
        USING HINT = format(
          'field_purchase_request %s not found', v_rid
        );
    END IF;

    -- Site access check (governance bypasses)
    IF NOT (
      public.is_governance_role()
      OR public.has_site_access(v_row.site_code)
    ) THEN
      RAISE EXCEPTION 'insufficient_privilege'
        USING HINT = format(
          'no access to site %s (request %s)', v_row.site_code, v_rid
        );
    END IF;

    -- State guard: every row must be in closed state
    IF v_row.status <> 'closed' THEN
      RAISE EXCEPTION 'invalid_state'
        USING HINT = format(
          'request %s expected status=closed, actual=%s',
          v_rid, v_row.status::text
        );
    END IF;
  END LOOP;

  -- ------------------------------------------------------------------
  -- 6. Batch UPDATE — transition all validated rows to purchased.
  --    fn_fpr_audit_transition fires once per row (AFTER UPDATE FOR EACH ROW)
  --    and writes a 'status_changed' entry for each.
  -- ------------------------------------------------------------------
  UPDATE public.field_purchase_request
     SET status     = 'purchased',
         updated_at = v_now
   WHERE id = ANY(p_request_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ------------------------------------------------------------------
  -- 7. Batch INSERT — one supplementary 'reopened' audit entry per request.
  --    metadata.bulk = true distinguishes bulk entries from single-reopen
  --    entries for reporting and audit filtering.
  -- ------------------------------------------------------------------
  INSERT INTO public.field_purchase_audit_log (
    request_id,
    actor,
    event_type,
    old_status,
    new_status,
    metadata
  )
  SELECT
    fpr.id,
    v_actor,
    'reopened',
    'closed'::public.field_purchase_status,
    'purchased'::public.field_purchase_status,
    jsonb_build_object(
      'reopen_note', p_reopen_note,
      'reopened_at', v_now,
      'site_code',   fpr.site_code,
      'amount',      fpr.amount,
      'bulk',        true
    )
  FROM public.field_purchase_request fpr
  WHERE fpr.id = ANY(p_request_ids);

  -- ------------------------------------------------------------------
  -- 8. Return summary payload
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'ok',             true,
    'reopened_count', v_count,
    'request_ids',    p_request_ids,
    'reopened_by',    v_actor,
    'reopen_note',    p_reopen_note,
    'reopened_at',    v_now
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_bulk_reopen_field_purchase_request(uuid[], text)
  FROM PUBLIC, anon;
GRANT  EXECUTE
    ON FUNCTION public.rpc_bulk_reopen_field_purchase_request(uuid[], text)
    TO authenticated;

COMMENT ON FUNCTION public.rpc_bulk_reopen_field_purchase_request(uuid[], text) IS
  'Atomically reopens multiple field_purchase_request rows (closed → purchased) in one batch. '
  'A single state-guard, site-access, or not-found failure rolls back the entire batch. '
  'Authority: project_manager, managing_director, or governance role. '
  'Writes one supplementary audit entry per row (event_type=reopened, metadata.bulk=true) '
  'in addition to the trigger-generated status_changed entries. '
  'Migration 0189.';

COMMIT;
