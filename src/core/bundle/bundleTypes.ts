/**
 * bundleTypes.ts - Export Bundle Verification Types
 *
 * @version 1.0.0
 */

/**
 * Result of verifying an export bundle
 */
export interface BundleVerificationResult {
  /** Whether the bundle is valid */
  ok: boolean;
  /** Reason for failure (if !ok) */
  reason?: string;
  /** Detailed failure information */
  details?: string[];
}
