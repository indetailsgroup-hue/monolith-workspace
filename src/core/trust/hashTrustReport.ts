/**
 * hashTrustReport.ts - Hash Utilities for Trust Report
 *
 * ARCHITECTURE:
 * - Uses Web Crypto API (SubtleCrypto) for SHA-256
 * - Deterministic JSON serialization for consistent hashing
 * - Used for integrity verification in export
 *
 * BROWSER COMPATIBILITY:
 * - Works in modern browsers (Chrome, Firefox, Safari, Edge)
 * - Falls back to simple hash for Node.js (if crypto unavailable)
 */

// ============================================
// SHA-256 HASH
// ============================================

/**
 * Compute SHA-256 hash of JSON object
 * Uses Web Crypto API (async)
 *
 * @param obj - Object to hash (must be JSON-serializable)
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Json(obj: any): Promise<string> {
  const encoder = new TextEncoder();
  const json = JSON.stringify(obj);
  const data = encoder.encode(json);

  // Use SubtleCrypto if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple hash (not cryptographically secure, but deterministic)
  return simpleHash(json);
}

/**
 * Compute SHA-256 hash of string
 */
export async function sha256String(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return simpleHash(str);
}

// ============================================
// SIMPLE HASH (FALLBACK)
// ============================================

/**
 * Simple non-cryptographic hash (DJB2 variant)
 * Used as fallback when SubtleCrypto unavailable
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char; // hash * 33 ^ char
  }

  // Convert to hex (8 chars)
  const unsignedHash = hash >>> 0;
  return unsignedHash.toString(16).padStart(8, '0');
}

// ============================================
// VERIFICATION
// ============================================

/**
 * Verify that object matches expected hash
 */
export async function verifyHash(
  obj: any,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await sha256Json(obj);
  return actualHash === expectedHash;
}

/**
 * Create hash and object pair
 */
export async function createHashedObject<T>(
  obj: T
): Promise<{ obj: T; hash: string }> {
  const hash = await sha256Json(obj);
  return { obj, hash };
}

// ============================================
// SYNC HASH (for non-async contexts)
// ============================================

/**
 * Synchronous simple hash (use async sha256Json when possible)
 */
export function hashSync(obj: any): string {
  const json = JSON.stringify(obj);
  return simpleHash(json);
}

/**
 * Verify hash synchronously
 */
export function verifyHashSync(obj: any, expectedHash: string): boolean {
  const actualHash = hashSync(obj);
  return actualHash === expectedHash;
}
