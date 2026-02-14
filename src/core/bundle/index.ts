/**
 * Bundle Module Index
 *
 * Export bundle creation and verification.
 */

// Types
export type {
  BundleVersion,
  BundleFileEntry,
  BundleIndex,
  BundleContent,
  BundleVerificationResult,
  BundleBuildOptions,
} from './bundleTypes';

export { BUNDLE_FILES, getChainProofFilename } from './bundleTypes';

// Builder
export type { BuildBundleConfig, BuildBundleResult } from './buildExportBundle';
export {
  buildExportBundle,
  generateBundleFilename,
  downloadBundle,
} from './buildExportBundle';

// Verifier
export type { BundleFileReader, VerifyBundleOptions } from './verifyExportBundle';
export {
  verifyExportBundle,
  createJsZipReader,
  quickVerifyBundle,
} from './verifyExportBundle';
