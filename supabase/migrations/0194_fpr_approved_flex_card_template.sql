-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 0194_fpr_approved_flex_card_template.sql
-- Purpose   : Seed tpl_fpr_approved_flex_card into line_oa_message_templates.
--             This is a green confirmation Flex Card sent to the requester (or group)
--             after their Field Purchase Request has been approved — distinct from
--             tpl_fpr_approval_flex_card (orange, action card sent to the approver).
--
-- Header    : Green #2ECC71, "✅ อนุมัติแล้ว" + {{site_code}}
-- Body rows : ฿{{amount}} | {{reason}} | อนุมัติโดย {{approved_by}} |
--             เวลาอนุมัติ {{approved_at_th}} | รหัสคำขอ #{{request_id_short}}
-- Footer    : None (confirmation only — no Approve/Reject postback buttons)
--
-- Slots consumed by rpc_bulk_approve_field_purchase_request (0193) notification loop:
--   request_id, request_id_short, amount, reason, site_code, approved_by, approved_at_th
--
-- Idempotent: ON CONFLICT ON CONSTRAINT line_oa_message_templates_key_vertical_uniq
--             DO UPDATE SET  (mirrors 0177 pattern)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── tpl_fpr_approved_flex_card ──────────────────────────────────────────────
INSERT INTO line_oa_message_templates (
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
  'tpl_fpr_approved_flex_card',
  'installation_pm',
  '✅ อนุมัติแล้ว — ฿{{amount}} | {{site_code}} | อนุมัติโดย {{approved_by}}',
  'flex',
  'internal',        -- Guardrail G1: FPR notifications are internal-staff only
  jsonb_build_object(
    'type', 'bubble',
    'size', 'kilo',

    -- ── Header ──────────────────────────────────────────────────────────────
    'header', jsonb_build_object(
      'type',            'box',
      'layout',          'vertical',
      'backgroundColor', '#2ECC71',
      'paddingAll',      '16px',
      'contents', jsonb_build_array(
        jsonb_build_object(
          'type',   'text',
          'text',   '✅ อนุมัติแล้ว',
          'color',  '#FFFFFF',
          'weight', 'bold',
          'size',   'lg'
        ),
        jsonb_build_object(
          'type',   'text',
          'text',   '{{site_code}}',
          'color',  '#D5F5E3',
          'size',   'xs',
          'margin', 'xs'
        )
      )
    ),

    -- ── Body ────────────────────────────────────────────────────────────────
    'body', jsonb_build_object(
      'type',       'box',
      'layout',     'vertical',
      'paddingAll', '16px',
      'spacing',    'sm',
      'contents', jsonb_build_array(

        -- Row: ฿amount
        jsonb_build_object(
          'type',     'box',
          'layout',   'horizontal',
          'contents', jsonb_build_array(
            jsonb_build_object(
              'type',  'text',
              'text',  'จำนวนเงิน',
              'color', '#6B7280',
              'size',  'xs',
              'flex',  2
            ),
            jsonb_build_object(
              'type',   'text',
              'text',   '฿{{amount}}',
              'color',  '#1F2937',
              'size',   'sm',
              'weight', 'bold',
              'align',  'end',
              'flex',   3
            )
          )
        ),

        -- Separator
        jsonb_build_object(
          'type',   'separator',
          'margin', 'sm',
          'color',  '#E5E7EB'
        ),

        -- Row: reason
        jsonb_build_object(
          'type',     'box',
          'layout',   'horizontal',
          'margin',   'sm',
          'contents', jsonb_build_array(
            jsonb_build_object(
              'type',  'text',
              'text',  'เหตุผล',
              'color', '#6B7280',
              'size',  'xs',
              'flex',  2
            ),
            jsonb_build_object(
              'type',  'text',
              'text',  '{{reason}}',
              'color', '#1F2937',
              'size',  'xs',
              'align', 'end',
              'flex',  3,
              'wrap',  true
            )
          )
        ),

        -- Row: approved_by
        jsonb_build_object(
          'type',     'box',
          'layout',   'horizontal',
          'margin',   'sm',
          'contents', jsonb_build_array(
            jsonb_build_object(
              'type',  'text',
              'text',  'อนุมัติโดย',
              'color', '#6B7280',
              'size',  'xs',
              'flex',  2
            ),
            jsonb_build_object(
              'type',  'text',
              'text',  '{{approved_by}}',
              'color', '#1F2937',
              'size',  'xs',
              'align', 'end',
              'flex',  3,
              'wrap',  true
            )
          )
        ),

        -- Row: approved_at_th
        jsonb_build_object(
          'type',     'box',
          'layout',   'horizontal',
          'margin',   'sm',
          'contents', jsonb_build_array(
            jsonb_build_object(
              'type',  'text',
              'text',  'เวลาอนุมัติ',
              'color', '#6B7280',
              'size',  'xs',
              'flex',  2
            ),
            jsonb_build_object(
              'type',  'text',
              'text',  '{{approved_at_th}}',
              'color', '#1F2937',
              'size',  'xs',
              'align', 'end',
              'flex',  3
            )
          )
        ),

        -- Separator
        jsonb_build_object(
          'type',   'separator',
          'margin', 'sm',
          'color',  '#E5E7EB'
        ),

        -- Row: request_id_short (footnote style)
        jsonb_build_object(
          'type',     'box',
          'layout',   'horizontal',
          'margin',   'sm',
          'contents', jsonb_build_array(
            jsonb_build_object(
              'type',  'text',
              'text',  'รหัสคำขอ',
              'color', '#9CA3AF',
              'size',  'xxs',
              'flex',  2
            ),
            jsonb_build_object(
              'type',  'text',
              'text',  '#{{request_id_short}}',
              'color', '#9CA3AF',
              'size',  'xxs',
              'align', 'end',
              'flex',  3
            )
          )
        )

      ) -- end body contents
    )
    -- No footer: this is a confirmation card, not an action card
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

-- ─── Verify seed ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM line_oa_message_templates
    WHERE template_key     = 'tpl_fpr_approved_flex_card'
      AND vertical_context = 'installation_pm'
  ) THEN
    RAISE EXCEPTION '0194: tpl_fpr_approved_flex_card seed not found after upsert';
  END IF;
END;
$$;

COMMIT;

-- ─── Summary ─────────────────────────────────────────────────────────────────
-- Template inventory after 0194:
--   tpl_fpr_photo_received_quickreply  — quick_reply  group prompt            (0177)
--   tpl_fpr_amount_prompt              — text         amount collection        (0177)
--   tpl_fpr_workitem_select            — quick_reply  work-item picker         (0177)
--   tpl_fpr_submitted_confirmation     — text         submission receipt       (0177)
--   tpl_fpr_approval_flex_card         — flex/orange  approval-REQUEST card    (0177)
--   tpl_fpr_outcome_notification       — text         post-decision group msg  (0177)
--   tpl_fpr_approved_flex_card         — flex/green   approval-CONFIRMATION    (0194) ← NEW
