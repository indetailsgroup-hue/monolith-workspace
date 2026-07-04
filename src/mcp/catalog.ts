// Feature: monolith-mcp-layer — Tool_Catalog filtering by authz (Req 1.2, 1.5)
// Pure; discovery คืนเฉพาะ tool ที่ Principal มีสิทธิ์เรียก (role-based) — site-level authz ทำตอน invoke.

import type { ToolClass } from './domain/types';

export interface CatalogTool {
  toolName: string;
  toolClass: ToolClass;
  /** บทบาทที่ tool ต้องการอย่างน้อยหนึ่ง (ว่าง = ทุก authenticated เรียกได้) */
  requiredRoles: readonly string[];
}

export interface CatalogContext {
  principalRoles: readonly string[];
  isGovernance: boolean;
}

/**
 * Req 1.2 — กรอง Tool_Catalog: คืนเฉพาะ tool ที่ Principal มีสิทธิ์ (governance เห็นทั้งหมด;
 * มิฉะนั้นต้องมีบทบาทใน requiredRoles หรือ tool ไม่ต้องการบทบาท).
 */
export function filterToolCatalog(
  tools: readonly CatalogTool[],
  ctx: CatalogContext,
): CatalogTool[] {
  return tools.filter(
    (t) =>
      ctx.isGovernance ||
      t.requiredRoles.length === 0 ||
      t.requiredRoles.some((r) => ctx.principalRoles.includes(r)),
  );
}

/** Req 1.5 — tool ไม่อยู่ใน catalog (ที่กรองแล้ว) → ถือว่าเรียกไม่ได้ */
export function isInCatalog(filtered: readonly CatalogTool[], toolName: string): boolean {
  return filtered.some((t) => t.toolName === toolName);
}
