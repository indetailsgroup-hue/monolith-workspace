// Feature: installation-pm — Spike 0.3 (D-6a): เลือกกลยุทธ์ flush ตามความสามารถ browser
//
// ข้อค้นพบ spike (บันทึกเต็มใน .kiro/specs/installation-pm/spike-0.3-offline-lite-queue.md):
//   - Background Sync API มีเฉพาะ Chromium (Android Chrome = เครื่องช่างส่วนใหญ่) — Safari/iOS PWA ไม่มี
//   - iOS จึงต้องใช้ fallback: flush ตอน 'online' + ตอนแอปกลับมา foreground (visibilitychange) + ตอนเปิดแอป
//   - ทั้งสองทางใช้คิวเดียวกันใน IndexedDB (SW กับ window เห็น DB เดียวกัน) — logic ไม่แตกสาย

export type SyncStrategy = 'background-sync' | 'foreground-events';

export interface SyncCapabilities {
  hasServiceWorker: boolean;
  /** 'sync' ใน ServiceWorkerRegistration.prototype (Chromium เท่านั้น ณ 2026) */
  hasBackgroundSync: boolean;
}

/** ตรวจจาก runtime จริง (เรียกใน window context) */
export function detectCapabilities(scope: {
  navigator?: { serviceWorker?: unknown };
  ServiceWorkerRegistration?: { prototype: object };
} = globalThis as never): SyncCapabilities {
  const hasServiceWorker = scope.navigator?.serviceWorker !== undefined;
  const hasBackgroundSync =
    hasServiceWorker &&
    scope.ServiceWorkerRegistration !== undefined &&
    'sync' in scope.ServiceWorkerRegistration.prototype;
  return { hasServiceWorker, hasBackgroundSync };
}

/**
 * Background Sync เมื่อมี (ส่งได้แม้ผู้ใช้ปิดแท็บไปแล้ว); ไม่มีก็ผูก event หน้าแอปแทน —
 * ยอมรับได้สำหรับ MVP เพราะช่างเปิดแอปตอนอยากรู้ว่า "ค้างส่งกี่รายการ" อยู่แล้ว (D-6a UI)
 */
export function pickSyncStrategy(caps: SyncCapabilities): SyncStrategy {
  return caps.hasBackgroundSync ? 'background-sync' : 'foreground-events';
}

export const SYNC_TAG = 'installation-queue-flush';

export interface ForegroundHooks {
  onOnline: () => void;
  onVisible: () => void;
}

/**
 * ผูก event ฝั่ง foreground (ใช้ทั้งเป็น fallback และเสริม Background Sync —
 * flush ทันทีที่เห็นโอกาสโดยไม่รอ SW): 'online' + กลับมา visible
 * คืน unbind function
 */
export function bindForegroundFlush(
  target: {
    addEventListener: (type: string, cb: () => void) => void;
    removeEventListener: (type: string, cb: () => void) => void;
  },
  document: { visibilityState?: string } & {
    addEventListener?: (type: string, cb: () => void) => void;
    removeEventListener?: (type: string, cb: () => void) => void;
  },
  flush: () => void,
): () => void {
  const onOnline = () => flush();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') flush();
  };
  target.addEventListener('online', onOnline);
  document.addEventListener?.('visibilitychange', onVisibility);
  return () => {
    target.removeEventListener('online', onOnline);
    document.removeEventListener?.('visibilitychange', onVisibility);
  };
}
