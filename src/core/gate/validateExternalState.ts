/**
 * validateExternalState.ts - Persistence Gate (Zod Boundary)
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This module provides the single entry point for validating external data
 * before it can be used in manufacturing operations.
 *
 * External state includes:
 * - localStorage data
 * - JSON imports
 * - API responses
 * - URL query parameters
 * - File uploads
 * - Legacy saved projects
 *
 * ## Usage
 *
 * ```typescript
 * import { validateExternalState, ValidationError } from './validateExternalState';
 * import { ProjectDataSchema } from '../schema/project.schema';
 *
 * // In load/import functions
 * try {
 *   const raw = JSON.parse(localStorage.getItem('project')!);
 *   const project = validateExternalState(ProjectDataSchema, raw);
 *   // project is now safe to use
 * } catch (e) {
 *   if (e instanceof ValidationError) {
 *     // Show structured errors to user
 *     showGateBlocker(e.issues);
 *   }
 * }
 * ```
 *
 * @version 1.0.0
 */

import { ZodSchema, ZodError } from 'zod';
import type { Validated, ValidatedResult } from './brandTypes';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Structured validation error for UI display.
 */
export interface ValidationIssue {
  /** JSON path to the invalid field (e.g., "cabinet.dimensions.width") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** The invalid value (for debugging) */
  received?: unknown;
  /** Expected type or constraint */
  expected?: string;
}

/**
 * Custom error class for external state validation failures.
 *
 * Extends Error with structured issues array for UI display.
 * Thrown in export paths to enforce fail-fast behavior.
 */
export class ExternalStateValidationError extends Error {
  /** Structured list of validation issues */
  public readonly issues: ValidationIssue[];
  /** Original Zod error (for advanced debugging) */
  public readonly zodError?: ZodError;
  /** Source context (e.g., 'localStorage', 'import', 'api') */
  public readonly source?: string;

  constructor(
    issues: ValidationIssue[],
    options?: {
      zodError?: ZodError;
      source?: string;
    }
  ) {
    const issueCount = issues.length;
    const summary = issues.slice(0, 3).map(i => i.path).join(', ');
    const message = `External state validation failed: ${issueCount} issue(s) at ${summary}${issueCount > 3 ? '...' : ''}`;

    super(message);
    this.name = 'ExternalStateValidationError';
    this.issues = issues;
    this.zodError = options?.zodError;
    this.source = options?.source;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExternalStateValidationError);
    }
  }
}

// Alias for backward compatibility
export { ExternalStateValidationError as ValidationError };

// ============================================
// VALIDATION RESULT TYPE
// ============================================

/**
 * Result type for safe validation (no throw).
 */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: ValidationIssue[]; error: ExternalStateValidationError };

// ============================================
// CORE VALIDATION FUNCTIONS
// ============================================

/**
 * Convert Zod error to structured ValidationIssue array.
 */
function zodErrorToIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    received: 'received' in issue ? issue.received : undefined,
    expected: 'expected' in issue ? String(issue.expected) : undefined,
  }));
}

/**
 * Validate external state and throw on failure (fail-fast).
 *
 * Use this in export paths and critical manufacturing operations
 * where invalid data must block the operation.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Unknown external data to validate
 * @param source - Optional source context for error messages
 * @returns Validated and typed data
 * @throws ExternalStateValidationError if validation fails
 *
 * @example
 * ```typescript
 * // In export path - MUST throw on invalid data
 * const project = validateExternalState(ProjectDataSchema, raw, 'export');
 * buildManufacturingPacket(project); // Safe to proceed
 * ```
 */
export function validateExternalState<T>(
  schema: ZodSchema<T>,
  raw: unknown,
  source?: string
): T {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const issues = zodErrorToIssues(result.error);
    throw new ExternalStateValidationError(issues, {
      zodError: result.error,
      source,
    });
  }

  return result.data;
}

/**
 * Validate external state and return result (no throw).
 *
 * Use this in UI paths where you need to display errors
 * without interrupting the flow.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Unknown external data to validate
 * @param source - Optional source context
 * @returns ValidationResult with either data or issues
 *
 * @example
 * ```typescript
 * // In UI path - surface errors to user
 * const result = validateExternalStateSafe(ProjectDataSchema, raw);
 * if (!result.ok) {
 *   showValidationErrors(result.issues);
 *   return;
 * }
 * loadProject(result.data);
 * ```
 */
export function validateExternalStateSafe<T>(
  schema: ZodSchema<T>,
  raw: unknown,
  source?: string
): ValidationResult<T> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const issues = zodErrorToIssues(result.error);
    return {
      ok: false,
      issues,
      error: new ExternalStateValidationError(issues, {
        zodError: result.error,
        source,
      }),
    };
  }

  return { ok: true, data: result.data };
}

// ============================================
// BOUNDARY HELPERS
// ============================================

/**
 * Parse JSON safely and validate with schema.
 *
 * Combines JSON.parse and schema validation in one step.
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @param source - Optional source context
 * @returns Validated data
 * @throws ExternalStateValidationError if invalid
 * @throws SyntaxError if JSON is malformed
 *
 * @example
 * ```typescript
 * const project = parseAndValidate(
 *   localStorage.getItem('project'),
 *   ProjectDataSchema,
 *   'localStorage'
 * );
 * ```
 */
export function parseAndValidate<T>(
  json: string | null | undefined,
  schema: ZodSchema<T>,
  source?: string
): T {
  if (json === null || json === undefined) {
    throw new ExternalStateValidationError(
      [{ path: '(root)', message: 'No data to parse (null or undefined)' }],
      { source }
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ExternalStateValidationError(
      [{
        path: '(root)',
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
      }],
      { source }
    );
  }

  return validateExternalState(schema, raw, source);
}

/**
 * Parse JSON safely and validate with schema (no throw).
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @param source - Optional source context
 * @returns ValidationResult
 */
export function parseAndValidateSafe<T>(
  json: string | null | undefined,
  schema: ZodSchema<T>,
  source?: string
): ValidationResult<T> {
  if (json === null || json === undefined) {
    const error = new ExternalStateValidationError(
      [{ path: '(root)', message: 'No data to parse (null or undefined)' }],
      { source }
    );
    return { ok: false, issues: error.issues, error };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    const issues: ValidationIssue[] = [{
      path: '(root)',
      message: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    }];
    const error = new ExternalStateValidationError(issues, { source });
    return { ok: false, issues, error };
  }

  return validateExternalStateSafe(schema, raw, source);
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if an error is an ExternalStateValidationError.
 */
export function isValidationError(error: unknown): error is ExternalStateValidationError {
  return error instanceof ExternalStateValidationError;
}

// ============================================
// BRANDED VALIDATION FUNCTIONS
// ============================================

/**
 * Validate external state and return branded type (fail-fast).
 *
 * Same as validateExternalState but returns a Validated<T> branded type
 * for compile-time enforcement that data passed through the validation boundary.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Unknown external data to validate
 * @param source - Optional source context for error messages
 * @returns Validated and branded data
 * @throws ExternalStateValidationError if validation fails
 *
 * @example
 * ```typescript
 * // Function requires branded type
 * function buildGraph(project: ValidatedProject): OperationGraph { ... }
 *
 * // Raw data won't compile
 * buildGraph(rawProject); // ERROR!
 *
 * // Branded data works
 * const validated = validateExternalStateBranded(ProjectDataSchema, raw);
 * buildGraph(validated); // OK!
 * ```
 */
export function validateExternalStateBranded<T>(
  schema: ZodSchema<T>,
  raw: unknown,
  source?: string
): Validated<T> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const issues = zodErrorToIssues(result.error);
    throw new ExternalStateValidationError(issues, {
      zodError: result.error,
      source,
    });
  }

  // Brand the validated data
  return result.data as Validated<T>;
}

/**
 * Validate external state and return branded result (no throw).
 *
 * Safe version that returns a ValidatedResult with branded data on success.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Unknown external data to validate
 * @param source - Optional source context
 * @returns ValidatedResult with branded data or issues
 */
export function validateExternalStateSafeBranded<T>(
  schema: ZodSchema<T>,
  raw: unknown,
  source?: string
): ValidatedResult<T> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const issues = zodErrorToIssues(result.error);
    return {
      ok: false,
      issues,
      error: new ExternalStateValidationError(issues, {
        zodError: result.error,
        source,
      }),
    };
  }

  return { ok: true, data: result.data as Validated<T> };
}

/**
 * Parse JSON and validate with branded result (fail-fast).
 *
 * Combines JSON.parse, schema validation, and branding in one step.
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @param source - Optional source context
 * @returns Validated and branded data
 * @throws ExternalStateValidationError if invalid
 */
export function parseAndValidateBranded<T>(
  json: string | null | undefined,
  schema: ZodSchema<T>,
  source?: string
): Validated<T> {
  if (json === null || json === undefined) {
    throw new ExternalStateValidationError(
      [{ path: '(root)', message: 'No data to parse (null or undefined)' }],
      { source }
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ExternalStateValidationError(
      [{
        path: '(root)',
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
      }],
      { source }
    );
  }

  return validateExternalStateBranded(schema, raw, source);
}

/**
 * Parse JSON and validate with branded result (no throw).
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @param source - Optional source context
 * @returns ValidatedResult with branded data
 */
export function parseAndValidateSafeBranded<T>(
  json: string | null | undefined,
  schema: ZodSchema<T>,
  source?: string
): ValidatedResult<T> {
  if (json === null || json === undefined) {
    const error = new ExternalStateValidationError(
      [{ path: '(root)', message: 'No data to parse (null or undefined)' }],
      { source }
    );
    return { ok: false, issues: error.issues, error };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    const issues: ValidationIssue[] = [{
      path: '(root)',
      message: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    }];
    const error = new ExternalStateValidationError(issues, { source });
    return { ok: false, issues, error };
  }

  return validateExternalStateSafeBranded(schema, raw, source);
}

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

export { z } from 'zod';
export type { ZodSchema, ZodError } from 'zod';

// Re-export branded types
export type { Validated, ValidatedResult, ValidatedProject, ValidatedCabinet } from './brandTypes';
export { unsafeMarkAsValidated, stripValidationBrand, isValidated } from './brandTypes';
