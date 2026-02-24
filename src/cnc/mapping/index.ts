/**
 * CNC Mapping Module
 *
 * @version 1.0.0 - Phase D1
 */

// Drill Map Mapping
export { mapDrillMapToOps, getDrillMapStats } from './mapDrillMapToOps';
export type { MapDrillResult, MapDrillOptions } from './mapDrillMapToOps';

// Minifix Mapping
export { mapMinifixToOps, getMinifixMapStats } from './mapMinifixToOps';
export type { MapMinifixResult, MapMinifixOptions } from './mapMinifixToOps';

// Operation Graph Building
export {
  buildOperationGraph,
  hasBuildErrors,
  hasUnmappedItems,
  formatBuildResult,
} from './buildOperationGraph';
export type {
  BuildOperationGraphResult,
  BuildStats,
  BuildOperationGraphOptions,
} from './buildOperationGraph';

// Validation
export {
  validateOperationGraph,
  isValidGraph,
  getValidationErrors,
  getValidationWarnings,
  formatValidationResult,
  ValidationCodes,
} from './validateOperationGraph';
export type {
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
} from './validateOperationGraph';

// G9 Persistence Gate
export {
  assertValidatedPacket,
  assertValidatedPacketSafe,
  markPacketAsValidated,
  isG9ViolationError,
  hasG9ViolationCode,
  G9ViolationError,
  G9_ERROR_CODE,
  TRUSTED_MODULES_ALLOWLIST,
} from './g9AssertValidPacket';
export type { TrustedPacketSource } from './g9AssertValidPacket';
