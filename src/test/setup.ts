/**
 * Vitest Global Setup
 *
 * Polyfills browser APIs not available in Node.js test environment.
 */

// Polyfill IndexedDB for all tests
import 'fake-indexeddb/auto';

// Polyfill localStorage for tests that use it (e.g., maintenance log)
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage;
}
