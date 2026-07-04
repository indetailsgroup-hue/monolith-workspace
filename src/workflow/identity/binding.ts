// Feature: monolith-workflow-copilot — identity binding logic (Req 1.2, 1.3, 1.5)

export interface IdentityBinding {
  lineUserId: string;
  actorId: string;
  department: string;
  isActive: boolean;
}

export type BindingError = 'duplicate_active_line_user';

/**
 * Req 1.2 — ความไม่ซ้ำของ LINE_User_Id ต่อ binding ที่ active:
 * สร้าง binding ใหม่ได้ก็ต่อเมื่อไม่มี active binding ของ lineUserId เดิม.
 */
export function canCreateBinding(
  existing: readonly IdentityBinding[],
  lineUserId: string,
): { ok: true } | { ok: false; error: BindingError } {
  const hasActive = existing.some((b) => b.lineUserId === lineUserId && b.isActive);
  return hasActive ? { ok: false, error: 'duplicate_active_line_user' } : { ok: true };
}

/**
 * Req 1.5 — การเพิกถอน binding มีผลทันที: ไม่ส่ง direct push แม้ระเบียนยัง active เชิงเทคนิค.
 * ใช้ revokedAt flag ตัดสิน (ถ้าถูก revoke → ไม่ deliver).
 */
export function canDirectPush(binding: Pick<IdentityBinding, 'isActive'> & { revoked?: boolean }): boolean {
  return binding.isActive && binding.revoked !== true;
}

/**
 * Req 1.3 — resolve บทบาทผ่าน current_app_roles() ขณะ runtime (ไม่เก็บซ้ำใน binding).
 * helper นี้รับ resolver function เพื่อความ deterministic ในการทดสอบ.
 */
export function resolveRoles(
  lineUserId: string,
  currentAppRoles: (lineUserId: string) => readonly string[],
): readonly string[] {
  return currentAppRoles(lineUserId);
}
