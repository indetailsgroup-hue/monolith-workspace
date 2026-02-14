/**
 * unsafeStorage.ts - Persistence Boundary (G9 Choke Point)
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This module is the ONLY place that should call localStorage.getItem().
 * All external state reads MUST go through this boundary for validation.
 *
 * ## Why "Unsafe" in the Name?
 * The name is intentional - this file handles RAW external data.
 * Any code calling this boundary must be aware that it's touching
 * unvalidated data that needs schema validation before use.
 *
 * ## Pattern
 * ```
 * localStorage.getItem()  →  unsafeStorage.readRaw()  →  Zod validation  →  typed data
 * ```
 *
 * ## Bypass Scan Exception
 * This file is excepted from WARN-HIGH "localStorage.getItem" pattern
 * because it IS the designated choke point.
 *
 * @version 1.0.0 - G9 Persistence Boundary
 */

import { z, type ZodSchema } from 'zod';
import {
  parseAndValidateSafe,
  ExternalStateValidationError,
  type ValidationResult,
} from '../gate/validateExternalState';

// ============================================
// TYPES
// ============================================

/**
 * Source of external data for error context
 */
export type StorageSource =
  | 'localStorage'
  | 'sessionStorage'
  | 'import'
  | 'runtime'
  | 'api';

/**
 * Error codes for persistence operations
 */
export type PersistenceErrorCode =
  | 'PERSISTENCE_MISSING'
  | 'PERSISTENCE_PARSE_FAILED'
  | 'PERSISTENCE_SCHEMA_INVALID'
  | 'PERSISTENCE_ACCESS_DENIED';

/**
 * Structured error for persistence operations
 */
export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly source: StorageSource;
  readonly key: string;
  readonly details?: unknown;

  constructor(args: {
    code: PersistenceErrorCode;
    source: StorageSource;
    key: string;
    message: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = 'PersistenceError';
    this.code = args.code;
    this.source = args.source;
    this.key = args.key;
    this.details = args.details;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersistenceError);
    }
  }
}

// ============================================
// RAW ACCESS (CHOKE POINT)
// ============================================

/**
 * Read raw string from localStorage.
 *
 * This is the ONLY function that should call localStorage.getItem().
 * All other modules must use readValidated() or readValidatedSafe().
 *
 * @param key - Storage key
 * @returns Raw string or null if not found
 */
export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    // localStorage unavailable (private mode, etc.)
    return null;
  }
}

/**
 * Write JSON to localStorage.
 *
 * @param key - Storage key
 * @param value - Value to serialize and store
 */
export function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new PersistenceError({
      code: 'PERSISTENCE_ACCESS_DENIED',
      source: 'localStorage',
      key,
      message: `Failed to write to localStorage: ${key}`,
      details: String(e),
    });
  }
}

/**
 * Write raw string to localStorage.
 *
 * @param key - Storage key
 * @param value - Raw string to store
 */
export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    throw new PersistenceError({
      code: 'PERSISTENCE_ACCESS_DENIED',
      source: 'localStorage',
      key,
      message: `Failed to write to localStorage: ${key}`,
      details: String(e),
    });
  }
}

/**
 * Remove item from localStorage.
 *
 * @param key - Storage key to remove
 */
export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors on removal
  }
}

// ============================================
// VALIDATED ACCESS (SAFE PATH)
// ============================================

/**
 * Read and validate data from localStorage (fail-fast).
 *
 * Use this when missing or invalid data should throw.
 *
 * @param key - Storage key
 * @param schema - Zod schema for validation
 * @param source - Source context (default: 'localStorage')
 * @returns Validated and typed data
 * @throws PersistenceError if missing, parse failed, or schema invalid
 *
 * @example
 * ```typescript
 * const policy = readValidated('monolith.policy', PolicySchema);
 * // policy is fully typed and validated
 * ```
 */
export function readValidated<T>(
  key: string,
  schema: ZodSchema<T>,
  source: StorageSource = 'localStorage'
): T {
  const raw = readRaw(key);

  if (raw === null) {
    throw new PersistenceError({
      code: 'PERSISTENCE_MISSING',
      source,
      key,
      message: `Missing persisted value for key="${key}"`,
    });
  }

  const result = parseAndValidateSafe(raw, schema, `${source}:${key}`);

  if (!result.ok) {
    throw new PersistenceError({
      code: 'PERSISTENCE_SCHEMA_INVALID',
      source,
      key,
      message: `Invalid schema for key="${key}": ${result.issues.map(i => i.message).join(', ')}`,
      details: result.issues,
    });
  }

  return result.data;
}

/**
 * Read and validate data from localStorage (no throw).
 *
 * Use this in UI paths where you need to handle errors gracefully.
 *
 * @param key - Storage key
 * @param schema - Zod schema for validation
 * @param source - Source context (default: 'localStorage')
 * @returns ValidationResult with either data or issues
 *
 * @example
 * ```typescript
 * const result = readValidatedSafe('monolith.project', ProjectSchema);
 * if (!result.ok) {
 *   showError(result.issues);
 *   return;
 * }
 * loadProject(result.data);
 * ```
 */
export function readValidatedSafe<T>(
  key: string,
  schema: ZodSchema<T>,
  source: StorageSource = 'localStorage'
): ValidationResult<T> {
  const raw = readRaw(key);

  if (raw === null) {
    const error = new ExternalStateValidationError(
      [{ path: '(root)', message: `No data found for key="${key}"` }],
      { source: `${source}:${key}` }
    );
    return { ok: false, issues: error.issues, error };
  }

  return parseAndValidateSafe(raw, schema, `${source}:${key}`);
}

/**
 * Read data with a default fallback for missing/invalid data.
 *
 * Use this for non-critical settings where a default is acceptable.
 * WARNING: This can hide errors - prefer readValidatedSafe for important data.
 *
 * @param key - Storage key
 * @param schema - Zod schema for validation
 * @param defaultValue - Fallback value if missing or invalid
 * @returns Validated data or default value
 *
 * @example
 * ```typescript
 * const mode = readWithDefault('monolith.mode', ModeSchema, 'DESIGNER');
 * // Always returns a valid mode, never throws
 * ```
 */
export function readWithDefault<T>(
  key: string,
  schema: ZodSchema<T>,
  defaultValue: T
): T {
  const result = readValidatedSafe(key, schema);
  return result.ok ? result.data : defaultValue;
}

// ============================================
// SIMPLE VALUE HELPERS
// ============================================

/**
 * Schema for simple string values
 */
const StringSchema = z.string();

/**
 * Schema for simple boolean-like values ('1'/'0' or 'true'/'false')
 */
const BooleanStringSchema = z.string().transform(v => v === '1' || v === 'true');

/**
 * Schema for ISO timestamp strings
 */
const IsoTimestampSchema = z.string().refine(
  s => !isNaN(Date.parse(s)),
  { message: 'Invalid ISO timestamp' }
);

/**
 * Read a simple string value (no JSON parsing).
 *
 * @param key - Storage key
 * @returns String value or null if not found
 */
export function readString(key: string): string | null {
  return readRaw(key);
}

/**
 * Read a string value with default.
 *
 * @param key - Storage key
 * @param defaultValue - Fallback value
 * @returns String value or default
 */
export function readStringOrDefault(key: string, defaultValue: string): string {
  return readRaw(key) ?? defaultValue;
}

/**
 * Read a boolean flag from localStorage ('1' or '0').
 *
 * @param key - Storage key
 * @returns True if value is '1', false otherwise
 */
export function readBooleanFlag(key: string): boolean {
  return readRaw(key) === '1';
}

/**
 * Write a boolean flag to localStorage ('1' or '0').
 *
 * @param key - Storage key
 * @param value - Boolean value
 */
export function writeBooleanFlag(key: string, value: boolean): void {
  writeRaw(key, value ? '1' : '0');
}

/**
 * Read an ISO timestamp string.
 *
 * @param key - Storage key
 * @returns ISO timestamp string or null if not found/invalid
 */
export function readTimestamp(key: string): string | null {
  const raw = readRaw(key);
  if (raw === null) return null;

  const result = IsoTimestampSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if an error is a PersistenceError
 */
export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

/**
 * Check if a PersistenceError indicates missing data
 */
export function isMissingError(error: unknown): boolean {
  return isPersistenceError(error) && error.code === 'PERSISTENCE_MISSING';
}

/**
 * Check if a PersistenceError indicates invalid schema
 */
export function isSchemaError(error: unknown): boolean {
  return isPersistenceError(error) && error.code === 'PERSISTENCE_SCHEMA_INVALID';
}
