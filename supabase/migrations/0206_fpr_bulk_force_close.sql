-- =============================================================================
-- Migration 0206: rpc_bulk_force_close_field_purchase_request
--
-- Force-closes any non-cancelled, non-closed field purchase request in bulk,
-- with per-request LINE push notifications to each requester.
--
-- Key differences from rpc_bulk_close_field_purchase_request (0188):
--   1. State guard rejects only 'cancelled' and 'closed' — accepts any of
--      pending / approved / rejected / purchased in a single batch.
--   2. Tracks each row's pre-close status so audit entries carry the correct
--      old_status (event_type = 'force_closed', metadata.previous_status).
--   3. LINE push notifications per request (0204 pattern).
--   4. Soft-return error payloads instead of RAISE EXCEPTION for auth/state
--      failures — caller can inspect ok+code without catching exceptions.
--
-- Template: tpl_fpr_force_closed_flex_card
--   header colour: #DC2626  (crimson — distinct from all prior templates)
--   notification target: REQUESTER (via identity_binding.employee_id)
--   slot_values: request_id, request_id_short, amount, site_code, reason,
--                forced_by, close_note, previous_status, closed_at_th
--
-- Error codes (soft RETURN):
--   empty_request_list    — p_request_ids is NULL or empty
--   insufficient_privilege — caller not authorized / no site access
--   invalid_state          — row is already cancelled or closed
--   request_not_found      — a UUID was not found in field_purchase_request
--
-- Return payload:
--   ok, force_closed_count, request_ids, forced_by, close_note,
--   closed_at, notifications
--
-- Prerequisite migrations:
--   0176 — core ENUMs, field_purchase_request, field_purchase_audit_log
--   0177 — line_oa_message_templates, line_oa_outbound_messages, identity_binding
--   0183 — introduces 'closed' status usage
--   0199 — introduces 'cancelled' status usage
--   0201 — bulk-cancel-with-notifications (notification loop pattern)
--   0204 — bulk-uncancel-with-notifications (canonical notification pattern)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Seed tpl_fpr_force_closed_flex_card template
--    Crimson (#DC2626) header — signals an administrative force-close.
--    Idempotent: ON CONFLICT DO UPDATE.
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
  'tpl_fpr_force_closed_flex_card',
  'field_purchase',
  'flex',
  'คำขอจัดซื้อ #{{request_id_short}} ถูกปิดโดยผู้จัดการ',
  jsonb_build_object(
    'type', 'bubble',
    'header', jsonb_build_object(
      'type',     'box',
      'layout',   'vertical',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type',  'text',
          'text',  '🔒 ปิดคำขอจัดซื้อ (บังคับ)',
          'color', '#FFFFFF',
          'weight','bold',
          'size',  'md'
        )
      ),
      'backgroundColor', '#DC2626'
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
          'text',  'สถานะก่อนปิด',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{previous_status}}',
          'weight','bold',
          'color', '#DC2626',
          'size',  'sm',
          'margin','xs'
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
          'color', '#DC2626',
          'size',  'sm',
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'เหตุผล',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{close_note}}',
          'size',  'sm',
          'wrap',  true,
          'margin','xs'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  'ปิดโดย',
          'color', '#6B7280',
          'size',  'xs',
          'margin','md'
        ),
        jsonb_build_object(
          'type',  'text',
          'text',  '{{forced_by}}',
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
          'text',  '{{closed_at_th}}',
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
          'type',  'text',
          'text',  'คำขอนี้ถูกปิดโดยผู้จัดการระบบ ไม่สามารถดำเนินการต่อได้',
          'color', '#6B7280',
          'size',  'xs',
          'align', 'center',
          'wrap',  true
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
     WHERE template_key     = 'tpl_fpr_force_closed_flex_card'
       AND vertical_context = 'field_purchase'
       AND is_active        = true
  ) THEN
    RAISE EXCEPTION 'seed verify failed: tpl_fpr_force_closed_flex_card not found or inactive';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. rpc_bulk_force_close_field_purchase_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_bulk_force_close_field_purchase_request(
  p_request_ids  uuid[],
  p_close_note   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor             text;
  v_now               timestamptz := now();
  v_ids_arr           uuid[]      := '{}';
  v_old_statuses      jsonb       := '{}';   -- uuid::text → old status text
  v_rec               public.field_purchase_request%ROWTYPE;
  v_force_closed_count int;

  -- Notification loop variables
  v_req_id            uuid;
  v_req               public.field_purchase_request%ROWTYPE;
  v_requester_uid     text;
  v_closed_at_th      text;
  v_notifications     jsonb[] := '{}';
BEGIN
  -- ── 1. Input guard ──────────────────────────────────────────────────────────
  IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'empty_request_list',
      'hint', 'p_request_ids must be a non-empty array of UUIDs'
    );
  END IF;

  -- ── 2. Resolve calling actor (fail-closed) ──────────────────────────────────
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege'
      USING HINT = 'authentication required';
  END IF;

  -- ── 3. Authority gate ────────────────────────────────────────────────────────
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

  -- ── 4. SET LOCAL app.actor for fn_fpr_audit_transition ─────────────────────
  PERFORM set_config('app.actor', v_actor, true);

  -- ── 5. Per-row validation loop (FOR UPDATE) ─────────────────────────────────
  --    Collects validated IDs into v_ids_arr and records each row's pre-close
  --    status into v_old_statuses for correct per-row audit entries later.
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

    -- 5b. State guard: force-close is blocked only for already-terminal states
    IF v_rec.status IN (
      'cancelled'::public.field_purchase_status,
      'closed'::public.field_purchase_status
    ) THEN
      RETURN jsonb_build_object(
        'ok',         false,
        'code',       'invalid_state',
        'request_id', v_rec.id,
        'current',    v_rec.status::text,
        'hint',       format(
          'request %s is already %s — cannot force-close',
          v_rec.id, v_rec.status::text
        )
      );
    END IF;

    -- Accumulate validated ID and record its current (pre-close) status
    v_ids_arr      := v_ids_arr || v_rec.id;
    v_old_statuses := v_old_statuses ||
                      jsonb_build_object(v_rec.id::text, v_rec.status::text);
  END LOOP;

  -- ── 6. Not-found guard ──────────────────────────────────────────────────────
  IF array_length(v_ids_arr, 1) IS DISTINCT FROM array_length(p_request_ids, 1) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'request_not_found',
      'hint', 'one or more request_ids were not found in field_purchase_request'
    );
  END IF;

  -- ── 7. Batch UPDATE: any state → closed ────────────────────────────────────
  UPDATE public.field_purchase_request
     SET status     = 'closed'::public.field_purchase_status,
         updated_at = v_now
   WHERE id = ANY(v_ids_arr);

  GET DIAGNOSTICS v_force_closed_count = ROW_COUNT;

  -- ── 8. Supplementary batch audit INSERT ─────────────────────────────────────
  --    Each row gets its own old_status from v_old_statuses so the audit log
  --    accurately reflects the transition from the actual previous state.
  INSERT INTO public.field_purchase_audit_log (
    request_id,
    actor,
    event_type,
    old_status,
    new_status,
    metadata
  )
  SELECT
    req_id,
    v_actor,
    'force_closed',
    (v_old_statuses ->> req_id::text)::public.field_purchase_status,
    'closed'::public.field_purchase_status,
    jsonb_build_object(
      'close_note',      p_close_note,
      'previous_status', v_old_statuses ->> req_id::text,
      'bulk',            true,
      'closed_at',       v_now
    )
  FROM unnest(v_ids_arr) AS t(req_id);

  -- ── 9. Per-request LINE push notifications (0204 pattern) ──────────────────
  --    Non-fatal: missing LINE binding never rolls back the status transitions.

  v_closed_at_th := to_char(
    timezone('Asia/Bangkok', v_now),
    'DD Mon YYYY HH24:MI'
  );

  FOREACH v_req_id IN ARRAY v_ids_arr
  LOOP
    BEGIN
      -- Re-read the closed row to get amount, site_code, reason
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
        'tpl_fpr_force_closed_flex_card',
        jsonb_build_object(
          'request_id',       v_req_id::text,
          'request_id_short', left(v_req_id::text, 8),
          'amount',           v_req.amount::text,
          'site_code',        v_req.site_code,
          'reason',           v_req.reason,
          'forced_by',        v_actor,
          'close_note',       coalesce(p_close_note, '—'),
          'previous_status',  v_old_statuses ->> v_req_id::text,
          'closed_at_th',     v_closed_at_th
        ),
        'user',
        v_requester_uid
      );

      -- Accumulate success entry
      v_notifications := v_notifications || jsonb_build_array(
        jsonb_build_object(
          'request_id', v_req_id,
          'ok',         true,
          'target_uid', v_requester_uid
        )
      );

    EXCEPTION WHEN OTHERS THEN
      -- Non-fatal: record failure without rolling back status transitions
      v_notifications := v_notifications || jsonb_build_array(
        jsonb_build_object(
          'request_id', v_req_id,
          'ok',         false,
          'reason',     SQLERRM
        )
      );
    END;
  END LOOP;

  -- ── 10. Return success payload ───────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                true,
    'force_closed_count',v_force_closed_count,
    'request_ids',       to_jsonb(v_ids_arr),
    'forced_by',         v_actor,
    'close_note',        p_close_note,
    'closed_at',         v_now,
    'notifications',     to_jsonb(v_notifications)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_bulk_force_close_field_purchase_request(uuid[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE
   ON FUNCTION public.rpc_bulk_force_close_field_purchase_request(uuid[], text)
   TO authenticated;

COMMENT ON FUNCTION public.rpc_bulk_force_close_field_purchase_request(uuid[], text) IS
'Atomically force-closes multiple field purchase requests in a single batch,
regardless of their current status (pending / approved / rejected / purchased).

State guard: only ''cancelled'' and ''closed'' rows are rejected — all other
states transition to ''closed'' in a single batch UPDATE.

Audit entries carry the correct previous_status per row (event_type=force_closed,
metadata.previous_status, metadata.bulk=true) in addition to the trigger-generated
status_changed entries.

Notification template: tpl_fpr_force_closed_flex_card (crimson #DC2626 header).
Notification target: REQUESTER (looked up via identity_binding.employee_id).
Notifications are non-fatal — a missing LINE binding never rolls back the
status transitions.

Fail-all atomicity on status transitions: any site-access or state-guard failure
triggers an immediate RETURN (implicit ROLLBACK of all preceding DML in this tx).

Authority: project_manager, managing_director, or governance role.
Empty-array guard: returns code=''empty_request_list''.
Not-found guard: returns code=''request_not_found'' if any UUID is unknown.
Invalid-state guard: returns code=''invalid_state'' for cancelled/closed rows.

Migration 0206.';

COMMIT;
