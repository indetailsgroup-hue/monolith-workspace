/**
 * Gate Module Index
 *
 * Validation and enforcement system for cabinet operations
 */

// Existing Gate After Snap
export type {
  GateInput,
  GateReport,
  GateIssue as GateIssueBase,
} from './runGateAfterSnap';
export { runGateAfterSnap } from './runGateAfterSnap';

// Collision Issue Codes
export type {
  CollisionIssueCode,
  IssueSeverity,
  CollisionGateIssue,
} from './collisionIssueCodes';
export {
  COLLISION_ISSUE,
  COLLISION_ISSUE_SEVERITY,
  formatOverlapMessage,
  formatMinGapMessage,
  formatExternalCollisionMessage,
  formatInternalCollisionMessage,
} from './collisionIssueCodes';

// Gate Bundle Types
export type {
  GateIssue,
  GatePerCabinet,
  GateBundleResult,
} from './gateBundleTypes';
export {
  createEmptyBundleResult,
  getAllIssues,
  getIssuesForCabinet,
  getCabinetIdsWithErrors,
  filterBundleByIds,
  mergeBundleResults,
} from './gateBundleTypes';

// Collision to Issues Mapper
export {
  collisionReportToGateIssues,
  collisionPairToGateIssues,
  indexIssuesBySubject,
  getGlobalIssues,
  filterBySeverity,
  hasBlockingIssues,
} from './collisionToIssues';

// Gate Bundle Runner
export type { RunGatePerCabinetFn } from './runGateBundle';
export {
  runGateBundle,
  runGateBundleCollisionOnly,
  isGateBundleBlocked,
  formatGateBundleSummary,
  formatGateBundleIssues,
} from './runGateBundle';

// ============================================
// PERSISTENCE GATE (G9) - External State Validation
// ============================================

export {
  // Error types
  ExternalStateValidationError,
  ValidationError, // Alias
  type ValidationIssue,
  type ValidationResult,

  // Core validation functions
  validateExternalState,
  validateExternalStateSafe,

  // Branded validation functions (compile-time enforcement)
  validateExternalStateBranded,
  validateExternalStateSafeBranded,

  // Boundary helpers
  parseAndValidate,
  parseAndValidateSafe,
  parseAndValidateBranded,
  parseAndValidateSafeBranded,

  // Type guards
  isValidationError,

  // Re-exports
  z,
  type ZodSchema,
  type ZodError,

  // Branded types
  type Validated,
  type ValidatedResult,
  type ValidatedProject,
  type ValidatedCabinet,

  // Branded type utilities
  unsafeMarkAsValidated,
  stripValidationBrand,
  isValidated,
} from './validateExternalState';

// Direct branded type exports for convenience
export type {
  ValidatedSavedProject,
  ValidatedImportedProject,
  ValidatedFactoryPacket,
  ValidatedMachineProfile,
} from './brandTypes';

// ============================================
// G9 PERSISTENCE GATE RUNTIME CHECKS
// ============================================

export type {
  G9Status,
  G9Issue,
  G9Result,
} from './g9PersistenceGate';

export {
  runG9Check,
  g9ToValidationRules,
  getG9Status,
} from './g9PersistenceGate';

// ============================================
// G10 DXF SAFETY GATE
// ============================================

export type {
  // Branded safe DXF type
  SafeDxf,

  // Provenance types
  DxfProvenance,
  DxfProvenanceOperationGraph,
  DxfProvenanceCabinet,
  DxfProvenanceNesting,
  DxfProvenanceUnknown,

  // Result types
  G10Issue,
  G10Result,
  G10ErrorCode,

  // Options
  DxfSafetyOptions,
} from './gate10DxfSafety';

export {
  // Error codes
  G10_ERROR_CODES,

  // Core gate functions
  assertDxfSafety,
  guardFactoryDxf,

  // Provenance builders
  createOperationGraphProvenance,
  createCabinetProvenance,
  createNestingProvenance,
  createUnknownProvenance,

  // Validation helpers
  hasCncOperations,
  isSafeDxf,
  isOperationGraphProvenance,

  // Error class
  G10Error,
  isG10Error,

  // Status helpers
  getG10Summary,
} from './gate10DxfSafety';

// ============================================
// G10.2 DXF SEMANTIC VALIDATION GATE
// ============================================

export type {
  // Issue types
  SemanticRule,
  SemanticSeverity,
  SemanticIssue,

  // Result types
  SemanticValidationResult,

  // Context types
  PanelContext,
  SemanticValidationOptions,
} from './gate10_2DxfSemantic';

export {
  // Constants
  TOLERANCES,
  MINIFIX_SPEC,

  // Core validation
  validateDxfSemantic,
  isDxfSemanticValid,

  // Helpers
  getBlockingIssues,
  formatSemanticReport,
} from './gate10_2DxfSemantic';

// ============================================
// G10.3 MACHINE DIALECT GATE
// ============================================

export type {
  // Issue types
  G10_3Code,
  G10_3Severity,
  G10_3Issue,

  // Result types
  MachineDialectResult,

  // Capabilities
  MachineDialectCapabilities,
} from './gate10_3MachineDialect';

export {
  // Codes
  G10_3_CODES,

  // Core validation
  validateMachineDialect,
  assertMachineDialect,

  // Machine profile validation
  validateMachineProfileStructure,
  assertMachineProfile,

  // Error class
  G10_3Error,
  isG10_3Error,

  // Helpers
  hasBlockingIssues as hasG10_3BlockingIssues,
  getBlockingIssues as getG10_3BlockingIssues,
  formatMachineDialectResult,

  // Trusted export paths
  TRUSTED_EXPORT_PATHS,
} from './gate10_3MachineDialect';

export type {
  MachineProfileIssue,
  TrustedExportSource,
} from './gate10_3MachineDialect';
