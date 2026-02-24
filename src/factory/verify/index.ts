/**
 * Factory Verify Module - Public API
 *
 * Re-verification for persisted artifacts loaded from IndexedDB.
 * Ensures trust chain integrity across browser sessions.
 *
 * @version 1.0.0 - Phase D3.3
 */

// Types
export type {
  ReverifyStatus,
  ReverifyErrorCode,
  ReverifyPacketOptions,
  ReverifyPacketResult,
  ReverifyCncBundleOptions,
  ReverifyCncBundleResult,
  VerificationState,
} from './types';

export {
  defaultVerificationState,
  isVerifyPass,
  isVerifyFail,
  isVerifyStale,
} from './types';

// Re-verification functions
export {
  reverifyPacketFromIndexedDb,
  reverifyCncBundleFromIndexedDb,
  isCncBundleValid,
  isPacketValid,
  invalidateIfVerifyFailed,
} from './reverifyOnLoad';
