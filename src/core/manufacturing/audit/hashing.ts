// src/core/manufacturing/audit/hashing.ts
/**
 * Audit Hashing Utilities.
 *
 * Deterministic hashing for IR programs and artifacts.
 * Uses stable JSON serialization + SHA-256.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

// =============================================================================
// STABLE STRINGIFY
// =============================================================================

/**
 * Stable JSON stringification.
 *
 * Produces deterministic output by sorting object keys.
 * Essential for reproducible hashes.
 *
 * @param obj Object to stringify
 * @returns Deterministic JSON string
 */
export function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, sortedReplacer);
}

/**
 * JSON replacer that sorts object keys.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  // Sort keys and rebuild object
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const k of keys) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }

  return sorted;
}

// =============================================================================
// SHA-256 HASHING
// =============================================================================

/**
 * Compute SHA-256 hash of string data.
 *
 * @param data String to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 hash of object (using stable stringify).
 *
 * @param obj Object to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Object(obj: unknown): Promise<string> {
  const str = stableStringify(obj);
  return sha256(str);
}

// =============================================================================
// FINGERPRINTING
// =============================================================================

/**
 * Generate short fingerprint (first 16 hex chars of SHA-256).
 *
 * @param data String to fingerprint
 * @returns 16-char hex fingerprint
 */
export async function fingerprint(data: string): Promise<string> {
  const hash = await sha256(data);
  return hash.substring(0, 16);
}

/**
 * Generate short fingerprint of object.
 *
 * @param obj Object to fingerprint
 * @returns 16-char hex fingerprint
 */
export async function fingerprintObject(obj: unknown): Promise<string> {
  const hash = await sha256Object(obj);
  return hash.substring(0, 16);
}

// =============================================================================
// SYNC HASHING (Simple, for non-crypto use)
// =============================================================================

/**
 * Simple sync hash (djb2 algorithm).
 *
 * Not cryptographic, but fast and deterministic.
 * Use for non-security-critical fingerprints.
 *
 * @param str String to hash
 * @returns 8-char hex hash
 */
export function simpleHash(str: string): string {
  let hash = 5381;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char;
  }

  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Simple sync hash of object.
 *
 * @param obj Object to hash
 * @returns 8-char hex hash
 */
export function simpleHashObject(obj: unknown): string {
  return simpleHash(stableStringify(obj));
}

// =============================================================================
// AUDIT RECORD
// =============================================================================

/**
 * Audit record for hashed artifacts.
 */
export interface AuditRecord {
  /** SHA-256 hash of content */
  sha256: string;

  /** Short fingerprint */
  fingerprint: string;

  /** Timestamp (ISO 8601) */
  timestamp: string;

  /** Content length (bytes) */
  contentLength: number;
}

/**
 * Create audit record for string content.
 *
 * @param content String content
 * @returns Audit record
 */
export async function createAuditRecord(content: string): Promise<AuditRecord> {
  const hash = await sha256(content);

  return {
    sha256: hash,
    fingerprint: hash.substring(0, 16),
    timestamp: new Date().toISOString(),
    contentLength: new TextEncoder().encode(content).length,
  };
}

/**
 * Create audit record for object.
 *
 * @param obj Object to audit
 * @returns Audit record
 */
export async function createObjectAuditRecord(
  obj: unknown
): Promise<AuditRecord> {
  return createAuditRecord(stableStringify(obj));
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify content against expected hash.
 *
 * @param content Content to verify
 * @param expectedHash Expected SHA-256 hash
 * @returns True if hash matches
 */
export async function verifyHash(
  content: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await sha256(content);
  return actualHash === expectedHash.toLowerCase();
}

/**
 * Verify object against expected hash.
 *
 * @param obj Object to verify
 * @param expectedHash Expected SHA-256 hash
 * @returns True if hash matches
 */
export async function verifyObjectHash(
  obj: unknown,
  expectedHash: string
): Promise<boolean> {
  return verifyHash(stableStringify(obj), expectedHash);
}
