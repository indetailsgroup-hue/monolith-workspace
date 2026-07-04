-- Migration: rpc_mcp_resolve_pending — monolith-mcp-layer Phase 2 (task 3.3)
-- Depends on: 0036/0040/0041/0044, workflow rpc_create_work_item + rpc_record_approval_decision, C12. ADR-019.
--
-- เรียกเมื่อมนุษย์ตัดสิน Pending_Invocation:
--   approved + Write_Tool (create_work_item) → execute rpc_create_work_item (reuse) → executed (Req 5.3/7.5)
--   approved + Approval_Tool                  → rpc_record_approval_decision (reuse path เดิม Req 5.2/8.3) → executed
--   rejected                                  → rejected, ไม่เปลี่ยนสถานะ Monolith (Req 5.4)
-- guard: pending ที่ไม่ใช่ 'pending' (executed/rejected/expired) → reject (Req 16.6); now ≥ expiry → expired ก่อน (Req 16.7 decision ต้องมาภายใน expiry).
-- MCP-native gate (Write_Tool): re-check governance เอง (ADR-019); audit ทุกกรณี.

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
  -- Req 16.6: เฉพาะ pending เท่านั้นที่บันทึก decision ได้
  if v_pend.status <> 'pending' then
    raise exception 'mcp: pending % already %', p_pending_id, v_pend.status using errcode = 'check_violation';
  end if;
  -- Req 16.7: decision ต้องมาภายใน expiry; เลย expiry แล้ว → expire (decision สาย ไม่ชนะ)
  if timezone('utc', now()) >= v_pend.invocation_expiry then
    update public.pending_invocation set status = 'expired' where id = p_pending_id;
    update public.tool_invocation set status = 'expired' where id = v_pend.tool_invocation_id;
    perform public.rpc_mcp_audit('expiry', null, null, null, null, 'expired_on_resolve', null,
      jsonb_build_object('pending_id', p_pending_id, 'expiry', v_pend.invocation_expiry));
    raise exception 'mcp: pending % expired', p_pending_id using errcode = 'check_violation';
  end if;

  select * into v_inv from public.tool_invocation where id = v_pend.tool_invocation_id for update;

  -- rejected → ไม่เปลี่ยนสถานะ Monolith (Req 5.4)
  if p_decision = 'rejected' then
    update public.pending_invocation set status = 'rejected' where id = p_pending_id;
    update public.tool_invocation set status = 'rejected' where id = v_inv.id;
    perform public.rpc_mcp_audit('approval', v_inv.tool_name, v_inv.tool_class, v_inv.site_code,
      v_inv.autonomy_tier, 'rejected', null, jsonb_build_object('pending_id', p_pending_id));
    return jsonb_build_object('status', 'rejected', 'pending_id', p_pending_id);
  end if;

  -- approved → execute capability เดิม
  if v_inv.tool_class = 'Approval_Tool' then
    -- reuse rpc_record_approval_decision (Req 5.2/8.3) — ผู้ตัดสิน = resolve_actor ภายใน RPC นั้น
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
    -- Write_Tool (create_work_item) — MCP-native gate: re-check governance (ADR-019)
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
    -- idempotency: เก็บผลจริงเพื่อ replay (Req 17.2)
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
