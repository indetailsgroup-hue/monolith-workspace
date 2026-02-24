/**
 * buildManifestWithExtras.ts - Build Signed Manifest with Extra Core Fields
 *
 * ARCHITECTURE:
 * - Extends buildSignedManifest to support additional core fields
 * - Extra fields (like receipts) are included in core hash
 * - Ensures receipts are cryptographically signed with manifest
 *
 * USE CASES:
 * - Appending factory receipts to chain
 * - Adding custom metadata that needs to be signed
 */

import type { SignedTrustReport } from './signedTrustTypes';
import type { SignedJobManifest, ExportArtifactRecord } from './manifestChainTypes';
import { sha256CanonicalHex } from '../crypto/sha256';
import { signHashHex } from '../crypto/ed25519';

// ============================================
// EXTENDED CORE TYPE
// ============================================

/**
 * Extended manifest core with arbitrary extras
 */
interface ExtendedManifestCore {
  version: '1.0';
  jobId: string;
  prevManifestHashHex: string | null;
  signedTrust: SignedTrustReport;
  exports: ExportArtifactRecord[];
  manifestKeyId: string;
  algo: 'Ed25519';
  [key: string]: unknown; // Extra fields
}

// ============================================
// BUILD WITH EXTRAS
// ============================================

/**
 * Build signed manifest with extra core fields
 *
 * Extra fields are included in the core hash and signed.
 * This is the correct way to add fields like `receipts` to the manifest.
 *
 * @param args.jobId - Job ID
 * @param args.prevManifestHashHex - Previous manifest hash (null for genesis)
 * @param args.signedTrust - Signed trust report
 * @param args.exports - Export artifacts
 * @param args.manifestKeyId - Manifest key ID
 * @param args.manifestPrivateKeyHex - Manifest private key
 * @param args.createdBy - Optional creator identifier
 * @param args.coreExtras - Extra fields to include in core hash
 * @returns SignedJobManifest with extras
 *
 * @example
 * // Append factory receipt
 * const manifest = await buildSignedManifestWithExtras({
 *   jobId,
 *   prevManifestHashHex: head.manifestHashHex,
 *   signedTrust: head.signedTrust,
 *   exports: head.exports,
 *   manifestKeyId,
 *   manifestPrivateKeyHex,
 *   coreExtras: { receipts: [signedReceipt] },
 * });
 */
export async function buildSignedManifestWithExtras(args: {
  jobId: string;
  prevManifestHashHex: string | null;
  signedTrust: SignedTrustReport;
  exports: ExportArtifactRecord[];
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
  coreExtras?: Record<string, unknown>;
}): Promise<SignedJobManifest> {
  const {
    jobId,
    prevManifestHashHex,
    signedTrust,
    exports,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
    coreExtras = {},
  } = args;

  // 1. Build extended core with extras
  const core: ExtendedManifestCore = {
    version: '1.0',
    jobId,
    prevManifestHashHex,
    signedTrust,
    exports,
    manifestKeyId,
    algo: 'Ed25519',
    // Spread extras into core (e.g., receipts)
    ...coreExtras,
  };

  // 2. Compute canonical hash of extended core
  const manifestHashHex = await sha256CanonicalHex(core);

  // 3. Sign the hash
  const manifestSignatureHex = await signHashHex({
    hashHex: manifestHashHex,
    privateKeyHex: manifestPrivateKeyHex,
  });

  // 4. Return complete manifest
  return {
    ...core,
    manifestHashHex,
    manifestSignatureHex,
    createdIso: new Date().toISOString(),
    createdBy,
  } as SignedJobManifest;
}
