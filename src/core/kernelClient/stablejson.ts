/**
 * Stable JSON - Deterministic JSON + SHA-256
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 *
 * Inline version of @monolith/stablejson for kernelClient.
 * This ensures no import path issues.
 */

// ============================================================================
// STABLE STRINGIFY
// ============================================================================

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Round float to specified decimal places.
 * Mimics Python's round(x, ndigits) behavior.
 */
function roundFloat(n: number, ndigits: number): number {
  const s = n.toFixed(ndigits);
  return Number(s);
}

/**
 * Recursively normalize value for stable serialization.
 */
function normalize(value: unknown, floatNdigit: number): Json {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`stableStringify: non-finite number not allowed: ${value}`);
    }
    return roundFloat(value, floatNdigit);
  }

  if (Array.isArray(value)) {
    return value.map((v) => normalize(v, floatNdigit));
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const out: Record<string, Json> = {};
    for (const k of keys) {
      out[k] = normalize(value[k], floatNdigit);
    }
    return out;
  }

  throw new Error(`stableStringify: unsupported type: ${typeof value}`);
}

/**
 * Deterministic JSON stringify.
 *
 * - Keys sorted alphabetically
 * - Floats rounded to specified precision
 * - No whitespace
 *
 * MUST match Python server's canonical_json.canonicalize()
 */
export function stableStringify(obj: unknown, floatNdigit = 6): string {
  const normalized = normalize(obj, floatNdigit);
  return JSON.stringify(normalized);
}

// ============================================================================
// SHA-256 HEX
// ============================================================================

/**
 * Convert Uint8Array to lowercase hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Compute SHA-256 hash of UTF-8 string.
 *
 * Uses WebCrypto API (works in browsers and Node 18+)
 */
export async function sha256HexUtf8(s: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(s);

  if (globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(hashBuffer));
  }

  throw new Error('sha256HexUtf8: WebCrypto not available');
}

// ============================================================================
// FINGERPRINT
// ============================================================================

/**
 * Compute fingerprint (SHA-256) of object using stable JSON.
 */
export async function fingerprint(obj: unknown, floatNdigit = 6): Promise<string> {
  const canonical = stableStringify(obj, floatNdigit);
  return sha256HexUtf8(canonical);
}
