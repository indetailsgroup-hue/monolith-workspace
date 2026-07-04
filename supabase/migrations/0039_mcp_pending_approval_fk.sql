-- Migration: mcp_pending_approval_fk — monolith-mcp-layer Phase 2 (scrutinize Wave 0, fix F1)
-- Depends on: 0036_mcp_init.sql (pending_invocation), 0002+/0031 workflow-copilot (approval_request)
--
-- F1 (MEDIUM): pending_invocation.approval_request_id (uuid NOT NULL) ไม่มี FK ไป approval_request
--   → referential integrity gap (pending ชี้ approval_request ผี / ลบ approval_request ที่มี pending ค้าง).
--   reuse-not-fork ควรผูก FK จริงเข้า workflow-copilot approval_request. additive (ไม่แก้ 0036 ที่ mark done).
--   ON DELETE NO ACTION (default): กันลบ approval_request ที่ยังมี pending_invocation อ้างถึง.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pending_invocation_approval_request_id_fkey'
      and conrelid = 'public.pending_invocation'::regclass
  ) then
    alter table public.pending_invocation
      add constraint pending_invocation_approval_request_id_fkey
      foreign key (approval_request_id) references public.approval_request (id);
  end if;
end
$$;
