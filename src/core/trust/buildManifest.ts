/**
 * buildManifest.ts - Build Signed Manifest
 *
 * Creates a SignedJobManifest by assembling the manifest data,
 * computing its content hash, and signing with the manifest key.
 *
 * @version 1.0.0
 */

import type { SignedJobManifest, ExportArtifactRecord } from './manifestChainTypes';
import type { SignedTrustReport } from './trustReportTypes';
import { sha256Hex, sha256CanonicalHex } from '../../crypto/sha256';

/**
 * Build signed manifest configuration
 */
interface BuildSignedManifestArgs {
  /** Job identifier */
  jobId: string;
  /** Previous manifest hash (null for genesis) */
  prevManifestHashHex: string | null;
  /** Signed trust report */
  signedTrust: SignedTrustReport | null;
  /** Export artifact records */
  exports: ExportArtifactRecord[];
  /** Manifest key ID */
  manifestKeyId: string;
  /** Manifest private key (hex) */
  manifestPrivateKeyHex: string;
  /** Creator identifier */
  createdBy?: string;
}

/**
 * Build and sign a manifest
 *
 * FLOW:
 * 1. Assemble manifest content (without hash and signature)
 * 2. Compute SHA-256 canonical hash of content
 * 3. Sign the hash with manifest key (HMAC-style)
 * 4. Return complete SignedJobManifest
 */
export async function buildSignedManifest(args: BuildSignedManifestArgs): Promise<SignedJobManifest> {
  const {
    jobId,
    prevManifestHashHex,
    signedTrust,
    exports,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  } = args;

  const createdIso = new Date().toISOString();

  // Content to hash (deterministic, without hash/signature)
  const content = {
    jobId,
    prevManifestHashHex,
    signedTrust,
    exports,
    createdIso,
    createdBy,
  };

  // Compute content hash
  const manifestHashHex = await sha256CanonicalHex(content);

  // Sign the hash (HMAC-style)
  const signatureHex = await sha256Hex(manifestPrivateKeyHex + manifestHashHex);

  return {
    jobId,
    manifestHashHex,
    prevManifestHashHex,
    signedTrust,
    exports: exports.length > 0 ? exports : undefined,
    createdIso,
    createdBy,
    manifestSignature: {
      keyId: manifestKeyId,
      signatureHex,
      algorithm: 'HMAC-SHA256',
    },
  };
}
