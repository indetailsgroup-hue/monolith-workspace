/**
 * makeApprovalSigner.ts - Create Approval Signer with Local Key
 *
 * MVP implementation using local private key.
 * For production, consider server-side signing or HSM.
 */

import type { ApprovalSigner } from './approvalSigner';
import type { TrustReport } from './trustReportTypes';
import type { SignedTrustReport } from './signedTrustTypes';
import { sha256CanonicalHex } from '../crypto/sha256';
import { signHashHex } from '../crypto/ed25519';

// ============================================
// FACTORY
// ============================================

/**
 * Create an ApprovalSigner using local private key
 *
 * @param args.keyId - Key identifier for verification
 * @param args.privateKeyHex - Ed25519 private key (64 hex chars)
 * @returns ApprovalSigner instance
 *
 * @example
 * const signer = makeApprovalSigner({
 *   keyId: 'approval-key-001',
 *   privateKeyHex: process.env.APPROVAL_PRIVATE_KEY,
 * });
 *
 * const signedTrust = await signer.signTrust(trustReport);
 */
export function makeApprovalSigner(args: {
  keyId: string;
  privateKeyHex: string;
}): ApprovalSigner {
  const { keyId, privateKeyHex } = args;

  return {
    signTrust: async (trust: TrustReport): Promise<SignedTrustReport> => {
      // 1. Compute canonical hash
      const trustHashHex = await sha256CanonicalHex(trust);

      // 2. Sign the hash
      const signatureHex = await signHashHex({
        hashHex: trustHashHex,
        privateKeyHex,
      });

      // 3. Return signed envelope
      return {
        trust,
        trustHashHex,
        signatureHex,
        keyId,
        algo: 'Ed25519',
        signedAtIso: new Date().toISOString(),
      };
    },
  };
}
