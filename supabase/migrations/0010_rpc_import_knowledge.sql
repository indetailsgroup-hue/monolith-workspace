-- Migration: rpc_import_knowledge — monolith-workflow-copilot Phase 1 (Req 11)
-- Spec task: 3.2 (read-only Knowledge_Export import + last-good)
-- Depends on: 0002 (knowledge_import, process_model), 0003 (audit), C12
--
-- read-only: import payload เข้า ledger, validate, set is_current เฉพาะ valid, populate
-- process_model จาก payload (ไม่เขียนกลับ Obsidian). audit ทุกการ import. governance only (Req 11.6).

-- ---------------------------------------------------------------------------
-- validate helper (mirror src/workflow/knowledge/import.ts validateExport)
-- ---------------------------------------------------------------------------
create or replace function public.wf_validate_knowledge_export(p_payload jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_orders int[];
  v_n int;
  v_q text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return false;
  end if;
  if jsonb_typeof(p_payload -> 'pfmeaRiskRows') <> 'array' then return false; end if;
  if jsonb_typeof(p_payload -> 'processModel') <> 'array' then return false; end if;
  if jsonb_typeof(p_payload -> 'raciMap') <> 'object' then return false; end if;
  if jsonb_typeof(p_payload -> 'approvalQuorum') <> 'object' then return false; end if;
  if jsonb_typeof(p_payload -> 'knowledgeFreshness') <> 'object' then return false; end if;

  -- knowledgeFreshness ต้องมี 3 field เป็น string
  if (p_payload #>> '{knowledgeFreshness,sourceVersion}') is null
     or (p_payload #>> '{knowledgeFreshness,importedAt}') is null
     or (p_payload #>> '{knowledgeFreshness,reviewStatus}') is null then
    return false;
  end if;

  -- processModel order ต้องต่อเนื่อง 0..n-1 (Req 11.8)
  select array_agg((e ->> 'order')::int order by (e ->> 'order')::int)
    into v_orders
  from jsonb_array_elements(p_payload -> 'processModel') e;
  if v_orders is null then return false; end if;
  v_n := array_length(v_orders, 1);
  for i in 1..v_n loop
    if v_orders[i] <> i - 1 then return false; end if;
  end loop;

  -- approvalQuorum ทุกค่า ∈ {unanimous, majority, first_response}
  for v_q in select value::text from jsonb_each_text(p_payload -> 'approvalQuorum') loop
    if v_q not in ('unanimous', 'majority', 'first_response') then return false; end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_import_knowledge (SECURITY DEFINER, governance only)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_import_knowledge(
  p_payload jsonb,
  p_source_version text,
  p_review_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valid boolean;
  v_id uuid;
  e jsonb;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  v_valid := public.wf_validate_knowledge_export(p_payload);

  insert into public.knowledge_import (source_version, payload, review_status, is_valid, is_current)
  values (p_source_version, p_payload, coalesce(p_review_status, 'draft'), v_valid, false)
  returning id into v_id;

  if v_valid then
    -- last-good: ย้าย is_current มาที่ import ใหม่ (valid) เท่านั้น
    update public.knowledge_import set is_current = false where is_current;
    update public.knowledge_import set is_current = true where id = v_id;

    -- populate process_model จาก payload (read-only projection ของ Knowledge_Export)
    delete from public.process_model;
    for e in select value from jsonb_array_elements(p_payload -> 'processModel') loop
      insert into public.process_model (process_step, sub_process_group, canonical_order, approval_quorum, requires_approval)
      values (
        e ->> 'step',
        coalesce(e ->> 'group', 'Office'),
        (e ->> 'order')::int,
        nullif(p_payload #>> array['approvalQuorum', e ->> 'step'], '')::public.wf_approval_quorum,
        (p_payload #>> array['approvalQuorum', e ->> 'step']) is not null
      )
      on conflict (process_step) do update
        set sub_process_group = excluded.sub_process_group,
            canonical_order = excluded.canonical_order,
            approval_quorum = excluded.approval_quorum,
            requires_approval = excluded.requires_approval;
    end loop;
  end if;

  insert into public.workflow_audit_log (event_type, performed_by, detail)
  values ('knowledge_import', public.resolve_actor(),
    jsonb_build_object('import_id', v_id, 'source_version', p_source_version, 'is_valid', v_valid));

  return v_id;
end;
$$;

revoke all on function public.rpc_import_knowledge(jsonb, text, text) from public;
