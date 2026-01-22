/**
 * types.ts - Re-verification Types for Factory Module
 *
 * Defines status and result types for re-verifying persisted artifacts
 * (packets and CNC bundles) loaded from IndexedDB.
 *
 * @version 1.0.0 - Phase D3.3
 */

// ============================================================================
// Verification Status
// ============================================================================

/**
 * Status of a re-verification operation.
 */
export type ReverifyStatus = 'PENDING' | 'PASS' | 'FAIL' | 'STALE';

/**
 * Error codes for re-verification failures.
 */
export type ReverifyErrorCode =
  // Packet errors
  | 'E_PACKET_NOT_FOUND'
  | 'E_PACKET_CORRUPT'
  | 'E_PACKET_HASH_MISMATCH'
  | 'E_PACKET_MANIFEST_INVALID'
  | 'E_PACKET_FILE_MISSING'
  | 'E_PACKET_FILE_HASH_MISMATCH'
  // CNC bundle errors
  | 'E_BUNDLE_NOT_FOUND'
  | 'E_BUNDLE_CORRUPT'
  | 'E_BUNDLE_MANIFEST_INVALID'
  | 'E_BUNDLE_GCODE_HASH_MISMATCH'
  | 'E_BUNDLE_OPGRAPH_HASH_MISMATCH'
  | 'E_BUNDLE_PACKET_HASH_MISMATCH'
  | 'E_BUNDLE_POST_VERSION_MISMATCH'
  // Generic errors
  | 'E_INTERNAL';

// ============================================================================
// Packet Re-verification
// ============================================================================

/**
 * Options for packet re-verification.
 */
export interface ReverifyPacketOptions {
  /**
   * Verification mode:
   * - 'fast': Verify only critical files (manifest, drillmap, cutlist)
   * - 'full': Verify all files in the packet
   */
  mode?: 'fast' | 'full';

  /**
   * Expected content hash (if known).
   * If provided, verifies that packet matches this hash.
   */
  expectedContentHash?: string;
}

/**
 * Result of packet re-verification.
 */
export type ReverifyPacketResult =
  | {
      status: 'PASS';
      /** Verified content hash */
      contentHash: string;
      /** Number of files verified */
      filesVerified: number;
      /** Verification timestamp */
      verifiedAt: string;
    }
  | {
      status: 'FAIL';
      code: ReverifyErrorCode;
      message: string;
      /** File that failed verification (if applicable) */
      failedFile?: string;
    }
  | {
      status: 'STALE';
      code: ReverifyErrorCode;
      message: string;
      /** Reason for staleness */
      reason: 'hash_mismatch' | 'schema_mismatch' | 'expired';
    };

// ============================================================================
// CNC Bundle Re-verification
// ============================================================================

/**
 * Options for CNC bundle re-verification.
 */
export interface ReverifyCncBundleOptions {
  /**
   * Expected packet content hash.
   * If provided, verifies bundle's packetContentHash matches.
   */
  expectedPacketHash?: string;

  /**
   * Current post processor version.
   * If provided, verifies bundle was generated with this version.
   */
  currentPostVersion?: string;

  /**
   * Treat post version mismatch as stale (not fail).
   * Default: true
   */
  treatVersionMismatchAsStale?: boolean;
}

/**
 * Result of CNC bundle re-verification.
 */
export type ReverifyCncBundleResult =
  | {
      status: 'PASS';
      /** G-code SHA-256 verified */
      gcodeSha256: string;
      /** OpGraph hash verified */
      opGraphHash: string;
      /** Verification timestamp */
      verifiedAt: string;
    }
  | {
      status: 'FAIL';
      code: ReverifyErrorCode;
      message: string;
    }
  | {
      status: 'STALE';
      code: ReverifyErrorCode;
      message: string;
      reason: 'post_version_mismatch' | 'packet_hash_mismatch';
    };

// ============================================================================
// Combined Verification State
// ============================================================================

/**
 * Combined verification state for UI display.
 */
export interface VerificationState {
  /** Packet verification status */
  packet: {
    status: ReverifyStatus;
    contentHash?: string;
    error?: string;
  };
  /** CNC cache verification status */
  cncCache: {
    status: ReverifyStatus;
    cacheKey?: string;
    error?: string;
  };
}

/**
 * Default verification state (nothing verified yet).
 */
export const defaultVerificationState: VerificationState = {
  packet: { status: 'PENDING' },
  cncCache: { status: 'PENDING' },
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if verification passed.
 */
export function isVerifyPass<T extends { status: ReverifyStatus }>(
  result: T
): result is T & { status: 'PASS' } {
  return result.status === 'PASS';
}

/**
 * Check if verification failed.
 */
export function isVerifyFail<T extends { status: ReverifyStatus }>(
  result: T
): result is T & { status: 'FAIL' } {
  return result.status === 'FAIL';
}

/**
 * Check if artifact is stale.
 */
export function isVerifyStale<T extends { status: ReverifyStatus }>(
  result: T
): result is T & { status: 'STALE' } {
  return result.status === 'STALE';
}
