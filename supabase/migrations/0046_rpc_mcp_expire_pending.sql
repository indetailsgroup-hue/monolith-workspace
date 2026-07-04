-- Migration: rpc_mcp_expire_pending — monolith-mcp-layer Phase 2 (task 3.4)
-- Depends on: 0036/0040/0041, C12
--
-- Cleanup_Process (Req 16.2/16.4/16.5): กวาด Pending_Invocation ที่ status='pending' และพ้น Invocation_Expiry →
--   'expired' (no side effects ต่อ Monolith) + set tool_invocation 'expired' + audit 'expiry'.
-- decision-wins-race guard (Req 16.7): กรองเฉพาะ status='pending' — รายการที่ถูกตัดสินแล้ว (executed/rejected) ไม่ถูกแตะ.
-- คืนจำนวนที่ expire. เรียกโดย cron (mcp-pending-cleanup) ≤ 5 นาที.

create or replace function public.rpc_mcp_expire_pending()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select pi.id as pending_id, pi.tool_invocation_id, pi.invocation_expiry,
           ti.tool_name, ti.tool_class, ti.site_code, ti.autonomy_tier
    from public.pending_invocation pi
    join public.tool_invocation ti on ti.id = pi.tool_invocation_id
    where pi.status = 'pending'
      and pi.invocation_expiry <= timezone('utc', now())
    for update of pi
  loop
    update public.pending_invocation set status = 'expired' where id = r.pending_id;
    update public.tool_invocation set status = 'expired' where id = r.tool_invocation_id;
    perform public.rpc_mcp_audit('expiry', r.tool_name, r.tool_class, r.site_code,
      r.autonomy_tier, 'expired', null,
      jsonb_build_object('pending_id', r.pending_id, 'invocation_expiry', r.invocation_expiry));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.rpc_mcp_expire_pending() from public;
