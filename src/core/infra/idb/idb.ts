/**
 * idb.ts - IndexedDB Utilities
 *
 * Minimal, type-safe IndexedDB wrapper.
 * No external dependencies.
 *
 * BROWSER COMPATIBILITY:
 * - Chrome 24+, Firefox 16+, Safari 10+, Edge 12+
 */

// ============================================
// TYPES
// ============================================

export type IDBMode = 'readonly' | 'readwrite';

export interface IDBConfig {
  dbName: string;
  version: number;
  onUpgrade: (db: IDBDatabase, oldVersion: number, newVersion: number) => void;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Open IndexedDB database
 *
 * @param config - Database configuration
 * @returns Promise resolving to database instance
 */
export function openDb(config: IDBConfig): Promise<IDBDatabase>;
export function openDb(
  dbName: string,
  version: number,
  onUpgrade: (db: IDBDatabase) => void
): Promise<IDBDatabase>;
export function openDb(
  configOrName: IDBConfig | string,
  version?: number,
  onUpgrade?: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
  const config: IDBConfig =
    typeof configOrName === 'string'
      ? { dbName: configOrName, version: version!, onUpgrade: onUpgrade! }
      : configOrName;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(config.dbName, config.version);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion ?? config.version;
      config.onUpgrade(db, oldVersion, newVersion);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Close database connection
 */
export function closeDb(db: IDBDatabase): void {
  db.close();
}

// ============================================
// TRANSACTION HELPERS
// ============================================

/**
 * Execute a transaction with automatic error handling
 *
 * @param db - Database instance
 * @param storeNames - Store name(s) to access
 * @param mode - Transaction mode
 * @param fn - Function to execute within transaction
 * @returns Promise resolving when transaction completes
 */
export function tx<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBMode,
  fn: (stores: Record<string, IDBObjectStore>) => T | void
): Promise<T | void> {
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const t = db.transaction(names, mode);

    const stores: Record<string, IDBObjectStore> = {};
    for (const name of names) {
      stores[name] = t.objectStore(name);
    }

    let result: T | void;
    try {
      result = fn(stores);
    } catch (e) {
      reject(e);
      return;
    }

    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  });
}

// ============================================
// REQUEST HELPERS
// ============================================

/**
 * Convert IDBRequest to Promise
 */
export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get value from store by key
 */
export async function getByKey<T>(
  store: IDBObjectStore,
  key: IDBValidKey
): Promise<T | undefined> {
  return reqToPromise<T | undefined>(store.get(key));
}

/**
 * Put value into store
 */
export async function putValue<T>(
  store: IDBObjectStore,
  value: T,
  key?: IDBValidKey
): Promise<IDBValidKey> {
  return reqToPromise(key !== undefined ? store.put(value, key) : store.put(value));
}

/**
 * Delete value from store
 */
export async function deleteByKey(
  store: IDBObjectStore,
  key: IDBValidKey
): Promise<void> {
  return reqToPromise(store.delete(key)).then(() => {});
}

// ============================================
// CURSOR HELPERS
// ============================================

/**
 * Iterate over store with cursor
 */
export async function iterateCursor<T>(
  store: IDBObjectStore | IDBIndex,
  direction: IDBCursorDirection,
  callback: (value: T, key: IDBValidKey) => boolean | void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.openCursor(null, direction);

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }

      const shouldContinue = callback(cursor.value as T, cursor.key);
      if (shouldContinue === false) {
        resolve();
        return;
      }

      cursor.continue();
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Collect values from cursor into array
 */
export async function collectFromCursor<T>(
  store: IDBObjectStore | IDBIndex,
  direction: IDBCursorDirection,
  filter: (value: T, key: IDBValidKey) => boolean,
  limit: number
): Promise<T[]> {
  const results: T[] = [];

  await iterateCursor<T>(store, direction, (value, key) => {
    if (filter(value, key)) {
      results.push(value);
    }
    return results.length < limit;
  });

  return results;
}
