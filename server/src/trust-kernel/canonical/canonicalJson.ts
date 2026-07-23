/**
 * canonicalJson.ts - Deterministic canonical JSON serialization
 *
 * Produces the byte-exact canonical string that underpins every signed hash in
 * the FactoryPacket V3 protocol (design §11.1). The function is total: it either
 * returns a canonical string or throws a `CanonicalError` naming the exact
 * violation. It performs no I/O and consults no clock, locale, or randomness.
 *
 * Rules:
 * - object keys are recursively sorted by UTF-16 code unit
 * - array order is preserved
 * - accepts null, boolean, string, and finite numbers
 * - normalizes `-0` to `0`
 * - rejects undefined, non-finite numbers (NaN / +/-Infinity), bigint,
 *   functions, symbols, sparse arrays (holes), and cyclic references
 *
 * Phase: NOT_FOR_PRODUCTION. Pure function only.
 *
 * @version 0.13.2
 */

// ============================================================================
// Types
// ============================================================================

export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

/** Stable canonical-layer error codes. Distinct from the design §13 TrustReasonCode registry. */
export const CANONICAL_ERROR_CODES = [
  'NON_CANONICAL_NUMBER',
  'NON_CANONICAL_UNDEFINED',
  'NON_CANONICAL_BIGINT',
  'NON_CANONICAL_FUNCTION',
  'NON_CANONICAL_SYMBOL',
  'NON_CANONICAL_SPARSE_ARRAY',
  'NON_CANONICAL_CYCLE',
  'NON_CANONICAL_TYPE',
] as const;

export type CanonicalErrorCode = (typeof CANONICAL_ERROR_CODES)[number];

/** Thrown when a value cannot be canonicalized. The code is embedded in the message. */
export class CanonicalError extends Error {
  readonly code: CanonicalErrorCode;
  constructor(code: CanonicalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'CanonicalError';
    this.code = code;
  }
}

// ============================================================================
// canonicalJson
// ============================================================================

/**
 * Serialize a value to its canonical JSON string, or throw a `CanonicalError`.
 * The accepted domain is `JsonValue`; the parameter is typed `unknown` so the
 * function can validate — and reject — out-of-domain input at runtime rather
 * than relying on the caller's types.
 */
export function canonicalJson(value: unknown): string {
  // `seen` tracks the current ancestor chain to detect cycles without rejecting
  // legitimate repeated (non-cyclic) references to the same object.
  return encode(value, new Set<object>());
}

function encode(value: unknown, seen: Set<object>): string {
  if (value === null) {
    return 'null';
  }

  const t = typeof value;

  if (t === 'string') {
    return JSON.stringify(value);
  }

  if (t === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new CanonicalError('NON_CANONICAL_NUMBER', `${String(n)} is not a finite number`);
    }
    // Normalize negative zero to a single canonical representation.
    return JSON.stringify(Object.is(n, -0) ? 0 : n);
  }

  if (t === 'undefined') {
    throw new CanonicalError('NON_CANONICAL_UNDEFINED', 'undefined is not representable');
  }

  if (t === 'bigint') {
    throw new CanonicalError('NON_CANONICAL_BIGINT', 'bigint is not representable');
  }

  if (t === 'function') {
    throw new CanonicalError('NON_CANONICAL_FUNCTION', 'function is not representable');
  }

  if (t === 'symbol') {
    throw new CanonicalError('NON_CANONICAL_SYMBOL', 'symbol is not representable');
  }

  if (t !== 'object') {
    throw new CanonicalError('NON_CANONICAL_TYPE', `unsupported type: ${t}`);
  }

  const obj = value as object;
  if (seen.has(obj)) {
    throw new CanonicalError('NON_CANONICAL_CYCLE', 'cyclic reference detected');
  }
  seen.add(obj);
  try {
    if (Array.isArray(value)) {
      return encodeArray(value, seen);
    }
    return encodeObject(value as Record<string, unknown>, seen);
  } finally {
    seen.delete(obj);
  }
}

function encodeArray(arr: unknown[], seen: Set<object>): string {
  const parts: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    // A hole (sparse array) is not a canonical `null`; reject it explicitly.
    if (!Object.prototype.hasOwnProperty.call(arr, i)) {
      throw new CanonicalError('NON_CANONICAL_SPARSE_ARRAY', `hole at index ${i}`);
    }
    parts.push(encode(arr[i], seen));
  }
  return `[${parts.join(',')}]`;
}

function encodeObject(obj: Record<string, unknown>, seen: Set<object>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${encode(obj[key], seen)}`);
  }
  return `{${parts.join(',')}}`;
}
