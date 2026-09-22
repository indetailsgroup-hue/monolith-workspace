-- Append-only migration after main fbaf046a: 20270327 -> 20270328.
-- Preserve the effective 0177 group handler; add only its final text acknowledgement.
-- Existing command/FPR paths and guard definitions are retained.
-- RPC group receipt uses the group's org_id and an empty payload for plain ack dedupe.
-- This is an unmerged PR migration, not a repair to a deployed migration.

insert into public.line_oa_message_templates (org_id, template_key, vertical_context, body, is_active, audience, message_kind) values
('00000000-0000-0000-0000-000000000000'::uuid, 'tpl_inst_group_ack', null,
   'รับข้อความแล้วครับ หากต้องการให้ Monolith ดำเนินการ พิมพ์ #ช่วยเหลือ หรือใช้คำสั่งงานได้เลยครับ',
   true, 'both', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

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
        -- BEGIN plain-ack port
        IF v_msg_type = 'text' THEN
            INSERT INTO public.line_oa_outbound_messages
                (org_id, send_type, status, template_key, slot_values, target_type, target_id)
            SELECT g.org_id, 'push', 'pending', 'tpl_inst_group_ack', '{}'::jsonb,
                   'group', v_group_line_id
            FROM public.line_groups g
            WHERE g.id = v_g.id AND g.status = 'active';
            IF FOUND THEN RETURN 'plain_ack_staged'; END IF;
        END IF;
        -- END plain-ack port
        RETURN 'plain_ignored';
    END IF;

    RETURN 'ignored_event_type';

EXCEPTION
    WHEN OTHERS THEN
        -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว
        RETURN 'handler_error:' || SQLERRM;
END;
$$;

create or replace function public.rpc_ingest_line_webhook(
  p_raw_body text,
  p_signature text,
  p_channel_identifier text,
  out accepted boolean,
  out reason text,
  out events_processed integer,
  out events_duplicate integer,
  out events_skipped integer
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vertical_context     text;
  v_token_ref            text;     -- resolved but intentionally unused here (never exposed)
  v_verified             boolean;
  v_actor                text;
  v_payload              jsonb;
  v_events               jsonb;
  v_event                jsonb;
  v_webhook_event_id     text;
  v_line_user_id         text;
  v_conversation_id      uuid;
  v_conv_site_code       text;
  v_inbound_id           uuid;
  v_customer_id          uuid;
  v_identity_id          uuid;
  v_identity_created     boolean;
  -- 1.8b group branch (0097)
  v_group_id             text;
  v_group_result         text;
  v_org_id               uuid;
begin
  -- Initialize OUT counters.
  accepted         := false;
  reason           := null;
  events_processed := 0;
  events_duplicate := 0;
  events_skipped   := 0;

  -- -------------------------------------------------------------------------
  -- (1) Resolve the channel to its Vertical_Context (+ token reference, unused).
  -- Unknown/inactive channel raises P0002 with no secret in the message; the
  -- Edge Function maps this to a 4xx rejection (Req 1.1, 1.6).
  -- -------------------------------------------------------------------------
  select r.vertical_context, r.channel_access_token_ref
    into v_vertical_context, v_token_ref
  from public.line_oa_resolve_channel(p_channel_identifier) r;

  -- Resolve the audit actor from the request context, never from client input
  -- (Req 12.5, 13.1).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- (2) Verify the LINE_Signature BEFORE any further processing (Req 1.2). The
  -- secret stays inside the helper. A missing/mismatched signature is rejected
  -- with a single rejection audit entry and NO persistence/side effects
  -- (Req 1.3, 1.4).
  -- -------------------------------------------------------------------------
  v_verified := public.line_oa_verify_signature(p_channel_identifier, p_raw_body, p_signature);

  if not v_verified then
    insert into public.line_oa_audit_log (
      event_type, vertical_context, site_code, entity_ref, performed_by
    )
    values (
      'webhook_rejected_signature',
      v_vertical_context,
      null,
      format('channel_identifier:%s|reason:signature_invalid', p_channel_identifier),
      v_actor
    );
    accepted := false;
    reason   := 'signature_invalid';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- (3) Parse the now-authenticated body. The signature already proves the body
  -- is genuine LINE JSON; guard the cast defensively and record a distinct
  -- rejection if it is malformed.
  -- -------------------------------------------------------------------------
  begin
    v_payload := p_raw_body::jsonb;
  exception
    when others then
      insert into public.line_oa_audit_log (
        event_type, vertical_context, site_code, entity_ref, performed_by
      )
      values (
        'webhook_rejected_malformed',
        v_vertical_context,
        null,
        format('channel_identifier:%s|reason:malformed_payload', p_channel_identifier),
        v_actor
      );
      accepted := false;
      reason   := 'malformed_payload';
      return;
  end;

  -- Normalize to a LINE events array. A standard LINE delivery carries
  -- {"destination":..., "events":[...]}; tolerate a single bare event object too.
  if jsonb_typeof(v_payload -> 'events') = 'array' then
    v_events := v_payload -> 'events';
  elsif v_payload ? 'webhookEventId' then
    v_events := jsonb_build_array(v_payload);
  else
    v_events := '[]'::jsonb;
  end if;

  -- -------------------------------------------------------------------------
  -- (4) Process each event idempotently.
  -- -------------------------------------------------------------------------
  for v_event in select jsonb_array_elements(v_events) loop
    v_webhook_event_id := v_event ->> 'webhookEventId';
    v_line_user_id     := v_event #>> '{source,userId}';

    -- -----------------------------------------------------------------------
    -- 1.8b (0097): group events แยกเส้นทางจาก 1:1 conversation ทั้งหมด
    -- (เดิม: event ไม่มี userId ถูก skip — join/memberJoined/memberLeft ของกลุ่มไม่มี userId)
    -- PDPA v1: เก็บ inbound row เฉพาะ event ที่ระบบทำงานด้วย (join/bind/member/รูป/#ปัญหา)
    -- แชทธรรมดาไม่เก็บ — ไม่มี side effect จึง redeliver ได้ปลอดภัยโดยไม่มีแถว idempotency
    -- -----------------------------------------------------------------------
    v_group_id := v_event #>> '{source,groupId}';
    if v_group_id is not null then
      select coalesce(g.org_id, '00000000-0000-0000-0000-000000000000'::uuid)
        into v_org_id
      from public.line_groups g
      where g.line_group_id = v_group_id;
      v_org_id := coalesce(v_org_id, '00000000-0000-0000-0000-000000000000'::uuid);
      if v_webhook_event_id is null or length(btrim(v_webhook_event_id)) = 0 then
        events_skipped := events_skipped + 1;
        continue;
      end if;
      if exists (select 1 from public.line_oa_inbound_messages m
                 where m.webhook_event_id = v_webhook_event_id) then
        events_duplicate := events_duplicate + 1;
        continue;
      end if;
      begin
        v_group_result := public.fn_line_handle_group_event(v_event, v_vertical_context, v_actor);

        if v_group_result in ('plain_ignored', 'plain_unbound_ignored', 'plain_archived_ignored',
                              'members_ignored_unbound', 'ignored_event_type', 'issue_empty_ignored') then
          events_skipped := events_skipped + 1;
        else
          insert into public.line_oa_inbound_messages (
            org_id, conversation_id, webhook_event_id, payload, received_at, source_type, line_group_id
          )
          values (
            v_org_id, null, v_webhook_event_id,
            case when v_group_result = 'plain_ack_staged' then '{}'::jsonb else v_event end,
            timezone('utc', now()), 'group', v_group_id
          );

          insert into public.line_oa_audit_log (
            org_id, event_type, vertical_context, site_code, entity_ref, performed_by
          )
          values (
            v_org_id, 'group_event', v_vertical_context, null,
            format('webhook_event_id:%s|line_group_id:%s|result:%s', v_webhook_event_id, v_group_id, v_group_result),
            v_actor
          );
          events_processed := events_processed + 1;
        end if;
      exception
        when unique_violation then
          events_duplicate := events_duplicate + 1;
      end;
      continue;
    end if;

    -- An event without a stable id or a user we can key a conversation by is not
    -- ingestible in this wave (e.g. a console verify ping). Skip without error.
    if v_webhook_event_id is null or length(btrim(v_webhook_event_id)) = 0
       or v_line_user_id is null or length(btrim(v_line_user_id)) = 0 then
      events_skipped := events_skipped + 1;
      continue;
    end if;

    -- Idempotency fast path for sequential redelivery: if this webhook_event_id
    -- was already ingested, acknowledge with NO side effects (Req 2.2, 2.3, 2.4).
    if exists (
      select 1
        from public.line_oa_inbound_messages m
       where m.webhook_event_id = v_webhook_event_id
    ) then
      events_duplicate := events_duplicate + 1;
      continue;
    end if;

    -- Per-event SAVEPOINT: all side effects for this event are atomic. A concurrent
    -- redelivery that loses the race on the inbound UNIQUE(webhook_event_id) (or on
    -- the conversations live partial-unique) raises unique_violation; the nested
    -- block rolls back to the savepoint so no orphan conversation/message remains,
    -- and we record it as a duplicate (Req 2.4, 2.5).
    begin
      -- Route to the single live conversation for (line_user_id, vertical_context),
      -- or create a new site_unresolved one with a NULL site_code (Req 3.1-3.3).
      -- 'closed' conversations are excluded, so an auto-closed thread is never
      -- reopened — a new one is created instead (Req 3.8).
      select c.id, c.site_code
        into v_conversation_id, v_conv_site_code
      from public.line_oa_conversations c
      where c.line_user_id = v_line_user_id
        and c.vertical_context = v_vertical_context
        and c.status <> 'closed'
      order by c.last_activity_at desc
      limit 1;

      if v_conversation_id is null then
        insert into public.line_oa_conversations (
          line_user_id, vertical_context, site_code, status, last_activity_at
        )
        values (
          v_line_user_id, v_vertical_context, null, 'site_unresolved', timezone('utc', now())
        )
        returning id, site_code into v_conversation_id, v_conv_site_code;
      else
        -- Keep the conversation live and bump the Session_Timeout clock (Req 3.3).
        update public.line_oa_conversations
           set last_activity_at = timezone('utc', now())
         where id = v_conversation_id;
      end if;

      -- Persist the Inbound_Message (Req 3.1). No ON CONFLICT clause: a duplicate
      -- webhook_event_id raises unique_violation, handled below as a redelivery.
      insert into public.line_oa_inbound_messages (
        conversation_id, webhook_event_id, payload, received_at
      )
      values (
        v_conversation_id, v_webhook_event_id, v_event, timezone('utc', now())
      )
      returning id into v_inbound_id;

      -- Resolve (or create) the single CustomerIdentity binding for this user +
      -- vertical and associate the conversation's customer (Req 6.1).
      select ci.customer_id, ci.identity_id, ci.created
        into v_customer_id, v_identity_id, v_identity_created
      from public.line_oa_resolve_customer_identity(v_line_user_id, v_vertical_context) ci;

      -- Exactly one audit receipt per first-time webhook_event_id (Req 1.7, 13.1).
      -- entity_ref is composed from non-secret identifiers only (Req 13.3). site_code
      -- is the conversation's (NULL while site_unresolved).
      insert into public.line_oa_audit_log (
        event_type, vertical_context, site_code, entity_ref, performed_by
      )
      values (
        'webhook_inbound_received',
        v_vertical_context,
        v_conv_site_code,
        format(
          'webhook_event_id:%s|conversation_id:%s|inbound_id:%s|line_user_id:%s|customer_id:%s|identity_created:%s',
          v_webhook_event_id, v_conversation_id, v_inbound_id, v_line_user_id, v_customer_id, v_identity_created
        ),
        v_actor
      );

      events_processed := events_processed + 1;

    exception
      when unique_violation then
        -- A concurrent delivery of the same webhook_event_id (or a concurrent new
        -- conversation for the same live key) won the race. The savepoint rolls back
        -- this event's partial work, so the single-delivery state is preserved with
        -- no duplicate rows (Req 2.3, 2.4, 2.5).
        events_duplicate := events_duplicate + 1;
    end;
  end loop;

  -- A verified delivery is accepted; per-event receipts above record the detail.
  accepted := true;
  reason   := 'accepted';
  return;
end;
$$;


set check_function_bodies = on;

comment on function public.rpc_ingest_line_webhook(text, text, text) is
  'Single inbound write path (00022 + 0097): verify signature → idempotent per webhook_event_id → '
  '1:1 events เข้า conversation flow เดิม; group events เข้า fn_line_handle_group_event '
  '(join/#ผูก/member sync/#ปัญหา/รูป — plain chat ไม่เก็บตาม PDPA v1)';

