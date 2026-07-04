// Feature: monolith-mcp-layer — shared domain types (Req 1, 2, 4, 15, 16)
// type projection เท่านั้น; แหล่งความจริง schema = mcp_tool_registry (DB) + design.md.

/** ประเภทธรรมาภิบาลของ MCP_Tool (Req 1.3) */
export type ToolClass = 'Read_Tool' | 'Write_Tool' | 'Approval_Tool';

/** สถานะ Tool_Invocation (mirror enum mcp_invocation_status) */
export type InvocationStatus =
  | 'executed'
  | 'pending'
  | 'rejected'
  | 'expired'
  | 'throttled'
  | 'error';

/** สถานะ Pending_Invocation (mirror enum mcp_pending_status) */
export type PendingStatus = 'pending' | 'executed' | 'rejected' | 'expired';

/** ขอบเขตการนับ rate-limit (Req 15, mirror enum mcp_scope_kind) */
export type ScopeKind = 'Principal' | 'MCP_Client' | 'Tool_Class';

/** Principal = ตัวตนที่ยืนยันแล้ว (resolve_actor → text email-based) (Req 2.5) */
export type Principal = string;
