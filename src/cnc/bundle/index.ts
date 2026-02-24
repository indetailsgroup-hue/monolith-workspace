/**
 * CNC Bundle Module - Phase D3.1
 *
 * Factory-verifiable CNC output bundles with cryptographic trust chain.
 *
 * @version 1.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Types & Constants
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Constants
  CNC_MANIFEST_SCHEMA,
  CNC_POST_VERSION,
  CNC_ZIP_FIXED_DATE,
  CNC_BUNDLE_FILES,
  // Types
  type CncDialect,
  type CncManifestFileEntry,
  type CncPostIdentity,
  type CncManifestStats,
  type CncManifest,
  // Type Guards
  isValidCncManifest,
  isValidFileEntry,
  // Helpers
  getCncBundleFilename,
  generateChecksumsFile,
} from './cncManifest';

// ─────────────────────────────────────────────────────────────────────────────
// Bundle Builder
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Main builder
  buildCncBundleZip,
  // Download helpers
  downloadCncBundleZip,
  buildAndDownloadCncBundle,
  // Types
  type BuildCncBundleInput,
  type BuildCncBundleResult,
} from './buildCncBundleZip';

// ─────────────────────────────────────────────────────────────────────────────
// ZIP Utilities
// ─────────────────────────────────────────────────────────────────────────────
export {
  // ZIP creation
  zipCncBundle,
  // ZIP extraction
  unzipCncBundle,
  listCncBundleFiles,
  // Types
  type CncBundleFile,
  type ZipCncBundleOptions,
} from './zipCncBundle';
