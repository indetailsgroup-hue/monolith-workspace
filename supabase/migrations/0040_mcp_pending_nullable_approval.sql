-- Migration: mcp_pending_nullable_approval — monolith-mcp-layer Phase 2 (ADR-019, approach A)
-- Depends on: 0036_mcp_init.sql, 0039 (FK)
--
-- ADR-019: create_work_item (Write_Tool) ไม่มี work_item ให้ผูก approval_request ก่อนอนุมัติ (Req 5.5) →
--   pending_invocation.approval_request_id ต้อง nullable. Approval_Tool ยังผูก approval_request จริง (Req 5.2);
--   create_work_item ใช้ MCP-native gate (approval_request_id = NULL). FK ยังคง (ผูกเมื่อ not-null เท่านั้น).

alter table public.pending_invocation
  alter column approval_request_id drop not null;

comment on column public.pending_invocation.approval_request_id is
  'workflow approval_request ที่ผูก (Approval_Tool); NULL = MCP-native gate (create_work_item Write_Tool) ตาม ADR-019';
