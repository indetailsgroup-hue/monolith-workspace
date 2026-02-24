/**
 * Browser-safe SHA-256 using SubtleCrypto
 *
 * Requires HTTPS or localhost for crypto.subtle availability.
 */

export type Sha256Hex = string;

/**
 * Compute SHA-256 hash and return as hex string
 *
 * @param input - String or Uint8Array to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 * @throws If crypto.subtle is not available (non-HTTPS)
 */
export async function sha256Hex(
  input: string | Uint8Array
): Promise<Sha256Hex> {
  const data =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;

  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'crypto.subtle is not available. Use HTTPS/localhost or add a server-side hash fallback.'
    );
  }

  // Cast to ArrayBuffer to satisfy TypeScript BufferSource type
  const digest = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Compute SHA-256 hash of a canonical JSON representation.
 *
 * Serializes the object with sorted keys to ensure deterministic hashing.
 *
 * @param obj - Object to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export async function sha256CanonicalHex(obj: unknown): Promise<Sha256Hex> {
  const canonical = JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
  return sha256Hex(canonical);
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
