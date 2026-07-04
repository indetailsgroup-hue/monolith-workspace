-- Migration: rpc_query_audit — monolith-workflow-copilot Phase 1 (Req 9.4)
-- Spec task: 16.2 (read helper that respects RLS predicate)
-- Depends on: 0003 (workflow_audit_log), C12
--
-- คืนเฉพาะแถวที่เคารพ predicate เดียวกับ RLS (is_governance_role() OR has_site_access(site_code)).
-- ใช้ SECURITY INVOKER เพื่อให้ RLS ของ workflow_audit_log บังคับใช้โดยตรง + filter เพิ่มเชิงป้องกัน.

create or replace function public.rpc_query_audit(
  p_work_item_id uuid default null,
  p_event_type text default null,
  p_limit int default 100
)
returns setof public.workflow_audit_log
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.workflow_audit_log a
  where (p_work_item_id is null or a.work_item_id = p_work_item_id)
    and (p_event_type is null or a.event_type = p_event_type)
    and (public.is_governance_role() or public.has_site_access(a.site_code))
  order by a.at desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

grant execute on function public.rpc_query_audit(uuid, text, int) to authenticated;
