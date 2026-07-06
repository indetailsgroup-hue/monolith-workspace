// Feature: installation-pm — Spike 0.3 (D-6a): IndexedDB adapter กับ fake-indexeddb
// จุดที่ spike ต้องพิสูจน์: roundtrip + FIFO ผ่าน index + "คิวรอด restart" (เปิด adapter ใหม่เห็นของเดิม)
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IdbQueueStorage, DB_NAME } from '../idb-storage';
import { OfflineQueue } from '../queue';
import type { QueueItem } from '../types';

function item(id: string, enqueuedAt: number): QueueItem {
  return {
    submissionId: id,
    kind: 'field_report',
    payload: { id },
    status: 'pending',
    attempts: 0,
    enqueuedAt,
    nextAttemptAt: enqueuedAt,
  };
}

beforeEach(() => {
  // fake DB ใหม่ต่อเทสต์ — isolation เต็ม
  globalThis.indexedDB = new IDBFactory();
});

describe('IdbQueueStorage (fake-indexeddb)', () => {
  it('put/get/list/delete roundtrip + list เรียง FIFO ตาม enqueuedAt ผ่าน index', async () => {
    const storage = new IdbQueueStorage();
    await storage.put(item('b', 200));
    await storage.put(item('a', 100));
    await storage.put(item('c', 300));

    expect((await storage.get('a'))?.payload).toEqual({ id: 'a' });
    expect(await storage.get('missing')).toBeUndefined();

    const listed = await storage.list();
    expect(listed.map((i) => i.submissionId)).toEqual(['a', 'b', 'c']);

    await storage.delete('b');
    expect((await storage.list()).map((i) => i.submissionId)).toEqual(['a', 'c']);
  });

  it('put ด้วย key เดิม = update ไม่ใช่แถวใหม่ (รองรับ state transition ของคิว)', async () => {
    const storage = new IdbQueueStorage();
    await storage.put(item('x', 100));
    await storage.put({ ...item('x', 100), status: 'sent', attempts: 1 });
    const listed = await storage.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe('sent');
  });

  it('คิวรอดข้าม "restart" — adapter instance ใหม่ (DB เดิม) เห็นรายการค้างส่งเดิม', async () => {
    const first = new IdbQueueStorage();
    await first.put(item('survivor', 100));

    // เปิดใหม่เหมือนผู้ใช้ปิดแอปแล้วเปิดกลับ (indexedDB global ตัวเดิม = disk เดิม)
    const second = new IdbQueueStorage();
    const listed = await second.list();
    expect(listed.map((i) => i.submissionId)).toEqual(['survivor']);
  });

  it('ทำงานร่วม OfflineQueue จบ flow: enqueue offline → restart → flush สำเร็จ', async () => {
    let t = 1_000;
    const q1 = new OfflineQueue(new IdbQueueStorage(), () => 'sub-1', () => t);
    await q1.enqueue({ kind: 'photo', payload: { localId: 'p1' } });
    expect(await q1.pendingCount()).toBe(1);

    t += 60_000; // ปิดแอปหนึ่งนาที
    const q2 = new OfflineQueue(new IdbQueueStorage(), () => 'sub-2', () => t);
    expect(await q2.pendingCount()).toBe(1);
    const summary = await q2.flush(async () => {});
    expect(summary.sent).toBe(1);
    expect(await q2.pendingCount()).toBe(0);
  });

  it('ชื่อ DB คงที่ (contract ระหว่าง window กับ service worker ต้องเปิด DB เดียวกัน)', () => {
    expect(DB_NAME).toBe('installation-offline-queue');
  });
});
