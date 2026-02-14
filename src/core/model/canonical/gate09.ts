/**
 * GATE09 - G9 Persistence Gate Implementation
 *
 * NORTH STAR: "No unvalidated external state enters OperationGraph"
 *
 * This module is the ONLY entry point for external data into the validated domain.
 * All persistence operations must go through this gate.
 *
 * FLOW:
 *   localStorage/file → G9 Gate → ValidationResult → Validated<T>
 *                          ↓
 *                    Zod Schema validation
 *                          ↓
 *                    G9Issue[] on failure
 *
 * @version 1.0.0
 */

import { z } from 'zod';
import {
  type CanonicalProject,
  type CanonicalCabinet,
  type CanonicalPanel,
  type ValidationResult,
  type ValidatedProject,
  type ValidatedCabinet,
  type ValidatedPanel,
  type ValidatedBrand,
  type G9Issue,
  CANONICAL_SCHEMA_VERSION,
} from './types';
import {
  CanonicalProjectSchema,
  CanonicalCabinetSchema,
  CanonicalPanelSchema,
} from './schemas';

// ============================================
// GATE09 CORE
// ============================================

/**
 * G9 Gate error codes
 */
export const G9_ERROR_CODES = {
  PARSE_ERROR: 'G9_PARSE_ERROR',
  SCHEMA_MISMATCH: 'G9_SCHEMA_MISMATCH',
  INVALID_TYPE: 'G9_INVALID_TYPE',
  MISSING_REQUIRED: 'G9_MISSING_REQUIRED',
  VALUE_OUT_OF_RANGE: 'G9_VALUE_OUT_OF_RANGE',
  UNKNOWN_ENUM: 'G9_UNKNOWN_ENUM',
  VERSION_UNSUPPORTED: 'G9_VERSION_UNSUPPORTED',
} as const;

/**
 * Convert Zod error to G9 issues
 */
function zodErrorToG9Issues(error: z.ZodError): G9Issue[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    let code: string = G9_ERROR_CODES.SCHEMA_MISMATCH;

    // Map Zod v4 error codes to G9 codes
    const issueCode = issue.code as string;
    if (issueCode === 'invalid_type' || issueCode === 'invalid_value') {
      code = G9_ERROR_CODES.INVALID_TYPE;
    } else if (issueCode === 'invalid_enum_value' || issueCode === 'invalid_element') {
      code = G9_ERROR_CODES.UNKNOWN_ENUM;
    } else if (issueCode === 'too_small' || issueCode === 'too_big') {
      code = G9_ERROR_CODES.VALUE_OUT_OF_RANGE;
    }

    return {
      gateId: 'G9' as const,
      code,
      message: issue.message,
      path: path || undefined,
      severity: 'BLOCK' as const,
    };
  });
}

// ============================================
// PROJECT VALIDATION
// ============================================

/**
 * Validate a project through G9 gate
 *
 * This is the MAIN entry point for project data.
 *
 * @param data - Unknown data (from localStorage, file, etc.)
 * @returns ValidationResult<CanonicalProject>
 *
 * @example
 * ```ts
 * const raw = JSON.parse(localStorage.getItem('project'));
 * const result = validateProject(raw);
 *
 * if (result.ok) {
 *   // result.value is ValidatedProject - safe to use
 *   buildOperationGraph(result.value);
 * } else {
 *   // result.issues contains G9Issue[] - display to user
 *   showErrors(result.issues);
 * }
 * ```
 */
export function validateProject(data: unknown): ValidationResult<CanonicalProject> {
  // Handle null/undefined
  if (data == null) {
    return {
      ok: false,
      issues: [{
        gateId: 'G9',
        code: G9_ERROR_CODES.PARSE_ERROR,
        message: 'Project data is null or undefined',
        severity: 'BLOCK',
      }],
    };
  }

  // Check schema version first if present
  if (typeof data === 'object' && 'schemaVersion' in data) {
    const version = (data as { schemaVersion: unknown }).schemaVersion;
    if (typeof version === 'string' && version !== CANONICAL_SCHEMA_VERSION) {
      // Future: Add migration support here
      return {
        ok: false,
        issues: [{
          gateId: 'G9',
          code: G9_ERROR_CODES.VERSION_UNSUPPORTED,
          message: `Schema version ${version} is not supported. Expected ${CANONICAL_SCHEMA_VERSION}`,
          severity: 'BLOCK',
        }],
      };
    }
  }

  // Parse through Zod
  const result = CanonicalProjectSchema.safeParse(data);

  if (result.success) {
    // Mark as validated - cast through unknown to satisfy branded type
    return {
      ok: true,
      value: result.data as unknown as ValidatedProject,
      warnings: [],
    };
  }

  // Convert Zod errors to G9 issues
  return {
    ok: false,
    issues: zodErrorToG9Issues(result.error),
  };
}

// ============================================
// CABINET VALIDATION
// ============================================

/**
 * Validate a cabinet through G9 gate
 *
 * @param data - Unknown cabinet data
 * @returns ValidationResult<CanonicalCabinet>
 */
export function validateCabinet(data: unknown): ValidationResult<CanonicalCabinet> {
  if (data == null) {
    return {
      ok: false,
      issues: [{
        gateId: 'G9',
        code: G9_ERROR_CODES.PARSE_ERROR,
        message: 'Cabinet data is null or undefined',
        severity: 'BLOCK',
      }],
    };
  }

  const result = CanonicalCabinetSchema.safeParse(data);

  if (result.success) {
    return {
      ok: true,
      value: result.data as unknown as ValidatedCabinet,
      warnings: [],
    };
  }

  return {
    ok: false,
    issues: zodErrorToG9Issues(result.error),
  };
}

// ============================================
// PANEL VALIDATION
// ============================================

/**
 * Validate a panel through G9 gate
 *
 * @param data - Unknown panel data
 * @returns ValidationResult<CanonicalPanel>
 */
export function validatePanel(data: unknown): ValidationResult<CanonicalPanel> {
  if (data == null) {
    return {
      ok: false,
      issues: [{
        gateId: 'G9',
        code: G9_ERROR_CODES.PARSE_ERROR,
        message: 'Panel data is null or undefined',
        severity: 'BLOCK',
      }],
    };
  }

  const result = CanonicalPanelSchema.safeParse(data);

  if (result.success) {
    return {
      ok: true,
      value: result.data as unknown as ValidatedPanel,
      warnings: [],
    };
  }

  return {
    ok: false,
    issues: zodErrorToG9Issues(result.error),
  };
}

// ============================================
// BATCH VALIDATION
// ============================================

/**
 * Validate multiple cabinets
 *
 * @param cabinets - Array of unknown cabinet data
 * @returns Combined validation result
 */
export function validateCabinets(
  cabinets: unknown[]
): ValidationResult<CanonicalCabinet[]> {
  const validatedCabinets: CanonicalCabinet[] = [];
  const allIssues: G9Issue[] = [];

  for (let i = 0; i < cabinets.length; i++) {
    const result = validateCabinet(cabinets[i]);
    if (result.ok) {
      validatedCabinets.push(result.value);
    } else {
      // Prefix issues with cabinet index
      for (const issue of result.issues) {
        allIssues.push({
          ...issue,
          path: `cabinets[${i}]${issue.path ? '.' + issue.path : ''}`,
        });
      }
    }
  }

  if (allIssues.length > 0) {
    return { ok: false, issues: allIssues };
  }

  return {
    ok: true,
    value: validatedCabinets as unknown as CanonicalCabinet[] & ValidatedBrand,
    warnings: [],
  };
}

// ============================================
// SAFE LOAD FROM STORAGE
// ============================================

/**
 * Safely load and validate project from localStorage
 *
 * @param key - localStorage key
 * @returns ValidationResult<CanonicalProject>
 */
export function loadProjectFromStorage(key: string): ValidationResult<CanonicalProject> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {
        ok: false,
        issues: [{
          gateId: 'G9',
          code: G9_ERROR_CODES.PARSE_ERROR,
          message: `No data found at key: ${key}`,
          severity: 'BLOCK',
        }],
      };
    }

    const parsed = JSON.parse(raw);
    return validateProject(parsed);
  } catch (error) {
    return {
      ok: false,
      issues: [{
        gateId: 'G9',
        code: G9_ERROR_CODES.PARSE_ERROR,
        message: `JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'BLOCK',
      }],
    };
  }
}

/**
 * Safely save validated project to localStorage
 *
 * @param key - localStorage key
 * @param project - ValidatedProject to save
 */
export function saveProjectToStorage(key: string, project: ValidatedProject): void {
  // Since it's already validated, we can safely serialize
  localStorage.setItem(key, JSON.stringify(project));
}

// ============================================
// GATE STATUS
// ============================================

/**
 * Check if a validation result has blocking issues
 */
export function hasBlockingIssues<T>(result: ValidationResult<T>): boolean {
  if (result.ok) return false;
  return result.issues.some((i) => i.severity === 'BLOCK');
}

/**
 * Get summary of validation result
 */
export function getValidationSummary<T>(
  result: ValidationResult<T>
): { ok: boolean; blockCount: number; warnCount: number } {
  if (result.ok) {
    return {
      ok: true,
      blockCount: 0,
      warnCount: result.warnings.length,
    };
  }

  return {
    ok: false,
    blockCount: result.issues.filter((i) => i.severity === 'BLOCK').length,
    warnCount: result.issues.filter((i) => i.severity === 'WARN').length,
  };
}

// ============================================
// TYPE ASSERTIONS
// ============================================

/**
 * Assert that data is a valid project, throw on failure
 *
 * @throws Error with G9 issues if validation fails
 */
export function assertValidProject(data: unknown): ValidatedProject {
  const result = validateProject(data);
  if (!result.ok) {
    const messages = result.issues.map((i) => `${i.code}: ${i.message}`).join('\n');
    throw new Error(`G9 Validation Failed:\n${messages}`);
  }
  return result.value;
}

/**
 * Assert that data is a valid cabinet, throw on failure
 *
 * @throws Error with G9 issues if validation fails
 */
export function assertValidCabinet(data: unknown): ValidatedCabinet {
  const result = validateCabinet(data);
  if (!result.ok) {
    const messages = result.issues.map((i) => `${i.code}: ${i.message}`).join('\n');
    throw new Error(`G9 Validation Failed:\n${messages}`);
  }
  return result.value;
}

/**
 * Assert that data is a valid panel, throw on failure
 *
 * @throws Error with G9 issues if validation fails
 */
export function assertValidPanel(data: unknown): ValidatedPanel {
  const result = validatePanel(data);
  if (!result.ok) {
    const messages = result.issues.map((i) => `${i.code}: ${i.message}`).join('\n');
    throw new Error(`G9 Validation Failed:\n${messages}`);
  }
  return result.value;
}
