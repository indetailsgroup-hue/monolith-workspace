/**
 * Vitest Setup File
 *
 * Automatically imported by vitest when using jsdom environment.
 * Provides jest-dom matchers (toBeInTheDocument, etc.)
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Ensure @testing-library/react unmounts components between every test.
// jsdom environment does not provide a global `afterEach`, so the auto-cleanup
// guard inside @testing-library/react never fires unless we register it here.
afterEach(cleanup);

// ── crypto.randomUUID stub ────────────────────────────────────────────────────
// jsdom does not expose crypto.randomUUID; provide a deterministic v4-shaped id
// so tests that call getOrCreateAnonymousToken() or similar helpers do not throw.
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...(typeof crypto !== 'undefined' ? crypto : {}),
      randomUUID: () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        }) as `${string}-${string}-${string}-${string}-${string}`,
      getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
        if (arr && 'length' in arr) {
          for (let i = 0; i < (arr as unknown as { length: number }).length; i++) {
            (arr as unknown as { [i: number]: number })[i] = (Math.random() * 256) | 0;
          }
        }
        return arr;
      },
    },
    writable: true,
    configurable: true,
  });
}

// ── localStorage stub ─────────────────────────────────────────────────────────
// jsdom includes localStorage, but some test environments reset it between
// imports. This in-memory fallback ensures isolation for period/token guards.
const _store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => _store[key] ?? null,
    setItem: (key: string, value: string) => { _store[key] = String(value); },
    removeItem: (key: string) => { delete _store[key]; },
    clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
    get length() { return Object.keys(_store).length; },
    key: (i: number) => Object.keys(_store)[i] ?? null,
  },
  writable: true,
  configurable: true,
});

// ── window.matchMedia stub ────────────────────────────────────────────────────
// Required by Recharts ResponsiveContainer and any media-query hooks.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ── ResizeObserver stub ───────────────────────────────────────────────────────
// jsdom lacks ResizeObserver; Recharts and several UI components observe resize.
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
