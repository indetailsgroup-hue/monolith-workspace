-- Migration: line_group_bot_flows — installation-pm task 1.8b (line-architecture §3-4, ADR-038/039)
-- Depends on: 00022 (rpc_ingest_line_webhook — **ตรวจแล้วไม่มี version ใหม่กว่า**), 0095 (line_groups/members/bind_codes,
--             guardrail G1), 0096 (installation_issues), 0053 (rpc_capture_ingest), 0086 (dispatch), 0084 (target employee_id)
--
-- Bot flows ในกลุ่ม (logic ทั้งหมดอยู่ DB ตาม trust boundary เดิม — line-webhook เป็น transport ล้วน):
--   join (bot เข้ากลุ่ม)        → กลุ่มยังไม่ผูก: ส่ง prompt "#ผูก <รหัส> ทีม|ลูกค้า"
--   '#ผูก <code> <ทีม|ลูกค้า>'  → validate: ผู้พิมพ์มี staff identity (identity_binding active) + code ยังไม่หมดอายุ/เหลือสิทธิ์
--                                → ผูก line_groups (จำ vertical จาก channel ที่รับ event) + uses_left-1 + สมาชิกผู้ผูก + ack
--   memberJoined / memberLeft   → sync line_group_members (member_kind: staff|customer|guest)
--   leave (bot โดนเตะ/ออก)      → archive กลุ่ม (ประวัติคงอยู่)
--   รูปในกลุ่ม internal          → capture 'installation_room_proof' (รูปจบเลน — ADR-039 ข้อ 3) + ack
--   '#ปัญหา <ข้อความ>' (internal) → installation_issues + แจ้งหัวหน้างาน (direct push ผ่าน notification engine) + ack
--   ข้อความอื่นในกลุ่ม            → **ไม่เก็บ** (PDPA v1: เก็บเฉพาะ รูป + #ปัญหา + member events — §8)
--
-- Idempotency: กลุ่ม branch ใช้ inbound UNIQUE(webhook_event_id) เดิม; event ที่จงใจไม่เก็บ (plain chat)
--   ไม่มี side effect → redelivery ปลอดภัยโดยไม่ต้องมีแถว

-- ---------------------------------------------------------------------------
-- (0) line_groups จำ vertical ของ channel ที่ผูก (sender ใช้เลือก token — group ไม่มี conversation)
-- ---------------------------------------------------------------------------
alter table public.line_groups add column if not exists vertical_context text null;

-- ---------------------------------------------------------------------------
-- (1) Templates ของ bot flows (ผ่าน governance review ใน PR นี้ — ≤200, ไม่มีศัพท์ระบบ, Req 12.2)
--     bind prompt/ok/fail = audience 'both' (ใช้ได้ทั้งสองกลุ่ม — เนื้อหากลางไม่มีข้อมูลภายใน)
-- ---------------------------------------------------------------------------
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience) values
  ('tpl_inst_bind_prompt', null,
   'สวัสดีครับ 🙏 กลุ่มนี้ยังไม่ได้เชื่อมกับบ้าน — พิมพ์ #ผูก ตามด้วยรหัสบ้าน แล้วตามด้วยคำว่า ทีม หรือ ลูกค้า ได้เลยครับ',
   true, 'both'),
  ('tpl_inst_bind_ok', null,
   'เชื่อมกลุ่มกับบ้านเรียบร้อยแล้วครับ ✅ จากนี้ระบบจะช่วยดูแลการแจ้งเตือนและรับรูปในกลุ่มนี้ครับ',
   true, 'both'),
  ('tpl_inst_bind_fail', null,
   'ผูกกลุ่มไม่สำเร็จครับ 🙏 รหัสอาจไม่ถูกต้อง หมดอายุ หรือสิทธิ์ไม่พอ — ขอรหัสใหม่จากออฟฟิศได้เลยครับ',
   true, 'both'),
  ('tpl_inst_photo_ack', null,
   'รับรูปเข้าระบบแล้วครับ 📷 เข้าไปเลือกห้อง/จุดงานในแอปได้เลยครับ',
   true, 'internal'),
  ('tpl_inst_issue_ack', null,
   'รับเรื่องปัญหาแล้วครับ 🙏 ระบบแจ้งหัวหน้างานให้แล้ว ติดตามสถานะได้ในแอปครับ',
   true, 'internal'),
  ('tpl_inst_issue_alert', null,
   '🔔 มีปัญหาหน้างานที่ {{project_name}} ครับ: {{detail}} — เข้าไปดูรายละเอียดในระบบได้เลยครับ',
   true, 'internal')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

-- ---------------------------------------------------------------------------
-- (2) Guardrail G1 update: อนุญาต bind prompt/fail เข้า "กลุ่มที่ยังไม่ผูก" เท่านั้น
--     (จำเป็นตามลำดับเหตุการณ์ — prompt ต้องส่งก่อนผูก; เนื้อหา generic ไม่มีข้อมูลภายใน)
--     กติกากลุ่ม customer เดิมคงทุกบรรทัด
-- ---------------------------------------------------------------------------
create or replace function public.fn_line_guard_customer_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_type text;
  v_audience text;
begin
  if new.target_type <> 'group' then
    return new;  -- 1:1 เดิมไม่เกี่ยว guardrail นี้
  end if;

  select g.group_type into v_group_type
  from public.line_groups g where g.line_group_id = new.target_id;

  if v_group_type is null then
    -- กลุ่มยังไม่ผูก: อนุญาตเฉพาะ template ของ bind flow (0097) — อย่างอื่น block เหมือนเดิม
    if new.template_key in ('tpl_inst_bind_prompt', 'tpl_inst_bind_fail') then
      return new;
    end if;
    raise exception 'line guardrail: กลุ่ม % ยังไม่ถูกผูกกับบ้าน (line_groups) — ส่งไม่ได้', new.target_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_group_type = 'customer' then
    select t.audience into v_audience
    from public.line_oa_message_templates t
    where t.template_key = new.template_key and t.is_active
    order by (t.vertical_context is null) desc
    limit 1;

    if v_audience is null or v_audience not in ('customer', 'both') then
      raise exception 'line guardrail G1: template % (audience=%) ห้ามส่งเข้ากลุ่มลูกค้า — เฉพาะ customer/both',
        new.template_key, coalesce(v_audience, 'ไม่พบ template')
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- (3) Group event handler — เรียกจาก rpc_ingest_line_webhook (ใน savepoint ต่อ event)
--     คืน result code; ห้าม raise (จับภายใน → 'handler_error') เพื่อไม่ล้มทั้ง batch
-- ---------------------------------------------------------------------------
create or replace function public.fn_line_handle_group_event(
  p_event jsonb,
  p_vertical text,
  p_actor text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_group_line_id text;
  v_user text;
  v_g record;
  v_msg_type text;
  v_text text;
  v_parts text[];
  v_code record;
  v_group_type text;
  v_kind text;
  v_member jsonb;
  v_desc text;
  v_project record;
  v_capture_id uuid;
begin
  v_type := p_event ->> 'type';
  v_group_line_id := p_event #>> '{source,groupId}';
  v_user := p_event #>> '{source,userId}';

  select g.id, g.project_id, g.group_type, g.status, g.site_code
    into v_g
  from public.line_groups g where g.line_group_id = v_group_line_id;

  -- ---- bot เข้ากลุ่ม ----
  if v_type = 'join' then
    if v_g.id is not null then
      return 'join_already_bound';
    end if;
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_bind_prompt', '{}'::jsonb, 'group', v_group_line_id);
    return 'join_prompted';
  end if;

  -- ---- bot ออก/โดนเอาออก → archive (ประวัติคงอยู่; ผูกใหม่ได้เพราะ unique เฉพาะ active) ----
  if v_type = 'leave' then
    if v_g.id is not null then
      update public.line_groups set status = 'archived' where id = v_g.id;
      return 'bot_left_archived';
    end if;
    return 'bot_left_unbound';
  end if;

  -- ---- member sync ----
  if v_type = 'memberJoined' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    for v_member in select jsonb_array_elements(coalesce(p_event #> '{joined,members}', '[]'::jsonb)) loop
      v_kind := case
        when exists (select 1 from public.identity_binding b
                     where b.line_user_id = v_member ->> 'userId' and b.is_active) then 'staff'
        when exists (select 1 from public.line_oa_customer_identity ci
                     where ci.line_user_id = v_member ->> 'userId') then 'customer'
        else 'guest'
      end;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      values (v_g.id, v_member ->> 'userId', v_kind)
      on conflict (group_id, line_user_id) where left_at is null do nothing;
    end loop;
    return 'members_joined';
  end if;

  if v_type = 'memberLeft' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    update public.line_group_members m
       set left_at = timezone('utc', now())
     where m.group_id = v_g.id and m.left_at is null
       and m.line_user_id in (
         select x ->> 'userId' from jsonb_array_elements(coalesce(p_event #> '{left,members}', '[]'::jsonb)) x);
    return 'members_left';
  end if;

  -- ---- ข้อความในกลุ่ม ----
  if v_type = 'message' then
    v_msg_type := p_event #>> '{message,type}';

    -- (ก) '#ผูก <code> <ทีม|ลูกค้า>' — ทำงานเฉพาะกลุ่มที่ยังไม่ผูก
    if v_msg_type = 'text' and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ผูก%' then
      if v_g.id is not null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_ok', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_already_bound';
      end if;

      v_parts := regexp_split_to_array(btrim(p_event #>> '{message,text}'), '\s+');
      v_group_type := case v_parts[3] when 'ทีม' then 'internal' when 'ลูกค้า' then 'customer' end;

      -- validate: ผู้พิมพ์ต้องมี staff identity (รหัส = capability token ที่ออฟฟิศแจก — ดู comment ตาราง)
      if v_user is null
         or not exists (select 1 from public.identity_binding b where b.line_user_id = v_user and b.is_active)
         or array_length(v_parts, 1) < 3 or v_group_type is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_identity_or_format';
      end if;

      select c.code, c.project_id into v_code
      from public.line_bind_codes c
      where c.code = v_parts[2] and c.expires_at > timezone('utc', now()) and c.uses_left > 0
      for update;

      if v_code.code is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_code';
      end if;

      select p.id, p.site_code, p.name into v_project
      from public.installation_projects p where p.id = v_code.project_id;

      insert into public.line_groups (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
      values (v_group_line_id, v_project.id, v_project.site_code, v_group_type, p_vertical, 'line:' || v_user);
      update public.line_bind_codes set uses_left = uses_left - 1 where code = v_code.code;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      select g.id, v_user, 'staff' from public.line_groups g where g.line_group_id = v_group_line_id
      on conflict (group_id, line_user_id) where left_at is null do nothing;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_bind_ok', '{}'::jsonb, 'group', v_group_line_id);
      return 'bound_' || v_group_type;
    end if;

    -- ต่อจากนี้ทำงานเฉพาะกลุ่มที่ผูกแล้ว + ยัง active
    if v_g.id is null then return 'plain_unbound_ignored'; end if;
    if v_g.status <> 'active' then return 'plain_archived_ignored'; end if;

    -- (ข) '#ปัญหา <ข้อความ>' — เฉพาะกลุ่ม internal (Req: เก็บเป็นหลักฐาน + แจ้งหัวหน้างาน)
    if v_msg_type = 'text' and v_g.group_type = 'internal'
       and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ปัญหา%' then
      v_desc := btrim(substr(btrim(p_event #>> '{message,text}'), length('#ปัญหา') + 1));
      if v_desc = '' then return 'issue_empty_ignored'; end if;

      insert into public.installation_issues (project_id, site_code, source, reported_by, line_user_id, description)
      values (v_g.project_id, v_g.site_code, 'line_group', 'line:' || coalesce(v_user, 'unknown'), v_user, v_desc);

      select p.name, p.foreman_employee_id into v_project
      from public.installation_projects p where p.id = v_g.project_id;
      if v_project.foreman_employee_id is not null then
        -- direct push ถึงหัวหน้างาน — resolution ผ่าน identity_binding (0084: target employee_id)
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_project.foreman_employee_id),
          'personal_responsibility', 'field_issue', 'tpl_inst_issue_alert',
          jsonb_build_object('project_name', v_project.name, 'detail', left(v_desc, 80)),
          false, null, true, null, v_g.site_code);
      end if;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_issue_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'issue_created';
    end if;

    -- (ค) รูปในกลุ่ม internal → capture รูปจบเลน (ADR-039 ข้อ 3); เลือกห้อง/เลนใน UI ภายหลัง (1.6b)
    if v_msg_type = 'image' and v_g.group_type = 'internal' then
      v_capture_id := public.rpc_capture_ingest(
        'installation_room_proof', 'line',
        'line-message://' || coalesce(p_event #>> '{message,id}', 'unknown'),
        p_event ->> 'webhookEventId',
        v_g.site_code);
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_photo_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'photo_captured';
    end if;

    -- (ง) แชทธรรมดา/สื่ออื่น → ไม่เก็บ (PDPA v1 — §8)
    return 'plain_ignored';
  end if;

  return 'ignored_event_type';
exception
  when others then
    -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว — บันทึกแล้วไปต่อ (inbound row + audit จะเก็บหลักฐาน)
    return 'handler_error:' || sqlerrm;
end;
$$;

revoke all on function public.fn_line_handle_group_event(jsonb, text, text) from public;

comment on function public.fn_line_handle_group_event(jsonb, text, text) is
  '1.8b (line-architecture §3-4): route group events — join/bind(#ผูก)/member sync/leave/#ปัญหา/รูป; plain chat ไม่เก็บ (PDPA); ห้าม raise (คืน handler_error แทน)';


-- ---------------------------------------------------------------------------
-- (4) rpc_ingest_line_webhook — เพิ่ม group branch (body เดิมจาก 00022 ทุกบรรทัด
--     ยกเว้น: declare 2 ตัว + branch ต้นลูป; เส้นทาง 1:1 เดิมไม่แตะเลย)
-- ---------------------------------------------------------------------------
set check_function_bodies = off;

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
            conversation_id, webhook_event_id, payload, received_at, source_type, line_group_id
          )
          values (null, v_webhook_event_id, v_event, timezone('utc', now()), 'group', v_group_id);

          insert into public.line_oa_audit_log (
            event_type, vertical_context, site_code, entity_ref, performed_by
          )
          values (
            'group_event', v_vertical_context, null,
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
