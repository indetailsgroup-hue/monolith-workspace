-- =============================================================================
-- Migration 0211: FPR Receiving Confirmation
-- Adds received_at / received_by columns + rpc_confirm_fpr_receiving
-- Notification: tpl_fpr_received_flex_card (emerald #10B981)
-- =============================================================================

-- ── 1. Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.field_purchase_request
  ADD COLUMN IF NOT EXISTS received_at  timestamptz,
  ADD COLUMN IF NOT EXISTS received_by  text;

COMMENT ON COLUMN public.field_purchase_request.received_at IS
  'Timestamp when field worker confirmed goods were received. NULL = not yet received.';
COMMENT ON COLUMN public.field_purchase_request.received_by IS
  'Actor (employee_id) who confirmed receipt.';

-- ── 2. Flex card template ────────────────────────────────────────────────────
INSERT INTO public.line_oa_message_templates (
  template_key,
  vertical_context,
  body,
  message_kind,
  audience,
  flex_payload,
  is_active,
  org_id
)
VALUES (
  'tpl_fpr_received_flex_card',
  'fpr',
  '✅ สินค้าถึงแล้ว — {{site_code}} — {{item_hint}} ฿{{amount}} รับโดย {{received_by}}',
  'flex',
  'internal',        -- Guardrail G1: FPR notifications are internal-staff only
  jsonb_build_object(
    'type', 'bubble',
    'size', 'kilo',
    'header', jsonb_build_object(
      'type', 'box',
      'layout', 'vertical',
      'paddingAll', '14px',
      'backgroundColor', '#10B981',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', '✅ สินค้าถึงแล้ว',
          'color', '#FFFFFF',
          'weight', 'bold',
          'size', 'lg'
        )
      )
    ),
    'body', jsonb_build_object(
      'type', 'box',
      'layout', 'vertical',
      'spacing', 'sm',
      'paddingAll', '14px',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', '{{site_code}} — {{item_hint}}',
          'wrap', true,
          'size', 'md',
          'weight', 'bold',
          'color', '#111827'
        ),
        jsonb_build_object(
          'type', 'text',
          'text', 'มูลค่า: ฿{{amount}}',
          'color', '#374151',
          'size', 'sm'
        ),
        jsonb_build_object(
          'type', 'text',
          'text', 'รับของโดย: {{received_by}}',
          'color', '#374151',
          'size', 'sm'
        ),
        jsonb_build_object(
          'type', 'text',
          'text', 'เวลา: {{received_at}}',
          'color', '#6B7280',
          'size', 'xs'
        )
      )
    )
  )::jsonb,
  TRUE,
  '00000000-0000-0000-0000-000000000000'   -- sentinel: shared platform template
)
ON CONFLICT ON CONSTRAINT line_oa_message_templates_key_vertical_uniq
DO UPDATE SET
  body         = EXCLUDED.body,
  flex_payload = EXCLUDED.flex_payload,
  message_kind = EXCLUDED.message_kind,
  audience     = EXCLUDED.audience,
  is_active    = EXCLUDED.is_active;

-- ── Verify seed ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM line_oa_message_templates
    WHERE template_key     = 'tpl_fpr_received_flex_card'
      AND vertical_context = 'fpr'
  ) THEN
    RAISE EXCEPTION '0211: tpl_fpr_received_flex_card seed not found after upsert';
  END IF;
END;
$$;

-- ── 3. RPC ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_confirm_fpr_receiving(
  p_request_id  uuid,
  p_actor       text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  text         := COALESCE(p_actor, resolve_actor());
  v_req    field_purchase_request;
  v_now    timestamptz  := now();
BEGIN
  SELECT * INTO v_req
    FROM field_purchase_request
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  -- Only callable when status = purchased
  IF v_req.status <> 'purchased' THEN
    RETURN jsonb_build_object(
      'ok',             false,
      'error',          'invalid_status',
      'current_status', v_req.status
    );
  END IF;

  -- Authority: site-member or governance
  IF NOT (has_site_access(v_req.site_code) OR is_governance_role()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  -- Idempotency guard
  IF v_req.received_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',          true,
      'idempotent',  true,
      'received_at', v_req.received_at,
      'received_by', v_req.received_by
    );
  END IF;

  -- Mark received (does NOT change status — status stays 'purchased')
  UPDATE field_purchase_request
     SET received_at = v_now,
         received_by = v_actor,
         updated_at  = v_now
   WHERE id = p_request_id;

  -- Audit entry
  INSERT INTO field_purchase_audit_log
         (request_id, actor, event_type, old_status, new_status, metadata)
  VALUES (p_request_id, v_actor, 'receiving_confirmed',
          v_req.status, v_req.status,
          jsonb_build_object('received_at', v_now));

  -- Notify requester via LINE
  INSERT INTO line_oa_outbound_messages
         (send_type, status, template_key, slot_values, target_type, target_id)
  SELECT  'push', 'pending',
          'tpl_fpr_received_flex_card',
          jsonb_build_object(
            'site_code',   v_req.site_code,
            'item_hint',   COALESCE(v_req.item_hint, '-'),
            'amount',      to_char(v_req.amount, 'FM999,999,990.00'),
            'received_by', v_actor,
            'received_at', to_char(v_now AT TIME ZONE 'Asia/Bangkok', 'DD Mon YYYY HH24:MI')
          ),
          'user',
          ib.line_user_id
    FROM  identity_binding ib
   WHERE  ib.employee_id = v_req.requester
     AND  ib.is_active;

  RETURN jsonb_build_object(
    'ok',          true,
    'received_at', v_now,
    'received_by', v_actor
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_confirm_fpr_receiving(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_fpr_receiving(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_confirm_fpr_receiving IS
  '0211 — Mark FPR goods as received by field worker. '
  'Status stays purchased; received_at/received_by columns are stamped. '
  'Guard: status must be purchased. Idempotent on received_at.';
