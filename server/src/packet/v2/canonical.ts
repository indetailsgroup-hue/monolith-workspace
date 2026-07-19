import { createHash } from 'node:crypto';
import type { JsonValue } from './types.js';

export type PacketGenerationErrorCode =
  | 'PKT_ATTESTATION_INVALID'
  | 'PKT_IDEMPOTENCY_CONFLICT'
  | 'PKT_SCHEMA_UNSUPPORTED'
  | 'PKT_SIGNATURE_INVALID'
  | 'PKT_ZIP_PROFILE_INVALID';

export class PacketGenerationError extends Error {
  constructor(
    public readonly code: PacketGenerationErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'PacketGenerationError';
  }
}

const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  assertWellFormedUnicode(value, 'UTF-8 input');
  return encoder.encode(value);
}

export function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Id(bytes: Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`;
}

/** RFC 8785 serialization for already parsed JSON values. */
export function jcs(value: JsonValue): string {
  return serializeJcs(value, '$');
}

export function jcsBytes(value: JsonValue): Uint8Array {
  return utf8(jcs(value));
}

function serializeJcs(value: JsonValue, path: string): string {
  if (value === null) return 'null';

  if (typeof value === 'string') {
    assertWellFormedUnicode(value, path);
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${path} is not finite`);
    }
    if (Object.is(value, -0)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${path} is negative zero`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${path} is an unsafe integer`);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => serializeJcs(item, `${path}[${index}]`)).join(',')}]`;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${path} is not a plain JSON object`);
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => {
    assertWellFormedUnicode(key, `${path} property name`);
    const child = value[key];
    if (child === undefined) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${path}.${key} is undefined`);
    }
    return `${JSON.stringify(key)}:${serializeJcs(child, `${path}.${key}`)}`;
  });
  return `{${entries.join(',')}}`;
}

export function assertWellFormedUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} contains a lone high surrogate`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} contains a lone low surrogate`);
    }
  }
}

export function compareUtf8(left: string, right: string): number {
  const a = utf8(left);
  const b = utf8(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.byteLength - b.byteLength;
}

export function sortUniqueUtf8(values: readonly string[], label: string): string[] {
  const sorted = [...values].sort(compareUtf8);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1] === sorted[index]) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} contains duplicate ${sorted[index]}`);
    }
  }
  return sorted;
}

export function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label}.${key} is required`);
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label}.${key} is not allowed`);
    }
  }
}

export function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} must be an array`);
  }
}

export function assertString(
  value: unknown,
  label: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): asserts value is string {
  if (typeof value !== 'string') {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} must be a string`);
  }
  assertWellFormedUnicode(value, label);
  if (options.min !== undefined && value.length < options.min) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} is too short`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} is too long`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} has invalid syntax`);
  }
}

export function assertOpaqueId(value: unknown, label: string): asserts value is string {
  assertString(value, label, { min: 1, max: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/ });
}

export function assertSemver(value: unknown, label: string): asserts value is string {
  assertString(value, label, {
    pattern:
      /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  });
}

export function assertSha256Id(value: unknown, label: string): asserts value is string {
  assertString(value, label, { pattern: /^sha256:[0-9a-f]{64}$/ });
}

export function assertUuidV4(value: unknown, label: string): asserts value is string {
  assertString(value, label, {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  });
}

export function assertTimestampMsUtc(value: unknown, label: string): asserts value is string {
  assertString(value, label, {
    pattern:
      /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/,
  });
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} is not a real UTC timestamp`);
  }
}

export function assertInteger(
  value: unknown,
  label: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `${label} must be a safe integer`);
  }
  if ((value as number) < minimum || (value as number) > maximum) {
    throw new PacketGenerationError(
      'PKT_SCHEMA_UNSUPPORTED',
      `${label} must be between ${minimum} and ${maximum}`,
    );
  }
}

export function decimalMillimetresToMicrometres(value: string): number {
  assertString(value, 'millimetres', { pattern: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/ });
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const micrometres = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (negative && micrometres === 0n) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'millimetres must not be negative zero');
  }
  const signed = negative ? -micrometres : micrometres;
  if (signed < BigInt(Number.MIN_SAFE_INTEGER) || signed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'millimetres exceed safe micrometre range');
  }
  const result = Number(signed);
  if (Object.is(result, -0)) return 0;
  return result;
}

export function assertCanonicalPath(value: string): void {
  assertString(value, 'path', { min: 1, max: 128 });
  if (
    value !== value.normalize('NFC') ||
    value.startsWith('/') ||
    value.includes('\\') ||
    // INTENTIONAL: rejecting C0 controls and DEL in packet entry paths is
    // the security check itself.
    // eslint-disable-next-line no-control-regex -- see comment above
    /[\u0000-\u001f\u007f<>:"|?*]/u.test(value)
  ) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `non-canonical path ${value}`);
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment),
    )
  ) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', `non-canonical path ${value}`);
  }
}

export function asJsonValue<T>(value: T): JsonValue {
  return value as unknown as JsonValue;
}
