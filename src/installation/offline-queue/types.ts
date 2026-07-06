// Feature: installation-pm — Spike 0.3 offline-lite upload queue (D-6a, ADR-035)
// สโคป spike: พิสูจน์กลไกคิว + idempotent submission id + retry/backoff + สถานะต่อรายการ
// (ไม่มี conflict resolution — อ่านอย่างเดียวตอน offline ตาม D-6a; full sync D-6 = Phase 2 รอ baseline)

/** ชนิดของงานที่เข้าคิวได้ใน MVP (D-6a): field report submission + รูปถ่ายหน้างาน */
export type QueueItemKind = 'field_report' | 'photo';

/**
 * สถานะต่อรายการ — โชว์ผู้ใช้เป็น "ค้างส่ง N รายการ" เท่านั้น (UX tenet D-12:
 * ห้ามใช้ศัพท์ sync/queue/retry กับช่างหน้างาน)
 */
export type QueueItemStatus = 'pending' | 'sent' | 'failed';

export interface QueueItem {
  /**
   * Idempotency key ฝั่ง client (uuid) — server ต้องมี UNIQUE constraint บนค่านี้
   * → retry กี่รอบก็ไม่เกิด record ซ้ำ (D-6a); id เดิมคงที่ตลอดอายุรายการ
   */
  submissionId: string;
  kind: QueueItemKind;
  /** payload ตามชนิดงาน — spike เก็บเป็น opaque JSON (รูปจริงเก็บเป็น Blob ใน object store แยกตอน Phase 1.7) */
  payload: unknown;
  status: QueueItemStatus;
  /** จำนวนครั้งที่พยายามส่งแล้ว (สำเร็จ/ล้มเหลวรวมกัน) */
  attempts: number;
  /** เวลาเข้าคิว (epoch ms) — ใช้คำนวณ metric baseline: gap ระหว่างเข้าคิว→ส่งสำเร็จ (D-6a) */
  enqueuedAt: number;
  /** ห้ามส่งก่อนเวลานี้ (epoch ms) — backoff หลังส่งล้มเหลว */
  nextAttemptAt: number;
  /** เวลาที่ส่งสำเร็จ (epoch ms) — คู่กับ enqueuedAt เป็น baseline metric */
  sentAt?: number;
  /** สาเหตุล่าสุดที่ส่งไม่สำเร็จ (ไว้ debug หลังบ้าน — ไม่โชว์ผู้ใช้ตรง ๆ) */
  lastError?: string;
}

/** Storage port — แยกจาก logic เพื่อเทสต์คิวล้วน ๆ ด้วย memory adapter และใช้ IndexedDB จริงใน browser */
export interface QueueStorage {
  put(item: QueueItem): Promise<void>;
  get(submissionId: string): Promise<QueueItem | undefined>;
  /** ทุกรายการ เรียงตาม enqueuedAt เก่า→ใหม่ (FIFO ต่อรอบ flush) */
  list(): Promise<QueueItem[]>;
  delete(submissionId: string): Promise<void>;
}

/** ผู้ส่งจริง (Phase 1.7 = rpc_capture_ingest / field report RPC) — spike รับเป็น dependency */
export type SubmitFn = (item: QueueItem) => Promise<void>;
