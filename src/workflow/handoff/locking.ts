// Feature: monolith-workflow-copilot — optimistic locking + atomic transition (Req 16.2, 16.3, 16.4)

export interface VersionedState {
  version: number;
}

export type TransitionResult<S> =
  | { ok: true; next: S }
  | { ok: false; error: 'version_conflict' };

/**
 * Req 16.2/16.3 — optimistic lock: ใช้ได้ก็ต่อเมื่อ expectedVersion ตรงกับ current.
 * ถ้าไม่ตรง (มีการเปลี่ยนก่อน commit) → fail, state คงเดิม (caller ไม่ apply).
 */
export function checkVersion(current: number, expected: number): boolean {
  return current === expected;
}

/**
 * Req 16.3/16.4 — atomic transition แบบ all-or-nothing:
 * ตรวจ version ก่อน, ถ้าตรง → คำนวณ state ใหม่ (apply) + increment version; ถ้าไม่ตรง → ไม่แตะ state.
 * `apply` ต้องเป็น pure (ไม่มี side-effect บางส่วน) เพื่อรับประกัน atomicity.
 */
export function atomicTransition<S extends VersionedState>(
  state: S,
  expectedVersion: number,
  apply: (s: S) => Omit<S, 'version'>,
): TransitionResult<S> {
  if (!checkVersion(state.version, expectedVersion)) {
    return { ok: false, error: 'version_conflict' };
  }
  const applied = apply(state);
  const next = { ...(applied as S), version: state.version + 1 };
  return { ok: true, next };
}
