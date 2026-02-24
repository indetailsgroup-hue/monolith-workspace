/**
 * Canonical Types - C1: Validated Truth Model
 *
 * NORTH STAR: "No unvalidated external state enters OperationGraph"
 *
 * These types represent VALIDATED data that has passed the G9 Persistence Gate.
 * They are branded types that cannot be created directly - only through validation.
 *
 * FLOW:
 *   External State (unknown) → G9 Validation → Canonical Types → OperationGraph
 *
 * @version 1.0.0
 */

// ============================================
// BRANDED TYPE FOUNDATION
// ============================================

/**
 * Brand symbol for validated types
 */
declare const VALIDATED_BRAND: unique symbol;

/**
 * Validated brand marker
 * Types with this brand have passed G9 validation
 */
export type ValidatedBrand = { readonly [VALIDATED_BRAND]: true };

/**
 * Validated<T> - A type that has passed G9 boundary validation
 * Cannot be created directly, only through validation functions
 */
export type Validated<T> = T & ValidatedBrand;

// ============================================
// SCHEMA VERSION
// ============================================

/**
 * Current schema version
 * Increment when making breaking changes to persisted format
 */
export const CANONICAL_SCHEMA_VERSION = '1.0.0' as const;

/**
 * Supported schema versions (for migration)
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'] as const;

export type SchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number];

// ============================================
// CANONICAL IDENTIFIERS
// ============================================

/**
 * Validated string ID
 * Non-empty string that has been validated
 */
export type CanonicalId = Validated<string>;

/**
 * Validated material reference
 */
export type CanonicalMaterialRef = Validated<string>;

// ============================================
// CANONICAL DIMENSIONS
// ============================================

/**
 * Validated positive number (> 0)
 */
export type PositiveNumber = Validated<number>;

/**
 * Validated non-negative number (>= 0)
 */
export type NonNegativeNumber = Validated<number>;

/**
 * Validated dimension in millimeters
 * Must be positive and finite
 */
export interface CanonicalDimensions {
  readonly width: PositiveNumber;
  readonly height: PositiveNumber;
  readonly depth: PositiveNumber;
  readonly toeKickHeight: NonNegativeNumber;
}

// ============================================
// CANONICAL ENUMS (DISCRIMINATED)
// ============================================

export type CanonicalCabinetType = 'BASE' | 'WALL' | 'TALL' | 'DRAWER' | 'CORNER';

export type CanonicalJointType = 'INSET' | 'OVERLAY';

export type CanonicalPanelRole =
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'TOP'
  | 'BOTTOM'
  | 'BACK'
  | 'SHELF'
  | 'DIVIDER'
  | 'FRONT'
  | 'DRAWER_FRONT'
  | 'DRAWER_SIDE'
  | 'DRAWER_BACK'
  | 'DRAWER_BOTTOM'
  | 'DOOR'
  | 'DOOR_LEFT'
  | 'DOOR_RIGHT';

export type CanonicalGrainDirection = 'HORIZONTAL' | 'VERTICAL';

export type CanonicalBackPanelConstruction = 'inset' | 'overlay';

// ============================================
// CANONICAL MATERIALS
// ============================================

export interface CanonicalCoreMaterial {
  readonly id: CanonicalId;
  readonly name: string;
  readonly thickness: PositiveNumber;
  readonly costPerSqm: NonNegativeNumber;
  readonly co2PerSqm: NonNegativeNumber;
}

export interface CanonicalSurfaceMaterial {
  readonly id: CanonicalId;
  readonly name: string;
  readonly thickness: NonNegativeNumber;
  readonly costPerSqm: NonNegativeNumber;
  readonly co2PerSqm: NonNegativeNumber;
  readonly color: string;
  readonly textureUrl?: string;
}

export interface CanonicalEdgeMaterial {
  readonly id: CanonicalId;
  readonly name: string;
  readonly code: string;
  readonly thickness: PositiveNumber;
  readonly height: PositiveNumber;
  readonly costPerMeter: NonNegativeNumber;
  readonly color: string;
}

// ============================================
// CANONICAL PANEL
// ============================================

export interface CanonicalPanelEdges {
  readonly top: CanonicalMaterialRef | null;
  readonly bottom: CanonicalMaterialRef | null;
  readonly left: CanonicalMaterialRef | null;
  readonly right: CanonicalMaterialRef | null;
}

export interface CanonicalPanelFaces {
  readonly faceA: CanonicalMaterialRef | null;
  readonly faceB: CanonicalMaterialRef | null;
}

export interface CanonicalPanelComputed {
  readonly realThickness: PositiveNumber;
  readonly cutWidth: PositiveNumber;
  readonly cutHeight: PositiveNumber;
  readonly surfaceArea: NonNegativeNumber;
  readonly edgeLength: NonNegativeNumber;
  readonly cost: NonNegativeNumber;
  readonly co2: NonNegativeNumber;
}

export interface CanonicalPanel {
  readonly id: CanonicalId;
  readonly role: CanonicalPanelRole;
  readonly name: string;
  readonly finishWidth: PositiveNumber;
  readonly finishHeight: PositiveNumber;
  readonly coreMaterialId: CanonicalMaterialRef;
  readonly faces: CanonicalPanelFaces;
  readonly edges: CanonicalPanelEdges;
  readonly grainDirection: CanonicalGrainDirection;
  readonly computed: CanonicalPanelComputed;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly visible: boolean;
}

// ============================================
// CANONICAL STRUCTURE
// ============================================

export interface CanonicalStructure {
  readonly topJoint: CanonicalJointType;
  readonly bottomJoint: CanonicalJointType;
  readonly hasBackPanel: boolean;
  readonly backPanelInset: NonNegativeNumber;
  readonly shelfCount: NonNegativeNumber;
  readonly dividerCount: NonNegativeNumber;
}

export interface CanonicalManufacturing {
  readonly glueThickness: PositiveNumber;
  readonly preMilling: NonNegativeNumber;
  readonly grooveDepth: PositiveNumber;
  readonly clearance: NonNegativeNumber;
  readonly shelfSetbackFront: NonNegativeNumber;
  readonly backPanelConstruction: CanonicalBackPanelConstruction;
  readonly backVoid: NonNegativeNumber;
  readonly backThickness: PositiveNumber;
  readonly safetyGap: NonNegativeNumber;
}

export interface CanonicalMaterials {
  readonly defaultCore: CanonicalMaterialRef;
  readonly defaultSurface: CanonicalMaterialRef;
  readonly defaultEdge: CanonicalMaterialRef;
}

export interface CanonicalComputed {
  readonly totalCost: NonNegativeNumber;
  readonly totalCO2: NonNegativeNumber;
  readonly panelCount: NonNegativeNumber;
  readonly totalSurfaceArea: NonNegativeNumber;
  readonly totalEdgeLength: NonNegativeNumber;
}

// ============================================
// CANONICAL CABINET
// ============================================

export interface CanonicalCabinet {
  readonly id: CanonicalId;
  readonly name: string;
  readonly type: CanonicalCabinetType;
  readonly dimensions: CanonicalDimensions;
  readonly structure: CanonicalStructure;
  readonly materials: CanonicalMaterials;
  readonly manufacturing: CanonicalManufacturing;
  readonly panels: readonly CanonicalPanel[];
  readonly computed: CanonicalComputed;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ============================================
// CANONICAL PROJECT
// ============================================

export interface CanonicalProjectMeta {
  readonly id: CanonicalId;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * CanonicalProject - The validated project model
 * This is the ONLY type that should enter OperationGraph builder
 */
export interface CanonicalProject {
  readonly schemaVersion: SchemaVersion;
  readonly meta: CanonicalProjectMeta;
  readonly cabinets: readonly CanonicalCabinet[];
  readonly materialLibrary: {
    readonly cores: readonly CanonicalCoreMaterial[];
    readonly surfaces: readonly CanonicalSurfaceMaterial[];
    readonly edges: readonly CanonicalEdgeMaterial[];
  };
}

// ============================================
// VALIDATED WRAPPER TYPES
// ============================================

/**
 * ValidatedProject - A project that has passed G9 validation
 * This branded type ensures compile-time safety
 */
export type ValidatedProject = Validated<CanonicalProject>;

/**
 * ValidatedCabinet - A cabinet that has passed G9 validation
 */
export type ValidatedCabinet = Validated<CanonicalCabinet>;

/**
 * ValidatedPanel - A panel that has passed G9 validation
 */
export type ValidatedPanel = Validated<CanonicalPanel>;

// ============================================
// VALIDATION RESULT TYPES
// ============================================

/**
 * G9 Gate Issue
 */
export interface G9Issue {
  readonly gateId: 'G9';
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly severity: 'BLOCK' | 'WARN';
}

/**
 * Validation result - discriminated union
 */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: Validated<T>; readonly warnings: readonly G9Issue[] }
  | { readonly ok: false; readonly issues: readonly G9Issue[] };

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is a validated type (runtime check)
 * Note: This is a heuristic - true validation only happens through G9 boundary
 */
export function isValidated<T>(value: T | Validated<T>): value is Validated<T> {
  return value !== null && typeof value === 'object';
}

/**
 * Check if validation result is successful
 */
export function isValidationSuccess<T>(
  result: ValidationResult<T>
): result is { ok: true; value: Validated<T>; warnings: readonly G9Issue[] } {
  return result.ok === true;
}

/**
 * Check if validation result is failure
 */
export function isValidationFailure<T>(
  result: ValidationResult<T>
): result is { ok: false; issues: readonly G9Issue[] } {
  return result.ok === false;
}

// ============================================
// UNSAFE ESCAPE HATCHES (USE WITH CAUTION)
// ============================================

/**
 * UNSAFE: Mark a value as validated without actual validation
 * Only use in tests or when you have external proof of validity
 *
 * @deprecated Prefer using proper validation through G9 boundary
 */
export function unsafeMarkAsValidated<T>(value: T): Validated<T> {
  return value as Validated<T>;
}

/**
 * Strip validation brand from a validated type
 * Use when you need to pass to APIs that don't understand branded types
 */
export function stripValidationBrand<T>(validated: Validated<T>): T {
  return validated as T;
}
