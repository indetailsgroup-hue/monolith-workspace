// Feature: monolith-mcp-layer — Tool_Authorization eval (Req 3.1, 3.2, 3.3, 3.4, 3.6, 19.3)
// Pure deterministic — mirror สิ่งที่ rpc_mcp_* จะ re-check ผ่าน C12 (has_any_app_role/has_site_access/get_active_site_codes).
//
// หลัก (Req 19.3 confused-deputy): authz re-derive จาก Principal + C12_Role ของ "เซสชันที่ยืนยันแล้ว" เท่านั้น —
// ไม่เชื่อ actor id / คำสั่งใน input ของ client. ฟังก์ชันนี้รับ role ที่ resolve มาแล้ว (จาก current_app_roles) ไม่รับจาก client.

import type { ToolClass } from './domain/types';

export type AuthzResult =
  | { ok: true }
  | { ok: false; reason: 'insufficient_role' | 'site_access_denied' | 'site_inactive' };

export interface AuthzInput {
  /** ประเภท tool — governance ข้ามไซต์ได้เฉพาะ Read_Tool (Req 3.3) */
  toolClass: ToolClass;
  /** บทบาท C12 ของ Principal (จาก current_app_roles) — ไม่ใช่จาก client */
  principalRoles: readonly string[];
  /** บทบาทที่ tool ต้องการอย่างน้อยหนึ่ง (has_any_app_role) */
  requiredRoles: readonly string[];
  /** Principal ถือ Governance_Role หรือไม่ (อ่านข้ามไซต์ได้สำหรับ Read) (Req 3.3) */
  isGovernance: boolean;
  /** site_code ที่ tool จะดำเนินการ (null = ไม่ผูกไซต์) */
  siteCode: string | null;
  /** ไซต์ที่ Principal เข้าถึงได้ (has_site_access = true) */
  accessibleSites: readonly string[];
  /** ไซต์ที่ active (get_active_site_codes) */
  activeSites: readonly string[];
}

/**
 * Req 3 — ประเมิน Tool_Authorization:
 *   1. ต้องมีบทบาทอย่างน้อยหนึ่งใน requiredRoles (has_any_app_role) — Req 3.1
 *   2. ถ้าผูก site: site ต้อง ∈ activeSites (Req 3.6) และ
 *      (governance ข้ามได้ **เฉพาะ Read_Tool** — Req 3.3 | มิฉะนั้นต้อง has_site_access — Req 3.2/3.4).
 *      Write_Tool/Approval_Tool ที่ผูกไซต์ ต้อง has_site_access เสมอแม้เป็น governance.
 */
export function evaluateToolAuthorization(input: AuthzInput): AuthzResult {
  const hasRole =
    input.requiredRoles.length === 0 ||
    input.requiredRoles.some((r) => input.principalRoles.includes(r));
  if (!hasRole) return { ok: false, reason: 'insufficient_role' };

  if (input.siteCode !== null) {
    // Req 3.6 — site ต้อง active เสมอ (governance ก็ไม่ข้ามเงื่อนไข active)
    if (!input.activeSites.includes(input.siteCode)) {
      return { ok: false, reason: 'site_inactive' };
    }
    // Req 3.3 — governance อ่านข้ามไซต์ได้ "เฉพาะ Read_Tool"; Write/Approval ต้อง has_site_access (Req 3.2/3.4)
    const governanceCrossSite = input.isGovernance && input.toolClass === 'Read_Tool';
    if (!governanceCrossSite && !input.accessibleSites.includes(input.siteCode)) {
      return { ok: false, reason: 'site_access_denied' };
    }
  }
  return { ok: true };
}
