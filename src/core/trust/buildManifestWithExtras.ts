/**
 * buildManifestWithExtras.ts - Build Signed Manifest with Extensions
 *
 * Extended version of buildSignedManifest that supports:
 * - Revision metadata (for fork workflows)
 * - Issue packs (from factory rejections)
 * - Factory receipts
 *
 * Used via dynamic import() in trustChainService.ts for advanced operations.
 *
 * @version 1.0.0
 */

import type { SignedJobManifest, ExportArtifactRecord, RevisionMeta } from './manifestChainTypes';
import type { SignedTrustReport } from './trustReportTypes';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { IssuePack } from '../issues/issueTypes';
import { sha256Hex, sha256CanonicalHex } from '../../crypto/sha256';

/**
 * Core extras that can be attached to a manifest
 */
interface CoreExtras {
  /** Revision metadata (for forked jobs) */
  revision?: RevisionMeta;
  /** Factory receipts */
  receipts?: SignedFactoryReceipt[];
  /** Issue packs */
  issuePacks?: IssuePack[];
}

/**
 * Build signed manifest with extras configuration
 */
interface BuildSignedManifestWithExtrasArgs {
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
  /** Extra data to include in the manifest */
  coreExtras: CoreExtras;
}

/**
 * Build and sign a manifest with extra data
 *
 * Same as buildSignedManifest but merges coreExtras into the manifest
 * before hashing and signing.
 */
export async function buildSignedManifestWithExtras(
  args: BuildSignedManifestWithExtrasArgs
): Promise<SignedJobManifest> {
  const {
    jobId,
    prevManifestHashHex,
    signedTrust,
    exports,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
    coreExtras,
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
    revision: coreExtras.revision,
    receipts: coreExtras.receipts,
    issuePacks: coreExtras.issuePacks,
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
    revision: coreExtras.revision,
    receipts: coreExtras.receipts,
    issuePacks: coreExtras.issuePacks,
  };
}
