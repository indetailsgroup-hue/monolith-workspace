/**
 * hashBytes.ts - SHA-256 for Raw Bytes and Text
 *
 * Convenience helpers for hashing files and text content.
 * Uses the core sha256.ts implementation.
 */

import { sha256Bytes, hexOf } from './sha256';

// ============================================
// BYTE HASHING
// ============================================

/**
 * Compute SHA-256 hash of raw bytes, return hex string
 *
 * @param bytes - Input bytes (e.g., file content)
 * @returns 64-character hex string
 *
 * @example
 * const fileBytes = new Uint8Array([...]);
 * const hash = await sha256BytesHex(fileBytes);
 * // => "a1b2c3d4..."
 */
export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const hash = await sha256Bytes(bytes);
  return hexOf(hash);
}

// ============================================
// TEXT HASHING
// ============================================

/**
 * Compute SHA-256 hash of UTF-8 text, return hex string
 *
 * @param text - Input text (UTF-8 encoded)
 * @returns 64-character hex string
 *
 * @example
 * const dxfContent = "0\nSECTION\n...";
 * const hash = await sha256TextHex(dxfContent);
 * // => "a1b2c3d4..."
 */
export async function sha256TextHex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return sha256BytesHex(bytes);
}

// ============================================
// FILE HASHING (Browser)
// ============================================

/**
 * Compute SHA-256 hash of a File object
 *
 * @param file - File object from input or drag-drop
 * @returns 64-character hex string
 */
export async function sha256FileHex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return sha256BytesHex(bytes);
}

/**
 * Compute SHA-256 hash of a Blob
 *
 * @param blob - Blob object
 * @returns 64-character hex string
 */
export async function sha256BlobHex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return sha256BytesHex(bytes);
}

// ============================================
// VERIFICATION
// ============================================

/**
 * Verify that bytes match expected hash
 */
export async function verifyBytesHash(
  bytes: Uint8Array,
  expectedHashHex: string
): Promise<boolean> {
  const actualHash = await sha256BytesHex(bytes);
  return actualHash === expectedHashHex.toLowerCase();
}

/**
 * Verify that text matches expected hash
 */
export async function verifyTextHash(
  text: string,
  expectedHashHex: string
): Promise<boolean> {
  const actualHash = await sha256TextHex(text);
  return actualHash === expectedHashHex.toLowerCase();
}
