-- Migration: notification_delivery_resolution — monolith-workflow-copilot Phase 13 close
-- Spec task: 12/17.4 (notification delivery + retry) — ปิดช่องที่ notification ถูก mark sent โดยไม่เคยส่งจริง
-- Depends on: 0025 (claim), 0002 (notification, identity_binding), line_oa schema (templates/channels), C12
--
-- ปัญหาเดิม (ตรวจพบ 2026-07-06):
--   worker เดิม POST body ไป line-outbound-sender ซึ่งเป็น batch worker (ไม่อ่าน body)
--   → send คืน 200 เสมอ → notification ถูก mark 'sent' ทั้งที่ไม่มีการส่งถึงพนักงานจริง
-- ทางแก้: claim RPC resolve ทุกอย่างที่ต้องใช้ส่งจริงใน DB (กติกา free-text ban คงอยู่ที่ DB):
--   (1) ผู้รับ: target->>'line_user_id' หรือ identity_binding (active) จาก target owner/employee_id
--   (2) ข้อความ: render จาก line_oa_message_templates (active; shared ก่อน) + named slots — ห้าม free-text
--   (3) token ref: ช่อง OA ที่ active (Vault reference — ไม่ใช่ token จริง)
-- แถวที่ resolve ไม่ได้ (ไม่มี binding/template) ยังถูกคืนพร้อมช่อง null ให้ worker record fail
-- ตาม backoff → ครบ retry แล้ว failed ถาวร + audit (0019 เดิม) — ไม่มีแถวหมุนเงียบ ๆ

-- ---------------------------------------------------------------------------
-- (1) helper: render template body + named slots (mirror 0040 semantics)
-- ---------------------------------------------------------------------------
create or replace function public.fn_wf_render_notification_text(
  p_template_key text,
  p_slots jsonb
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_body text;
  v_key text;
begin
  -- active template เท่านั้น (ปฏิเสธ free-text — Req 6.7); shared (vertical null) ก่อน
  select t.body into v_body
  from public.line_oa_message_templates t
  where t.template_key = p_template_key
    and t.is_active
  order by (t.vertical_context is null) desc
  limit 1;

  if v_body is null then
    return null; -- worker จะ record fail 'template_unresolvable'
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_slots, '{}'::jsonb)) loop
    v_body := replace(v_body, '{{' || v_key || '}}', coalesce(p_slots ->> v_key, ''));
  end loop;
  return v_body;
end;
$$;

revoke all on function public.fn_wf_render_notification_text(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- (2) claim v2 — return type เปลี่ยน จึงต้อง drop ก่อน (caller เดียว: notification-retry-worker)
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_claim_pending_notifications(int, int);

create or replace function public.rpc_claim_pending_notifications(
  p_limit int default 20,
  p_lease_seconds int default 60
)
returns table (
  id uuid,
  channel public.wf_notification_channel,
  category text,
  template_key text,
  slots jsonb,
  retry_count int,
  site_code text,
  line_user_id text,     -- null = recipient_unresolvable
  rendered_text text,    -- null = template_unresolvable
  token_ref text         -- Vault reference ของ channel access token (ไม่ใช่ token)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_ref text;
begin
  -- ช่อง OA สำหรับส่งหา staff: ช่องที่ active (ภายในบริษัทใช้ OA เดียวกับ line-oa)
  select c.channel_access_token_ref into v_token_ref
  from public.line_oa_channels c
  where c.is_active
  order by (c.vertical_context = 'monolith') desc, c.channel_identifier
  limit 1;

  return query
  with claimed as (
    select n.id
    from public.notification n
    where n.status in ('queued', 'pending')
      and (n.next_attempt_at is null or n.next_attempt_at <= timezone('utc', now()))
    order by n.created_at
    for update skip locked
    limit greatest(1, p_limit)
  ), leased as (
    update public.notification n
       set next_attempt_at = timezone('utc', now()) + make_interval(secs => greatest(1, p_lease_seconds))
      from claimed
     where n.id = claimed.id
    returning n.*
  )
  select
    l.id,
    l.channel,
    l.category,
    l.template_key,
    l.slots,
    l.retry_count,
    l.site_code,
    coalesce(
      l.target ->> 'line_user_id',
      (select b.line_user_id
         from public.identity_binding b
        where b.is_active
          and b.employee_id::text = coalesce(l.target ->> 'owner', l.target ->> 'employee_id')
        limit 1)
    ) as line_user_id,
    public.fn_wf_render_notification_text(l.template_key, l.slots) as rendered_text,
    v_token_ref as token_ref
  from leased l;
end;
$$;

comment on function public.rpc_claim_pending_notifications(int, int)
  is 'Claim due workflow notifications (queued/pending, lease via next_attempt_at) และ resolve ทุกอย่างที่ delivery worker ต้องใช้: ผู้รับจาก identity_binding, ข้อความจาก template ที่ approve แล้ว (free-text ban ที่ DB), Vault token ref. แถว resolve ไม่ได้คืนช่อง null ให้ worker record fail ตาม backoff (Req 18.1-18.3, 6.7).';

-- service worker เท่านั้น (pattern 0061)
revoke all on function public.rpc_claim_pending_notifications(int, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_claim_pending_notifications(int, int) to service_role';
    execute 'grant execute on function public.fn_wf_render_notification_text(text, jsonb) to service_role';
  end if;
end $$;
