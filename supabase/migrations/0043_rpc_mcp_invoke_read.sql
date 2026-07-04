-- Migration: rpc_mcp_invoke_read — monolith-mcp-layer Phase 2 (task 3.1)
-- Depends on: 0036/0037/0041, workflow knowledge_import + process_model, C12
--
-- mirror src/mcp/{authz,autonomy,untrusted}.ts. Read_Tool only (read-only, ไม่เขียนกลับ Obsidian Req 6.3).
-- authz re-derive จาก Principal+C12 (Req 3/19.3); autonomy Read+auto-tier→auto (Req 4.2);
-- execute = query Knowledge_Export (current+valid) → แนบ Source_Provenance (source_version/imported_at) (Req 6.4/19.4) +
-- low_confidence เมื่อ review_status≠approved (Req 6.5); record tool_invocation + audit (Req 11).
-- p_required_roles: บทบาทที่ tool อนุญาต (config); NULL/ว่าง = ต้องมี principal ที่ยืนยันแล้วเท่านั้น.

create or replace function public.rpc_mcp_invoke_read(
  p_tool_name text,
  p_input jsonb default '{}'::jsonb,
  p_required_roles text[] default null,
  p_site_code text default null,
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
  v_src_version text;
  v_imported_at timestamptz;
  v_review text;
  v_low_conf boolean;
  v_rows jsonb;
  v_inv_id uuid;
begin
  -- fail-safe: ต้องมี principal ที่ยืนยันแล้ว (Req 2.5/12)
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'mcp: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  -- Req 1.5: tool ต้องอยู่ใน catalog
  select * into v_tool from public.mcp_tool_registry where tool_name = p_tool_name;
  if not found then
    raise exception 'mcp: unknown tool %', p_tool_name using errcode = 'no_data_found';
  end if;
  -- RPC นี้เฉพาะ Read_Tool (Write/Approval → create_pending)
  if v_tool.tool_class <> 'Read_Tool' then
    raise exception 'mcp: % is not a Read_Tool', p_tool_name using errcode = 'check_violation';
  end if;

  v_is_gov := public.is_governance_role();

  -- Req 3.1: authz role (has_any_app_role); NULL/ว่าง = ต้องมี principal เท่านั้น
  if p_required_roles is not null and array_length(p_required_roles, 1) is not null then
    if not (v_is_gov or public.has_any_app_role(p_required_roles)) then
      perform public.rpc_mcp_audit('invocation', p_tool_name, v_tool.tool_class, p_site_code,
        v_tool.default_autonomy_tier, 'insufficient_role', p_model_provenance, null);
      raise exception 'mcp: insufficient permission for %', p_tool_name using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Req 3.2/3.3/3.6: ถ้าผูก site — ต้อง active; governance อ่านข้ามไซต์ได้ (Read), มิฉะนั้นต้อง has_site_access
  if p_site_code is not null then
    if not exists (select 1 from public.get_active_site_codes() s where s.site_code = p_site_code) then
      raise exception 'mcp: site_code % not active', p_site_code using errcode = 'check_violation';
    end if;
    if not (v_is_gov or public.has_site_access(p_site_code)) then
      raise exception 'mcp: site access denied for %', p_site_code using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Req 4.2: Read auto เฉพาะ tier ที่อนุญาต auto (L2/L3); มิฉะนั้น fail-safe (ต้อง human gate — ไม่ใช่ read auto path)
  if v_tool.default_autonomy_tier not in ('L2_auto_within_guardrail', 'L3_auto_with_notify') then
    raise exception 'mcp: read tool % tier % not auto-permitted', p_tool_name, v_tool.default_autonomy_tier
      using errcode = 'check_violation';
  end if;

  -- execute: query Knowledge_Export ปัจจุบันที่ valid (read-only) — Source_Provenance (Req 6.4/19.4)
  select source_version, imported_at, review_status
    into v_src_version, v_imported_at, v_review
  from public.knowledge_import
  where is_current and is_valid
  order by imported_at desc
  limit 1;

  -- Req 6.5: low_confidence เมื่อ review_status ≠ approved (ไม่ซ่อนข้อมูล)
  v_low_conf := (v_review is distinct from 'approved');

  -- ตัวอย่าง read: ถ้า input ระบุ process_step → คืนแถว process_model ที่ตรง (ภายใต้สิทธิ์)
  if (p_input ? 'process_step') then
    select coalesce(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) into v_rows
    from public.process_model pm
    where pm.process_step = (p_input->>'process_step');
  else
    select coalesce(jsonb_agg(to_jsonb(pm) order by pm.canonical_order), '[]'::jsonb) into v_rows
    from public.process_model pm;
  end if;

  -- record tool_invocation (executed) + audit (Req 11.1)
  insert into public.tool_invocation
    (tool_name, tool_class, principal, site_code, autonomy_tier, status, model_provenance, result_ref)
  values
    (p_tool_name, 'Read_Tool', v_principal, p_site_code, v_tool.default_autonomy_tier, 'executed',
     coalesce(p_model_provenance, '{"model":"unknown","provider":"unknown"}'::jsonb),
     jsonb_build_object('source_version', v_src_version, 'imported_at', v_imported_at))
  returning id into v_inv_id;

  perform public.rpc_mcp_audit('invocation', p_tool_name, 'Read_Tool', p_site_code,
    v_tool.default_autonomy_tier, 'executed', p_model_provenance,
    jsonb_build_object('invocation_id', v_inv_id, 'low_confidence', v_low_conf));

  return jsonb_build_object(
    'rows', v_rows,
    'source_version', coalesce(v_src_version, 'unknown'),
    'imported_at', v_imported_at,
    'low_confidence', v_low_conf,
    'invocation_id', v_inv_id
  );
end;
$$;

revoke all on function public.rpc_mcp_invoke_read(text, jsonb, text[], text, jsonb) from public;
