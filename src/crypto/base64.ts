/**
 * Base64 and UTF-8 Encoding Utilities
 *
 * Browser-safe implementations for crypto operations.
 */

/**
 * Convert Uint8Array to Base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Convert UTF-8 string to Uint8Array
 */
export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Convert Uint8Array to UTF-8 string
 */
export function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}
