// Feature: installation-pm — Spike 0.3 (D-6a): IndexedDB adapter (raw IDB API — ไม่เพิ่ม dependency)
// ใช้ได้ทั้งใน window และใน service worker (ทั้งคู่มี indexedDB global) — เงื่อนไขสำคัญของ
// Background Sync: ตัว sync handler รันใน SW จึงต้องอ่านคิวจาก storage ที่ SW เห็นด้วย (localStorage ใช้ไม่ได้)

import type { QueueItem, QueueStorage } from './types';

export const DB_NAME = 'installation-offline-queue';
export const DB_VERSION = 1;
export const STORE_NAME = 'submissions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'submissionId' });
        store.createIndex('by_enqueued_at', 'enqueuedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

export class IdbQueueStorage implements QueueStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDb();
    return this.dbPromise;
  }

  async put(item: QueueItem): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(tx.objectStore(STORE_NAME).put(item));
  }

  async get(submissionId: string): Promise<QueueItem | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const found = await requestToPromise<QueueItem | undefined>(
      tx.objectStore(STORE_NAME).get(submissionId),
    );
    return found ?? undefined;
  }

  async list(): Promise<QueueItem[]> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readonly');
    // อ่านผ่าน index by_enqueued_at → ได้ FIFO ตามเวลาเข้าคิวโดยตรง
    return requestToPromise<QueueItem[]>(
      tx.objectStore(STORE_NAME).index('by_enqueued_at').getAll(),
    );
  }

  async delete(submissionId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await requestToPromise(tx.objectStore(STORE_NAME).delete(submissionId));
  }
}
