-- Migration: rpc_record_copilot_suggestion — monolith-workflow-copilot Phase 1 (Req 5.8, 17)
-- Spec task: 14.3 (persist suggestion + audit; advisory-only, D2-gated)
-- Depends on: 0002 (copilot_suggestion CHECK options 2–3), 0003 (audit), C12
--
-- advisory-only: persist เท่านั้น ไม่เปลี่ยน work_item state. mirror src/workflow/copilot/builder.ts:
--   ต้องมี citation, autonomy_tier ≤ L1 (clamp ฝั่ง logic), options 2–3 (DB CHECK).

create or replace function public.rpc_record_copilot_suggestion(
  p_work_item_id uuid,
  p_options jsonb,
  p_pfmea_citation jsonb,
  p_autonomy_tier text,
  p_source_version text,
  p_imported_at timestamptz,
  p_review_status text,
  p_is_stale boolean default false,
  p_is_low_confidence boolean default false,
  p_site_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- ต้องอ้าง PFMEA เสมอ (Req 5.4)
  if p_pfmea_citation is null or jsonb_typeof(p_pfmea_citation) = 'null' then
    raise exception 'copilot suggestion must cite PFMEA' using errcode = 'check_violation';
  end if;
  -- D2 ตัวเลือก C: tier ต้อง ≤ L1 ใน phase นี้ (Req 19.5/19.11 — กันไว้ชั้นบน)
  if p_autonomy_tier not in ('L0_advisory', 'L1_propose') then
    raise exception 'autonomy_tier exceeds phase cap (L1): %', p_autonomy_tier using errcode = 'check_violation';
  end if;

  -- options 2–3 บังคับโดย DB CHECK ck_copilot_options_2_3 (ไม่ต้องเช็คซ้ำ; ปล่อยให้ DB reject)
  insert into public.copilot_suggestion
    (work_item_id, site_code, options, pfmea_citation, autonomy_tier, source_version, imported_at, review_status, is_stale, is_low_confidence)
  values
    (p_work_item_id, p_site_code, p_options, p_pfmea_citation, p_autonomy_tier, p_source_version, p_imported_at, p_review_status, p_is_stale, p_is_low_confidence)
  returning id into v_id;

  insert into public.workflow_audit_log (event_type, work_item_id, site_code, performed_by, detail)
  values ('copilot', p_work_item_id, p_site_code, public.resolve_actor(),
    jsonb_build_object('suggestion_id', v_id, 'autonomy_tier', p_autonomy_tier, 'advisory_only', true));

  return v_id;
end;
$$;

revoke all on function public.rpc_record_copilot_suggestion(uuid, jsonb, jsonb, text, text, timestamptz, text, boolean, boolean, text) from public;
