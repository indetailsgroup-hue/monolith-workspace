/**
 * canonical.ts - Independent canonical JSON + SHA-256 (design §11.1)
 *
 * A SEPARATELY AUTHORED reimplementation of the FactoryPacket V3 canonicalization
 * rules, written from the normative protocol text - NOT copied from and NOT
 * importing the builder's `canonicalJson`. Cross-implementation agreement (both
 * implementations emit the same bytes for the golden vectors) is proven in
 * `verify.test.ts`, which is the design's stated bar: "Avoiding imports alone is
 * insufficient. Both implementations pass the same normative protocol and golden
 * vectors." (design §14.)
 *
 * Normative rules reproduced here:
 *   - object member keys are ordered by ascending UTF-16 code unit
 *   - array element order is PRESERVED (never sorted)
 *   - string escaping is standard JSON (`JSON.stringify` on a single string)
 *   - a finite number serializes as `JSON.stringify(n)`; `-0` collapses to `0`
 *   - reject: `undefined`, non-finite numbers (`NaN`, `+/-Infinity`), `bigint`,
 *     functions, symbols, sparse-array holes, and cyclic references
 *
 * Pure: no I/O, clock, locale, or randomness.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import { createHash } from 'node:crypto';

export type CanonicalErrorCode =
  | 'NON_CANONICAL_NUMBER'
  | 'NON_CANONICAL_UNDEFINED'
  | 'NON_CANONICAL_BIGINT'
  | 'NON_CANONICAL_FUNCTION'
  | 'NON_CANONICAL_SYMBOL'
  | 'NON_CANONICAL_SPARSE_ARRAY'
  | 'NON_CANONICAL_CYCLE'
  | 'NON_CANONICAL_TYPE';

export class CanonicalError extends Error {
  readonly code: CanonicalErrorCode;
  constructor(code: CanonicalErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'CanonicalError';
    this.code = code;
  }
}

/** Order object keys by ascending UTF-16 code unit (the default JS string order). */
function orderKeys(keys: string[]): string[] {
  return keys.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function serialize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new CanonicalError('NON_CANONICAL_NUMBER', `${String(value)} is not finite`);
      }
      // -0 and 0 must share one canonical form.
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    case 'undefined':
      throw new CanonicalError('NON_CANONICAL_UNDEFINED', 'undefined has no canonical form');
    case 'bigint':
      throw new CanonicalError('NON_CANONICAL_BIGINT', 'bigint has no canonical form');
    case 'function':
      throw new CanonicalError('NON_CANONICAL_FUNCTION', 'function has no canonical form');
    case 'symbol':
      throw new CanonicalError('NON_CANONICAL_SYMBOL', 'symbol has no canonical form');
    case 'object':
      break;
    default:
      throw new CanonicalError('NON_CANONICAL_TYPE', `unsupported type: ${typeof value}`);
  }

  const obj = value as object;
  if (ancestors.has(obj)) {
    throw new CanonicalError('NON_CANONICAL_CYCLE', 'cyclic reference');
  }
  ancestors.add(obj);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let i = 0; i < value.length; i++) {
        // A hole is not a canonical null; reject the sparse array outright.
        if (!Object.prototype.hasOwnProperty.call(value, i)) {
          throw new CanonicalError('NON_CANONICAL_SPARSE_ARRAY', `hole at index ${i}`);
        }
        items.push(serialize(value[i], ancestors));
      }
      return `[${items.join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const members = orderKeys(Object.keys(record)).map(
      (key) => `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`,
    );
    return `{${members.join(',')}}`;
  } finally {
    ancestors.delete(obj);
  }
}

/** Canonical JSON string for `value`, or throw a `CanonicalError`. */
export function canonicalJson(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

/** Lowercase-hex SHA-256 over a UTF-8 string or raw bytes. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256')
    .update(typeof input === 'string' ? Buffer.from(input, 'utf-8') : Buffer.from(input))
    .digest('hex');
}

/** Base64 SHA-256 over a UTF-8 string or raw bytes. */
export function sha256Base64(input: string | Uint8Array): string {
  return createHash('sha256')
    .update(typeof input === 'string' ? Buffer.from(input, 'utf-8') : Buffer.from(input))
    .digest('base64');
}
