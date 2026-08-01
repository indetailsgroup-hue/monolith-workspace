-- Migration: LINE OA outbound timezone-safe successful-send timestamp (Phase A4)
-- Depends on: 0195_line_outbound_timezone_safe_backoff.sql
--
-- Keep successful delivery timestamps as timestamptz. This migration creates
-- no cron schedule and does not enable live sending.

set check_function_bodies = off;

create or replace function public.rpc_record_line_send_result(
  p_outbound_id uuid,
  p_status text,
  p_error_detail text default null,
  p_failure_class text default 'transient',
  p_claim_token uuid default null,
  out outbound_id uuid,
  out status text,
  out error_detail text,
  out sent_at timestamptz,
  out recorded boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reported_status         public.line_oa_outbound_status;
  v_stored_status           public.line_oa_outbound_status;
  v_actor                   text;
  v_conversation_id         uuid;
  v_target_type             text;
  v_target_id               text;
  v_authorization_site_code text;
  v_audit_site_code         text;
  v_vertical_context        text;
  v_current_status          public.line_oa_outbound_status;
  v_current_error_detail    text;
  v_current_sent_at         timestamptz;
  v_attempt_count           int;
  v_current_claim_token     uuid;
  v_error_detail            text;
  v_sent_at                 timestamptz;
  v_next_attempt_at         timestamptz;
  v_is_service_context      boolean;
begin
  if p_outbound_id is null then
    raise exception 'line_oa: outbound_id is required to record a send result'
      using errcode = '22004';
  end if;

  if p_status is null then
    raise exception 'line_oa: unsupported send status (expected sent or failed)'
      using errcode = '22023';
  end if;

  begin
    v_reported_status := p_status::public.line_oa_outbound_status;
  exception
    when invalid_text_representation then
      raise exception 'line_oa: unsupported send status (expected sent or failed)'
        using errcode = '22023';
  end;

  if v_reported_status = 'pending' then
    raise exception 'line_oa: send result must be sent or failed, not pending'
      using errcode = '22023';
  end if;

  if p_failure_class is null or p_failure_class not in ('transient', 'permanent') then
    raise exception 'line_oa: unsupported failure class (expected transient or permanent)'
      using errcode = '22023';
  end if;

  -- LEFT JOIN preserves group rows. Authorization and audit scope are exactly
  -- the guarded paths introduced in 0193.
  select
    o.conversation_id,
    o.target_type,
    o.target_id,
    o.status,
    o.error_detail,
    o.sent_at,
    o.attempt_count,
    o.claim_token,
    case
      when o.target_type = 'group' then coalesce(g.vertical_context, 'monolith')
      else c.vertical_context
    end,
    case
      when o.target_type = 'group' then g.site_code
      else c.site_code
    end,
    case
      when o.target_type = 'group' then null
      else c.site_code
    end
  into
    v_conversation_id,
    v_target_type,
    v_target_id,
    v_current_status,
    v_current_error_detail,
    v_current_sent_at,
    v_attempt_count,
    v_current_claim_token,
    v_vertical_context,
    v_authorization_site_code,
    v_audit_site_code
  from public.line_oa_outbound_messages o
  left join public.line_oa_conversations c
    on c.id = o.conversation_id
  left join public.line_groups g
    on o.target_type = 'group'
   and g.line_group_id = o.target_id
  where o.id = p_outbound_id
  for update of o;

  if not found then
    raise exception 'line_oa: outbound message not found to record a send result'
      using errcode = 'P0002';
  end if;

  v_is_service_context :=
    coalesce(current_setting('role', true), '') = 'service_role';

  if v_is_service_context then
    v_actor := 'line-outbound-sender';
  else
    if not (
      public.is_governance_role()
      or public.has_site_access(v_authorization_site_code)
    ) then
      raise exception 'line_oa: permission denied to record send result for this conversation'
        using errcode = '42501';
    end if;
    v_actor := public.resolve_actor();
  end if;

  -- Authorization stays ahead of the fence so a stale-token probe cannot be
  -- used to disclose row state to a caller who lacks the existing 0193 role or
  -- site authority. Exact equality also fences a replay after an accepted
  -- transient result has cleared the stored token; legacy null/null remains valid.
  if p_claim_token is distinct from v_current_claim_token then
    outbound_id := p_outbound_id;
    status := v_current_status::text;
    error_detail := v_current_error_detail;
    sent_at := v_current_sent_at;
    recorded := false;
    return;
  end if;

  if v_current_status <> 'pending' then
    outbound_id := p_outbound_id;
    status := v_current_status::text;
    error_detail := v_current_error_detail;
    sent_at := v_current_sent_at;
    recorded := false;
    return;
  end if;

  if v_reported_status = 'failed' then
    v_error_detail := nullif(btrim(coalesce(p_error_detail, '')), '');
    if v_error_detail is null then
      v_error_detail := 'line_oa: send failed (no detail provided)';
    end if;

    -- Keep 0193's secret scrub unchanged.
    v_error_detail := regexp_replace(
      v_error_detail,
      '(?i)bearer\s+[A-Za-z0-9._\-+/=]+',
      'Bearer [REDACTED]',
      'g'
    );
    v_error_detail := regexp_replace(
      v_error_detail,
      '[A-Za-z0-9._\-+/=]{40,}',
      '[REDACTED]',
      'g'
    );

    v_attempt_count := v_attempt_count + 1;
    if p_failure_class = 'permanent' or v_attempt_count >= 5 then
      v_stored_status := 'failed';
      v_next_attempt_at := null;
    else
      v_stored_status := 'pending';
      -- Mirror notification-retry-worker: 1s * 2^(failed attempts before this
      -- one), capped at five minutes. attempt_count=1 => 1s, =2 => 2s.
      v_next_attempt_at := now() + make_interval(
        secs => least(
          300.0,
          power(2.0, greatest(0, v_attempt_count - 1))
        )
      );
    end if;
    v_sent_at := null;

    update public.line_oa_outbound_messages o
       set status = v_stored_status,
           attempt_count = v_attempt_count,
           next_attempt_at = v_next_attempt_at,
           error_detail = v_error_detail,
           sent_by = v_actor,
           sent_at = null,
           claimed_at = null,
           claimed_by = null,
           claim_token = null
     where o.id = p_outbound_id;
  else
    v_stored_status := 'sent';
    v_error_detail := null;
    v_sent_at := now();

    update public.line_oa_outbound_messages o
       set status = 'sent',
           next_attempt_at = null,
           error_detail = null,
           sent_by = v_actor,
           sent_at = v_sent_at,
           claimed_at = null,
           claimed_by = null,
           claim_token = null
     where o.id = p_outbound_id;
  end if;

  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'outbound_send_result_recorded',
    v_vertical_context,
    v_audit_site_code,
    format(
      'line_oa_outbound_message:%s|conversation:%s|status:%s',
      p_outbound_id,
      v_conversation_id,
      v_reported_status
    ),
    v_actor
  );

  outbound_id := p_outbound_id;
  status := v_stored_status::text;
  error_detail := v_error_detail;
  sent_at := v_sent_at;
  recorded := true;
  return;
end;
$$;

comment on function public.rpc_record_line_send_result(uuid, text, text, text, uuid) is
  'Records one authorized LINE outbound result with transient/permanent classification and claim-token fencing. A stale token returns recorded=false before mutation/audit; rows with no stored token retain the legacy null-token path. Permanent failures are terminal immediately; transient failures use timezone-safe timestamptz exponential backoff through attempt 4 and fail on attempt 5. Successful sends store the current timestamptz without session-timezone reinterpretation. All 0193 guards and secret scrubbing remain intact.';

set check_function_bodies = on;
