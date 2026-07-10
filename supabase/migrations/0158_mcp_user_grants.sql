-- 0158: MCP layer grants สำหรับผู้ใช้จริง (ADR-061 — AI client ตัวแรกต่อเข้า mcp-server)
-- ราก: RLS policy SELECT TO authenticated มีตั้งแต่ 0036 แต่ base GRANT ไม่มี
-- (platform ตัด DML default — บทเรียนเดียวกับ 0090) และ rpc_mcp_* ไม่เคย grant EXECUTE
-- → AI client จริงเจอ 403 ทุกเส้น = MCP layer ไม่เคยถูกใช้โดย principal จริงมาก่อน
-- ปลอดภัย: ทุก RPC ทำ authz ภายใน (resolve_actor + required_roles) — grant แค่ประตูเข้า

grant select on public.mcp_tool_registry to authenticated;   -- discovery (RLS คุมแถวอยู่แล้ว)

grant execute on function public.rpc_mcp_tool_class(text) to authenticated;
grant execute on function public.rpc_mcp_check_rate_limit(jsonb, timestamptz, numeric, text) to authenticated;
grant execute on function public.rpc_mcp_invoke_read(text, jsonb, text[], text, jsonb, numeric) to authenticated;
grant execute on function public.rpc_mcp_create_pending(text, jsonb, text, text[], text, numeric, jsonb) to authenticated;
-- resolve/expire/audit = service_role เท่านั้น (เดิม) — human-in-loop ผ่าน approval flow

-- เส้น human-in-loop: mcp-approval-callback/cleanup ใช้ service key แต่ 0045/0046
-- revoke จาก public โดยไม่เคย grant ให้ service_role → callback 403 ทั้งเส้น
grant execute on function public.rpc_mcp_resolve_pending(uuid, text, text, public.wf_decision_channel, int) to service_role;
grant execute on function public.rpc_mcp_expire_pending() to service_role;
grant execute on function public.rpc_mcp_pending_for_approval(uuid) to service_role;
grant select on public.mcp_audit_log to service_role;
grant select on public.pending_invocation, public.tool_invocation to service_role;
