-- Migration: scrutiny3_fixes — scrutinize รอบ 3 (0094–0100): S3 guardrail-on-update + S4 duplicate-bind เงียบ
-- Depends on: 0100 (fn_line_handle_group_event ล่าสุด — ตรวจ chain แล้ว), 0095/0097 (guardrail G1)
--
-- S3 (กลาง-สูง, พิสูจน์บน DB): trg_line_guard_customer_group ยิงตอน UPDATE ด้วย —
--   ถ้า governance เปลี่ยน audience ของ template หลังข้อความถูกคิว: LINE ส่ง "สำเร็จ" แต่การบันทึกผล
--   (update status→sent) โดน trigger โยน → แถวค้าง pending → sender ส่งซ้ำทุกรอบ = spam กลุ่มลูกค้า
--   แก้: validate ที่จุดตัดสินใจ (INSERT/enqueue) เท่านั้น — การบันทึกผลส่งห้าม re-validate
--
-- S4 (ต่ำ/UX, พิสูจน์บน DB): #ผูก ชนิดที่บ้านผูกแล้ว → unique_violation → handler_error → คนผูกได้ความเงียบ
--   แก้: จับ unique_violation ที่จุด insert → ตอบ tpl_inst_bind_fail + result ชัดเจน

-- (1) S3: trigger เฉพาะ INSERT
drop trigger if exists trg_line_guard_customer_group on public.line_oa_outbound_messages;
create trigger trg_line_guard_customer_group
  before insert on public.line_oa_outbound_messages
  for each row execute function public.fn_line_guard_customer_group();

-- (2) S4: fn_line_handle_group_event (body เดิมจาก 0100 ทุกบรรทัด + exception ครอบ insert เดียว)
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
  -- 1.8c postback branch (0098)
  v_pb jsonb;
  v_appr record;
  v_decision text;
  v_internal_group text;
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
        select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_ok',
          jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
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

      begin
        insert into public.line_groups (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
        values (v_group_line_id, v_project.id, v_project.site_code, v_group_type, p_vertical, 'line:' || v_user);
      exception when unique_violation then
        -- S4 (scrutiny รอบ 3): บ้านนี้มีกลุ่มชนิดนี้ active อยู่แล้ว — ตอบให้คนผูกรู้ ไม่ใช่เงียบ
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_already_has_group';
      end;
      update public.line_bind_codes set uses_left = uses_left - 1 where code = v_code.code;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      select g.id, v_user, 'staff' from public.line_groups g where g.line_group_id = v_group_line_id
      on conflict (group_id, line_user_id) where left_at is null do nothing;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_bind_ok',
        jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
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

  -- ---- postback จากการ์ดตรวจรับ (0098 — D-5) ----
  if v_type = 'postback' then
    if v_g.id is null then return 'postback_unbound_ignored'; end if;
    begin
      v_pb := (p_event #>> '{postback,data}')::jsonb;
      if coalesce(v_pb ->> 't', '') <> 'inst_approval' then
        return 'postback_unknown_ignored';
      end if;
      v_decision := case v_pb ->> 'd' when 'approve' then 'approved' when 'reject' then 'rejected' end;
      if v_decision is null then return 'postback_malformed_ignored'; end if;

      select a.id, a.project_id, a.approve_token, a.result into v_appr
      from public.installation_approvals a
      where a.id = (v_pb ->> 'id')::uuid
      for update;
    exception when others then
      return 'postback_malformed_ignored';
    end;

    if v_appr.id is null then return 'postback_stale_ignored'; end if;
    if v_appr.project_id <> v_g.project_id then return 'postback_wrong_group_ignored'; end if;
    if v_appr.approve_token::text <> coalesce(v_pb ->> 'k', '') then return 'postback_token_mismatch'; end if;
    if v_appr.result is not null then return 'postback_already_decided'; end if;

    update public.installation_approvals
       set result = v_decision,
           decided_by = 'line:' || coalesce(v_user, 'unknown'),
           decided_at = timezone('utc', now()),
           postback_id = p_event ->> 'webhookEventId'
     where id = v_appr.id;

    select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;

    if v_decision = 'approved' then
      -- ADR-039 มติ 5: ตรวจรับผ่าน = ปิดโปรเจกต์ (work item ปิดไปแล้วตอนใบปิดบ้าน)
      update public.installation_projects
         set status = 'completed'
       where id = v_g.project_id and status = 'customer_review';
    end if;
    -- reject: คง customer_review — ทีมคุย punch list แล้วส่งตรวจรับใหม่ (ไม่ reopen work item)

    -- ack ลูกค้าในกลุ่มเดิม + แจ้งผลเข้ากลุ่ม internal ของบ้านเดียวกัน (ถ้าผูกไว้)
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_acceptance_ack', '{}'::jsonb, 'group', v_group_line_id);

    select g2.line_group_id into v_internal_group
    from public.line_groups g2
    where g2.project_id = v_g.project_id and g2.group_type = 'internal' and g2.status = 'active';
    if v_internal_group is not null then
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_acceptance_result',
        jsonb_build_object('project_name', coalesce(v_project.name, '-'),
          'result_text', case v_decision when 'approved' then 'รับงานเรียบร้อย ✅' else 'ขอแก้ไขงานก่อนรับ 🙏' end),
        'group', v_internal_group);
    end if;

    insert into public.installation_audit_log (event_type, project_id, site_code, performed_by, detail)
    values ('customer_acceptance_decided', v_g.project_id, v_g.site_code, 'line:' || coalesce(v_user, 'unknown'),
      jsonb_build_object('approval_id', v_appr.id, 'result', v_decision));

    return 'inst_approval_' || v_decision;
  end if;

  return 'ignored_event_type';
exception
  when others then
    -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว — บันทึกแล้วไปต่อ (inbound row + audit จะเก็บหลักฐาน)
    return 'handler_error:' || sqlerrm;
end;
$$;
