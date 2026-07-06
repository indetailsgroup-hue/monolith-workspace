// Feature: installation-pm — Spike 0.3 offline-lite upload queue (D-6a, ADR-035)
// Logic ล้วน ไม่ผูก browser API — service worker/Background Sync อยู่ใน sw-bridge.ts

import type { QueueItem, QueueItemKind, QueueStorage, SubmitFn } from './types';

/**
 * นโยบาย retry — mirror ค่าจาก notification-retry-worker (0081/0084) เพื่อให้พฤติกรรม
 * backoff ทั้งระบบเป็นแบบเดียวกัน: 1000ms · 2^attempts, cap 300000ms, สูงสุด 5 ครั้ง
 */
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 300_000;
export const MAX_ATTEMPTS = 5;

export function nextBackoffDelayMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export interface EnqueueInput {
  kind: QueueItemKind;
  payload: unknown;
}

export interface FlushSummary {
  attempted: number;
  sent: number;
  /** ล้มเหลวรอบนี้แต่ยังอยู่ในคิว (จะลองใหม่หลัง backoff) */
  deferred: number;
  /** ครบ MAX_ATTEMPTS → ติดสถานะ failed (ผู้ใช้กด "ลองส่งอีกครั้ง" ได้ผ่าน retryFailed) */
  failed: number;
}

export class OfflineQueue {
  /**
   * Scrutiny S3: 'online' + 'visibilitychange' ยิงพร้อมกันได้ (ปลดล็อกจอตอนเน็ตกลับ)
   * → flush ซ้อนกัน double-submit รายการเดียวกัน. กันระดับ instance ด้วย in-flight set;
   * ข้าม instance (window กับ service worker คนละ context) กันไม่ได้ที่นี่ —
   * สัญญาของ SubmitFn: server ต้อง treat duplicate submissionId เป็น success (UNIQUE + on conflict)
   */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly storage: QueueStorage,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** เข้าคิวพร้อม idempotency key ที่เกิดครั้งเดียว ณ จุดสร้างรายการ (D-6a) */
  async enqueue(input: EnqueueInput): Promise<QueueItem> {
    const item: QueueItem = {
      submissionId: this.newId(),
      kind: input.kind,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      enqueuedAt: this.now(),
      nextAttemptAt: this.now(),
    };
    await this.storage.put(item);
    return item;
  }

  /** จำนวน "ค้างส่ง" ที่โชว์ผู้ใช้ (pending + failed — ของที่ยังไปไม่ถึง server ทั้งหมด) */
  async pendingCount(): Promise<number> {
    const items = await this.storage.list();
    return items.filter((i) => i.status !== 'sent').length;
  }

  async items(): Promise<QueueItem[]> {
    return this.storage.list();
  }

  /**
   * ส่งทุกรายการ pending ที่ถึงกำหนด (FIFO) — เรียกจาก sw-bridge เมื่อกลับ online/
   * Background Sync fire/ผู้ใช้เปิดแอป. รายการที่ submitFn throw → backoff แล้วรอรอบหน้า;
   * ครบ MAX_ATTEMPTS → status 'failed' (หยุด auto-retry — กันคิวตันด้วย poison item)
   */
  async flush(submit: SubmitFn): Promise<FlushSummary> {
    const t = this.now();
    const due = (await this.storage.list()).filter(
      (i) => i.status === 'pending' && i.nextAttemptAt <= t && !this.inFlight.has(i.submissionId),
    );
    for (const item of due) this.inFlight.add(item.submissionId); // จองก่อนถึงจุด await แรก
    const summary: FlushSummary = { attempted: due.length, sent: 0, deferred: 0, failed: 0 };

    for (const item of due) {
      const attempts = item.attempts + 1;
      try {
        // submissionId เดิมเสมอ — server UNIQUE ทำให้ retry หลังส่งสำเร็จแบบไม่รู้ผล (เน็ตหลุดกลางทาง) ไม่เกิดซ้ำ
        await submit(item);
        await this.storage.put({ ...item, status: 'sent', attempts, sentAt: this.now() });
        summary.sent += 1;
      } catch (err) {
        const lastError = err instanceof Error ? err.message : String(err);
        if (attempts >= MAX_ATTEMPTS) {
          await this.storage.put({ ...item, status: 'failed', attempts, lastError });
          summary.failed += 1;
        } else {
          await this.storage.put({
            ...item,
            attempts,
            lastError,
            nextAttemptAt: this.now() + nextBackoffDelayMs(attempts),
          });
          summary.deferred += 1;
        }
      } finally {
        this.inFlight.delete(item.submissionId);
      }
    }
    return summary;
  }

  /** ผู้ใช้สั่ง "ลองส่งอีกครั้ง" กับของที่ failed — รีเซ็ตกลับ pending (attempts นับต่อไม่ล้าง เพื่อร่องรอย) */
  async retryFailed(): Promise<number> {
    const failed = (await this.storage.list()).filter((i) => i.status === 'failed');
    for (const item of failed) {
      await this.storage.put({ ...item, status: 'pending', nextAttemptAt: this.now() });
    }
    return failed.length;
  }

  /** ลบรายการที่ส่งสำเร็จแล้วและเก่ากว่า maxAgeMs (housekeeping — เก็บไว้ช่วงหนึ่งเพื่อ metric baseline) */
  async pruneSent(maxAgeMs: number): Promise<number> {
    const cutoff = this.now() - maxAgeMs;
    const stale = (await this.storage.list()).filter(
      (i) => i.status === 'sent' && (i.sentAt ?? i.enqueuedAt) < cutoff,
    );
    for (const item of stale) await this.storage.delete(item.submissionId);
    return stale.length;
  }
}
