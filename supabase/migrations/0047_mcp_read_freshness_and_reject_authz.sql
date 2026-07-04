-- Migration: mcp_read_freshness_and_reject_authz — monolith-mcp-layer Phase 2 (scrutinize Wave 2, fix H1 + H2)
-- Depends on: 0043 (rpc_mcp_invoke_read), 0045 (rpc_mcp_resolve_pending), C12
--
-- H1 (MEDIUM): low_confidence ขาดเงื่อนไข staleness (Req 6.5 = review≠approved OR เก่ากว่า freshness threshold).
--   แก้: เพิ่ม param p_freshness_max_age_hours (configurable, default 720h=30d) → low_conf = review≠approved OR imported_at เก่าเกิน.
--   (เพิ่ม param → drop+recreate; call site เดิม resolve ผ่าน default ไม่ break.)
-- H2 (MEDIUM): reject path ไม่มี authz re-check → ใครก็ reject pending คนอื่นได้.
--   แก้: reject ต้อง is_governance_role() OR resolve_actor() = creator principal ของ pending.

-- ---------------------------------------------------------------------------
-- H1: rpc_mcp_invoke_read — เพิ่ม freshness staleness ใน low_confidence
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_mcp_invoke_read(text, jsonb, text[], text, jsonb);

create or replace function public.rpc_mcp_invoke_read(
  p_tool_name text,
  p_input jsonb default '{}'::jsonb,
  p_required_roles text[] default null,
  p_site_code text default null,
  p_model_provenance jsonb default null,
  p_freshness_max_age_hours numeric default 720   -- H1: configurable freshness threshold (default 30 วัน)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_tool public.mcp_tool_registry%rowtype;
  v_is_gov boolean;
  v_src_version text;
  v_imported_at timestamptz;
  v_review text;
  v_low_conf boolean;
  v_stale boolean;
  v_rows jsonb;
  v_inv_id uuid;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'mcp: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tool from public.mcp_tool_registry where tool_name = p_tool_name;
  if not found then
    raise exception 'mcp: unknown tool %', p_tool_name using errcode = 'no_data_found';
  end if;
  if v_tool.tool_class <> 'Read_Tool' then
    raise exception 'mcp: % is not a Read_Tool', p_tool_name using errcode = 'check_violation';
  end if;

  v_is_gov := public.is_governance_role();

  if p_required_roles is not null and array_length(p_required_roles, 1) is not null then
    if not (v_is_gov or public.has_any_app_role(p_required_roles)) then
      perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
        v_tool.default_autonomy_tier, 'insufficient_role', p_model_provenance, null);
      raise exception 'mcp: insufficient permission for %', p_tool_name using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_site_code is not null then
    if not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
      raise exception 'mcp: site_code % not active', p_site_code using errcode = 'check_violation';
    end if;
    if not (v_is_gov or public.has_site_access(p_site_code)) then
      raise exception 'mcp: site access denied for %', p_site_code using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_tool.default_autonomy_tier not in ('L2_auto_within_guardrail', 'L3_auto_with_notify') then
    raise exception 'mcp: read tool % tier % not auto-permitted', p_tool_name, v_tool.default_autonomy_tier
      using errcode = 'check_violation';
  end if;

  select source_version, imported_at, review_status
    into v_src_version, v_imported_at, v_review
  from public.knowledge_import
  where is_current and is_valid
  order by imported_at desc
  limit 1;

  -- H1 + Req 6.5: low_confidence = review≠approved OR stale (เก่ากว่า freshness threshold) — ไม่ซ่อนข้อมูล
  v_stale := (v_imported_at is null)
    or (v_imported_at < timezone('utc', now()) - make_interval(hours => p_freshness_max_age_hours::int));
  v_low_conf := (v_review is distinct from 'approved') or v_stale;

  if (p_input ? 'process_step') then
    select coalesce(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) into v_rows
    from public.process_model pm where pm.process_step = (p_input->>'process_step');
  else
    select coalesce(jsonb_agg(to_jsonb(pm) order by pm.canonical_order), '[]'::jsonb) into v_rows
    from public.process_model pm;
  end if;

  insert into public.tool_invocation
    (tool_name, tool_class, principal, site_code, autonomy_tier, status, model_provenance, result_ref)
  values
    (p_tool_name, 'Read_Tool', v_principal, p_site_code, v_tool.default_autonomy_tier, 'executed',
     coalesce(p_model_provenance, '{"model":"unknown","provider":"unknown"}'::jsonb),
     jsonb_build_object('source_version', v_src_version, 'imported_at', v_imported_at))
  returning id into v_inv_id;

  perform public.rpc_mcp_audit('invocation', p_tool_name, 'Read_Tool', p_site_code,
    v_tool.default_autonomy_tier, 'executed', p_model_provenance,
    jsonb_build_object('invocation_id', v_inv_id, 'low_confidence', v_low_conf, 'stale', v_stale));

  return jsonb_build_object(
    'rows', v_rows,
    'source_version', coalesce(v_src_version, 'unknown'),
    'imported_at', v_imported_at,
    'low_confidence', v_low_conf,
    'stale', v_stale,
    'invocation_id', v_inv_id
  );
end;
$$;

revoke all on function public.rpc_mcp_invoke_read(text, jsonb, text[], text, jsonb, numeric) from public;

-- ---------------------------------------------------------------------------
-- H2: rpc_mcp_resolve_pending — เพิ่ม authz re-check ใน reject path (signature เดิม → REPLACE)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_mcp_resolve_pending(
  p_pending_id uuid,
  p_decision text,
  p_webhook_event_id text default null,
  p_channel public.wf_decision_channel default 'web',
  p_expected_version int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_pend public.pending_invocation%rowtype;
  v_inv public.tool_invocation%rowtype;
  v_input jsonb;
  v_wi_id uuid;
  v_decision_result text;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'mcp: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'mcp: invalid decision %', p_decision using errcode = 'check_violation';
  end if;

  select * into v_pend from public.pending_invocation where id = p_pending_id for update;
  if not found then
    raise exception 'mcp: pending_invocation % not found', p_pending_id using errcode = 'no_data_found';
  end if;
  if v_pend.status <> 'pending' then
    raise exception 'mcp: pending % already %', p_pending_id, v_pend.status using errcode = 'check_violation';
  end if;
  if timezone('utc', now()) >= v_pend.invocation_expiry then
    update public.pending_invocation set status = 'expired' where id = p_pending_id;
    update public.tool_invocation set status = 'expired' where id = v_pend.tool_invocation_id;
    perform public.rpc_mcp_audit('expiry', null, null, null, null, 'expired_on_resolve', null,
      jsonb_build_object('pending_id', p_pending_id, 'expiry', v_pend.invocation_expiry));
    raise exception 'mcp: pending % expired', p_pending_id using errcode = 'check_violation';
  end if;

  select * into v_inv from public.tool_invocation where id = v_pend.tool_invocation_id for update;

  -- H2: reject ต้อง governance หรือเจ้าของ pending (creator) — กันใครก็ cancel ของคนอื่น (Req 5.4 scope authz)
  if p_decision = 'rejected' then
    if not (public.is_governance_role() or v_principal = v_inv.principal) then
      perform public.rpc_mcp_audit('approval', v_inv.tool_name, v_inv.tool_class, v_inv.site_code,
        v_inv.autonomy_tier, 'reject_insufficient_role', null, jsonb_build_object('pending_id', p_pending_id));
      raise exception 'mcp: reject requires governance or pending owner' using errcode = 'insufficient_privilege';
    end if;
    update public.pending_invocation set status = 'rejected' where id = p_pending_id;
    update public.tool_invocation set status = 'rejected' where id = v_inv.id;
    perform public.rpc_mcp_audit('approval', v_inv.tool_name, v_inv.tool_class, v_inv.site_code,
      v_inv.autonomy_tier, 'rejected', null, jsonb_build_object('pending_id', p_pending_id));
    return jsonb_build_object('status', 'rejected', 'pending_id', p_pending_id);
  end if;

  if v_inv.tool_class = 'Approval_Tool' then
    if p_webhook_event_id is null then
      raise exception 'mcp: Approval_Tool resolve requires webhook_event_id' using errcode = 'check_violation';
    end if;
    select public.rpc_record_approval_decision(
      v_pend.approval_request_id, p_webhook_event_id, 'approved'::public.wf_decision, p_channel, p_expected_version
    ) into v_decision_result;
    update public.pending_invocation set status = 'executed' where id = p_pending_id;
    update public.tool_invocation set status = 'executed',
      result_ref = jsonb_build_object('decision_result', v_decision_result) where id = v_inv.id;
    perform public.rpc_mcp_audit('approval', v_inv.tool_name, 'Approval_Tool', v_inv.site_code,
      v_inv.autonomy_tier, 'executed', null,
      jsonb_build_object('pending_id', p_pending_id, 'approval_request_id', v_pend.approval_request_id));
    return jsonb_build_object('status', 'executed', 'pending_id', p_pending_id, 'decision_result', v_decision_result);
  else
    if not public.is_governance_role() then
      perform public.rpc_mcp_audit('approval', v_inv.tool_name, v_inv.tool_class, v_inv.site_code,
        v_inv.autonomy_tier, 'insufficient_role', null, jsonb_build_object('pending_id', p_pending_id));
      raise exception 'mcp: MCP-native approval requires governance role' using errcode = 'insufficient_privilege';
    end if;
    v_input := v_inv.result_ref->'input';
    v_wi_id := public.rpc_create_work_item(
      coalesce(v_input->>'site_code', v_inv.site_code),
      coalesce(v_input->'data', '{}'::jsonb)
    );
    update public.pending_invocation set status = 'executed' where id = p_pending_id;
    update public.tool_invocation set status = 'executed',
      result_ref = jsonb_build_object('work_item_id', v_wi_id) where id = v_inv.id;
    if v_inv.idempotency_key is not null then
      update public.mcp_idempotency_record set result_ref = jsonb_build_object('work_item_id', v_wi_id)
      where idempotency_key = v_inv.idempotency_key and principal = v_inv.principal;
    end if;
    perform public.rpc_mcp_audit('approval', v_inv.tool_name, 'Write_Tool', v_inv.site_code,
      v_inv.autonomy_tier, 'executed', null,
      jsonb_build_object('pending_id', p_pending_id, 'work_item_id', v_wi_id));
    return jsonb_build_object('status', 'executed', 'pending_id', p_pending_id, 'work_item_id', v_wi_id);
  end if;
end;
$$;

revoke all on function public.rpc_mcp_resolve_pending(uuid, text, text, public.wf_decision_channel, int) from public;
