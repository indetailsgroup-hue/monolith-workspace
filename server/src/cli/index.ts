/**
 * cli/index.ts - P13.2/P13.4 CLI Module Exports
 *
 * Exports for programmatic use of CLI verification.
 *
 * @version 0.13.4
 */

export {
  verifyReceiptZip,
  formatVerifyOutput,
  CLI_VERSION,
  type CliVerifyResult,
  type VerifyCode,
} from './receiptVerify.js';

export {
  extractZipEntries,
  extractReceiptFromZip,
  computeContentHash,
  listZipEntries,
  getZipEntry,
  ZipSafetyError,
  DEFAULT_SAFETY_LIMITS,
  type ZipSafetyLimits,
} from './zipExtract.js';
