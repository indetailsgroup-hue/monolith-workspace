/**
 * textToBytes.ts - Text/String to Uint8Array Conversion
 *
 * Utilities for converting text content to binary format
 * for consistent hashing and bundling.
 */

/**
 * Convert UTF-8 string to Uint8Array
 */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Convert Uint8Array to UTF-8 string
 */
export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Check if content is binary (Uint8Array) or text (string)
 */
export function isBinary(content: string | Uint8Array): content is Uint8Array {
  return content instanceof Uint8Array;
}

/**
 * Normalize content to Uint8Array
 */
export function normalizeToBytes(content: string | Uint8Array): Uint8Array {
  if (isBinary(content)) {
    return content;
  }
  return textToBytes(content);
}

/**
 * Get byte length of content
 */
export function getByteLength(content: string | Uint8Array): number {
  if (isBinary(content)) {
    return content.length;
  }
  return textToBytes(content).length;
}
