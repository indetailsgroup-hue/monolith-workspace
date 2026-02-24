/**
 * buildManifest.ts - Build Signed Job Manifest
 *
 * PROCESS:
 * 1. Create manifest core (without signature)
 * 2. Compute canonical hash of core
 * 3. Sign hash with manifest key
 * 4. Return complete SignedJobManifest
 *
 * CHAIN LINKAGE:
 * - For genesis: prevManifestHashHex = null
 * - For subsequent: prevManifestHashHex = previous manifest's hash
 */

import type { SignedTrustReport } from './signedTrustTypes';
import type {
  SignedJobManifest,
  ExportArtifactRecord,
  ManifestCore,
} from './manifestChainTypes';
import { sha256CanonicalHex } from '../crypto/sha256';
import { signHashHex } from '../crypto/ed25519';

// ============================================
// BUILD SIGNED MANIFEST
// ============================================

/**
 * Build a signed job manifest
 *
 * @param args.jobId - Job/project identifier
 * @param args.prevManifestHashHex - Previous manifest hash (null for genesis)
 * @param args.signedTrust - Signed trust report for this state
 * @param args.exports - Export artifacts (can be empty)
 * @param args.manifestKeyId - Key ID for manifest signature
 * @param args.manifestPrivateKeyHex - Private key for signing
 * @param args.createdBy - Optional creator identifier
 * @returns SignedJobManifest
 *
 * @example
 * // Genesis manifest
 * const genesis = await buildSignedManifest({
 *   jobId: 'job-001',
 *   prevManifestHashHex: null,
 *   signedTrust,
 *   exports: [],
 *   manifestKeyId: 'manifest-key-001',
 *   manifestPrivateKeyHex: process.env.MANIFEST_PRIVATE_KEY,
 * });
 *
 * // Subsequent manifest
 * const next = await buildSignedManifest({
 *   jobId: 'job-001',
 *   prevManifestHashHex: genesis.manifestHashHex,
 *   signedTrust: newSignedTrust,
 *   exports: [{ kind: 'DXF', filename: 'output.dxf', contentHashHex: '...' }],
 *   manifestKeyId: 'manifest-key-001',
 *   manifestPrivateKeyHex: process.env.MANIFEST_PRIVATE_KEY,
 * });
 */
export async function buildSignedManifest(args: {
  jobId: string;
  prevManifestHashHex: string | null;
  signedTrust: SignedTrustReport;
  exports: ExportArtifactRecord[];
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<SignedJobManifest> {
  // 1. Create manifest core (fields that are hashed)
  const core: ManifestCore = {
    version: '1.0',
    jobId: args.jobId,
    prevManifestHashHex: args.prevManifestHashHex,
    signedTrust: args.signedTrust,
    exports: args.exports,
    manifestKeyId: args.manifestKeyId,
    algo: 'Ed25519',
  };

  // 2. Compute canonical hash of core
  const manifestHashHex = await sha256CanonicalHex(core);

  // 3. Sign the hash
  const manifestSignatureHex = await signHashHex({
    hashHex: manifestHashHex,
    privateKeyHex: args.manifestPrivateKeyHex,
  });

  // 4. Return complete manifest
  return {
    ...core,
    manifestHashHex,
    manifestSignatureHex,
    createdIso: new Date().toISOString(),
    createdBy: args.createdBy,
  };
}

/**
 * Build genesis manifest (first in chain)
 */
export async function buildGenesisManifest(args: {
  jobId: string;
  signedTrust: SignedTrustReport;
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<SignedJobManifest> {
  return buildSignedManifest({
    ...args,
    prevManifestHashHex: null,
    exports: [],
  });
}

/**
 * Build child manifest (linked to parent)
 */
export async function buildChildManifest(args: {
  parent: SignedJobManifest;
  signedTrust: SignedTrustReport;
  exports: ExportArtifactRecord[];
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<SignedJobManifest> {
  return buildSignedManifest({
    jobId: args.parent.jobId,
    prevManifestHashHex: args.parent.manifestHashHex,
    signedTrust: args.signedTrust,
    exports: args.exports,
    manifestKeyId: args.manifestKeyId,
    manifestPrivateKeyHex: args.manifestPrivateKeyHex,
    createdBy: args.createdBy,
  });
}

// ============================================
// EXPORT ARTIFACT HELPERS
// ============================================

/**
 * Create export artifact record
 */
export async function createExportArtifact(args: {
  kind: ExportArtifactRecord['kind'];
  filename: string;
  content: Uint8Array;
}): Promise<ExportArtifactRecord> {
  const { sha256Hex } = await import('../crypto/sha256');

  const contentHashHex = await sha256Hex(args.content);

  return {
    kind: args.kind,
    filename: args.filename,
    contentHashHex,
    sizeBytes: args.content.length,
    createdIso: new Date().toISOString(),
  };
}

/**
 * Create export artifact from string content
 */
export async function createExportArtifactFromString(args: {
  kind: ExportArtifactRecord['kind'];
  filename: string;
  content: string;
}): Promise<ExportArtifactRecord> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(args.content);

  return createExportArtifact({
    kind: args.kind,
    filename: args.filename,
    content: bytes,
  });
}
