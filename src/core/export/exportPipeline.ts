/**
 * exportPipeline.ts - Guarded Export Pipeline
 *
 * NORTH STAR: No export without verified chain + Gate OK
 *
 * FLOW:
 * 1. Load HEAD manifest for job
 * 2. Verify chain back to genesis
 * 3. Assert gate.ok in trust report
 * 4. Generate export artifacts
 * 5. Hash each artifact
 * 6. Create new manifest with export records
 * 7. Sign and save new manifest
 * 8. Set new HEAD
 * 9. Persist artifacts (download/save)
 *
 * INVARIANT: Artifacts only persisted AFTER new manifest is saved
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type {
  SignedJobManifest,
  ExportArtifactRecord,
  ExportKind,
} from '../trust/manifestChainTypes';
import { verifyChain } from '../trust/verifyManifestChain';
import { buildSignedManifest } from '../trust/buildManifest';
import { sha256TextHex, sha256BytesHex } from '../crypto/hashBytes';

// ============================================
// TYPES
// ============================================

/**
 * Export artifact (generated content)
 */
export interface ExportArtifact {
  kind: ExportKind;
  filename: string;
  content: string | Uint8Array;
}

/**
 * Export pipeline configuration
 */
export interface ExportPipelineConfig {
  /** Job identifier */
  jobId: string;

  /** Manifest store */
  store: ManifestStore;

  /** Keyring for verification */
  keyring: Keyring;

  /** Manifest signing key ID */
  manifestKeyId: string;

  /** Manifest signing private key */
  manifestPrivateKeyHex: string;

  /** Generator function for export artifacts */
  generate: () => Promise<ExportArtifact[]>;

  /** Persistence function (download/save) */
  persist: (artifacts: ExportArtifact[]) => Promise<void>;

  /** Maximum chain depth to verify */
  maxDepth?: number;

  /** Creator identifier */
  createdBy?: string;
}

/**
 * Export pipeline result
 */
export type ExportPipelineResult =
  | { ok: true; newHeadHash: string; artifactCount: number }
  | { ok: false; reason: string; details?: string[] };

// ============================================
// GUARDED EXPORT
// ============================================

/**
 * Execute guarded export pipeline
 *
 * GUARANTEES:
 * - Chain is verified before export
 * - Gate is OK before export
 * - Artifacts are hashed and recorded
 * - New manifest is saved before artifacts are persisted
 */
export async function guardedExport(
  config: ExportPipelineConfig
): Promise<ExportPipelineResult> {
  const {
    jobId,
    store,
    keyring,
    manifestKeyId,
    manifestPrivateKeyHex,
    generate,
    persist,
    maxDepth = 25,
    createdBy,
  } = config;

  // 1. Load HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No manifest HEAD for job' };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: 'HEAD manifest missing from store' };
  }

  // 2. Verify chain
  const chainResult = await verifyChain({
    head,
    keyring,
    store,
    maxDepth,
  });

  if (!chainResult.ok) {
    return {
      ok: false,
      reason: 'Chain verification failed',
      details: [chainResult.reason ?? 'Unknown chain error'],
    };
  }

  // 3. Assert gate OK
  if (!head.signedTrust?.trust?.gate?.ok) {
    const errorCount = head.signedTrust?.trust?.gate?.errorCount ?? 0;
    return {
      ok: false,
      reason: 'Gate not OK in HEAD trust report',
      details: [`Gate has ${errorCount} errors`],
    };
  }

  // 4. Generate artifacts
  let artifacts: ExportArtifact[];
  try {
    artifacts = await generate();
  } catch (e) {
    return {
      ok: false,
      reason: 'Export generation failed',
      details: [e instanceof Error ? e.message : 'Unknown error'],
    };
  }

  if (artifacts.length === 0) {
    return { ok: false, reason: 'No artifacts generated' };
  }

  // 5. Hash artifacts
  const records: ExportArtifactRecord[] = [];
  for (const artifact of artifacts) {
    const hash =
      typeof artifact.content === 'string'
        ? await sha256TextHex(artifact.content)
        : await sha256BytesHex(artifact.content);

    const sizeBytes =
      typeof artifact.content === 'string'
        ? new TextEncoder().encode(artifact.content).length
        : artifact.content.length;

    records.push({
      kind: artifact.kind,
      filename: artifact.filename,
      contentHashHex: hash,
      sizeBytes,
      createdIso: new Date().toISOString(),
    });
  }

  // 6. Build new manifest (export manifest references same trust state)
  const newManifest: SignedJobManifest = await buildSignedManifest({
    jobId,
    prevManifestHashHex: head.manifestHashHex,
    signedTrust: head.signedTrust,
    exports: records,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  });

  // 7. Save manifest + set HEAD
  await store.put(newManifest);
  await store.setHead(jobId, newManifest.manifestHashHex);

  // 8. Persist artifacts (only after manifest saved)
  try {
    await persist(artifacts);
  } catch (e) {
    // Manifest is saved but persist failed
    // This is recoverable: re-export will work
    return {
      ok: false,
      reason: 'Artifact persistence failed (manifest saved)',
      details: [e instanceof Error ? e.message : 'Unknown error'],
    };
  }

  // 9. Optional: Re-verify new HEAD (defensive)
  const newHead = await store.loadByHash(newManifest.manifestHashHex);
  if (!newHead) {
    return { ok: false, reason: 'Post-save HEAD missing' };
  }

  const reVerify = await verifyChain({
    head: newHead,
    keyring,
    store,
    maxDepth,
  });

  if (!reVerify.ok) {
    return {
      ok: false,
      reason: 'Post-save verification failed',
      details: [reVerify.reason ?? 'Unknown error'],
    };
  }

  return {
    ok: true,
    newHeadHash: newManifest.manifestHashHex,
    artifactCount: artifacts.length,
  };
}

// ============================================
// PRE-EXPORT CHECK
// ============================================

/**
 * Check if export is allowed (without executing)
 */
export async function canExportJob(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  maxDepth?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { jobId, store, keyring, maxDepth = 25 } = args;

  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No manifest HEAD for job' };
  }

  const head = await store.loadByHash(headHash);
  if (!head) {
    return { ok: false, reason: 'HEAD manifest missing' };
  }

  const chainResult = await verifyChain({ head, keyring, store, maxDepth });
  if (!chainResult.ok) {
    return { ok: false, reason: chainResult.reason ?? 'Chain verify failed' };
  }

  if (!head.signedTrust?.trust?.gate?.ok) {
    return { ok: false, reason: 'Gate not OK' };
  }

  return { ok: true };
}

// ============================================
// BROWSER DOWNLOAD HELPER
// ============================================

/**
 * Create persist function that downloads files in browser
 */
export function createBrowserDownloader(): (
  artifacts: ExportArtifact[]
) => Promise<void> {
  return async (artifacts: ExportArtifact[]) => {
    for (const artifact of artifacts) {
      const content = artifact.content;
      let blob: Blob;
      if (typeof content === 'string') {
        blob = new Blob([content], { type: 'text/plain' });
      } else {
        // Create a fresh copy to satisfy BlobPart type requirement
        const bytes = new Uint8Array(content.length);
        bytes.set(content);
        blob = new Blob([bytes], { type: 'application/octet-stream' });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Small delay between downloads
      await new Promise((r) => setTimeout(r, 100));
    }
  };
}
