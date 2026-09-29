-- =============================================================================
-- Migration 0204: rpc_bulk_uncancel_field_purchase_request (with notifications)
--
-- Supersedes migration 0203 by extending rpc_bulk_uncancel_field_purchase_request
-- with per-request LINE push notifications to the requester's LINE account.
--
-- Changes from 0203:
--   1. Seeds the `tpl_fpr_uncancelled_flex_card` message template (indigo
--      header #6366F1) into line_oa_message_templates.
--   2. Adds a FOREACH notification loop (after the batch UPDATE) that:
--        a. Looks up the requester's LINE UID via identity_binding.
--        b. Inserts a push notification into line_oa_outbound_messages.
--        c. Appends a per-request result to the v_notifications array.
--        d. Catches all exceptions non-fatally so a missing LINE binding
--           never rolls back an otherwise successful uncancel.
--   3. Adds a `notifications` array to the return payload.
--
-- Notification template:
--   template_key      : tpl_fpr_uncancelled_flex_card
--   vertical_context  : field_purchase
--   message_kind      : flex
--   header colour     : #6366F1 (indigo — distinct from cancelled orange #F97316)
--   slot_values       : request_id, request_id_short, amount, site_code,
--                       reason, uncancelled_by, uncancel_note, uncancelled_at_th
--
-- Notification target: REQUESTER (same pattern as 0201 bulk-cancel notifications)
--
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0177 — line_oa_message_templates, line_oa_outbound_messages, identity_binding
--   0191 — canonical bulk pattern (0203/0204 mirror it exactly)
--   0199 — rpc_cancel_field_purchase_request
--   0201 — rpc_bulk_cancel_field_purchase_request with notifications (pattern source)
--   0202 — rpc_uncancel_field_purchase_request (single-row reference)
--   0203 — rpc_bulk_uncancel_field_purchase_request (base, replaced here)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Seed the tpl_fpr_uncancelled_flex_card template
--    Indigo header (#6366F1) distinguishes uncancelled from:
--      • cancelled (orange #F97316 — 0201)
--      • approved  (green  #2ECC71 — 0194)
--    INSERT ON CONFLICT DO UPDATE makes this migration idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.line_oa_message_templates (
  template_key,
  vertical_context,
  message_kind,
  body,
  flex_payload,
  is_active,
  org_id
)
VALUES (
  'tpl_fpr_uncancelled_flex_card',
  'field_purchase',
  'flex',
  'คำขอจัดซื้อ #{{request_id_short}} ถูกคืนสถานะแล้ว',
  jsonb_build_object(
    'type', 'bubble',
    'header', jsonb_build_object(
      'type',     'box',
      'layout',   'vertical',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type',  'text',
          'text',  '↩ คืนสถานะคำขอจัดซื้อ',
          'color', '#FFFFFF',
          'weight','bold',
          'size',  'md'
        )
      ),
      'backgroundColor', '#6366F1'
    ),
    'body', jsonb_build_object(
      'type',   'box',
      'layout', 'vertical',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type',  'text',
          'text',  'Request ID',
          'color', '#6B7280',
          'size',  'xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '#{{request_id_short}}',
          'weight','bold',
          'size',  'sm',
          'margin','xs'
        ),
        jsonb_build_object(
          'type',   'separator',
          'margin', 'md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'ไซต์งาน',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{site_code}}',
          'weight','bold',
          'size',  'sm',
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'ยอดเงิน',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '฿{{amount}}',
          'weight','bold',
          'color', '#6366F1',
          'size',  'sm',
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'หมายเหตุ',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{uncancel_note}}',
          'size',  'sm',
          'wrap',  true,
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'คืนสถานะโดย',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{uncancelled_by}}',
          'size',  'sm',
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'เวลา',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{uncancelled_at_th}}',
          'size',  'sm',
          'color', '#6B7280',
          'margin','xs'
        )
      )
    ),
    'footer', jsonb_build_object(
      'type',   'box',
      'layout', 'vertical',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type',   'text',
          'text',   'คำขอได้ถูกคืนสถานะกลับสู่ระบบแล้ว',
          'color',  '#6B7280',
          'size',   'xs',
          'align',  'center',
          'wrap',   true
        )
      )
    )
  ),
  true,
  '00000000-0000-0000-0000-000000000000'   -- sentinel: shared platform template
)
ON CONFLICT (template_key, vertical_context)
DO UPDATE SET
  body         = EXCLUDED.body,
  flex_payload = EXCLUDED.flex_payload,
  message_kind = EXCLUDED.message_kind,
  is_active    = EXCLUDED.is_active;

-- Verify seed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.line_oa_message_templates
     WHERE template_key     = 'tpl_fpr_uncancelled_flex_card'
       AND vertical_context = 'field_purchase'
       AND is_active        = true
  ) THEN
    RAISE EXCEPTION 'seed verify failed: tpl_fpr_uncancelled_flex_card not found or inactive';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. CREATE OR REPLACE rpc_bulk_uncancel_field_purchase_request
--    This replaces the 0203 stub with the full notification-enabled version.
-- ---------------------------------------------------------------------------

-- Idempotent ALTER TYPE guard: ensure 'cancelled' exists in field_purchase_status.
-- (It was introduced in 0199; this guard is defensive for replay safety.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'field_purchase_status'
       AND e.enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE public.field_purchase_status ADD VALUE IF NOT EXISTS 'cancelled';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_uncancel_field_purchase_request(
  p_request_ids   uuid[],
  p_uncancel_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor              text;
  v_now                timestamptz := now();
  v_ids_arr            uuid[]      := '{}';
  v_rec                public.field_purchase_request%ROWTYPE;
  v_uncancelled_count  int;

  -- Notification loop variables
  v_req_id             uuid;
  v_req                public.field_purchase_request%ROWTYPE;
  v_requester_uid      text;
  v_uncancelled_at_th  text;
  v_notifications      jsonb[] := '{}';
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
    -- 5a. Site access check
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

    -- 5b. State guard: must be 'cancelled' to uncancel
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

    v_ids_arr := v_ids_arr || v_rec.id;
  END LOOP;

  -- ── 6. Not-found guard ─────────────────────────────────────────────────────
  IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'request_not_found',
      'hint', 'one or more request_ids were not found in field_purchase_request'
    );
  END IF;

  -- ── 7. Batch UPDATE: cancelled → pending ───────────────────────────────────
  UPDATE public.field_purchase_request
     SET status         = 'pending'::field_purchase_status,
         approver       = NULL,
         approved_at    = NULL,
         rejection_note = NULL,
         updated_at     = v_now
   WHERE id = ANY(v_ids_arr);

  GET DIAGNOSTICS v_uncancelled_count = ROW_COUNT;

  -- ── 8. Supplementary batch audit INSERT ───────────────────────────────────
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
           'uncancel_note',  p_uncancel_note,
           'bulk',           true,
           'uncancelled_at', v_now
         )
    FROM unnest(v_ids_arr) AS t(req_id);

  -- ── 9. Per-request LINE push notifications ────────────────────────────────
  --    Mirrors 0201 (bulk-cancel-with-notifications) exactly.
  --    Non-fatal: a missing LINE binding or insert error never rolls back
  --    the successful status transitions above.

  v_uncancelled_at_th := to_char(
    timezone('Asia/Bangkok', v_now),
    'DD Mon YYYY HH24:MI'
  );

  FOREACH v_req_id IN ARRAY v_ids_arr
  LOOP
    BEGIN
      -- Re-read the row (now pending) to get requester, amount, site_code, reason
      SELECT * INTO v_req
        FROM public.field_purchase_request
       WHERE id = v_req_id;

      -- Resolve requester's LINE UID via identity_binding
      SELECT ib.line_user_id INTO v_requester_uid
        FROM public.identity_binding ib
       WHERE ib.employee_id = v_req.requester
         AND ib.is_active
       LIMIT 1;

      IF v_requester_uid IS NULL THEN
        RAISE EXCEPTION 'no active LINE binding for requester %', v_req.requester;
      END IF;

      -- Insert push notification row
      INSERT INTO public.line_oa_outbound_messages (
        send_type,
        status,
        template_key,
        slot_values,
        target_type,
        target_id
      ) VALUES (
        'push',
        'pending',
        'tpl_fpr_uncancelled_flex_card',
        jsonb_build_object(
          'request_id',       v_req_id::text,
          'request_id_short', left(v_req_id::text, 8),
          'amount',           v_req.amount::text,
          'site_code',        v_req.site_code,
          'reason',           v_req.reason,
          'uncancelled_by',   v_actor,
          'uncancel_note',    coalesce(p_uncancel_note, '—'),
          'uncancelled_at_th', v_uncancelled_at_th
        ),
        'user',
        v_requester_uid
      );

      -- Accumulate success entry
      v_notifications := v_notifications || jsonb_build_array(
        jsonb_build_object(
          'request_id',    v_req_id,
          'ok',            true,
          'target_uid',    v_requester_uid
        )
      );

    EXCEPTION WHEN OTHERS THEN
      -- Non-fatal: record failure without rolling back the status update
      v_notifications := v_notifications || jsonb_build_array(
        jsonb_build_object(
          'request_id', v_req_id,
          'ok',         false,
          'reason',     SQLERRM
        )
      );
    END;
  END LOOP;

  -- ── 10. Return success payload ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                true,
    'uncancelled_count', v_uncancelled_count,
    'request_ids',       to_jsonb(v_ids_arr),
    'uncancelled_by',    v_actor,
    'uncancel_note',     p_uncancel_note,
    'uncancelled_at',    v_now,
    'notifications',     to_jsonb(v_notifications)
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
'Atomically uncancels multiple cancelled field purchase requests in a single batch
and sends a LINE push notification to each requester via line_oa_outbound_messages.

Transitions each row: cancelled → pending.  Clears approver, approved_at, and
rejection_note so each request re-enters the approval queue as a fresh submission.

Notification template: tpl_fpr_uncancelled_flex_card (indigo #6366F1 header).
Notification target: REQUESTER (looked up via identity_binding.employee_id).
Notifications are non-fatal — a missing LINE binding never rolls back the
status transitions.

Fail-all atomicity on status transitions: any site-access or state-guard failure
triggers an immediate RETURN (implicit ROLLBACK of all preceding DML).

Authority: project_manager, managing_director, or governance role.
Self-uncancel excluded (mirrors single-row 0202).
State guard: only ''cancelled'' requests may be bulk-uncancelled.
Empty-array guard: returns code=''empty_request_list''.
Not-found guard: returns code=''request_not_found'' if any UUID is unknown.

Supersedes migration 0203.  Migration 0204.';

COMMIT;
