/**
 * approvalSigner.ts - Approval Signer Interface
 *
 * Abstract interface for signing trust reports.
 * Used by the trust chain service for revision fork workflows.
 *
 * @version 1.0.0
 */

import type { TrustReport, SignedTrustReport } from './trustReportTypes';

/**
 * Approval signer interface
 *
 * Wraps the signing key and provides a simple signTrust() method.
 * Implementations may use hardware keys, browser crypto, or test keys.
 */
export interface ApprovalSigner {
  /** Sign a trust report */
  signTrust(trust: TrustReport): Promise<SignedTrustReport>;
}
