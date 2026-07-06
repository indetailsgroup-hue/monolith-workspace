// Feature: installation-pm — Spike 0.3 (D-6a): เลือกกลยุทธ์ sync ตาม browser + foreground fallback
import { describe, it, expect, vi } from 'vitest';
import { detectCapabilities, pickSyncStrategy, bindForegroundFlush } from '../sw-bridge';

describe('pickSyncStrategy — Chromium ได้ Background Sync, iOS ได้ foreground fallback', () => {
  it('มี Background Sync → background-sync (Android Chrome = เครื่องช่างส่วนใหญ่)', () => {
    expect(pickSyncStrategy({ hasServiceWorker: true, hasBackgroundSync: true })).toBe(
      'background-sync',
    );
  });

  it('ไม่มี Background Sync (Safari/iOS PWA) → foreground-events', () => {
    expect(pickSyncStrategy({ hasServiceWorker: true, hasBackgroundSync: false })).toBe(
      'foreground-events',
    );
    expect(pickSyncStrategy({ hasServiceWorker: false, hasBackgroundSync: false })).toBe(
      'foreground-events',
    );
  });
});

describe('detectCapabilities', () => {
  it('Chromium-like: มี serviceWorker + sync ใน SWRegistration prototype', () => {
    const caps = detectCapabilities({
      navigator: { serviceWorker: {} },
      ServiceWorkerRegistration: { prototype: { sync: {} } },
    });
    expect(caps).toEqual({ hasServiceWorker: true, hasBackgroundSync: true });
  });

  it('Safari-like: มี serviceWorker แต่ไม่มี sync', () => {
    const caps = detectCapabilities({
      navigator: { serviceWorker: {} },
      ServiceWorkerRegistration: { prototype: {} },
    });
    expect(caps).toEqual({ hasServiceWorker: true, hasBackgroundSync: false });
  });

  it('ไม่มี service worker เลย (browser เก่า/webview จำกัด)', () => {
    expect(detectCapabilities({ navigator: {} })).toEqual({
      hasServiceWorker: false,
      hasBackgroundSync: false,
    });
  });
});

describe('bindForegroundFlush', () => {
  function fakeTarget() {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener: (type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      },
      removeEventListener: (type: string, cb: () => void) => {
        listeners.get(type)?.delete(cb);
      },
      fire: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
      count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    };
  }

  it("flush ตอน 'online' และตอนกลับมา visible เท่านั้น (ตอน hidden ไม่ flush)", () => {
    const win = fakeTarget();
    const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' as string });
    const flush = vi.fn();
    bindForegroundFlush(win, doc, flush);

    win.fire('online');
    expect(flush).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(flush).toHaveBeenCalledTimes(1); // hidden → ไม่ flush

    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('unbind แล้ว event ไม่ trigger flush อีก (กัน listener รั่วตอน component unmount)', () => {
    const win = fakeTarget();
    const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' as string });
    const flush = vi.fn();
    const unbind = bindForegroundFlush(win, doc, flush);
    unbind();
    win.fire('online');
    doc.fire('visibilitychange');
    expect(flush).not.toHaveBeenCalled();
    expect(win.count() + doc.count()).toBe(0);
  });
});
