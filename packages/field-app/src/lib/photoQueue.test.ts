// S18 L3: photoQueue — enqueuePhoto ต้องย่อรูปก่อนเข้าคิว + สายปุ่ม "ลองส่งอีกครั้ง"
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueItem } from '../../../../src/installation/offline-queue/types';

const fake = vi.hoisted(() => ({
  enqueue: vi.fn(async (input: { kind: string; payload: unknown }) => input as unknown as QueueItem),
  flush: vi.fn(async () => ({ attempted: 0, sent: 0, deferred: 0, failed: 0 })),
  retryFailed: vi.fn(async () => 0),
  items: vi.fn(async () => [] as QueueItem[]),
  pendingCount: vi.fn(async () => 0),
}));

// แทน OfflineQueue จริงด้วยตัวจับ call — photoQueue สร้าง instance ตอน import module
vi.mock('../../../../src/installation/offline-queue/queue', () => ({
  OfflineQueue: class {
    enqueue = fake.enqueue;
    flush = fake.flush;
    retryFailed = fake.retryFailed;
    items = fake.items;
    pendingCount = fake.pendingCount;
  },
}));

import { enqueuePhoto, failedPhotoCount, retryFailedPhotos } from './photoQueue';

interface PhotoPayload { taskId: string; blob: Blob; contentType: string }

describe('enqueuePhoto — ย่อรูปด้านยาว ≤1600px ก่อนเข้าคิว (S18 Slice 3)', () => {
  const resized = new Blob(['small'], { type: 'image/jpeg' });
  let canvasDims: { width: number; height: number } | null;

  beforeEach(() => {
    vi.clearAllMocks();
    canvasDims = null;
    // กล้องมือถือ: 4000x3000 (~12MP)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
        canvasDims = { width: this.width, height: this.height };
        cb(resized);
      });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('เก็บ blob ที่ย่อแล้ว (canvas ด้านยาว 1600px) ไม่ใช่ไฟล์ดิบจากกล้อง', async () => {
    const raw = new File(['x'.repeat(1024)], 'p.jpg', { type: 'image/jpeg' });
    await enqueuePhoto('task-1', raw);
    expect(fake.enqueue).toHaveBeenCalledTimes(1);
    const { kind, payload } = fake.enqueue.mock.calls[0][0] as { kind: string; payload: PhotoPayload };
    expect(kind).toBe('photo');
    expect(payload.taskId).toBe('task-1');
    expect(payload.blob).toBe(resized); // ของที่เข้าคิวคือรูปย่อ
    expect(payload.contentType).toBe('image/jpeg');
    expect(canvasDims).toEqual({ width: 1600, height: 1200 });
    expect(Math.max(canvasDims!.width, canvasDims!.height)).toBeLessThanOrEqual(1600);
  });

  it('ย่อไม่ได้ (decode พัง) → เข้าคิวไฟล์เดิม — รูปช่างห้ามหายเด็ดขาด', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('unsupported'); }));
    const raw = new File(['y'], 'p.jpg', { type: 'image/jpeg' });
    await enqueuePhoto('task-2', raw);
    const { payload } = fake.enqueue.mock.calls[0][0] as { payload: PhotoPayload };
    expect(payload.blob).toBe(raw);
  });
});

describe('photoQueue — สายปุ่ม "ลองส่งอีกครั้ง" (S18 Slice 1 wiring)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retryFailedPhotos: ปลุกของ failed แล้ว flush ต่อทันที', async () => {
    fake.retryFailed.mockResolvedValue(2);
    await expect(retryFailedPhotos()).resolves.toBe(2);
    expect(fake.retryFailed).toHaveBeenCalledTimes(1);
    expect(fake.flush).toHaveBeenCalledTimes(1);
  });

  it('retryFailedPhotos: ไม่มีของ failed → ไม่ flush ฟรี', async () => {
    fake.retryFailed.mockResolvedValue(0);
    await expect(retryFailedPhotos()).resolves.toBe(0);
    expect(fake.flush).not.toHaveBeenCalled();
  });

  it('failedPhotoCount: นับเฉพาะ status failed', async () => {
    fake.items.mockResolvedValue([
      { status: 'failed' }, { status: 'pending' }, { status: 'failed' }, { status: 'sent' },
    ] as QueueItem[]);
    await expect(failedPhotoCount()).resolves.toBe(2);
  });
});
