// Feature: monolith-workflow-copilot — RLS predicate evaluation (Req 9.4, 10.1, 10.2)

/**
 * Req 10.6 / has_site_access semantics — site_code = null → false (ไม่มีสิทธิ์โดยปริยาย).
 */
export function hasSiteAccess(
  siteCode: string | null,
  accessibleSites: readonly string[],
): boolean {
  if (siteCode === null) return false;
  return accessibleSites.includes(siteCode);
}

export interface RlsReadInput {
  /** is_governance_role() — เห็นทุก site */
  isGovernance: boolean;
  /** site_code ของแถว (null → ต้องเป็น governance ถึงจะเห็น) */
  rowSiteCode: string | null;
  /** site ที่ผู้เรียกเข้าถึงได้ */
  accessibleSites: readonly string[];
}

/**
 * Req 9.4/10.1/10.2 — อ่านได้ก็ต่อเมื่อ governance หรือ has_site_access(row.site_code).
 * mirror policy: USING (is_governance_role() OR has_site_access(site_code)).
 */
export function canReadRow(input: RlsReadInput): boolean {
  if (input.isGovernance) return true;
  return hasSiteAccess(input.rowSiteCode, input.accessibleSites);
}
