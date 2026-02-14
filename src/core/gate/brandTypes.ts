/**
 * brandTypes.ts - Branded Types for G9 Persistence Gate
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * Branded types provide compile-time enforcement that data has passed
 * through the validation boundary. Only `validateExternalState()` can
 * create these types - there's no way to bypass without explicit unsafe cast.
 *
 * ## Why Branded Types?
 *
 * 1. **Compile-time safety**: TypeScript won't let you pass raw data
 *    where validated data is required
 * 2. **Intent clarity**: Function signatures show validation requirement
 * 3. **Audit trail**: Easy to grep for `as Validated<T>` violations
 *
 * ## Usage
 *
 * ```typescript
 * // In store code - MUST use validated type
 * function processProject(project: ValidatedProject): void {
 *   // TypeScript enforces validation happened
 *   buildOperationGraph(project); // Safe!
 * }
 *
 * // At boundary - validation creates branded type
 * const validated = validateExternalState(ProjectDataSchema, raw);
 * processProject(validated); // OK - validated is ValidatedProject
 *
 * // Raw data - compile error!
 * processProject(rawProject); // ERROR: Type 'ProjectData' is not assignable
 * ```
 *
 * @version 1.0.0
 */

// ============================================
// BRAND SYMBOLS
// ============================================

/**
 * Unique symbol for validation brand.
 * Using a symbol ensures the brand cannot be forged accidentally.
 */
declare const ValidatedBrand: unique symbol;

/**
 * Unique symbol for G9-specific brand.
 */
declare const G9Brand: unique symbol;

// ============================================
// BRANDED TYPE DEFINITIONS
// ============================================

/**
 * Brand type marker for validated data.
 *
 * This is a phantom type - it exists only at compile time and has
 * no runtime overhead. The brand cannot be created directly; only
 * the validation boundary can produce it.
 */
export interface ValidatedMark {
  readonly [ValidatedBrand]: 'VALIDATED';
  readonly [G9Brand]: 'G9_PERSISTENCE_GATE';
}

/**
 * Validated<T> - Data that has passed G9 validation.
 *
 * This branded type wraps any data type T and adds a compile-time
 * marker indicating it came through the validation boundary.
 *
 * @template T - The underlying data type
 *
 * @example
 * ```typescript
 * // Function requires validated data
 * function buildGraph(cabinet: Validated<Cabinet>): OperationGraph { ... }
 *
 * // Raw cabinet won't compile
 * const raw: Cabinet = { ... };
 * buildGraph(raw); // ERROR!
 *
 * // Validated cabinet works
 * const validated = validateExternalState(CabinetSchema, raw);
 * buildGraph(validated); // OK!
 * ```
 */
export type Validated<T> = T & ValidatedMark;

// ============================================
// CONCRETE BRANDED TYPES
// ============================================

// Import types for concrete branded versions
import type { ProjectDataSchemaType, SavedProjectSchemaType, ImportedProjectSchemaType } from '../schema/project.schema';
import type { CabinetSchemaType } from '../schema/cabinet.schema';
import type { FactoryPacket } from '../../factory/packet/types';
import type { MachineProfile } from '../../cnc/machine/machineProfile';

/**
 * ValidatedProject - Project data that has passed G9 validation.
 *
 * Only `validateExternalState(ProjectDataSchema, raw)` can create this type.
 * Use this type in all functions that process project data from external sources.
 */
export type ValidatedProject = Validated<ProjectDataSchemaType>;

/**
 * ValidatedCabinet - Cabinet data that has passed G9 validation.
 */
export type ValidatedCabinet = Validated<CabinetSchemaType>;

/**
 * ValidatedSavedProject - Saved project metadata that has passed validation.
 */
export type ValidatedSavedProject = Validated<SavedProjectSchemaType>;

/**
 * ValidatedImportedProject - Imported project that has passed validation.
 */
export type ValidatedImportedProject = Validated<ImportedProjectSchemaType>;

/**
 * ValidatedFactoryPacket - Factory packet that has passed G9 validation.
 *
 * GATE RULE (G9): Only validated factory packets may enter buildOperationGraph().
 *
 * This type can ONLY be created by:
 * - `buildFactoryPacket()` (trusted internal path)
 * - `assertValidatedPacket()` (explicit validation boundary)
 *
 * Error code if violation: MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH
 */
export type ValidatedFactoryPacket = Validated<FactoryPacket>;

/**
 * ValidatedMachineProfile - Machine profile that has passed G10.3 validation.
 *
 * GATE RULE (G10.3): No OperationGraph may be exported unless validated
 * against a properly configured machine profile.
 *
 * This type can ONLY be created by:
 * - `assertMachineProfile()` (explicit validation boundary)
 * - `getMachineProfile()` (trusted internal preset loader)
 *
 * Error code if violation: MONO_G10_3_MACHINE_DIALECT_FAILED
 */
export type ValidatedMachineProfile = Validated<MachineProfile>;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value has been validated (runtime check for debugging).
 *
 * Note: This is a heuristic check since the brand only exists at compile time.
 * It verifies the value is an object, which is necessary but not sufficient.
 * The real enforcement happens at compile time.
 *
 * @param value - Value to check
 * @returns True if value appears to be validated
 */
export function isValidated<T>(value: T | Validated<T>): value is Validated<T> {
  // Runtime: we can only verify it's a non-null object
  // Compile-time: TypeScript enforces the brand
  return value !== null && typeof value === 'object';
}

// ============================================
// UNSAFE ESCAPE HATCHES (USE WITH CAUTION)
// ============================================

/**
 * UNSAFE: Mark data as validated without actual validation.
 *
 * ⚠️ WARNING: Only use this for:
 * - Legacy migration code with explicit review
 * - Test fixtures
 * - Type system workarounds with documented justification
 *
 * Every use of this function should be auditable and justified.
 * Consider adding a comment explaining why validation was bypassed.
 *
 * @param data - Data to mark as validated (WITHOUT ACTUALLY VALIDATING)
 * @returns The same data with validated brand
 *
 * @example
 * ```typescript
 * // ❌ BAD: No justification
 * const project = unsafeMarkAsValidated(rawProject);
 *
 * // ✅ OK: Documented legacy workaround
 * // LEGACY: Data from v0.8 stores was validated at load time
 * // TODO: Remove when v0.8 migration is complete
 * const project = unsafeMarkAsValidated(legacyProject);
 * ```
 */
export function unsafeMarkAsValidated<T>(data: T): Validated<T> {
  // This is intentionally simple - the "validation" is the conscious
  // decision to use this function, which should be auditable
  return data as Validated<T>;
}

/**
 * Strip the validated brand from data.
 *
 * Use when you need to serialize validated data back to plain objects.
 * The resulting data loses its validation guarantee.
 *
 * @param validated - Validated data
 * @returns Plain data without brand
 */
export function stripValidationBrand<T>(validated: Validated<T>): T {
  // The brand is phantom - no runtime action needed
  return validated as T;
}

// ============================================
// VALIDATION RESULT WITH BRAND
// ============================================

/**
 * Result type for validation functions returning branded data.
 */
export type ValidatedResult<T> =
  | { ok: true; data: Validated<T> }
  | { ok: false; issues: import('./validateExternalState').ValidationIssue[]; error: import('./validateExternalState').ExternalStateValidationError };

// ============================================
// BRANDED RESULT HELPER
// ============================================

/**
 * Convert a plain validation result to a branded result.
 *
 * Used internally by validateExternalState to add the brand.
 */
export function brandValidationResult<T>(
  result: { ok: true; data: T } | { ok: false; issues: import('./validateExternalState').ValidationIssue[]; error: import('./validateExternalState').ExternalStateValidationError }
): ValidatedResult<T> {
  if (result.ok) {
    return { ok: true, data: result.data as Validated<T> };
  }
  return result;
}
