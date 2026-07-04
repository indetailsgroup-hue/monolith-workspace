-- Migration: rpc_mcp_check_rate_limit — monolith-mcp-layer Phase 2 (task 3.5)
-- Depends on: 0036 (mcp_rate_limit_counter), 0041 (rpc_mcp_audit), C12
--
-- mirror src/mcp/ratelimit.ts. atomic ต่อ scope ด้วย row lock (FOR UPDATE) → ไม่ overshoot (Req 15.7).
-- ประเมินทุก scope (Principal/MCP_Client/Tool_Class) ที่ส่งมาแบบ resolved-policy (max_count/max_cost จาก config, Req 15.5/15.6);
-- scope ใดละเมิด → reject ก่อน increment (no side effects, Req 15.2/15.3) + Throttling_Event audit (Req 15.4).
-- p_scopes = jsonb array ของ {scope_kind, scope_key, max_count, max_cost} (เรียงลำดับ deterministic เพื่อกัน deadlock).

create or replace function public.rpc_mcp_check_rate_limit(
  p_scopes jsonb,
  p_window_start timestamptz,
  p_est_cost numeric default 0,
  p_tool_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope jsonb;
  v_kind public.mcp_scope_kind;
  v_key text;
  v_max_count int;
  v_max_cost numeric;
  v_cur_count int;
  v_cur_cost numeric;
begin
  -- PASS 1: ensure-exist + lock + check (ยังไม่ increment) — atomic ต่อ scope
  for v_scope in select * from jsonb_array_elements(p_scopes) loop
    v_kind := (v_scope->>'scope_kind')::public.mcp_scope_kind;
    v_key := v_scope->>'scope_key';
    v_max_count := (v_scope->>'max_count')::int;
    v_max_cost := (v_scope->>'max_cost')::numeric;

    insert into public.mcp_rate_limit_counter (scope_kind, scope_key, window_start)
    values (v_kind, v_key, p_window_start)
    on conflict (scope_kind, scope_key, window_start) do nothing;

    select invocation_count, accrued_cost into v_cur_count, v_cur_cost
    from public.mcp_rate_limit_counter
    where scope_kind = v_kind and scope_key = v_key and window_start = p_window_start
    for update;

    -- Req 15.2 count: รวมครั้งนี้แล้ว "เกิน" → reject (strictly exceed)
    if v_cur_count + 1 > v_max_count then
      perform public.rpc_mcp_audit('throttling', p_tool_name, null, null, null, 'rate_limit_exceeded',
        null, jsonb_build_object('scope_kind', v_kind, 'scope_key', v_key, 'window_start', p_window_start));
      return jsonb_build_object('ok', false, 'reason', 'rate_limit_exceeded',
        'scope_kind', v_kind, 'scope_key', v_key);
    end if;
    -- Req 15.3 cost: รวมครั้งนี้แล้ว "ถึงหรือเกิน" budget → reject
    if v_cur_cost + p_est_cost >= v_max_cost then
      perform public.rpc_mcp_audit('throttling', p_tool_name, null, null, null, 'cost_budget_exceeded',
        null, jsonb_build_object('scope_kind', v_kind, 'scope_key', v_key, 'window_start', p_window_start));
      return jsonb_build_object('ok', false, 'reason', 'cost_budget_exceeded',
        'scope_kind', v_kind, 'scope_key', v_key);
    end if;
  end loop;

  -- PASS 2: ทุก scope ผ่าน → increment ทั้งหมด (locks ยังถืออยู่ตลอด tx)
  for v_scope in select * from jsonb_array_elements(p_scopes) loop
    v_kind := (v_scope->>'scope_kind')::public.mcp_scope_kind;
    v_key := v_scope->>'scope_key';
    update public.mcp_rate_limit_counter
      set invocation_count = invocation_count + 1,
          accrued_cost = accrued_cost + p_est_cost
    where scope_kind = v_kind and scope_key = v_key and window_start = p_window_start;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rpc_mcp_check_rate_limit(jsonb, timestamptz, numeric, text) from public;
