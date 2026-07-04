// Feature: monolith-accounting — IAM row-scoping core (AUTHZ-1 User-Scoped Result / RLS)
// Pure logic mirror ของ enforceScope: effective identity = caller; ผลลัพธ์ ⊆ ข้อมูลที่ผู้เรียกมีสิทธิ์;
//   คำขอข้ามแผนกที่ไม่มีสิทธิ์ถูกปฏิเสธ. runtime จริงบังคับด้วย Postgres RLS (has_site_access/is_governance_role).

export interface AuthContext {
  userId: string;
  departments: readonly string[]; // แผนก/ไซต์ที่มีสิทธิ์
  isGovernance: boolean;          // governance ข้าม scope ได้
}

export interface ScopedRow {
  ownerUserId: string;
  departmentId: string;
}

/** แถวมองเห็นได้ ⟺ governance | เป็นเจ้าของ | อยู่ในแผนกที่มีสิทธิ์ */
export function isRowVisible(row: ScopedRow, ctx: AuthContext): boolean {
  return ctx.isGovernance || row.ownerUserId === ctx.userId || ctx.departments.includes(row.departmentId);
}

/** Req 13.1/13.2/13.5 — คืนเฉพาะแถวที่ผู้เรียกมีสิทธิ์ (RLS filter) */
export function enforceScope<T extends ScopedRow>(rows: readonly T[], ctx: AuthContext): T[] {
  return rows.filter((r) => isRowVisible(r, ctx));
}

/** Req 13.2 — คำขอข้ามแผนก: อนุญาต ⟺ governance | มีสิทธิ์แผนกนั้น (มิฉะนั้นปฏิเสธ) */
export function authorizeCrossDept(ctx: AuthContext, targetDept: string): boolean {
  return ctx.isGovernance || ctx.departments.includes(targetDept);
}

/** เข้าถึงข้อมูลแผนกอื่นที่ไม่มีสิทธิ์ → throw (fail-closed) */
export function assertDeptAccess(ctx: AuthContext, targetDept: string): void {
  if (!authorizeCrossDept(ctx, targetDept)) {
    throw new Error(`AUTHZ: ปฏิเสธคำขอข้ามแผนก ${targetDept} (ไม่มีสิทธิ์)`);
  }
}
