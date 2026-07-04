// Feature: monolith-accounting — MCP secure filter enforcement core (AUTHZ-2)
// Pure logic: ทุกคำสั่งผ่าน MCP ต้องผ่าน secure API filter + ตรวจสิทธิ์ ก่อน execute เสมอ (ไม่มี bypass path).
// runtime จริง = mcp-layer RPC (rpc_mcp_invoke_read + authz). โมเดลนี้พิสูจน์ invariant "no-bypass".

export type ToolClass = 'Read_Tool' | 'Write_Tool' | 'Approval_Tool';

export interface ToolCall {
  toolName: string;
  toolClass: ToolClass;
  requiredRoles: readonly string[];
  paramsValid: boolean; // ผลการ validate พารามิเตอร์ (secure API filter)
}

export interface InvokeContext {
  principalRoles: readonly string[];
  isGovernance: boolean;
}

const VALID_CLASSES: ReadonlySet<string> = new Set(['Read_Tool', 'Write_Tool', 'Approval_Tool']);

/** secure API filter: toolName ไม่ว่าง + class รู้จัก + params ผ่าน validate */
export function passesSecureFilter(call: ToolCall): boolean {
  return call.toolName.length > 0 && VALID_CLASSES.has(call.toolClass) && call.paramsValid === true;
}

/** ตรวจสิทธิ์: governance | ไม่ต้องการ role | มี role ตรง */
export function isAuthorized(call: ToolCall, ctx: InvokeContext): boolean {
  return ctx.isGovernance || call.requiredRoles.length === 0 || call.requiredRoles.some((r) => ctx.principalRoles.includes(r));
}

/** เรียกได้ ⟺ ผ่าน secure filter AND authz (ทั้งสองชั้น) */
export function canInvoke(call: ToolCall, ctx: InvokeContext): boolean {
  return passesSecureFilter(call) && isAuthorized(call, ctx);
}

export class SecureFilterError extends Error {
  constructor(reason: string) {
    super(`AUTHZ-2: ${reason}`);
    this.name = 'SecureFilterError';
  }
}

/**
 * Req 9.2 — invoke: execute เฉพาะเมื่อผ่านทั้ง secure filter และ authz (no bypass).
 *   ไม่ผ่าน → throw ก่อนเรียก exec (exec ไม่ถูกเรียกเด็ดขาด).
 */
export function invoke<T>(call: ToolCall, ctx: InvokeContext, exec: () => T): T {
  if (!passesSecureFilter(call)) throw new SecureFilterError('ไม่ผ่าน secure API filter');
  if (!isAuthorized(call, ctx)) throw new SecureFilterError('ไม่มีสิทธิ์เรียกใช้');
  return exec();
}
