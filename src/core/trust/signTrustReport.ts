/**
 * signTrustReport.ts - Sign Trust Report
 *
 * Creates a SignedTrustReport by computing a canonical hash
 * of the trust report and signing it with the approval key.
 *
 * @version 1.0.0
 */

import type { TrustReport, SignedTrustReport } from './trustReportTypes';
import { sha256Hex, sha256CanonicalHex } from '../../crypto/sha256';

/**
 * Sign trust report configuration
 */
interface SignTrustReportArgs {
  /** The trust report to sign */
  trust: TrustReport;
  /** Approval key ID */
  keyId: string;
  /** Approval private key (hex) */
  privateKeyHex: string;
}

/**
 * Sign a trust report with the approval key
 *
 * Uses HMAC-style signing: SHA-256(privateKey + canonicalHash)
 * This will be replaced with Ed25519 when available.
 */
export async function signTrustReport(args: SignTrustReportArgs): Promise<SignedTrustReport> {
  const { trust, keyId, privateKeyHex } = args;

  // Compute canonical hash of trust report
  const canonicalHash = await sha256CanonicalHex(trust);

  // HMAC-style signature: hash(privateKey + canonicalHash)
  const signatureHex = await sha256Hex(privateKeyHex + canonicalHash);

  return {
    trust,
    signatureHex,
    keyId,
    timestampIso: new Date().toISOString(),
  };
}
