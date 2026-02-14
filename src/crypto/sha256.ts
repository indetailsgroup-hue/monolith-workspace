/**
 * SHA-256 Hashing (v0.2)
 *
 * Web Crypto API based SHA-256 implementation.
 * Used for artifact integrity verification throughout the system.
 */

/** Branded hex string from SHA-256 hash */
export type Sha256Hex = string;

/**
 * Compute SHA-256 hash of a UTF-8 string or binary data.
 *
 * @param input - UTF-8 string or Uint8Array to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Hex(input: string | Uint8Array): Promise<Sha256Hex> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash of a canonical JSON representation.
 *
 * Serializes the object with sorted keys for deterministic hashing.
 *
 * @param obj - Object to canonicalize and hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256CanonicalHex(obj: unknown): Promise<Sha256Hex> {
  const canonical = JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
  return sha256Hex(canonical);
}
