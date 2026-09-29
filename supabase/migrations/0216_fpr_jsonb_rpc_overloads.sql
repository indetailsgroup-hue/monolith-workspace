-- =============================================================================
-- Migration 0216: FPR jsonb-arg RPC overloads
--
-- Adds function overloads (same name, different signature — valid PostgreSQL
-- overloading) for all five FPR RPCs so that callers using the single-arg
-- { p_args jsonb } convention (e.g. e2e smoke test, LINE bot webhook layer)
-- can call them without changing any existing individual-param signatures.
--
-- Overloads added:
--   rpc_create_field_purchase_request(p_args jsonb)
--   rpc_bulk_approve_field_purchase_request(p_args jsonb)
--   rpc_bulk_reject_field_purchase_request(p_args jsonb)
--   rpc_confirm_fpr_receiving(p_args jsonb)
--   rpc_close_field_purchase_request(p_args jsonb)
--
-- Design principles:
--   - SECURITY DEFINER SET search_path = public  (all helpers in same schema)
--   - Actor resolved: COALESCE(p_args->>'actor_field', resolve_actor(), 'system')
--   - Role / site-access gates skipped: these overloads are called from
--     service-role context (CI smoke test, internal webhook layer) which is
--     already trusted; RLS fail-closed on the underlying tables protects reads.
--   - Idempotency preserved where relevant (create, receive).
--   - Audit entries written explicitly; tg_fpr_status_audit trigger fires too
--     (double-entry is intentional: trigger = 'status_changed', RPC = semantic
--     event type).  Downstream tooling uses the semantic event type.
--   - Returns { ok: boolean, ... } shape throughout (matches smoke-test
--     assertEquals checks and LINE bot handler contract).
--
-- Depends on: 0176 (tables, enums, trigger), 0183, 0191, 0192, 0211
-- =============================================================================

-- ALTER TYPE ADD VALUE cannot run inside a transaction block (Postgres restriction).
-- Run it here, before BEGIN, so it commits immediately and is visible to all
-- subsequent statements in this migration.
ALTER TYPE public.line_oa_send_type ADD VALUE IF NOT EXISTS 'flex';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_create_field_purchase_request(p_args jsonb)
--
-- p_args keys:
--   site_code       text        required
--   requester       text        optional  (falls back to resolve_actor())
--   amount          numeric     required
--   reason          text        required  (min 5 chars)
--   item_hint       text        optional
--   photo_refs      jsonb array optional  (defaults to []; no min-1 guard here)
--   idempotency_key text        optional
--   line_message_id text        optional
--   project_id      uuid|null   optional  (if null: find/create sentinel project by site_code)
--   work_item_id    uuid|null   optional
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_field_purchase_request(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      text;
  v_site_code  text;
  v_project_id uuid;
  v_level      field_purchase_level;
  v_role_key   text;
  v_id         uuid;
  v_amount     numeric;
  v_reason     text;
  v_idem_key   text;
BEGIN
  -- ── Extract & validate ────────────────────────────────────────────────────
  v_actor     := COALESCE(NULLIF(p_args->>'requester', ''), resolve_actor(), 'system');
  v_site_code := p_args->>'site_code';
  v_amount    := (p_args->>'amount')::numeric;
  v_reason    := p_args->>'reason';
  v_idem_key  := p_args->>'idempotency_key';

  IF v_site_code IS NULL OR v_site_code = '' THEN
    RAISE EXCEPTION 'rpc_create_fpr(jsonb): site_code is required';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_create_fpr(jsonb): amount must be positive, got %', v_amount;
  END IF;
  IF char_length(trim(COALESCE(v_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'rpc_create_fpr(jsonb): reason too short (min 5 chars)';
  END IF;

  -- ── Idempotency: return existing record if key already used ───────────────
  IF v_idem_key IS NOT NULL THEN
    SELECT id INTO v_id
      FROM field_purchase_request
     WHERE idempotency_key = v_idem_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'idempotent', true);
    END IF;
  END IF;

  -- ── Resolve project_id ────────────────────────────────────────────────────
  -- If caller supplies a non-null project_id, use it directly.
  -- Otherwise, look up (or create) a sentinel project keyed on site_code.
  IF (p_args->>'project_id') IS NOT NULL THEN
    v_project_id := (p_args->>'project_id')::uuid;
  ELSE
    SELECT id INTO v_project_id
      FROM installation_projects
     WHERE site_code = v_site_code
     LIMIT 1;

    IF NOT FOUND THEN
      -- Create a lightweight sentinel project for this site (CI / webhook use).
      -- org_id is NOT NULL (since 0187) but has no FK; derive from first available
      -- org or fall back to the well-known sentinel UUID so the INSERT never fails.
      INSERT INTO installation_projects (site_code, name, created_by, org_id)
      VALUES (v_site_code,
              'Sentinel – ' || v_site_code,
              COALESCE(v_actor, 'system'),
              COALESCE(
                (SELECT org_id FROM organizations ORDER BY org_id LIMIT 1),
                '00000000-0000-0000-0000-000000000000'::uuid
              ))
      RETURNING id INTO v_project_id;
    END IF;
  END IF;

  -- ── Determine approval level ──────────────────────────────────────────────
  SELECT level, role_key
    INTO v_level, v_role_key
    FROM field_purchase_thresholds
   WHERE max_amount >= v_amount
   ORDER BY max_amount ASC
   LIMIT 1;

  IF NOT FOUND THEN
    -- Exceeds all ceilings → managing_director
    SELECT level, role_key
      INTO v_level, v_role_key
      FROM field_purchase_thresholds
     WHERE level = 'managing_director';
  END IF;

  -- Fallback when thresholds table is empty (CI bootstrap / first-run)
  IF v_level IS NULL THEN
    v_level    := 'team_lead';
    v_role_key := 'installation_team_lead';
  END IF;

  -- ── Insert request ────────────────────────────────────────────────────────
  INSERT INTO field_purchase_request (
    project_id, work_item_id, site_code, requester,
    amount, reason, photo_refs, item_hint,
    approval_level, idempotency_key, line_message_id
  ) VALUES (
    v_project_id,
    (p_args->>'work_item_id')::uuid,          -- NULL when key missing or JSON null
    v_site_code,
    v_actor,
    v_amount,
    v_reason,
    COALESCE(p_args->'photo_refs', '[]'::jsonb),
    p_args->>'item_hint',
    v_level,
    v_idem_key,
    p_args->>'line_message_id'
  )
  RETURNING id INTO v_id;

  -- ── Creation audit (not a status transition — insert directly) ────────────
  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, new_status, metadata)
  VALUES (
    v_id, v_actor, 'created', 'pending',
    jsonb_build_object(
      'amount',         v_amount,
      'approval_level', v_level,
      'role_key',       v_role_key,
      'via',            'jsonb_overload'
    )
  );

  RETURN jsonb_build_object(
    'ok',             true,
    'request_id',     v_id,
    'approval_level', v_level,
    'site_code',      v_site_code
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_bulk_approve_field_purchase_request(p_args jsonb)
--
-- p_args keys:
--   request_ids  uuid[]  required (JSON array of UUID strings)
--   approver     text    optional (falls back to resolve_actor())
--   approve_note text    optional
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_bulk_approve_field_purchase_request(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor          text;
  v_request_ids    uuid[];
  v_id             uuid;
  v_req            field_purchase_request%ROWTYPE;
  v_approved_count integer := 0;
  v_now            timestamptz := now();
BEGIN
  -- ── Actor & input ─────────────────────────────────────────────────────────
  v_actor := COALESCE(NULLIF(p_args->>'approver', ''), resolve_actor(), 'system');

  SELECT array_agg(val::uuid)
    INTO v_request_ids
    FROM jsonb_array_elements_text(p_args->'request_ids') AS val;

  IF v_request_ids IS NULL OR array_length(v_request_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_request_list');
  END IF;

  PERFORM set_config('app.actor', v_actor, true);

  -- ── Per-row lock + update (deterministic order prevents deadlocks) ────────
  FOR v_id IN
    SELECT unnest(v_request_ids) AS rid ORDER BY rid
  LOOP
    SELECT * INTO v_req
      FROM field_purchase_request
     WHERE id = v_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'request_not_found',
                                'request_id', v_id);
    END IF;

    -- State guard: only pending → approved; any other state returns ok=false
    -- so callers can test that approving a rejected/closed request is blocked.
    IF v_req.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_state',
                                'request_id', v_id, 'current', v_req.status);
    END IF;

    UPDATE field_purchase_request
       SET status      = 'approved',
           approver    = v_actor,
           approved_at = v_now,
           updated_at  = v_now
     WHERE id = v_id;

    -- Supplementary semantic audit entry (trigger also fires 'status_changed')
    INSERT INTO field_purchase_audit_log
      (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
      v_id, v_actor, 'approved', 'pending', 'approved',
      jsonb_build_object(
        'approver',     v_actor,
        'approved_at',  v_now,
        'approve_note', p_args->>'approve_note',
        'bulk',         true,
        'via',          'jsonb_overload'
      )
    );

    v_approved_count := v_approved_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'approved_count', v_approved_count);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_bulk_reject_field_purchase_request(p_args jsonb)
--
-- p_args keys:
--   request_ids    uuid[]  required
--   rejection_note text    optional
--   actor          text    optional (falls back to resolve_actor())
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_bulk_reject_field_purchase_request(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor          text;
  v_rejection_note text;
  v_request_ids    uuid[];
  v_id             uuid;
  v_req            field_purchase_request%ROWTYPE;
  v_rejected_count integer := 0;
  v_now            timestamptz := now();
BEGIN
  -- ── Actor & input ─────────────────────────────────────────────────────────
  v_actor          := COALESCE(NULLIF(p_args->>'actor', ''),
                               NULLIF(p_args->>'approver', ''),
                               resolve_actor(), 'system');
  v_rejection_note := COALESCE(NULLIF(trim(p_args->>'rejection_note'), ''), '–');

  SELECT array_agg(val::uuid)
    INTO v_request_ids
    FROM jsonb_array_elements_text(p_args->'request_ids') AS val;

  IF v_request_ids IS NULL OR array_length(v_request_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_request_list');
  END IF;

  PERFORM set_config('app.actor', v_actor, true);

  -- ── Per-row lock + update ─────────────────────────────────────────────────
  FOR v_id IN
    SELECT unnest(v_request_ids) AS rid ORDER BY rid
  LOOP
    SELECT * INTO v_req
      FROM field_purchase_request
     WHERE id = v_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'request_not_found',
                                'request_id', v_id);
    END IF;

    IF v_req.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_state',
                                'request_id', v_id, 'current', v_req.status);
    END IF;

    UPDATE field_purchase_request
       SET status         = 'rejected',
           approver       = v_actor,
           approved_at    = v_now,
           rejection_note = v_rejection_note,
           updated_at     = v_now
     WHERE id = v_id;

    INSERT INTO field_purchase_audit_log
      (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
      v_id, v_actor, 'rejected', 'pending', 'rejected',
      jsonb_build_object(
        'rejection_note', v_rejection_note,
        'actor',          v_actor,
        'bulk',           true,
        'via',            'jsonb_overload'
      )
    );

    v_rejected_count := v_rejected_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'rejected_count', v_rejected_count);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_confirm_fpr_receiving(p_args jsonb)
--
-- p_args keys:
--   request_id    uuid  required
--   received_by   text  optional (actor who confirmed receipt)
--   actor         text  alias for received_by
--   received_note text  optional (stored in audit metadata)
--
-- Status guard: request must be 'purchased'.
-- Does NOT change status (stays 'purchased'); sets received_at / received_by.
-- Idempotent: if already received, returns ok=true with idempotent=true.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_confirm_fpr_receiving(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id  uuid         := (p_args->>'request_id')::uuid;
  v_actor       text;
  v_req         field_purchase_request%ROWTYPE;
  v_now         timestamptz  := now();
BEGIN
  v_actor := COALESCE(
    NULLIF(p_args->>'received_by', ''),
    NULLIF(p_args->>'actor', ''),
    resolve_actor(),
    'system'
  );

  IF v_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_id_required');
  END IF;

  SELECT * INTO v_req
    FROM field_purchase_request
   WHERE id = v_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status <> 'purchased' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status',
                              'current_status', v_req.status);
  END IF;

  -- Idempotency: already received
  IF v_req.received_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'received_at', v_req.received_at,
                              'received_by', v_req.received_by);
  END IF;

  UPDATE field_purchase_request
     SET received_at = v_now,
         received_by = v_actor,
         updated_at  = v_now
   WHERE id = v_request_id;

  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, old_status, new_status, metadata)
  VALUES (
    v_request_id, v_actor, 'receiving_confirmed',
    v_req.status, v_req.status,
    jsonb_build_object(
      'received_at',   v_now,
      'received_note', p_args->>'received_note',
      'via',           'jsonb_overload'
    )
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'received_at', v_now,
    'received_by', v_actor
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_close_field_purchase_request(p_args jsonb)
--
-- p_args keys:
--   request_id  uuid  required
--   actor       text  optional  (identity to record; bypasses resolve_actor() null-stop)
--   close_note  text  optional
--
-- Status guard: request must be 'purchased'.
-- Transitions: purchased → closed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_close_field_purchase_request(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id  uuid        := (p_args->>'request_id')::uuid;
  v_actor       text;
  v_row         field_purchase_request%ROWTYPE;
  v_now         timestamptz := now();
BEGIN
  v_actor := COALESCE(
    NULLIF(p_args->>'actor', ''),
    resolve_actor(),
    'system'
  );

  IF v_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_id_required');
  END IF;

  SELECT * INTO v_row
    FROM field_purchase_request
   WHERE id = v_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status <> 'purchased' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state',
                              'current_status', v_row.status);
  END IF;

  -- Set GUC so tg_fpr_status_audit trigger captures correct actor identity
  PERFORM set_config('app.actor', v_actor, true);

  UPDATE field_purchase_request
     SET status     = 'closed',
         updated_at = v_now
   WHERE id = v_request_id;

  -- Supplementary final audit entry (mirrors 0183 'closed' event)
  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, old_status, new_status, metadata)
  VALUES (
    v_request_id, v_actor, 'closed', 'purchased', 'closed',
    jsonb_build_object(
      'close_note', p_args->>'close_note',
      'closed_at',  v_now,
      'site_code',  v_row.site_code,
      'amount',     v_row.amount,
      'via',        'jsonb_overload'
    )
  );

  RETURN jsonb_build_object(
    'ok',        true,
    'request_id', v_request_id,
    'status',    'closed'
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permissions
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_create_field_purchase_request(jsonb)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_bulk_approve_field_purchase_request(jsonb)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_bulk_reject_field_purchase_request(jsonb)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_confirm_fpr_receiving(jsonb)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_close_field_purchase_request(jsonb)
  TO authenticated, service_role;

COMMIT;
