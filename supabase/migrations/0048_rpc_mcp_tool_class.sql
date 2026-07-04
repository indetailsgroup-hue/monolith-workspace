-- Migration: rpc_mcp_tool_class — monolith-mcp-layer Phase 2 (task 5.1 support)
-- Depends on: 0036 (mcp_tool_registry)
--
-- helper อ่าน Tool_Class ของ tool หนึ่ง (ให้ mcp-server route Read vs Write/Approval). คืน null ถ้าไม่รู้จัก.

create or replace function public.rpc_mcp_tool_class(p_tool_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tool_class::text from public.mcp_tool_registry where tool_name = p_tool_name;
$$;

revoke all on function public.rpc_mcp_tool_class(text) from public;

-- helper: หา pending_invocation (สถานะ pending) ที่ผูก approval_request หนึ่ง (สำหรับ mcp-approval-callback task 5.3).
-- คืน pending_id ล่าสุด หรือ null ถ้าไม่มี (= approval_request นี้ไม่ได้มาจาก MCP → callback no-op).
create or replace function public.rpc_mcp_pending_for_approval(p_approval_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.pending_invocation
  where approval_request_id = p_approval_request_id and status = 'pending'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.rpc_mcp_pending_for_approval(uuid) from public;
