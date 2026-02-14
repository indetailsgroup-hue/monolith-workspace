/**
 * TextureThumb - Generate 256px Thumbnails from Texture Blobs
 *
 * T016: Performance optimization
 * - Converts full-size texture blobs to 256x256 thumbnails
 * - Uses ImageBitmap for efficient decoding
 * - Returns JPEG dataUrl for compact storage
 *
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

export interface TextureDecoded {
  /** Original texture width */
  width: number;
  /** Original texture height */
  height: number;
  /** 256x256 JPEG thumbnail as dataUrl */
  thumbDataUrl: string;
}

// ============================================================================
// Thumbnail Generation
// ============================================================================

/**
 * Decode blob to thumbnail
 */
export async function decodeThumb256(blob: Blob): Promise<TextureDecoded> {
  // Use ImageBitmap for efficient decoding
  const bmp = await createImageBitmap(blob);

  try {
    const width = bmp.width;
    const height = bmp.height;
    const thumbDataUrl = await makeThumb256(bmp);

    return { width, height, thumbDataUrl };
  } finally {
    // Close bitmap to free memory
    bmp.close?.();
  }
}

/**
 * Create 256x256 thumbnail from ImageBitmap
 */
async function makeThumb256(bmp: ImageBitmap): Promise<string> {
  const size = 256;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  // Calculate cover-fit square crop (center crop)
  const srcW = bmp.width;
  const srcH = bmp.height;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcW > srcH) {
    // Landscape: crop sides
    sw = srcH;
    sx = Math.floor((srcW - sw) / 2);
  } else if (srcH > srcW) {
    // Portrait: crop top/bottom
    sh = srcW;
    sy = Math.floor((srcH - sh) / 2);
  }

  // Draw cropped and scaled
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, size, size);

  // Return as JPEG with good quality
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Check if blob is a valid image
 */
export async function isValidImageBlob(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob);
    bmp.close?.();
    return true;
  } catch {
    return false;
  }
}
