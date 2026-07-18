// S18 L3 Slice 3: ย่อรูปหน้างานก่อนเข้าคิว — เน็ตมือถือหน้างานอ่อน รูปกล้อง 4-12MB
// ส่งไม่ผ่าน/กินโควตา. ย่อด้านยาวเหลือ ≤1600px (พอสำหรับรีวิวงาน+ส่งกลุ่ม LINE)
// หลักเหล็ก: ย่อไม่ได้ด้วยเหตุใดก็ตาม → คืนไฟล์เดิม — รูปช่างห้ามหายเด็ดขาด

export const MAX_DIMENSION_PX = 1600;
export const JPEG_QUALITY = 0.85;

/** คำนวณขนาดปลายทาง: ด้านยาว ≤ maxDim รักษาสัดส่วน — ไม่ขยายรูปที่เล็กอยู่แล้ว */
export function scaledDimensions(
  width: number,
  height: number,
  maxDim: number = MAX_DIMENSION_PX,
): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxDim) return { width, height };
  const ratio = maxDim / longSide;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** ย่อรูปด้วย canvas (createImageBitmap → drawImage → toBlob jpeg) — fallback = blob เดิม */
export async function downscaleImage(blob: Blob, maxDim: number = MAX_DIMENSION_PX): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxDim);
      if (width === bitmap.width && height === bitmap.height) return blob; // เล็กพอแล้ว — ไม่ recompress
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const resized = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      );
      return resized ?? blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return blob; // decode ไม่ได้ (เครื่องเก่า/ไฟล์แปลก) — ส่งไฟล์เดิมดีกว่าทำรูปหาย
  }
}
