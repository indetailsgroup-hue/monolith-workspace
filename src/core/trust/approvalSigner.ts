/**
 * approvalSigner.ts - Approval Signer Contract
 *
 * ARCHITECTURE:
 * - Abstracts the signing of TrustReports
 * - TrustChainService doesn't need to know about private keys directly
 * - Allows swapping key management (local, server, HSM) without changing service
 *
 * USE CASES:
 * - Signing TrustReports during commit
 * - Re-signing TrustReports during revision fork
 * - Future: HSM integration, remote signing service
 */

import type { TrustReport } from './trustReportTypes';
import type { SignedTrustReport } from './signedTrustTypes';

// ============================================
// APPROVAL SIGNER CONTRACT
// ============================================

/**
 * Contract for signing TrustReports with approval key
 *
 * Implementations can use:
 * - Local private key (MVP)
 * - Server-side signing API
 * - Hardware Security Module (HSM)
 */
export interface ApprovalSigner {
  /**
   * Sign a TrustReport with approval key
   *
   * @param trust - TrustReport to sign
   * @returns SignedTrustReport with signature
   */
  signTrust: (trust: TrustReport) => Promise<SignedTrustReport>;
}
