/**
 * Canonical Model - C1 Module
 *
 * NORTH STAR: "No unvalidated external state enters OperationGraph"
 *
 * This module provides:
 * - Canonical types (validated truth model)
 * - Adapters for converting between legacy and canonical
 * - Type guards and utilities
 *
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

export type {
  // Brand types
  ValidatedBrand,
  Validated,
  CanonicalId,
  CanonicalMaterialRef,
  PositiveNumber,
  NonNegativeNumber,

  // Schema version
  SchemaVersion,

  // Enums
  CanonicalCabinetType,
  CanonicalJointType,
  CanonicalPanelRole,
  CanonicalGrainDirection,
  CanonicalBackPanelConstruction,

  // Materials
  CanonicalCoreMaterial,
  CanonicalSurfaceMaterial,
  CanonicalEdgeMaterial,

  // Panel
  CanonicalPanelEdges,
  CanonicalPanelFaces,
  CanonicalPanelComputed,
  CanonicalPanel,

  // Structure
  CanonicalDimensions,
  CanonicalStructure,
  CanonicalManufacturing,
  CanonicalMaterials,
  CanonicalComputed,

  // Cabinet
  CanonicalCabinet,

  // Project
  CanonicalProjectMeta,
  CanonicalProject,

  // Validated wrappers
  ValidatedProject,
  ValidatedCabinet,
  ValidatedPanel,

  // Validation
  G9Issue,
  ValidationResult,
} from './types';

export {
  // Constants
  CANONICAL_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,

  // Type guards
  isValidated,
  isValidationSuccess,
  isValidationFailure,

  // Escape hatches
  unsafeMarkAsValidated,
  stripValidationBrand,
} from './types';

// ============================================
// ADAPTERS
// ============================================

export {
  // Material adapters
  toCanonicalCoreMaterial,
  fromCanonicalCoreMaterial,
  toCanonicalSurfaceMaterial,
  fromCanonicalSurfaceMaterial,
  toCanonicalEdgeMaterial,
  fromCanonicalEdgeMaterial,

  // Panel adapters
  toCanonicalPanel,
  fromCanonicalPanel,

  // Cabinet adapters
  toCanonicalCabinet,
  fromCanonicalCabinet,

  // Project adapters
  toCanonicalProject,
  extractCabinetFromProject,
  extractMaterialsFromProject,
} from './adapters';

// ============================================
// ZOD SCHEMAS
// ============================================

export {
  // Core schemas
  CanonicalProjectSchema,
  CanonicalCabinetSchema,
  CanonicalPanelSchema,
  CanonicalDimensionsSchema,
  CanonicalStructureSchema,
  CanonicalManufacturingSchema,
  CanonicalMaterialsSchema,
  CanonicalComputedSchema,

  // Material schemas
  CanonicalCoreMaterialSchema,
  CanonicalSurfaceMaterialSchema,
  CanonicalEdgeMaterialSchema,

  // Panel sub-schemas
  CanonicalPanelEdgesSchema,
  CanonicalPanelFacesSchema,
  CanonicalPanelComputedSchema,

  // Enum schemas
  CanonicalCabinetTypeSchema,
  CanonicalJointTypeSchema,
  CanonicalPanelRoleSchema,
  CanonicalGrainDirectionSchema,
  CanonicalBackPanelConstructionSchema,

  // Utility schemas
  CanonicalIdSchema,
  CanonicalMaterialRefSchema,
  SchemaVersionSchema,
  Vec3TupleSchema,

  // Parse helpers
  parseCanonicalProject,
  parseCanonicalCabinet,
  parseCanonicalPanel,

  // Types
  type SafeParseResult,
  type ZodCanonicalProject,
  type ZodCanonicalCabinet,
  type ZodCanonicalPanel,

  // Metadata
  SCHEMA_PACK_VERSION,
  schemas,
} from './schemas';

// ============================================
// G9 PERSISTENCE GATE
// ============================================

export {
  // Core validation
  validateProject,
  validateCabinet,
  validatePanel,
  validateCabinets,

  // Storage helpers
  loadProjectFromStorage,
  saveProjectToStorage,

  // Utilities
  hasBlockingIssues,
  getValidationSummary,

  // Assertions (throw on failure)
  assertValidProject,
  assertValidCabinet,
  assertValidPanel,

  // Error codes
  G9_ERROR_CODES,
} from './gate09';
