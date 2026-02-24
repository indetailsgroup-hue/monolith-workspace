/**
 * indexedDbToolingStore.ts - Tool Usage IndexedDB Store
 *
 * Persists tool usage events and aggregated records to IndexedDB.
 * Read-only observer pattern - does not affect G-code output.
 *
 * @version 1.1.0 - Phase D6.1 (added resetToolWear, listToolWearThresholds)
 */

import type { ToolUsageEvent, ToolUsageRecord, ToolWearThreshold } from '../types';
import { initRecord, mergeEventIntoRecord, nowMs } from './toolingStoreHelpers';

const DB_NAME = 'monolith-factory-tooling';
const DB_VERSION = 1;

const STORE_EVENTS = 'events';
const STORE_RECORDS = 'records';
const STORE_THRESHOLDS = 'thresholds';

type EventRow = ToolUsageEvent & {
  id?: number; // autoIncrement
  toolId: string; // denormalized for indexing
};

/**
 * Open the tooling database.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const events = db.createObjectStore(STORE_EVENTS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        events.createIndex('toolId', 'toolId', { unique: false });
        events.createIndex('jobId', 'jobId', { unique: false });
        events.createIndex('occurredAt', 'occurredAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'toolId' });
      }

      if (!db.objectStoreNames.contains(STORE_THRESHOLDS)) {
        db.createObjectStore(STORE_THRESHOLDS, { keyPath: 'toolId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

/**
 * Wait for a transaction to complete.
 */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Convert IDBRequest to Promise.
 */
function reqToPromise<T = unknown>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Reset (delete) the tooling database.
 * Use in tests only.
 */
export async function resetToolingDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to delete IndexedDB'));
    req.onblocked = () => resolve(); // tests sometimes block; ok to proceed
  });
}

/**
 * Append tool usage events to the store.
 *
 * - Optionally persists events to event log (default: true)
 * - Always updates aggregated ToolUsageRecord per toolId
 *
 * @param events - Array of ToolUsageEvent (should be stable-sorted from D6-B)
 * @param opts - Options (persistEventLog: boolean)
 */
export async function appendToolUsageEvents(
  events: ToolUsageEvent[],
  opts?: { persistEventLog?: boolean }
): Promise<void> {
  const persistEventLog = opts?.persistEventLog ?? true;
  const db = await openDb();
  const tx = db.transaction([STORE_EVENTS, STORE_RECORDS], 'readwrite');

  const eventsStore = tx.objectStore(STORE_EVENTS);
  const recordsStore = tx.objectStore(STORE_RECORDS);

  const updatedAt = nowMs();

  // Deterministic aggregation: process in given order (caller already stable-sorted in D6-B)
  for (const e of events) {
    const toolId = e.tool.toolId;
    if (!toolId) continue;

    if (persistEventLog) {
      const row: EventRow = { ...e, toolId };
      eventsStore.add(row);
    }

    // Load existing record and update (sync per-tool)
    const existing: ToolUsageRecord | undefined = await reqToPromise(
      recordsStore.get(toolId)
    );
    const base = existing ?? initRecord(toolId, updatedAt);
    const merged = mergeEventIntoRecord(base, e, updatedAt);
    recordsStore.put(merged);
  }

  await txDone(tx);
  db.close();
}

/**
 * Get a tool usage record by toolId.
 */
export async function getToolUsageRecord(toolId: string): Promise<ToolUsageRecord | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_RECORDS], 'readonly');
  const store = tx.objectStore(STORE_RECORDS);
  const res = (await reqToPromise(store.get(toolId))) as ToolUsageRecord | undefined;
  await txDone(tx);
  db.close();
  return res ?? null;
}

/**
 * List all tool usage records.
 * Returns in stable order (sorted by toolId).
 */
export async function listToolUsageRecords(): Promise<ToolUsageRecord[]> {
  const db = await openDb();
  const tx = db.transaction([STORE_RECORDS], 'readonly');
  const store = tx.objectStore(STORE_RECORDS);

  const records = await new Promise<ToolUsageRecord[]>((resolve, reject) => {
    const out: ToolUsageRecord[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return resolve(out);
      out.push(c.value as ToolUsageRecord);
      c.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('Cursor failed'));
  });

  await txDone(tx);
  db.close();

  // Stable ordering for UI/tests
  return records.sort((a, b) => (a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0));
}

/**
 * Set a tool wear threshold.
 */
export async function setToolWearThreshold(threshold: ToolWearThreshold): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_THRESHOLDS], 'readwrite');
  tx.objectStore(STORE_THRESHOLDS).put(threshold);
  await txDone(tx);
  db.close();
}

/**
 * Get a tool wear threshold by toolId.
 */
export async function getToolWearThreshold(
  toolId: string
): Promise<ToolWearThreshold | null> {
  const db = await openDb();
  const tx = db.transaction([STORE_THRESHOLDS], 'readonly');
  const res = (await reqToPromise(tx.objectStore(STORE_THRESHOLDS).get(toolId))) as
    | ToolWearThreshold
    | undefined;
  await txDone(tx);
  db.close();
  return res ?? null;
}

/**
 * Get tool usage events by toolId.
 * Returns events in chronological order (by occurredAt).
 *
 * @param toolId - Tool identifier
 * @param limit - Maximum number of events to return (default: 500)
 */
export async function getToolUsageEventsByTool(
  toolId: string,
  limit = 500
): Promise<ToolUsageEvent[]> {
  const db = await openDb();
  const tx = db.transaction([STORE_EVENTS], 'readonly');
  const store = tx.objectStore(STORE_EVENTS);
  const idx = store.index('toolId');

  const rows = await new Promise<EventRow[]>((resolve, reject) => {
    const out: EventRow[] = [];
    const req = idx.openCursor(IDBKeyRange.only(toolId));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out.push(c.value);
      if (out.length >= limit) return resolve(out);
      c.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('Cursor failed'));
  });

  await txDone(tx);
  db.close();

  // Drop internal row id/toolId field, return as ToolUsageEvent
  // Sort by occurredAt for chronological order
  return rows
    .sort((a, b) => a.occurredAt - b.occurredAt)
    .map(({ id: _id, toolId: _t, ...rest }) => rest as unknown as ToolUsageEvent);
}

// ============================================================================
// D6.1: Reset & Maintenance Functions
// ============================================================================

/**
 * Reason for resetting tool wear.
 */
export type ResetReason = 'REPLACED' | 'RESHARPENED' | 'MANUAL';

/**
 * Options for resetToolWear function.
 */
export interface ResetToolWearOptions {
  /** Reason for reset */
  reason?: ResetReason;
  /** Optional note (for audit/reference) */
  note?: string;
  /** Timestamp of reset (defaults to now) */
  occurredAt?: number;
  /** Whether to delete event history for this tool (default: false) */
  deleteEventHistory?: boolean;
}

/**
 * Reset tool wear data for a specific tool.
 *
 * This clears the aggregated wear data, allowing the tool to start fresh
 * (e.g., after replacement or resharpening).
 *
 * Does NOT delete the threshold - only resets the usage record.
 * Does NOT affect G-code generation.
 *
 * @param toolId - Tool identifier to reset
 * @param opts - Reset options (reason, note, timestamp)
 */
export async function resetToolWear(
  toolId: string,
  opts?: ResetToolWearOptions
): Promise<void> {
  const db = await openDb();
  const occurredAt = opts?.occurredAt ?? nowMs();

  const tx = db.transaction([STORE_RECORDS, STORE_EVENTS], 'readwrite');
  const recordsStore = tx.objectStore(STORE_RECORDS);

  // Reset the record by creating a fresh one
  const freshRecord: ToolUsageRecord = {
    toolId,
    totalHoles: 0,
    totalDepthMm: 0,
    wearUnits: 0,
    byMaterial: {},
    lastJobId: undefined,
    lastOccurredAt: undefined,
    updatedAt: occurredAt,
  };

  recordsStore.put(freshRecord);

  // Optionally delete event history
  if (opts?.deleteEventHistory) {
    const eventsStore = tx.objectStore(STORE_EVENTS);
    const idx = eventsStore.index('toolId');

    // Delete all events for this tool
    const deleteReq = idx.openCursor(IDBKeyRange.only(toolId));
    deleteReq.onsuccess = () => {
      const cursor = deleteReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }

  await txDone(tx);
  db.close();

  // Log to localStorage for minimal audit trail (optional, non-critical)
  try {
    logMaintenanceAction(toolId, 'RESET', opts?.reason, opts?.note, occurredAt);
  } catch {
    // Non-critical - swallow errors
  }
}

/**
 * List all tool wear thresholds.
 * Returns in stable order (sorted by toolId).
 */
export async function listToolWearThresholds(): Promise<ToolWearThreshold[]> {
  const db = await openDb();
  const tx = db.transaction([STORE_THRESHOLDS], 'readonly');
  const store = tx.objectStore(STORE_THRESHOLDS);

  const thresholds = await new Promise<ToolWearThreshold[]>((resolve, reject) => {
    const out: ToolWearThreshold[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return resolve(out);
      out.push(c.value as ToolWearThreshold);
      c.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('Cursor failed'));
  });

  await txDone(tx);
  db.close();

  // Stable ordering
  return thresholds.sort((a, b) =>
    a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0
  );
}

/**
 * Delete a tool wear threshold.
 * Returns true if deleted, false if not found.
 */
export async function deleteToolWearThreshold(toolId: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction([STORE_THRESHOLDS], 'readwrite');
  const store = tx.objectStore(STORE_THRESHOLDS);

  // Check if exists
  const existing = await reqToPromise<ToolWearThreshold | undefined>(store.get(toolId));
  if (!existing) {
    await txDone(tx);
    db.close();
    return false;
  }

  store.delete(toolId);
  await txDone(tx);
  db.close();
  return true;
}

// ============================================================================
// Maintenance Audit Log (localStorage - minimal, non-critical)
// ============================================================================

const MAINTENANCE_LOG_KEY = 'monolith.tooling.maintenanceLog';
const MAX_LOG_ENTRIES = 100;

export interface MaintenanceLogEntry {
  toolId: string;
  action: 'RESET' | 'THRESHOLD_SET' | 'THRESHOLD_DELETE';
  reason?: ResetReason;
  note?: string;
  timestamp: number;
}

/**
 * Log a maintenance action to localStorage.
 * Non-critical - errors are swallowed.
 */
function logMaintenanceAction(
  toolId: string,
  action: MaintenanceLogEntry['action'],
  reason?: ResetReason,
  note?: string,
  timestamp?: number
): void {
  try {
    const existing = localStorage.getItem(MAINTENANCE_LOG_KEY);
    const log: MaintenanceLogEntry[] = existing ? JSON.parse(existing) : [];

    log.push({
      toolId,
      action,
      reason,
      note,
      timestamp: timestamp ?? Date.now(),
    });

    // Keep only recent entries
    if (log.length > MAX_LOG_ENTRIES) {
      log.splice(0, log.length - MAX_LOG_ENTRIES);
    }

    localStorage.setItem(MAINTENANCE_LOG_KEY, JSON.stringify(log));
  } catch {
    // Non-critical - swallow errors
  }
}

/**
 * Get maintenance log entries.
 * Returns most recent entries first.
 */
export function getMaintenanceLog(): MaintenanceLogEntry[] {
  try {
    const existing = localStorage.getItem(MAINTENANCE_LOG_KEY);
    if (!existing) return [];
    const log: MaintenanceLogEntry[] = JSON.parse(existing);
    return log.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/**
 * Clear maintenance log.
 */
export function clearMaintenanceLog(): void {
  try {
    localStorage.removeItem(MAINTENANCE_LOG_KEY);
  } catch {
    // Non-critical
  }
}
