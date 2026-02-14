/**
 * sha256.ts - SHA-256 Hashing with Canonical JSON
 *
 * FEATURES:
 * - Uses Web Crypto API (SubtleCrypto)
 * - Canonical JSON serialization for deterministic hashes
 * - Hex encoding for portable hash strings
 *
 * BROWSER/NODE COMPATIBILITY:
 * - Works in modern browsers (Chrome, Firefox, Safari, Edge)
 * - Works in Node.js 15+ (crypto.subtle available)
 */

import { canonicalJson } from './canonicalJson';

// ============================================
// BYTE UTILITIES
// ============================================

/**
 * Convert bytes to hex string
 */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function bytesOf(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ============================================
// SHA-256 CORE
// ============================================

/**
 * Compute SHA-256 hash of raw bytes
 *
 * @param data - Input bytes
 * @returns SHA-256 hash as bytes
 */
export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  // Create a clean ArrayBuffer copy to satisfy BufferSource type requirement
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const buffer = await crypto.subtle.digest('SHA-256', copy);
  return new Uint8Array(buffer);
}

/**
 * Compute SHA-256 hash of string
 *
 * @param str - Input string (UTF-8)
 * @returns SHA-256 hash as hex string
 */
export async function sha256String(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await sha256Bytes(data);
  return hexOf(hash);
}

/**
 * Compute SHA-256 hash of raw bytes, return hex
 *
 * @param data - Input bytes
 * @returns SHA-256 hash as hex string
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await sha256Bytes(data);
  return hexOf(hash);
}

// ============================================
// CANONICAL JSON + SHA-256
// ============================================

/**
 * Compute SHA-256 hash of canonical JSON representation
 *
 * CRITICAL: This function produces deterministic hashes across all platforms
 * by first converting the object to canonical JSON.
 *
 * @param obj - Any JSON-serializable value
 * @returns SHA-256 hash as hex string (64 characters)
 *
 * @example
 * await sha256CanonicalHex({ b: 2, a: 1 })
 * // Same hash as: await sha256CanonicalHex({ a: 1, b: 2 })
 */
export async function sha256CanonicalHex(obj: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const json = canonicalJson(obj);
  const data = encoder.encode(json);
  const hash = await sha256Bytes(data);
  return hexOf(hash);
}

/**
 * Compute SHA-256 hash of canonical JSON, return bytes
 */
export async function sha256CanonicalBytes(obj: unknown): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const json = canonicalJson(obj);
  const data = encoder.encode(json);
  return sha256Bytes(data);
}

// ============================================
// VERIFICATION
// ============================================

/**
 * Verify that object produces expected hash
 */
export async function verifyCanonicalHash(
  obj: unknown,
  expectedHashHex: string
): Promise<boolean> {
  const actualHash = await sha256CanonicalHex(obj);
  return actualHash === expectedHashHex;
}

/**
 * Create object with its hash
 */
export async function withCanonicalHash<T>(
  obj: T
): Promise<{ obj: T; hashHex: string }> {
  const hashHex = await sha256CanonicalHex(obj);
  return { obj, hashHex };
}
