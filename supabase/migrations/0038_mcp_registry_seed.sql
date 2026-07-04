-- Migration: mcp_registry_seed — monolith-mcp-layer Phase 2 (task 1.3)
-- Depends on: 0036_mcp_init.sql
--
-- Seed mcp_tool_registry 3 tools (Tool_Catalog เริ่มต้นจาก design):
--   query_knowledge          = Read_Tool     (wrap Knowledge_Export query, read-only)   — requires_approval=false
--   create_work_item         = Write_Tool    (wrap rpc_create_work_item)                — requires_approval=true
--   record_approval_decision = Approval_Tool (wrap rpc_record_approval_decision)         — requires_approval=true
-- requires_approval สอดคล้อง Tool_Class ตาม CHECK mcp_registry_approval_matches_class (Req 1.6).
-- default_autonomy_tier = ป้าย D2 (Read auto-within-guardrail; Write/Approval propose→human gate); การบังคับจริงอยู่ใน autonomy.ts/RPC.
-- idempotent: on conflict do update (re-seed schema ได้เมื่อ db reset / แก้ schema).

insert into public.mcp_tool_registry
  (tool_name, tool_class, requires_approval, default_autonomy_tier, input_schema, output_schema)
values
  (
    'query_knowledge', 'Read_Tool', false, 'L2_auto_within_guardrail',
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('query'),
      'properties', jsonb_build_object(
        'query', jsonb_build_object('type', 'string'),
        'process_step', jsonb_build_object('type', 'string')
      )
    ),
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('rows', 'source_version', 'imported_at'),
      'properties', jsonb_build_object(
        'rows', jsonb_build_object('type', 'array'),
        'source_version', jsonb_build_object('type', 'string'),
        'imported_at', jsonb_build_object('type', 'string'),
        'low_confidence', jsonb_build_object('type', 'boolean')
      )
    )
  ),
  (
    'create_work_item', 'Write_Tool', true, 'L1_propose',
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('site_code'),
      'properties', jsonb_build_object(
        'site_code', jsonb_build_object('type', 'string'),
        'data', jsonb_build_object('type', 'object')
      )
    ),
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('work_item_id'),
      'properties', jsonb_build_object(
        'work_item_id', jsonb_build_object('type', 'string', 'format', 'uuid')
      )
    )
  ),
  (
    'record_approval_decision', 'Approval_Tool', true, 'L1_propose',
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('webhook_event_id', 'work_item_id', 'decision'),
      'properties', jsonb_build_object(
        'webhook_event_id', jsonb_build_object('type', 'string'),
        'work_item_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'decision', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('approved', 'rejected'))
      )
    ),
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('result'),
      'properties', jsonb_build_object(
        'result', jsonb_build_object('type', 'string')
      )
    )
  )
on conflict (tool_name) do update set
  tool_class            = excluded.tool_class,
  requires_approval     = excluded.requires_approval,
  default_autonomy_tier = excluded.default_autonomy_tier,
  input_schema          = excluded.input_schema,
  output_schema         = excluded.output_schema;
