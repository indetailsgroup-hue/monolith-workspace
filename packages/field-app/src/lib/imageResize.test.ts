// S18 L3 Slice 3: ย่อรูปหน้างานก่อนเข้าคิว — เน็ตหน้างานอ่อน รูป 4-12MB ส่งไม่ผ่าน
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_DIMENSION_PX, downscaleImage, scaledDimensions } from './imageResize';

describe('scaledDimensions — คณิตย่อรูป (ด้านยาว ≤ 1600px รักษาสัดส่วน)', () => {
  it('แนวนอน 4000x3000 → 1600x1200', () => {
    expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('แนวตั้ง 3000x4000 → 1200x1600', () => {
    expect(scaledDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('เล็กกว่า/เท่ากับ limit อยู่แล้ว → ไม่แตะ (ไม่ขยาย ไม่ recompress)', () => {
    expect(scaledDimensions(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('ค่า default คือ 1600px', () => {
    expect(MAX_DIMENSION_PX).toBe(1600);
  });
});

describe('downscaleImage — canvas resize + fallback ไม่ทำรูปหาย', () => {
  const original = new Blob(['big-photo-bytes'], { type: 'image/jpeg' });
  const resized = new Blob(['small'], { type: 'image/jpeg' });
  let bitmapClose: ReturnType<typeof vi.fn>;
  let canvasDims: { width: number; height: number } | null;
  let drawImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bitmapClose = vi.fn();
    canvasDims = null;
    drawImage = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: bitmapClose })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
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

  it('รูปใหญ่ 4000x3000 → วาดลง canvas 1600x1200 แล้วคืน blob ที่ย่อแล้ว + ปิด bitmap', async () => {
    const out = await downscaleImage(original);
    expect(out).toBe(resized);
    expect(canvasDims).toEqual({ width: 1600, height: 1200 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(bitmapClose).toHaveBeenCalled();
  });

  it('รูปเล็กกว่า limit → คืน blob เดิมโดยไม่ recompress', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 900, close: bitmapClose })));
    const out = await downscaleImage(original);
    expect(out).toBe(original);
    expect(canvasDims).toBeNull(); // ไม่แตะ canvas เลย
  });

  it('decode ไม่ได้ (เครื่องเก่า/ไฟล์แปลก) → คืน blob เดิม — ห้ามทำรูปช่างหาย', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('unsupported'); }));
    await expect(downscaleImage(original)).resolves.toBe(original);
  });

  it('toBlob คืน null → fallback blob เดิม', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) { cb(null); });
    await expect(downscaleImage(original)).resolves.toBe(original);
  });
});
