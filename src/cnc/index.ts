/**
 * CNC Module - Phase D1 + D2 + D3.1 + D3.2
 *
 * Machine profile + Operation mapping + G-code generation for CNC manufacturing.
 * Converts verified factory packets to machine-specific operation graphs and G-code.
 *
 * D3.1 adds factory-verifiable CNC bundle ZIP with trust chain.
 * D3.2 adds IndexedDB cache with deterministic cache keys.
 *
 * @version 3.1.0 - Phase D3.2
 */

// ============================================
// Machine Module
// ============================================
export * from './machine';

// ============================================
// Operation Module
// ============================================
export * from './operation';

// ============================================
// Mapping Module
// ============================================
export * from './mapping';

// ============================================
// Post Processing Module (D2)
// ============================================
export * from './post';

// ============================================
// Bundle Builder (D2)
// ============================================
export {
  buildGcodeBundle,
  canGenerateBundle,
  getValidationIssues,
  extractGcodeText,
  createGcodeBlob,
  getGcodeFilename,
} from './buildGcodeBundle';
export type { BuildBundleParams } from './buildGcodeBundle';

// ============================================
// CNC Bundle (D3.1)
// ============================================
export * from './bundle';

// ============================================
// CNC Cache (D3.2)
// ============================================
export * from './cache';
