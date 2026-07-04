-- Migration: rpc_mcp_create_pending — monolith-mcp-layer Phase 2 (task 3.2)
-- Depends on: 0036/0040/0041, C12. ADR-019.
--
-- mirror src/mcp/{authz,autonomy,idempotency,expiry}.ts. Write_Tool/Approval_Tool → Pending_Invocation, NO side effects (Req 5.1/5.5).
--   Approval_Tool : approval_request_id = input.approval_request_id (workflow ที่มีอยู่ — Req 5.2 reuse path)
--   Write_Tool    : approval_request_id = NULL (MCP-native gate — ADR-019)
-- idempotency (Idempotency_Key, Principal): invalid→reject; conflict→reject; pending→return เดิม; double-submit→≤1 (PK) (Req 17).
-- expiry = now()+timeout (clamp 1h–30d default 72h) (Req 16.1). audit ทุกกรณี.

create or replace function public.rpc_mcp_create_pending(
  p_tool_name text,
  p_input jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_required_roles text[] default null,
  p_site_code text default null,
  p_timeout_hours numeric default 72,
  p_model_provenance jsonb default null
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
  v_hash text;
  v_existing public.mcp_idempotency_record%rowtype;
  v_inserted_idem boolean := false;
  v_appr_req uuid;
  v_inv_id uuid;
  v_pending_id uuid;
  v_expiry timestamptz;
  v_timeout_h numeric;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'mcp: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tool from public.mcp_tool_registry where tool_name = p_tool_name;
  if not found then
    raise exception 'mcp: unknown tool %', p_tool_name using errcode = 'no_data_found';
  end if;
  if v_tool.tool_class = 'Read_Tool' then
    raise exception 'mcp: % is Read_Tool (use rpc_mcp_invoke_read)', p_tool_name using errcode = 'check_violation';
  end if;

  v_is_gov := public.is_governance_role();

  -- Req 3.1 authz role
  if p_required_roles is not null and array_length(p_required_roles, 1) is not null then
    if not (v_is_gov or public.has_any_app_role(p_required_roles)) then
      perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
        v_tool.default_autonomy_tier, 'insufficient_role', p_model_provenance, null);
      raise exception 'mcp: insufficient permission for %', p_tool_name using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- Req 3.2/3.6 site (Write/Approval ต้อง has_site_access เสมอแม้ governance — ADR/Req 3.4)
  if p_site_code is not null then
    if not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
      raise exception 'mcp: site_code % not active', p_site_code using errcode = 'check_violation';
    end if;
    if not public.has_site_access(p_site_code) then
      raise exception 'mcp: site access denied for %', p_site_code using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- idempotency (Req 17)
  v_hash := md5(coalesce(p_input, '{}'::jsonb)::text);
  if p_idempotency_key is not null then
    if length(p_idempotency_key) < 1 or length(p_idempotency_key) > 255 then
      raise exception 'mcp: invalid idempotency_key length' using errcode = 'check_violation';  -- Req 17.7
    end if;
    insert into public.mcp_idempotency_record (idempotency_key, principal, input_hash)
    values (p_idempotency_key, v_principal, v_hash)
    on conflict (idempotency_key, principal) do nothing;
    get diagnostics v_inserted_idem = row_count;

    if not v_inserted_idem then
      -- มี record เดิม → replay/return_pending/conflict (Req 17.2/17.3/17.8)
      select * into v_existing from public.mcp_idempotency_record
      where idempotency_key = p_idempotency_key and principal = v_principal for update;
      if v_existing.input_hash <> v_hash then
        perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
          v_tool.default_autonomy_tier, 'idempotency_conflict', p_model_provenance,
          jsonb_build_object('idempotency_key', p_idempotency_key));
        raise exception 'mcp: idempotency conflict for key %', p_idempotency_key using errcode = 'unique_violation';
      end if;
      if v_existing.result_ref is not null then
        perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
          v_tool.default_autonomy_tier, 'idempotent_replay', p_model_provenance,
          jsonb_build_object('idempotency_key', p_idempotency_key));
        return jsonb_build_object('replay', true, 'result', v_existing.result_ref);
      end if;
      return jsonb_build_object('replay', true, 'status', 'pending',
        'tool_invocation_id', v_existing.tool_invocation_id);
    end if;
  end if;

  -- expiry clamp 1h–30d default 72h (Req 16.1)
  v_timeout_h := least(greatest(coalesce(p_timeout_hours, 72), 1), 720);
  v_expiry := timezone('utc', now()) + make_interval(hours => v_timeout_h::int);

  -- Approval_Tool ผูก approval_request เดิม; Write_Tool = NULL (ADR-019)
  if v_tool.tool_class = 'Approval_Tool' then
    v_appr_req := nullif(p_input->>'approval_request_id', '')::uuid;
    if v_appr_req is null then
      raise exception 'mcp: Approval_Tool requires input.approval_request_id' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.approval_request where id = v_appr_req) then
      raise exception 'mcp: approval_request % not found', v_appr_req using errcode = 'no_data_found';
    end if;
  else
    v_appr_req := null;
  end if;

  -- สร้าง tool_invocation (pending) + pending_invocation — NO side effects ต่อ Monolith (Req 5.5)
  insert into public.tool_invocation
    (tool_name, tool_class, principal, site_code, autonomy_tier, status, idempotency_key, model_provenance, result_ref)
  values
    (p_tool_name, v_tool.tool_class, v_principal, p_site_code, v_tool.default_autonomy_tier, 'pending',
     p_idempotency_key, coalesce(p_model_provenance, '{"model":"unknown","provider":"unknown"}'::jsonb),
     jsonb_build_object('input', p_input))
  returning id into v_inv_id;

  insert into public.pending_invocation (tool_invocation_id, approval_request_id, status, invocation_expiry)
  values (v_inv_id, v_appr_req, 'pending', v_expiry)
  returning id into v_pending_id;

  if p_idempotency_key is not null then
    update public.mcp_idempotency_record set tool_invocation_id = v_inv_id
    where idempotency_key = p_idempotency_key and principal = v_principal;
  end if;

  perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
    v_tool.default_autonomy_tier, 'pending', p_model_provenance,
    jsonb_build_object('pending_id', v_pending_id, 'invocation_id', v_inv_id, 'expiry', v_expiry));

  return jsonb_build_object('status', 'pending', 'pending_id', v_pending_id,
    'tool_invocation_id', v_inv_id, 'invocation_expiry', v_expiry);
end;
$$;

revoke all on function public.rpc_mcp_create_pending(text, jsonb, text, text[], text, numeric, jsonb) from public;
