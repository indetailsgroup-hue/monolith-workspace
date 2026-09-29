-- =============================================================================
-- Migration 0209: rpc_create_field_purchase_request — photo_refs guard
--
-- Adds three safety guards at the top of the existing validation block:
--   1. Max 10 photo refs per request  → RAISE EXCEPTION 'too_many_photo_refs'
--   2. Each element must be a non-empty string → RAISE EXCEPTION 'invalid_photo_ref'
--   3. Each URI must not exceed 2048 chars     → RAISE EXCEPTION 'invalid_photo_ref'
--
-- All other logic (idempotency, site lookup, threshold routing, audit) is
-- identical to the 0176 version — this is a drop-in replacement.
--
-- Prerequisite migrations: 0176 (creates rpc_create_field_purchase_request).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_field_purchase_request(
  p_project_id       uuid,
  p_amount           numeric,
  p_reason           text,
  p_photo_refs       jsonb,
  p_work_item_id     uuid    DEFAULT NULL,
  p_item_hint        text    DEFAULT NULL,
  p_line_message_id  text    DEFAULT NULL,
  p_idempotency_key  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      text;
  v_site_code  text;
  v_level      public.field_purchase_level;
  v_role_key   text;
  v_id         uuid;
  v_ref_elem   jsonb;
  v_ref_uri    text;
  v_ref_idx    int4;
BEGIN
  v_actor := public.resolve_actor();

  -- ------------------------------------------------------------------
  -- Input validation (existing checks)
  -- ------------------------------------------------------------------
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_create_fpr: amount must be positive, got %', p_amount;
  END IF;

  IF p_photo_refs IS NULL OR jsonb_array_length(p_photo_refs) = 0 THEN
    RAISE EXCEPTION 'rpc_create_fpr: at least one photo_ref is required';
  END IF;

  -- ------------------------------------------------------------------
  -- 0209 PHOTO REF GUARDS — inserted after the "at least one" check
  -- ------------------------------------------------------------------

  -- Guard 1: max 10 refs
  IF jsonb_array_length(p_photo_refs) > 10 THEN
    RAISE EXCEPTION 'too_many_photo_refs'
      USING HINT = format(
        'at most 10 photo_refs allowed, got %s', jsonb_array_length(p_photo_refs)
      );
  END IF;

  -- Guard 2 & 3: each element must be a non-empty string ≤ 2048 chars
  FOR v_ref_idx IN 0 .. jsonb_array_length(p_photo_refs) - 1 LOOP
    v_ref_elem := p_photo_refs -> v_ref_idx;

    -- Must be a JSON string (not null, object, array, or number)
    IF jsonb_typeof(v_ref_elem) <> 'string' THEN
      RAISE EXCEPTION 'invalid_photo_ref'
        USING HINT = format(
          'photo_refs[%s] must be a string, got %s', v_ref_idx, jsonb_typeof(v_ref_elem)
        );
    END IF;

    v_ref_uri := v_ref_elem #>> '{}';  -- extract text value from JSON string node

    -- Must not be empty
    IF length(trim(v_ref_uri)) = 0 THEN
      RAISE EXCEPTION 'invalid_photo_ref'
        USING HINT = format('photo_refs[%s] must not be empty', v_ref_idx);
    END IF;

    -- Must not exceed 2048 chars
    IF length(v_ref_uri) > 2048 THEN
      RAISE EXCEPTION 'invalid_photo_ref'
        USING HINT = format(
          'photo_refs[%s] URI exceeds 2048 chars (got %s)', v_ref_idx, length(v_ref_uri)
        );
    END IF;
  END LOOP;

  -- ------------------------------------------------------------------
  -- Existing validation (continued)
  -- ------------------------------------------------------------------
  IF char_length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'rpc_create_fpr: reason too short (min 5 chars)';
  END IF;

  -- Idempotency: return existing record if key already used
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.field_purchase_request
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'request_id', v_id,
        'created',    false,
        'duplicate',  true
      );
    END IF;
  END IF;

  -- Derive site_code from project (authoritative source)
  SELECT site_code INTO v_site_code
    FROM public.installation_projects
   WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_fpr: project % not found', p_project_id;
  END IF;

  -- Determine approval level: lowest ceiling that covers the amount
  SELECT level, role_key INTO v_level, v_role_key
    FROM public.field_purchase_thresholds
   WHERE max_amount >= p_amount
   ORDER BY max_amount ASC
   LIMIT 1;

  -- No ceiling found → exceeds all thresholds → managing_director required
  IF NOT FOUND THEN
    SELECT level, role_key INTO v_level, v_role_key
      FROM public.field_purchase_thresholds
     WHERE level = 'managing_director';
  END IF;

  -- Insert request
  INSERT INTO public.field_purchase_request (
    project_id, work_item_id, site_code, requester,
    amount, reason, photo_refs, item_hint,
    approval_level, idempotency_key, line_message_id
  ) VALUES (
    p_project_id, p_work_item_id, v_site_code, v_actor,
    p_amount, p_reason, p_photo_refs, p_item_hint,
    v_level, p_idempotency_key, p_line_message_id
  )
  RETURNING id INTO v_id;

  -- Creation audit event (not a status transition; insert directly)
  INSERT INTO public.field_purchase_audit_log
    (request_id, actor, event_type, new_status, metadata)
  VALUES (
    v_id, v_actor, 'created', 'pending',
    jsonb_build_object(
      'amount',         p_amount,
      'project_id',     p_project_id,
      'approval_level', v_level,
      'role_key',       v_role_key
    )
  );

  RETURN jsonb_build_object(
    'request_id',     v_id,
    'approval_level', v_level,
    'role_key',       v_role_key,
    'site_code',      v_site_code,
    'created',        true,
    'duplicate',      false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions (unchanged from 0176)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_create_field_purchase_request(
  uuid, numeric, text, jsonb, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_field_purchase_request(
  uuid, numeric, text, jsonb, uuid, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_field_purchase_request(
  uuid, numeric, text, jsonb, uuid, text, text, text
) IS
  'Creates a new field_purchase_request. '
  '0209 hardening: rejects > 10 photo_refs (too_many_photo_refs), '
  'rejects non-string or empty ref elements (invalid_photo_ref), '
  'rejects ref URIs > 2048 chars (invalid_photo_ref). '
  'All other logic identical to 0176. Migration 0209.';

COMMIT;
