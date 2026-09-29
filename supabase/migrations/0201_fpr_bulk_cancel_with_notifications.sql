-- =============================================================================
-- Migration 0201 – rpc_bulk_cancel_field_purchase_request (+ LINE notifications)
--
-- Replaces the 0200 version of rpc_bulk_cancel_field_purchase_request to add
-- per-request LINE cancellation notifications after the batch is committed.
--
-- Notification pattern (mirrors 0193 bulk-approve-with-notifications):
--   For each cancelled request the function resolves the REQUESTER's LINE UID
--   via identity_binding (ADR-038) and queues a tpl_fpr_cancelled_flex_card
--   push into line_oa_outbound_messages.
--
--   Notification failures are NON-FATAL: if the LINE UID cannot be resolved
--   the cancellation is still committed and the failure is recorded in the
--   'notifications' response array.  This preserves fail-safe behaviour for
--   sites without LINE or requesters without identity bindings.
--
-- Template seed:
--   tpl_fpr_cancelled_flex_card — orange/neutral Flex Card notifying the
--   requester their FPR was cancelled.  Seeded idempotently via INSERT ... ON
--   CONFLICT DO UPDATE, following 0194 (tpl_fpr_approved_flex_card).
--
-- Return payload additions vs 0200:
--   notifications jsonb[]  — per-request [ { request_id, ok, reason? } ]
--
-- Atomicity contract (unchanged from 0200):
--   Any site-access or state-guard failure → immediate RETURN → implicit
--   ROLLBACK of all preceding DML.  Notification errors do NOT trigger rollback.
--
-- Authority:
--   • project_manager | managing_director | is_governance_role()
--   • Self-cancel: actor is requester of ALL rows in the batch.
--
-- State guard: status must be 'pending'.
--
-- Depends on: 0176 (field_purchase_request, field_purchase_audit_log),
--             0177 (identity_binding, line_oa_outbound_messages),
--             0199 ('cancelled' ENUM value),
--             0200 (initial rpc_bulk_cancel_field_purchase_request)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure 'cancelled' exists in the status enum (idempotent guard)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    ALTER TYPE field_purchase_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'closed';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Template seed: tpl_fpr_cancelled_flex_card
-- Orange/neutral Flex Card sent as a push to the REQUESTER's LINE DM when
-- their field purchase request is cancelled (either by themselves or a manager).
-- Mirrors 0194 (tpl_fpr_approved_flex_card) structure and insert strategy.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO line_oa_message_templates (
    template_key,
    vertical_context,
    message_kind,
    body,
    flex_payload,
    is_active,
    org_id
)
VALUES (
    'tpl_fpr_cancelled_flex_card',
    'field_purchase',
    'flex',
    'คำขอซื้อด่วน #{{request_id_short}} ถูกยกเลิกแล้ว',
    '{
  "type": "bubble",
  "size": "kilo",
  "header": {
    "type": "box",
    "layout": "vertical",
    "backgroundColor": "#F97316",
    "paddingAll": "16px",
    "contents": [
      {
        "type": "text",
        "text": "คำขอถูกยกเลิก",
        "color": "#FFFFFF",
        "size": "lg",
        "weight": "bold"
      },
      {
        "type": "text",
        "text": "#{{request_id_short}}",
        "color": "#FED7AA",
        "size": "xs",
        "margin": "xs"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "spacing": "sm",
    "paddingAll": "16px",
    "contents": [
      {
        "type": "box",
        "layout": "horizontal",
        "contents": [
          { "type": "text", "text": "Site", "color": "#6B7280", "size": "sm", "flex": 2 },
          { "type": "text", "text": "{{site_code}}", "size": "sm", "weight": "bold", "flex": 4, "wrap": true }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "contents": [
          { "type": "text", "text": "มูลค่า", "color": "#6B7280", "size": "sm", "flex": 2 },
          { "type": "text", "text": "฿{{amount}}", "size": "sm", "weight": "bold", "color": "#DC2626", "flex": 4 }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "contents": [
          { "type": "text", "text": "เหตุผล", "color": "#6B7280", "size": "sm", "flex": 2 },
          { "type": "text", "text": "{{reason}}", "size": "sm", "flex": 4, "wrap": true, "color": "#374151" }
        ]
      },
      {
        "type": "separator",
        "margin": "md"
      },
      {
        "type": "box",
        "layout": "horizontal",
        "margin": "md",
        "contents": [
          { "type": "text", "text": "ยกเลิกโดย", "color": "#6B7280", "size": "sm", "flex": 2 },
          { "type": "text", "text": "{{cancelled_by}}", "size": "sm", "flex": 4, "wrap": true, "color": "#374151" }
        ]
      },
      {
        "type": "box",
        "layout": "horizontal",
        "contents": [
          { "type": "text", "text": "เหตุผลยกเลิก", "color": "#6B7280", "size": "sm", "flex": 2 },
          { "type": "text", "text": "{{cancel_reason}}", "size": "sm", "flex": 4, "wrap": true, "color": "#374151" }
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "paddingAll": "12px",
    "contents": [
      {
        "type": "text",
        "text": "ยกเลิกเมื่อ {{cancelled_at_th}}",
        "color": "#9CA3AF",
        "size": "xxs",
        "align": "end"
      }
    ]
  }
}'::jsonb,
    true,
    '00000000-0000-0000-0000-000000000000'   -- sentinel: shared platform template
)
ON CONFLICT (template_key, vertical_context)
DO UPDATE SET
    message_kind  = EXCLUDED.message_kind,
    body          = EXCLUDED.body,
    flex_payload  = EXCLUDED.flex_payload,
    is_active     = EXCLUDED.is_active;

-- Verify template was seeded correctly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM line_oa_message_templates
         WHERE template_key      = 'tpl_fpr_cancelled_flex_card'
           AND vertical_context  = 'field_purchase'
           AND is_active
    ) THEN
        RAISE EXCEPTION '0201: tpl_fpr_cancelled_flex_card seed not found after upsert';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_bulk_cancel_field_purchase_request (0201 — with LINE notifications)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_bulk_cancel_field_purchase_request(
    p_request_ids   uuid[],
    p_cancel_reason text    DEFAULT NULL
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
    v_now             timestamptz;
    v_rec             RECORD;
    v_req             RECORD;

    -- Accumulation array — filled during the validation lock loop
    v_ids_arr         uuid[] := '{}';

    -- Running count for the final payload
    v_cancelled_count integer := 0;

    -- Notification tracking (mirrors 0193 pattern)
    v_req_id          uuid;
    v_requester_uid   text;
    v_slot_values     jsonb;
    v_request_short   text;
    v_amount_fmt      text;
    v_cancelled_at_th text;
    v_notifications   jsonb  := '[]'::jsonb;
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
    --    Two permitted paths:
    --      A) PM / MD / governance role  → can cancel any pending request at
    --         an accessible site.
    --      B) Self-cancel: actor is the requester of ALL rows in the batch.
    --    installation_team_lead is NOT in the authority gate (mirrors 0199 / 0200).
    v_is_manager := (
        has_any_app_role(ARRAY['project_manager', 'managing_director'])
        OR is_governance_role()
    );

    IF NOT v_is_manager THEN
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
               status
          FROM field_purchase_request
         WHERE id = ANY(p_request_ids)
         ORDER BY id
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
       SET status     = 'cancelled'::field_purchase_status,
           updated_at = v_now
     WHERE id = ANY(v_ids_arr);

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- ── 7. Supplementary batch audit INSERT ───────────────────────────────────
    --    event_type='cancelled' + metadata.bulk=true + metadata.self_cancel=false.
    --    (Per-row self_cancel precision belongs to rpc_cancel_field_purchase_request.)
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

    -- ── 8. Per-request LINE cancellation notifications ─────────────────────────
    --    For each cancelled request, resolve the REQUESTER's LINE UID via
    --    identity_binding (ADR-038) and queue a tpl_fpr_cancelled_flex_card push.
    --    Mirrors the FOREACH notification loop in 0193 (bulk approve).
    --    Failures are non-fatal; recorded in v_notifications array.
    --
    --    Formatted timestamp for the card footer (Asia/Bangkok display)
    v_cancelled_at_th := to_char(
        timezone('Asia/Bangkok', v_now),
        'DD Mon YYYY HH24:MI'
    );

    FOREACH v_req_id IN ARRAY v_ids_arr
    LOOP
        BEGIN
            -- Load request details for slot values
            SELECT requester,
                   site_code,
                   reason,
                   amount
              INTO v_req
              FROM field_purchase_request
             WHERE id = v_req_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'request_not_found: %', v_req_id;
            END IF;

            -- Resolve requester LINE UID via identity_binding
            --   identity_binding.employee_id = requester (actor sub or employee_id)
            SELECT ib.line_user_id
              INTO v_requester_uid
              FROM identity_binding ib
             WHERE ib.employee_id = v_req.requester
               AND ib.is_active
             LIMIT 1;

            IF v_requester_uid IS NULL THEN
                RAISE EXCEPTION 'no_line_uid: requester % has no active LINE identity binding',
                    v_req.requester;
            END IF;

            -- Format slot values for the flex card
            v_request_short := left(v_req_id::text, 8);
            v_amount_fmt    := to_char(v_req.amount, 'FM999,999,990.00');

            v_slot_values := jsonb_build_object(
                'request_id',       v_req_id,
                'request_id_short', v_request_short,
                'amount',           v_amount_fmt,
                'reason',           left(COALESCE(v_req.reason, ''), 60),
                'site_code',        v_req.site_code,
                'cancelled_by',     v_actor,
                'cancel_reason',    COALESCE(p_cancel_reason, 'ไม่ระบุเหตุผล'),
                'cancelled_at_th',  v_cancelled_at_th
            );

            -- Queue push notification to requester DM
            INSERT INTO line_oa_outbound_messages (
                send_type,
                status,
                template_key,
                slot_values,
                target_type,
                target_id
            ) VALUES (
                'push',
                'pending',
                'tpl_fpr_cancelled_flex_card',
                v_slot_values,
                'user',
                v_requester_uid
            );

            v_notifications := v_notifications || jsonb_build_array(
                jsonb_build_object(
                    'request_id',  v_req_id,
                    'ok',          true,
                    'target_uid',  v_requester_uid
                )
            );

        EXCEPTION WHEN OTHERS THEN
            -- Non-fatal: record failure but do not roll back the cancellation
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
        'ok',              true,
        'cancelled_count', v_cancelled_count,
        'request_ids',     to_jsonb(v_ids_arr),
        'cancelled_by',    v_actor,
        'cancel_reason',   p_cancel_reason,
        'cancelled_at',    v_now,
        'notifications',   v_notifications
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions (unchanged from 0200)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text)
    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text)
    TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION rpc_bulk_cancel_field_purchase_request(uuid[], text) IS
'Atomically cancels multiple pending field purchase requests in a single batch,
then sends per-request LINE cancellation notifications to each requester.

DML behaviour (same as 0200):
  Sets status = ''cancelled'' on each request.
  Inserts supplementary audit row: event_type=''cancelled'', metadata.bulk=true,
  metadata.self_cancel=false, metadata.cancel_reason.
  fn_fpr_audit_transition also inserts status_changed rows on UPDATE.

LINE notification behaviour (added in 0201):
  After the batch UPDATE is committed, resolves each requester''s LINE UID from
  identity_binding (ADR-038 employee_id lookup) and queues a
  tpl_fpr_cancelled_flex_card push into line_oa_outbound_messages.
  Notification failures are NON-FATAL: the cancellation is committed regardless.
  Per-request notification outcomes are returned in the ''notifications'' array.

Fail-all atomicity (DML): any site-access or state-guard failure inside the
validation loop triggers an immediate RETURN, causing an implicit ROLLBACK of all
preceding DML in this transaction.  No partial cancellations are possible.

Authority:
  • project_manager | managing_director | is_governance_role() — any pending row
    at an accessible site.
  • Self-cancel — caller is the requester of ALL rows in the batch.

State guard: only ''pending'' requests may be cancelled.

Mirror of 0193 (bulk_approve_with_notifications).
Depends on: 0177 (identity_binding, line_oa_outbound_messages),
            0200 (initial rpc_bulk_cancel_field_purchase_request).
Migration: 0201';

COMMIT;
