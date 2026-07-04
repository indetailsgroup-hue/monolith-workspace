-- Migration: rpc_mcp_audit — monolith-mcp-layer Phase 2 (task 3.6 — append-only audit writer)
-- Depends on: 0037_mcp_audit.sql, C12 (resolve_actor)
--
-- append-only writer (reuse audit pattern). SECURITY DEFINER, principal = resolve_actor().
-- Model_Provenance: unknown-fallback + truncate ตามเพดาน (Req 18.2/18.6/18.8); scrub = หน้าที่ caller (ส่ง detail ที่ scrub แล้ว).
-- คงรายการเสมอ (Req 11.6/18.5). คืน id ของรายการที่บันทึก.

create or replace function public.rpc_mcp_audit(
  p_event_type text,
  p_tool_name text default null,
  p_tool_class public.mcp_tool_class default null,
  p_site_code text default null,
  p_autonomy_tier text default null,
  p_result text default null,
  p_model_provenance jsonb default null,
  p_detail jsonb default null,
  p_provenance_max_len int default 2000   -- เพดานความยาว Model_Provenance (configurable, Req 18.8)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prov jsonb;
begin
  -- Req 18.2 unknown-fallback: ไม่มี/ไม่ครบ → unknown (ไม่ทิ้งรายการ audit)
  v_prov := coalesce(p_model_provenance, jsonb_build_object('model', 'unknown', 'provider', 'unknown'));

  -- Req 18.8 truncate: ถ้า serialize ยาวเกินเพดาน → บันทึก unknown แทนเนื้อหาเต็ม (fail-safe minimal)
  if length(v_prov::text) > p_provenance_max_len then
    v_prov := jsonb_build_object('model', 'unknown', 'provider', 'unknown', 'truncated', true);
  end if;

  insert into public.mcp_audit_log
    (event_type, tool_name, tool_class, principal, site_code, autonomy_tier, result, model_provenance, detail)
  values
    (p_event_type, p_tool_name, p_tool_class, public.resolve_actor(), p_site_code,
     p_autonomy_tier, p_result, v_prov, p_detail)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_mcp_audit(text, text, public.mcp_tool_class, text, text, text, jsonb, jsonb, int) from public;
