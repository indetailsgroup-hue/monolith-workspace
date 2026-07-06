// Feature: installation-pm — Spike 0.3 offline-lite queue (D-6a): logic คิว + idempotency + backoff
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { OfflineQueue, MAX_ATTEMPTS, nextBackoffDelayMs, BASE_BACKOFF_MS, MAX_BACKOFF_MS } from '../queue';
import { MemoryQueueStorage } from '../memory-storage';
import type { QueueItem } from '../types';

function makeQueue(startAt = 1_000_000) {
  let t = startAt;
  let seq = 0;
  const storage = new MemoryQueueStorage();
  const queue = new OfflineQueue(storage, () => `sub-${++seq}`, () => t);
  return { queue, storage, tick: (ms: number) => (t += ms), now: () => t };
}

describe('OfflineQueue — enqueue + สถานะค้างส่ง (D-6a)', () => {
  it('เข้าคิว → pending พร้อม submissionId ที่เกิดครั้งเดียว และนับ "ค้างส่ง" ถูก', async () => {
    const { queue } = makeQueue();
    const a = await queue.enqueue({ kind: 'field_report', payload: { note: 'ห้องครัวเสร็จ' } });
    const b = await queue.enqueue({ kind: 'photo', payload: { localId: 'p1' } });
    expect(a.status).toBe('pending');
    expect(a.submissionId).not.toBe(b.submissionId);
    expect(await queue.pendingCount()).toBe(2);
  });

  it('flush สำเร็จ → sent + เก็บ sentAt ไว้ทำ baseline metric (gap เข้าคิว→ส่งสำเร็จ)', async () => {
    const { queue, tick } = makeQueue();
    const item = await queue.enqueue({ kind: 'field_report', payload: {} });
    tick(5_000); // ช่างอยู่จุดอับสัญญาณ 5 วิ
    const summary = await queue.flush(async () => {});
    expect(summary).toEqual({ attempted: 1, sent: 1, deferred: 0, failed: 0 });
    const after = (await queue.items())[0];
    expect(after.status).toBe('sent');
    expect((after.sentAt ?? 0) - item.enqueuedAt).toBe(5_000);
    expect(await queue.pendingCount()).toBe(0);
  });
});

describe('OfflineQueue — idempotency (หัวใจ D-6a)', () => {
  it('retry ทุกครั้งส่ง submissionId เดิมเสมอ — server UNIQUE จึงกันซ้ำได้', async () => {
    const { queue, tick } = makeQueue();
    await queue.enqueue({ kind: 'field_report', payload: {} });
    const seenIds: string[] = [];
    let failures = 2;
    const submit = async (i: QueueItem) => {
      seenIds.push(i.submissionId);
      if (failures-- > 0) throw new Error('network');
    };
    await queue.flush(submit); // fail #1
    tick(nextBackoffDelayMs(1) + 1);
    await queue.flush(submit); // fail #2
    tick(nextBackoffDelayMs(2) + 1);
    await queue.flush(submit); // success
    expect(seenIds).toHaveLength(3);
    expect(new Set(seenIds).size).toBe(1); // id เดิมตลอด
    expect((await queue.items())[0].status).toBe('sent');
  });
});

describe('OfflineQueue — backoff + poison item (mirror นโยบาย notification worker)', () => {
  it('backoff = 1000·2^n cap 300000 (ตรงค่าจาก 0081/0084)', () => {
    expect(nextBackoffDelayMs(1)).toBe(2_000);
    expect(nextBackoffDelayMs(4)).toBe(16_000);
    expect(nextBackoffDelayMs(20)).toBe(MAX_BACKOFF_MS);
    expect(nextBackoffDelayMs(0)).toBe(BASE_BACKOFF_MS);
  });

  it('ล้มเหลว → deferred พร้อม nextAttemptAt อนาคต; ยังไม่ถึงกำหนด flush รอบถัดไปต้องไม่แตะ', async () => {
    const { queue } = makeQueue();
    await queue.enqueue({ kind: 'photo', payload: {} });
    const s1 = await queue.flush(async () => {
      throw new Error('offline');
    });
    expect(s1).toEqual({ attempted: 1, sent: 0, deferred: 1, failed: 0 });
    // ยังไม่ tick เวลา → รายการยังไม่ due
    const s2 = await queue.flush(async () => {});
    expect(s2.attempted).toBe(0);
    expect(await queue.pendingCount()).toBe(1);
  });

  it(`ครบ ${MAX_ATTEMPTS} ครั้ง → failed หยุด auto-retry แต่ retryFailed() ปลุกกลับได้`, async () => {
    const { queue, tick } = makeQueue();
    await queue.enqueue({ kind: 'field_report', payload: {} });
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      await queue.flush(async () => {
        throw new Error(`fail ${n}`);
      });
      tick(MAX_BACKOFF_MS + 1);
    }
    const item = (await queue.items())[0];
    expect(item.status).toBe('failed');
    expect(item.attempts).toBe(MAX_ATTEMPTS);
    expect(item.lastError).toBe(`fail ${MAX_ATTEMPTS}`);
    // failed ยังนับเป็น "ค้างส่ง" ให้ผู้ใช้เห็น (ของยังไปไม่ถึง server)
    expect(await queue.pendingCount()).toBe(1);
    // ผู้ใช้กด "ลองส่งอีกครั้ง"
    expect(await queue.retryFailed()).toBe(1);
    const summary = await queue.flush(async () => {});
    expect(summary.sent).toBe(1);
  });

  it('poison item ไม่ block รายการอื่น — ตัวพังตัวเดียว ตัวดีส่งผ่าน', async () => {
    const { queue, tick } = makeQueue();
    const bad = await queue.enqueue({ kind: 'photo', payload: { poison: true } });
    tick(1);
    await queue.enqueue({ kind: 'field_report', payload: {} });
    const summary = await queue.flush(async (i) => {
      if (i.submissionId === bad.submissionId) throw new Error('corrupt blob');
    });
    expect(summary).toEqual({ attempted: 2, sent: 1, deferred: 1, failed: 0 });
  });

  it('Property: flush ไม่เคยทำรายการหาย — sent+deferred+failed = attempted และของทุกชิ้นยังมีสถานะ', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        async (successFlags) => {
          const { queue, tick } = makeQueue();
          for (let i = 0; i < successFlags.length; i++) {
            await queue.enqueue({ kind: 'field_report', payload: { i } });
            tick(1);
          }
          let call = 0;
          const summary = await queue.flush(async () => {
            if (!successFlags[call++]) throw new Error('x');
          });
          expect(summary.sent + summary.deferred + summary.failed).toBe(summary.attempted);
          expect(summary.attempted).toBe(successFlags.length);
          const items = await queue.items();
          expect(items).toHaveLength(successFlags.length);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('OfflineQueue — concurrent flush (scrutiny S3: online + visibilitychange ยิงพร้อมกัน)', () => {
  it('flush ซ้อนกัน → รายการเดียวถูก submit ครั้งเดียว (in-flight guard)', async () => {
    const { queue } = makeQueue();
    await queue.enqueue({ kind: 'field_report', payload: {} });
    const submitted: string[] = [];
    const slowSubmit = async (i: QueueItem) => {
      submitted.push(i.submissionId);
      await new Promise((r) => setTimeout(r, 30)); // network ช้า — เปิดหน้าต่าง race
    };
    const [a, b] = await Promise.all([queue.flush(slowSubmit), queue.flush(slowSubmit)]);
    expect(submitted).toHaveLength(1); // ไม่ double-submit
    expect(a.sent + b.sent).toBe(1);
    expect((await queue.items())[0].status).toBe('sent');
  });

  it('flush ระหว่างที่อีก flush ค้าง → รอบสองเห็นเฉพาะของที่ไม่ in-flight', async () => {
    const { queue, tick } = makeQueue();
    await queue.enqueue({ kind: 'field_report', payload: { n: 1 } });
    tick(1);
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const submitted: string[] = [];
    // flush แรกค้างอยู่ที่ item แรก
    const first = queue.flush(async (i) => {
      submitted.push(i.submissionId);
      await gate;
    });
    await new Promise((r) => setTimeout(r, 10));
    await queue.enqueue({ kind: 'photo', payload: { n: 2 } });
    // flush สอง: ต้องส่งเฉพาะ item ใหม่ ไม่แตะตัวที่ in-flight
    const second = await queue.flush(async (i) => {
      submitted.push(i.submissionId);
    });
    expect(second.attempted).toBe(1);
    releaseFirst();
    await first;
    expect(new Set(submitted).size).toBe(2); // สองรายการ สองครั้ง ไม่ซ้ำ
  });
});

describe('OfflineQueue — housekeeping', () => {
  it('pruneSent ลบเฉพาะ sent ที่เก่ากว่า maxAge — pending/failed ไม่โดนแตะ', async () => {
    const { queue, tick } = makeQueue();
    await queue.enqueue({ kind: 'field_report', payload: {} });
    tick(1);
    await queue.enqueue({ kind: 'photo', payload: {} });
    await queue.flush(async (i) => {
      if (i.kind === 'photo') throw new Error('keep pending');
    });
    tick(100_000);
    expect(await queue.pruneSent(50_000)).toBe(1);
    const items = await queue.items();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('photo');
  });
});
