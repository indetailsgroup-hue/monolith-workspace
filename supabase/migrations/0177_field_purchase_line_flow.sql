-- =============================================================================
-- Migration 0177: field_purchase_line_flow
-- Depends on: 0097 (fn_line_handle_group_event, line_oa_message_templates),
--             0176 (field_purchase_request, rpc_*_field_purchase_*),
--             0095 (line_groups, line_group_members, identity_binding),
--             0063 (rpc_capture_ingest), pgcrypto (hmac/encode)
--
-- Adds the FPR LINE bot flow on top of existing group event handling:
--   • fpr_line_session — ephemeral state machine for group/DM bot sessions
--   • 6 message templates (quick_reply + flex + text)
--   • fn_line_handle_group_event replacement — intercepts image → FPR quick reply;
--     intercepts text when session in await_amount; preserves all 0097 behaviour
--   • rpc_route_fpr_approval_notification — resolves approver LINE UID, signs
--     HMAC token (ADR-031), queues flex card push
--   • rpc_handle_fpr_postback — single postback router (fpr_start / room_proof /
--     fpr_workitem_select / fpr_skip_workitem / fpr_approve / fpr_reject_init /
--     fpr_reject_note)
--
-- Patterns: SECURITY DEFINER RPC, fail-closed RLS, append-only audit,
--           idempotent ON CONFLICT, no client write path, reuse not fork.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (0) Extend line_oa_message_templates — add message_kind + flex_payload
--     (idempotent: IF NOT EXISTS + safe DEFAULT)
-- ---------------------------------------------------------------------------
ALTER TABLE public.line_oa_message_templates
    ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'text'
        CONSTRAINT line_oa_message_templates_kind_chk
            CHECK (message_kind IN ('text', 'quick_reply', 'flex'));

ALTER TABLE public.line_oa_message_templates
    ADD COLUMN IF NOT EXISTS flex_payload jsonb NULL;

COMMENT ON COLUMN public.line_oa_message_templates.message_kind IS
    '0177: text (default) | quick_reply (body=prompt, flex_payload=items JSON) | flex (body=alt-text, flex_payload=Bubble JSON)';
COMMENT ON COLUMN public.line_oa_message_templates.flex_payload IS
    '0177: quick_reply → {items:[...]}; flex → LINE Bubble JSON object with {{slot}} placeholders';

-- ---------------------------------------------------------------------------
-- (1) fpr_session_state ENUM
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'fpr_session_state' AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.fpr_session_state AS ENUM (
            'await_confirm',       -- photo received; user choosing fpr vs room_proof
            'await_amount',        -- user confirmed fpr_start; waiting for amount text
            'await_workitem',      -- amount captured; waiting for work-item selection or skip
            'await_reject_note',   -- approver tapped reject_init; DM waiting for note text
            'submitted',           -- rpc_create_field_purchase_request called; awaiting decision
            'done'                 -- terminal: approved / rejected / room_proof taken / expired
        );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- (2) fpr_line_session — ephemeral bot state store (24-hour TTL)
--     UNIQUE (line_group_id, line_user_id): one active session per user per context.
--     DM sessions use synthetic key 'dm:{line_user_id}' as line_group_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fpr_line_session (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session key ─────────────────────────────────────────────────────────
    line_group_id        text          NOT NULL,
    -- actual LINE groupId or 'dm:{line_user_id}' for 1:1 rejection-note flow
    line_user_id         text          NOT NULL,

    -- State machine ────────────────────────────────────────────────────────
    state                public.fpr_session_state NOT NULL DEFAULT 'await_confirm',

    -- Captured photo context ───────────────────────────────────────────────
    photo_ref            text          NULL,  -- LINE message ID of intercepted photo
    webhook_event_id     text          NULL,  -- for rpc_capture_ingest idempotency

    -- Project context (resolved from line_groups at session creation) ──────
    project_id           uuid          NULL,
    site_code            text          NULL,

    -- Accumulated values ───────────────────────────────────────────────────
    pending_amount       numeric(12,2) NULL,
    pending_request_id   uuid          NULL
        REFERENCES public.field_purchase_request (id) ON DELETE SET NULL,
    pending_work_item_id uuid          NULL,

    -- Multi-step rejection flow ────────────────────────────────────────────
    postback_token       text          NULL,  -- HMAC token stored for rpc_reject call
    origin_group_id      text          NULL,  -- original LINE groupId for outcome push

    -- Timestamps ───────────────────────────────────────────────────────────
    created_at           timestamptz   NOT NULL DEFAULT timezone('utc', now()),
    updated_at           timestamptz   NOT NULL DEFAULT timezone('utc', now()),
    expires_at           timestamptz   NOT NULL
        DEFAULT (timezone('utc', now()) + interval '24 hours'),

    CONSTRAINT fpr_line_session_group_user_uniq UNIQUE (line_group_id, line_user_id)
);

COMMENT ON TABLE public.fpr_line_session IS
    '0177: Ephemeral LINE bot session for field-purchase flow. 24-hour TTL. '
    'One row per (line_group_id, line_user_id); DM sessions use ''dm:{userId}'' as group key.';

-- updated_at auto-stamp (reuse C12 helper fn_set_updated_at from 0001)
CREATE TRIGGER trg_fpr_line_session_updated_at
BEFORE UPDATE ON public.fpr_line_session
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- (3) RLS — fail-closed; governance SELECT only; no client write path
-- ---------------------------------------------------------------------------
ALTER TABLE public.fpr_line_session ENABLE ROW LEVEL SECURITY;

-- Only governance roles may read sessions (internal diagnostics / admin UI)
CREATE POLICY fpr_session_gov_select ON public.fpr_line_session
    FOR SELECT
    USING (public.is_governance_role());

-- All writes go through SECURITY DEFINER RPCs; no client INSERT/UPDATE/DELETE
-- (no permissive write policies → fail-closed)

-- ---------------------------------------------------------------------------
-- (4) fn_expire_fpr_sessions — mark timed-out sessions as done
--     Called by a pg_cron job: SELECT fn_expire_fpr_sessions(); (hourly)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_expire_fpr_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.fpr_line_session
    SET    state      = 'done',
           updated_at = timezone('utc', now())
    WHERE  state  NOT IN ('done', 'submitted')
      AND  expires_at <= timezone('utc', now());

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_expire_fpr_sessions() FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_expire_fpr_sessions() TO service_role;

-- ---------------------------------------------------------------------------
-- (5) Message templates — 6 seeds (ON CONFLICT DO UPDATE for idempotency)
--
--   tpl_fpr_photo_received_quickreply  quick_reply  group prompt: ซื้อด่วน|เก็บรูปงาน
--   tpl_fpr_amount_prompt              text          ask for amount (THB)
--   tpl_fpr_workitem_select            quick_reply   ask for work-item or skip
--   tpl_fpr_submitted_confirmation     text          receipt for technician
--   tpl_fpr_approval_flex_card         flex          Approve/Reject bubble → approver DM
--   tpl_fpr_outcome_notification       text          group notification after decision
-- ---------------------------------------------------------------------------
INSERT INTO public.line_oa_message_templates
    (template_key, vertical_context, body, message_kind, flex_payload, is_active, audience)
VALUES

-- 5a. Quick-reply prompt after photo intercept
(
    'tpl_fpr_photo_received_quickreply',
    'installation_pm',
    'รับรูปแล้วครับ 📷 ต้องการซื้ออุปกรณ์ด่วน หรือเก็บเป็นรูปจบงานครับ?',
    'quick_reply',
    '{"items":[
        {"type":"action","action":{"type":"postback","label":"🛒 ซื้อด่วน",
            "data":"action=fpr_start","displayText":"ซื้อด่วน"}},
        {"type":"action","action":{"type":"postback","label":"📷 เก็บรูปงาน",
            "data":"action=room_proof","displayText":"เก็บรูปงาน"}}
    ]}'::jsonb,
    true, 'internal'
),

-- 5b. Amount prompt (text message; optional error slot)
(
    'tpl_fpr_amount_prompt',
    'installation_pm',
    'กรุณาพิมพ์จำนวนเงินที่ต้องการซื้อ (บาท) เช่น 1500 ครับ',
    'text',
    NULL,
    true, 'internal'
),

-- 5c. Work-item selection quick reply
--     slot_values: {"amount":"1500","work_items":[{"id":"...","name":"..."},...]}
--     Edge function builds quick-reply items from slot_values.work_items array.
(
    'tpl_fpr_workitem_select',
    'installation_pm',
    'ต้องการเชื่อมค่าใช้จ่ายนี้กับรายการงานไหนครับ? (กด ข้ามไป ถ้าไม่มี)',
    'quick_reply',
    '{"items":[
        {"type":"action","action":{"type":"postback","label":"⏭ ข้ามไป",
            "data":"action=fpr_skip_workitem","displayText":"ข้ามไป"}}
    ]}'::jsonb,
    true, 'internal'
),

-- 5d. Submission confirmation (sent to group)
--     slot_values: {"amount":"1500","request_id":"...","approval_level":"team_lead"}
(
    'tpl_fpr_submitted_confirmation',
    'installation_pm',
    'ส่งคำขอซื้อด่วน ฿{{amount}} แล้วครับ ✅ กำลังรอการอนุมัติจาก {{approval_level_th}} อยู่นะครับ',
    'text',
    NULL,
    true, 'internal'
),

-- 5e. Approval Flex Card (sent as DM to approver)
--     slot_values: {"request_id":"...","amount":"1500","reason":"...","site_code":"...",
--                   "approval_level_th":"...","approve_token":"...","iat":"..."}
--     body = LINE alt-text (shown in notification preview)
(
    'tpl_fpr_approval_flex_card',
    'installation_pm',
    'คำขอซื้อด่วน ฿{{amount}} — กรุณาอนุมัติหรือปฏิเสธครับ',
    'flex',
    '{
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#FF6B35",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": "🛒 คำขอซื้อด่วน",
                    "color": "#FFFFFF",
                    "size": "lg",
                    "weight": "bold"
                },
                {
                    "type": "text",
                    "text": "{{site_code}}",
                    "color": "#FFE0D3",
                    "size": "sm"
                }
            ]
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type":"text","text":"จำนวนเงิน","size":"sm","color":"#888888","flex":2},
                        {"type":"text","text":"฿{{amount}}","size":"sm","weight":"bold","color":"#FF6B35","flex":3}
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type":"text","text":"เหตุผล","size":"sm","color":"#888888","flex":2},
                        {"type":"text","text":"{{reason}}","size":"sm","flex":3,"wrap":true,"maxLines":2}
                    ]
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {"type":"text","text":"ระดับอนุมัติ","size":"sm","color":"#888888","flex":2},
                        {"type":"text","text":"{{approval_level_th}}","size":"sm","flex":3}
                    ]
                },
                {
                    "type": "separator",
                    "margin": "sm"
                },
                {
                    "type": "text",
                    "text": "รหัสคำขอ: {{request_id_short}}",
                    "size": "xxs",
                    "color": "#AAAAAA"
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "horizontal",
            "spacing": "sm",
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "postback",
                        "label": "✅ อนุมัติ",
                        "data": "action=fpr_approve&request_id={{request_id}}&token={{approve_token}}&iat={{iat}}"
                    },
                    "style": "primary",
                    "color": "#2ECC71",
                    "height": "sm"
                },
                {
                    "type": "button",
                    "action": {
                        "type": "postback",
                        "label": "❌ ปฏิเสธ",
                        "data": "action=fpr_reject_init&request_id={{request_id}}&token={{approve_token}}&iat={{iat}}"
                    },
                    "style": "secondary",
                    "height": "sm"
                }
            ]
        }
    }'::jsonb,
    true, 'internal'
),

-- 5f. Outcome notification (sent to group after approval OR rejection)
--     slot_values: {"outcome":"อนุมัติแล้ว ✅","amount":"1500","note":"..."}
(
    'tpl_fpr_outcome_notification',
    'installation_pm',
    'คำขอซื้อด่วน ฿{{amount}} — {{outcome}} ครับ {{note}}',
    'text',
    NULL,
    true, 'internal'
)

ON CONFLICT ON CONSTRAINT line_oa_message_templates_key_vertical_uniq
DO UPDATE SET
    body         = EXCLUDED.body,
    message_kind = EXCLUDED.message_kind,
    flex_payload = EXCLUDED.flex_payload,
    is_active    = EXCLUDED.is_active,
    audience     = EXCLUDED.audience;

-- ---------------------------------------------------------------------------
-- (6) fn_line_handle_group_event — full replacement (extends 0097)
--
--     Changes from 0097:
--       • Declares 2 new variables: v_fpr_sess record, v_fpr_amount numeric
--       • Image handler (internal group): creates/resets fpr_line_session +
--         sends tpl_fpr_photo_received_quickreply instead of calling
--         rpc_capture_ingest directly → return 'fpr_photo_intercepted'
--       • NEW block (before #ปัญหา): text intercept when session=await_amount →
--         parse amount, advance to await_workitem, send workitem select prompt
--       • ALL original 0097 join/leave/memberJoined/memberLeft/#ผูก/#ปัญหา/
--         plain_ignored paths preserved unchanged (line for line)
--
--     Signature UNCHANGED: (p_event jsonb, p_vertical text, p_actor text) RETURNS text
-- ---------------------------------------------------------------------------
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_line_handle_group_event(
    p_event    jsonb,
    p_vertical text,
    p_actor    text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- 0097 original declarations (unchanged)
    v_type          text;
    v_group_line_id text;
    v_user          text;
    v_g             record;
    v_msg_type      text;
    v_text          text;
    v_parts         text[];
    v_code          record;
    v_group_type    text;
    v_kind          text;
    v_member        jsonb;
    v_desc          text;
    v_project       record;
    v_capture_id    uuid;
    -- 0177 additions
    v_fpr_sess      record;
    v_fpr_amount    numeric;
BEGIN
    v_type          := p_event ->> 'type';
    v_group_line_id := p_event #>> '{source,groupId}';
    v_user          := p_event #>> '{source,userId}';

    SELECT g.id, g.project_id, g.group_type, g.status, g.site_code
      INTO v_g
    FROM public.line_groups g WHERE g.line_group_id = v_group_line_id;

    -- ── bot เข้ากลุ่ม ──────────────────────────────────────────────────────
    IF v_type = 'join' THEN
        IF v_g.id IS NOT NULL THEN
            RETURN 'join_already_bound';
        END IF;
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_inst_bind_prompt', '{}'::jsonb, 'group', v_group_line_id);
        RETURN 'join_prompted';
    END IF;

    -- ── bot ออก/โดนเอาออก → archive ──────────────────────────────────────
    IF v_type = 'leave' THEN
        IF v_g.id IS NOT NULL THEN
            UPDATE public.line_groups SET status = 'archived' WHERE id = v_g.id;
            RETURN 'bot_left_archived';
        END IF;
        RETURN 'bot_left_unbound';
    END IF;

    -- ── member sync ───────────────────────────────────────────────────────
    IF v_type = 'memberJoined' THEN
        IF v_g.id IS NULL THEN RETURN 'members_ignored_unbound'; END IF;
        FOR v_member IN SELECT jsonb_array_elements(
                COALESCE(p_event #> '{joined,members}', '[]'::jsonb)) LOOP
            v_kind := CASE
                WHEN EXISTS (SELECT 1 FROM public.identity_binding b
                             WHERE b.line_user_id = v_member ->> 'userId' AND b.is_active)
                    THEN 'staff'
                WHEN EXISTS (SELECT 1 FROM public.line_oa_customer_identity ci
                             WHERE ci.line_user_id = v_member ->> 'userId')
                    THEN 'customer'
                ELSE 'guest'
            END;
            INSERT INTO public.line_group_members (group_id, line_user_id, member_kind)
            VALUES (v_g.id, v_member ->> 'userId', v_kind)
            ON CONFLICT (group_id, line_user_id) WHERE left_at IS NULL DO NOTHING;
        END LOOP;
        RETURN 'members_joined';
    END IF;

    IF v_type = 'memberLeft' THEN
        IF v_g.id IS NULL THEN RETURN 'members_ignored_unbound'; END IF;
        UPDATE public.line_group_members m
           SET left_at = timezone('utc', now())
         WHERE m.group_id = v_g.id AND m.left_at IS NULL
           AND m.line_user_id IN (
               SELECT x ->> 'userId'
               FROM jsonb_array_elements(
                    COALESCE(p_event #> '{left,members}', '[]'::jsonb)) x);
        RETURN 'members_left';
    END IF;

    -- ── ข้อความในกลุ่ม ───────────────────────────────────────────────────
    IF v_type = 'message' THEN
        v_msg_type := p_event #>> '{message,type}';

        -- (ก) '#ผูก <code> <ทีม|ลูกค้า>' — ทำงานเฉพาะกลุ่มที่ยังไม่ผูก
        IF v_msg_type = 'text' AND
           btrim(COALESCE(p_event #>> '{message,text}', '')) LIKE '#ผูก%' THEN

            IF v_g.id IS NOT NULL THEN
                INSERT INTO public.line_oa_outbound_messages
                    (send_type, status, template_key, slot_values, target_type, target_id)
                VALUES ('push','pending','tpl_inst_bind_ok','{}'::jsonb,'group',v_group_line_id);
                RETURN 'bind_already_bound';
            END IF;

            v_parts      := regexp_split_to_array(btrim(p_event #>> '{message,text}'), '\s+');
            v_group_type := CASE v_parts[3]
                WHEN 'ทีม'    THEN 'internal'
                WHEN 'ลูกค้า' THEN 'customer'
            END;

            IF v_user IS NULL
               OR NOT EXISTS (SELECT 1 FROM public.identity_binding b
                              WHERE b.line_user_id = v_user AND b.is_active)
               OR array_length(v_parts, 1) < 3
               OR v_group_type IS NULL THEN
                INSERT INTO public.line_oa_outbound_messages
                    (send_type, status, template_key, slot_values, target_type, target_id)
                VALUES ('push','pending','tpl_inst_bind_fail','{}'::jsonb,'group',v_group_line_id);
                RETURN 'bind_failed_identity_or_format';
            END IF;

            SELECT c.code, c.project_id INTO v_code
            FROM public.line_bind_codes c
            WHERE c.code = v_parts[2]
              AND c.expires_at > timezone('utc', now())
              AND c.uses_left > 0
            FOR UPDATE;

            IF v_code.code IS NULL THEN
                INSERT INTO public.line_oa_outbound_messages
                    (send_type, status, template_key, slot_values, target_type, target_id)
                VALUES ('push','pending','tpl_inst_bind_fail','{}'::jsonb,'group',v_group_line_id);
                RETURN 'bind_failed_code';
            END IF;

            SELECT p.id, p.site_code, p.name INTO v_project
            FROM public.installation_projects p WHERE p.id = v_code.project_id;

            INSERT INTO public.line_groups
                (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
            VALUES (v_group_line_id, v_project.id, v_project.site_code,
                    v_group_type, p_vertical, 'line:' || v_user);
            UPDATE public.line_bind_codes SET uses_left = uses_left - 1 WHERE code = v_code.code;
            INSERT INTO public.line_group_members (group_id, line_user_id, member_kind)
            SELECT g.id, v_user, 'staff'
            FROM public.line_groups g WHERE g.line_group_id = v_group_line_id
            ON CONFLICT (group_id, line_user_id) WHERE left_at IS NULL DO NOTHING;

            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push','pending','tpl_inst_bind_ok','{}'::jsonb,'group',v_group_line_id);
            RETURN 'bound_' || v_group_type;
        END IF;

        -- ต่อจากนี้ทำงานเฉพาะกลุ่มที่ผูกแล้ว + ยัง active
        IF v_g.id IS NULL THEN RETURN 'plain_unbound_ignored'; END IF;
        IF v_g.status <> 'active' THEN RETURN 'plain_archived_ignored'; END IF;

        -- ── (ข.0) 0177: FPR amount intercept ─────────────────────────────────
        --    Text in internal group when active session is in await_amount state.
        --    Fires before #ปัญหา so technician can still type normal #ปัญหา
        --    commands from a different state.
        IF v_msg_type = 'text' AND v_g.group_type = 'internal' THEN
            SELECT s.id, s.project_id, s.site_code, s.photo_ref, s.webhook_event_id
              INTO v_fpr_sess
            FROM public.fpr_line_session s
            WHERE s.line_group_id = v_group_line_id
              AND s.line_user_id  = v_user
              AND s.state         = 'await_amount'
              AND s.expires_at    > timezone('utc', now());

            IF v_fpr_sess.id IS NOT NULL THEN
                -- Try to parse text as a positive numeric amount
                BEGIN
                    v_fpr_amount := btrim(p_event #>> '{message,text}')::numeric;
                EXCEPTION WHEN OTHERS THEN
                    v_fpr_amount := NULL;
                END;

                IF v_fpr_amount IS NULL OR v_fpr_amount <= 0 THEN
                    -- Re-prompt; do not advance state
                    INSERT INTO public.line_oa_outbound_messages
                        (send_type, status, template_key, slot_values, target_type, target_id)
                    VALUES ('push', 'pending', 'tpl_fpr_amount_prompt',
                            jsonb_build_object('hint', 'กรุณาพิมพ์เฉพาะตัวเลข เช่น 1500'),
                            'group', v_group_line_id);
                    RETURN 'fpr_amount_invalid';
                END IF;

                -- Advance session: await_amount → await_workitem
                UPDATE public.fpr_line_session
                   SET state          = 'await_workitem',
                       pending_amount = v_fpr_amount,
                       updated_at     = timezone('utc', now())
                 WHERE id = v_fpr_sess.id;

                -- Send workitem select prompt; slot_values carries project_id so
                -- the edge function can query available work items and append
                -- quick-reply items to the base template items array.
                INSERT INTO public.line_oa_outbound_messages
                    (send_type, status, template_key, slot_values, target_type, target_id)
                VALUES ('push', 'pending', 'tpl_fpr_workitem_select',
                        jsonb_build_object(
                            'amount',     v_fpr_amount,
                            'project_id', v_fpr_sess.project_id,
                            'group_id',   v_group_line_id,
                            'user_id',    v_user
                        ),
                        'group', v_group_line_id);

                RETURN 'fpr_amount_captured';
            END IF;
        END IF;
        -- ── end FPR amount intercept ─────────────────────────────────────────

        -- (ข) '#ปัญหา <ข้อความ>' — เฉพาะกลุ่ม internal
        IF v_msg_type = 'text' AND v_g.group_type = 'internal'
           AND btrim(COALESCE(p_event #>> '{message,text}', '')) LIKE '#ปัญหา%' THEN

            v_desc := btrim(substr(btrim(p_event #>> '{message,text}'), length('#ปัญหา') + 1));
            IF v_desc = '' THEN RETURN 'issue_empty_ignored'; END IF;

            INSERT INTO public.installation_issues
                (project_id, site_code, source, reported_by, line_user_id, description)
            VALUES (v_g.project_id, v_g.site_code, 'line_group',
                    'line:' || COALESCE(v_user, 'unknown'), v_user, v_desc);

            SELECT p.name, p.foreman_employee_id INTO v_project
            FROM public.installation_projects p WHERE p.id = v_g.project_id;

            IF v_project.foreman_employee_id IS NOT NULL THEN
                PERFORM public.rpc_dispatch_notification(
                    jsonb_build_object('employee_id', v_project.foreman_employee_id),
                    'personal_responsibility', 'field_issue', 'tpl_inst_issue_alert',
                    jsonb_build_object('project_name', v_project.name, 'detail', left(v_desc, 80)),
                    false, null, true, null, v_g.site_code);
            END IF;

            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push','pending','tpl_inst_issue_ack','{}'::jsonb,'group',v_group_line_id);
            RETURN 'issue_created';
        END IF;

        -- ── (ค) 0177: รูปในกลุ่ม internal → FPR quick-reply intercept ────────
        --    Replaces 0097's direct rpc_capture_ingest call.
        --    Technician chooses: "🛒 ซื้อด่วน" → fpr_start postback
        --                        "📷 เก็บรูปงาน" → room_proof postback → capture
        IF v_msg_type = 'image' AND v_g.group_type = 'internal' THEN
            -- Create or reset session (new photo always resets to await_confirm)
            INSERT INTO public.fpr_line_session
                (line_group_id, line_user_id, state, photo_ref, webhook_event_id,
                 project_id, site_code, expires_at)
            VALUES
                (v_group_line_id, v_user, 'await_confirm',
                 p_event #>> '{message,id}',
                 p_event ->> 'webhookEventId',
                 v_g.project_id, v_g.site_code,
                 timezone('utc', now()) + interval '24 hours')
            ON CONFLICT ON CONSTRAINT fpr_line_session_group_user_uniq DO UPDATE SET
                state            = 'await_confirm',
                photo_ref        = EXCLUDED.photo_ref,
                webhook_event_id = EXCLUDED.webhook_event_id,
                project_id       = EXCLUDED.project_id,
                site_code        = EXCLUDED.site_code,
                pending_amount   = NULL,
                pending_request_id    = NULL,
                pending_work_item_id  = NULL,
                postback_token   = NULL,
                origin_group_id  = NULL,
                updated_at       = timezone('utc', now()),
                expires_at       = timezone('utc', now()) + interval '24 hours';

            -- Quick-reply prompt
            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push', 'pending', 'tpl_fpr_photo_received_quickreply',
                    jsonb_build_object('message_id', p_event #>> '{message,id}'),
                    'group', v_group_line_id);

            RETURN 'fpr_photo_intercepted';
        END IF;

        -- (ง) แชทธรรมดา/สื่ออื่น → ไม่เก็บ (PDPA v1 — §8)
        RETURN 'plain_ignored';
    END IF;

    RETURN 'ignored_event_type';

EXCEPTION
    WHEN OTHERS THEN
        -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว
        RETURN 'handler_error:' || SQLERRM;
END;
$$;

SET check_function_bodies = on;

REVOKE ALL ON FUNCTION public.fn_line_handle_group_event(jsonb, text, text) FROM public;

COMMENT ON FUNCTION public.fn_line_handle_group_event(jsonb, text, text) IS
    '0177 (extends 0097): image → fpr_line_session + quick-reply; '
    'text+await_amount → amount capture; all 0097 paths preserved. '
    'Signature unchanged: (p_event jsonb, p_vertical text, p_actor text) RETURNS text.';

-- ---------------------------------------------------------------------------
-- (7) rpc_route_fpr_approval_notification
--     Resolves approver LINE UID → signs HMAC → queues flex card DM push.
--     Called by rpc_handle_fpr_postback after successful rpc_create.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_route_fpr_approval_notification(
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req            record;
    v_role_key       text;
    v_employee_id    text;
    v_approver_uid   text;
    v_iat            bigint;
    v_msg_to_sign    text;
    v_token          text;
    v_level_th       text;
    v_request_short  text;
    v_slot_values    jsonb;
BEGIN
    -- 1. Load request
    SELECT r.project_id, r.amount, r.reason, r.site_code, r.approval_level, r.requester
      INTO v_req
    FROM public.field_purchase_request r
    WHERE r.id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
    END IF;

    -- 2. Resolve role_key for this approval level
    SELECT t.role_key INTO v_role_key
    FROM public.field_purchase_thresholds t
    WHERE t.level = v_req.approval_level;

    IF v_role_key IS NULL THEN
        v_role_key := 'managing_director';
    END IF;

    -- 3. Find approver employee via installation_memberships (project-level role)
    SELECT im.employee_id INTO v_employee_id
    FROM public.installation_memberships im
    WHERE im.project_id = v_req.project_id
      AND im.role_key   = v_role_key
    LIMIT 1;

    IF v_employee_id IS NULL THEN
        -- Fallback: any managing_director with site access
        SELECT im.employee_id INTO v_employee_id
        FROM public.installation_memberships im
        WHERE im.role_key = 'managing_director'
        LIMIT 1;
    END IF;

    IF v_employee_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_approver_found',
                                  'role_key', v_role_key);
    END IF;

    -- 4. Resolve approver LINE UID (ADR-038: identity_binding)
    SELECT ib.line_user_id INTO v_approver_uid
    FROM public.identity_binding ib
    WHERE ib.employee_id = v_employee_id
      AND ib.is_active
    LIMIT 1;

    IF v_approver_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'approver_no_line_identity',
                                  'employee_id', v_employee_id);
    END IF;

    -- 5. Generate HMAC token (ADR-031)
    --    Sign: 'fpr:{request_id}:fpr_approve:{iat}'  (same pattern for approve + reject_init)
    v_iat         := extract(epoch from timezone('utc', now()))::bigint;
    v_msg_to_sign := 'fpr:' || p_request_id::text || ':fpr_approve:' || v_iat::text;
    v_token       := encode(
        hmac(v_msg_to_sign::bytea,
             current_setting('app.line_channel_secret')::bytea,
             'sha256'),
        'hex'
    );

    -- 6. Thai label for approval level
    v_level_th := CASE v_req.approval_level::text
        WHEN 'team_lead'         THEN 'หัวหน้าทีม'
        WHEN 'project_manager'   THEN 'ผู้จัดการโครงการ'
        WHEN 'managing_director' THEN 'กรรมการผู้จัดการ'
        ELSE v_req.approval_level::text
    END;

    -- Short request ID for card footer (first 8 chars)
    v_request_short := left(p_request_id::text, 8);

    -- 7. Slot values for the flex card template
    v_slot_values := jsonb_build_object(
        'request_id',       p_request_id,
        'request_id_short', v_request_short,
        'amount',           to_char(v_req.amount, 'FM999,999,990.00'),
        'reason',           left(COALESCE(v_req.reason, ''), 60),
        'site_code',        v_req.site_code,
        'approval_level_th', v_level_th,
        'approve_token',    v_token,
        'iat',              v_iat::text
    );

    -- 8. Queue flex card push to approver DM (target_type='user')
    INSERT INTO public.line_oa_outbound_messages
        (send_type, status, template_key, slot_values, target_type, target_id)
    VALUES ('push', 'pending', 'tpl_fpr_approval_flex_card',
            v_slot_values, 'user', v_approver_uid);

    RETURN jsonb_build_object(
        'ok',                true,
        'approver_uid',      v_approver_uid,
        'employee_id',       v_employee_id,
        'iat',               v_iat,
        'token_preview',     left(v_token, 8) || '...'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_route_fpr_approval_notification(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_route_fpr_approval_notification(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_route_fpr_approval_notification(uuid) IS
    '0177: Resolve approver LINE UID → HMAC sign (ADR-031) → queue tpl_fpr_approval_flex_card push. '
    'Called after rpc_create_field_purchase_request. Returns approver UID and token preview.';

-- ---------------------------------------------------------------------------
-- (8) rpc_handle_fpr_postback — single postback router
--
--     Actions:
--       fpr_start          user tapped "🛒 ซื้อด่วน" → advance to await_amount
--       room_proof         user tapped "📷 เก็บรูปงาน" → call rpc_capture_ingest
--       fpr_workitem_select  work item tapped → submit request
--       fpr_skip_workitem  skip work item → submit request (work_item_id=NULL)
--       fpr_approve        approver tapped ✅ → pass token to rpc_approve
--       fpr_reject_init    approver tapped ❌ → HMAC validate → DM session
--       fpr_reject_note    approver typed rejection note in DM → rpc_reject
--
--     Called by the LINE webhook Edge Function for postback events.
--     For fpr_approve / fpr_reject: the postback data carries
--       "action=fpr_approve&request_id=...&token=...&iat=..."
--     Edge Function should parse this into p_params JSON before calling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_handle_fpr_postback(
    p_action           text,
    p_line_user_id     text,
    p_line_group_id    text    DEFAULT NULL,
    p_webhook_event_id text    DEFAULT NULL,
    p_params           jsonb   DEFAULT NULL,
    p_message_text     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sess           record;    -- fpr_line_session row
    v_req_result     jsonb;     -- rpc_create result
    v_approve_result jsonb;     -- rpc_approve / rpc_reject result
    v_route_result   jsonb;     -- rpc_route_fpr_approval_notification result
    v_request_id     uuid;
    v_work_item_id   uuid;
    v_capture_id     uuid;
    v_dm_group_key   text;      -- 'dm:{line_user_id}' synthetic key
    v_origin_group   text;      -- original LINE groupId for outcome push
    v_postback_token text;
    v_iat_val        bigint;
    v_msg_to_sign    text;
    v_expected_hmac  text;
    v_outcome_text   text;
    v_note_text      text;
    v_amount_text    text;
BEGIN
    -- ── fpr_start: user confirmed purchase intent ────────────────────────
    IF p_action = 'fpr_start' THEN
        -- Fetch session in await_confirm for this user+group
        SELECT s.id, s.project_id, s.site_code, s.photo_ref, s.webhook_event_id
          INTO v_sess
        FROM public.fpr_line_session s
        WHERE s.line_group_id = p_line_group_id
          AND s.line_user_id  = p_line_user_id
          AND s.state         = 'await_confirm'
          AND s.expires_at    > timezone('utc', now());

        IF v_sess.id IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'no_active_session_fpr_start');
        END IF;

        -- Advance: await_confirm → await_amount
        UPDATE public.fpr_line_session
           SET state      = 'await_amount',
               updated_at = timezone('utc', now())
         WHERE id = v_sess.id;

        -- Prompt for amount
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_fpr_amount_prompt',
                '{}'::jsonb, 'group', p_line_group_id);

        RETURN jsonb_build_object('ok', true, 'action', 'fpr_start', 'next', 'await_amount');
    END IF;

    -- ── room_proof: user chose regular photo capture ─────────────────────
    IF p_action = 'room_proof' THEN
        SELECT s.id, s.photo_ref, s.webhook_event_id, s.site_code
          INTO v_sess
        FROM public.fpr_line_session s
        WHERE s.line_group_id = p_line_group_id
          AND s.line_user_id  = p_line_user_id
          AND s.state         IN ('await_confirm', 'await_amount')
          AND s.expires_at    > timezone('utc', now());

        IF v_sess.id IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'no_active_session_room_proof');
        END IF;

        -- Delegate to original capture flow
        v_capture_id := public.rpc_capture_ingest(
            'installation_room_proof', 'line',
            'line-message://' || COALESCE(v_sess.photo_ref, 'unknown'),
            COALESCE(v_sess.webhook_event_id, p_webhook_event_id),
            v_sess.site_code
        );

        -- Mark session done
        UPDATE public.fpr_line_session
           SET state      = 'done',
               updated_at = timezone('utc', now())
         WHERE id = v_sess.id;

        -- Standard photo ack
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_inst_photo_ack',
                '{}'::jsonb, 'group', p_line_group_id);

        RETURN jsonb_build_object('ok', true, 'action', 'room_proof',
                                  'capture_id', v_capture_id);
    END IF;

    -- ── fpr_workitem_select / fpr_skip_workitem: submit request ──────────
    IF p_action IN ('fpr_workitem_select', 'fpr_skip_workitem') THEN
        SELECT s.id, s.project_id, s.site_code, s.photo_ref, s.webhook_event_id,
               s.pending_amount
          INTO v_sess
        FROM public.fpr_line_session s
        WHERE s.line_group_id = p_line_group_id
          AND s.line_user_id  = p_line_user_id
          AND s.state         = 'await_workitem'
          AND s.expires_at    > timezone('utc', now());

        IF v_sess.id IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'no_active_session_workitem');
        END IF;

        IF p_action = 'fpr_workitem_select' AND p_params ? 'work_item_id' THEN
            v_work_item_id := (p_params->>'work_item_id')::uuid;
        ELSE
            v_work_item_id := NULL;
        END IF;

        -- Create the field purchase request
        v_req_result := public.rpc_create_field_purchase_request(
            p_project_id      => v_sess.project_id,
            p_amount          => v_sess.pending_amount,
            p_reason          => COALESCE(p_params->>'reason',
                                          'คำขอซื้อด่วนจาก LINE group'),
            p_photo_refs      => jsonb_build_array(
                                     'line-message://' || COALESCE(v_sess.photo_ref, 'unknown')),
            p_work_item_id    => v_work_item_id,
            p_line_message_id => v_sess.photo_ref,
            p_idempotency_key => 'line:' || COALESCE(v_sess.webhook_event_id,
                                                      v_sess.photo_ref, gen_random_uuid()::text)
        );

        v_request_id := (v_req_result->>'request_id')::uuid;
        v_amount_text := to_char(v_sess.pending_amount, 'FM999,999,990.00');

        -- Advance session: await_workitem → submitted
        UPDATE public.fpr_line_session
           SET state              = 'submitted',
               pending_request_id = v_request_id,
               pending_work_item_id = v_work_item_id,
               updated_at         = timezone('utc', now())
         WHERE id = v_sess.id;

        -- Submitted confirmation to group
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_fpr_submitted_confirmation',
                jsonb_build_object(
                    'amount',           v_amount_text,
                    'request_id',       v_request_id,
                    'approval_level',   v_req_result->>'approval_level',
                    'approval_level_th', CASE v_req_result->>'approval_level'
                        WHEN 'team_lead'         THEN 'หัวหน้าทีม'
                        WHEN 'project_manager'   THEN 'ผู้จัดการโครงการ'
                        WHEN 'managing_director' THEN 'กรรมการผู้จัดการ'
                        ELSE v_req_result->>'approval_level'
                    END
                ),
                'group', p_line_group_id);

        -- Route approval notification to approver DM
        v_route_result := public.rpc_route_fpr_approval_notification(v_request_id);

        RETURN jsonb_build_object(
            'ok',           true,
            'action',       p_action,
            'request_id',   v_request_id,
            'create_result', v_req_result,
            'route_result',  v_route_result
        );
    END IF;

    -- ── fpr_approve: approver tapped ✅ ──────────────────────────────────
    --    p_params: {"request_id":"...","token":"...","iat":"..."}
    --    HMAC validation happens INSIDE rpc_approve_field_purchase_request (ADR-031).
    --    We just pass the token through — no duplicate validation here.
    IF p_action = 'fpr_approve' THEN
        IF NOT (p_params ? 'request_id' AND p_params ? 'token') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'missing_approve_params');
        END IF;

        v_request_id     := (p_params->>'request_id')::uuid;
        v_postback_token := p_params->>'token';

        -- Verify token has not expired (belt-and-suspenders; full validation in rpc_approve)
        v_iat_val := COALESCE((p_params->>'iat')::bigint, 0);
        IF v_iat_val + 86400 < extract(epoch from timezone('utc', now()))::bigint THEN
            RETURN jsonb_build_object('ok', false, 'error', 'token_expired');
        END IF;

        v_approve_result := public.rpc_approve_field_purchase_request(
            p_request_id     => v_request_id,
            p_postback_token => v_postback_token
        );

        -- Find the original internal LINE group for this project
        SELECT g.line_group_id INTO v_origin_group
        FROM public.field_purchase_request r
        JOIN public.line_groups g
          ON g.project_id = r.project_id
         AND g.group_type = 'internal'
         AND g.status     = 'active'
        WHERE r.id = v_request_id
        LIMIT 1;

        IF v_origin_group IS NOT NULL THEN
            SELECT to_char(r.amount, 'FM999,999,990.00') INTO v_amount_text
            FROM public.field_purchase_request r WHERE r.id = v_request_id;

            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push', 'pending', 'tpl_fpr_outcome_notification',
                    jsonb_build_object(
                        'amount',  v_amount_text,
                        'outcome', 'อนุมัติแล้ว ✅',
                        'note',    ''
                    ),
                    'group', v_origin_group);
        END IF;

        RETURN jsonb_build_object('ok', true, 'action', 'fpr_approve',
                                  'result', v_approve_result);
    END IF;

    -- ── fpr_reject_init: approver tapped ❌ ──────────────────────────────
    --    Inline HMAC validation here (before creating a DM session).
    --    The stored token is passed to rpc_reject later in fpr_reject_note.
    IF p_action = 'fpr_reject_init' THEN
        IF NOT (p_params ? 'request_id' AND p_params ? 'token' AND p_params ? 'iat') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'missing_reject_init_params');
        END IF;

        v_request_id     := (p_params->>'request_id')::uuid;
        v_postback_token := p_params->>'token';
        v_iat_val        := (p_params->>'iat')::bigint;

        -- Expiry check (24h window)
        IF v_iat_val + 86400 < extract(epoch from timezone('utc', now()))::bigint THEN
            RETURN jsonb_build_object('ok', false, 'error', 'token_expired');
        END IF;

        -- Inline HMAC validation: recompute against original signing pattern
        v_msg_to_sign   := 'fpr:' || v_request_id::text || ':fpr_approve:' || v_iat_val::text;
        v_expected_hmac := encode(
            hmac(v_msg_to_sign::bytea,
                 current_setting('app.line_channel_secret')::bytea,
                 'sha256'),
            'hex'
        );

        IF v_expected_hmac <> v_postback_token THEN
            RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
        END IF;

        -- Find original group for later outcome notification
        SELECT g.line_group_id INTO v_origin_group
        FROM public.field_purchase_request r
        JOIN public.line_groups g
          ON g.project_id = r.project_id
         AND g.group_type = 'internal'
         AND g.status     = 'active'
        WHERE r.id = v_request_id
        LIMIT 1;

        -- Create await_reject_note session in DM space ('dm:{userId}')
        v_dm_group_key := 'dm:' || p_line_user_id;

        INSERT INTO public.fpr_line_session
            (line_group_id, line_user_id, state, pending_request_id,
             postback_token, origin_group_id, expires_at)
        VALUES
            (v_dm_group_key, p_line_user_id, 'await_reject_note', v_request_id,
             v_postback_token, v_origin_group,
             timezone('utc', now()) + interval '30 minutes')
        ON CONFLICT ON CONSTRAINT fpr_line_session_group_user_uniq DO UPDATE SET
            state              = 'await_reject_note',
            pending_request_id = EXCLUDED.pending_request_id,
            postback_token     = EXCLUDED.postback_token,
            origin_group_id    = EXCLUDED.origin_group_id,
            updated_at         = timezone('utc', now()),
            expires_at         = timezone('utc', now()) + interval '30 minutes';

        -- DM approver: ask for rejection note
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_fpr_outcome_notification',
                jsonb_build_object(
                    'amount',  '',
                    'outcome', 'กรุณาพิมพ์เหตุผลการปฏิเสธ (ส่งมาใน chat นี้ได้เลยครับ) 🙏',
                    'note',    ''
                ),
                'user', p_line_user_id);

        RETURN jsonb_build_object('ok', true, 'action', 'fpr_reject_init',
                                  'dm_key', v_dm_group_key);
    END IF;

    -- ── fpr_reject_note: approver typed rejection note in DM ─────────────
    --    Called by Edge Function when DM text arrives from a user with an
    --    active await_reject_note session. p_line_group_id is NULL for DM.
    IF p_action = 'fpr_reject_note' THEN
        -- Find DM session by synthetic key
        v_dm_group_key := 'dm:' || p_line_user_id;

        SELECT s.id, s.pending_request_id, s.postback_token, s.origin_group_id
          INTO v_sess
        FROM public.fpr_line_session s
        WHERE s.line_group_id = v_dm_group_key
          AND s.line_user_id  = p_line_user_id
          AND s.state         = 'await_reject_note'
          AND s.expires_at    > timezone('utc', now());

        IF v_sess.id IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'no_active_reject_session');
        END IF;

        v_note_text := btrim(COALESCE(p_message_text, ''));
        IF char_length(v_note_text) < 3 THEN
            -- Too short; re-prompt
            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push', 'pending', 'tpl_fpr_outcome_notification',
                    jsonb_build_object(
                        'amount',  '',
                        'outcome', 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษรครับ 🙏',
                        'note',    ''
                    ),
                    'user', p_line_user_id);
            RETURN jsonb_build_object('ok', false, 'error', 'note_too_short');
        END IF;

        -- Call rpc_reject (HMAC validation + actor authority check inside)
        v_approve_result := public.rpc_reject_field_purchase_request(
            p_request_id     => v_sess.pending_request_id,
            p_rejection_note => v_note_text,
            p_postback_token => v_sess.postback_token
        );

        -- Mark DM session done
        UPDATE public.fpr_line_session
           SET state      = 'done',
               updated_at = timezone('utc', now())
         WHERE id = v_sess.id;

        -- Confirm to approver DM
        INSERT INTO public.line_oa_outbound_messages
            (send_type, status, template_key, slot_values, target_type, target_id)
        VALUES ('push', 'pending', 'tpl_fpr_outcome_notification',
                jsonb_build_object(
                    'amount',  '',
                    'outcome', 'บันทึกการปฏิเสธเรียบร้อยแล้วครับ ✅',
                    'note',    ''
                ),
                'user', p_line_user_id);

        -- Notify original group (if traceable)
        IF v_sess.origin_group_id IS NOT NULL THEN
            SELECT to_char(r.amount, 'FM999,999,990.00') INTO v_amount_text
            FROM public.field_purchase_request r
            WHERE r.id = v_sess.pending_request_id;

            INSERT INTO public.line_oa_outbound_messages
                (send_type, status, template_key, slot_values, target_type, target_id)
            VALUES ('push', 'pending', 'tpl_fpr_outcome_notification',
                    jsonb_build_object(
                        'amount',  v_amount_text,
                        'outcome', 'ปฏิเสธแล้ว ❌',
                        'note',    '(' || left(v_note_text, 40) || ')'
                    ),
                    'group', v_sess.origin_group_id);
        END IF;

        RETURN jsonb_build_object('ok', true, 'action', 'fpr_reject_note',
                                  'result', v_approve_result);
    END IF;

    -- ── unknown action ────────────────────────────────────────────────────
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_action', 'action', p_action);

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'action', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_handle_fpr_postback(text, text, text, text, jsonb, text)
    FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_handle_fpr_postback(text, text, text, text, jsonb, text)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_handle_fpr_postback(text, text, text, text, jsonb, text) IS
    '0177: LINE postback router for FPR flow. '
    'Actions: fpr_start / room_proof / fpr_workitem_select / fpr_skip_workitem / '
    'fpr_approve / fpr_reject_init / fpr_reject_note. '
    'Called by LINE webhook Edge Function for postback events. Returns jsonb {ok, ...}.';

-- ---------------------------------------------------------------------------
-- GRANT — service_role full access to session table (Edge Function DM lookup)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.fpr_line_session TO service_role;
-- authenticated has NO direct table access (fail-closed; all writes via RPC)

-- ---------------------------------------------------------------------------
-- Guardrail G1 update: allow FPR templates into unbound groups? No —
-- tpl_fpr_* templates have audience='internal', so the existing guardrail
-- already blocks them from customer groups. No change needed.
-- ---------------------------------------------------------------------------
