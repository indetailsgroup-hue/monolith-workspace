/**
 * buildExportBundle.ts - Export Bundle Builder
 *
 * Creates a .zip bundle containing:
 * - Export artifacts (DXF, CSV, GCODE, etc.)
 * - signed_manifest_head.json
 * - factory_acceptance_checklist.json
 * - bundle_index.json
 * - Optional: chain/ folder with proof manifests
 *
 * REQUIRES: jszip package
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import type { SignedJobManifest, ExportArtifactRecord } from '../trust/manifestChainTypes';
import {
  generateFactoryChecklist,
  type FactoryAcceptanceChecklist,
} from '../factory/generateFactoryChecklist';
import { loadChainProof } from '../manifest/loadManifestChain';
import { sha256BytesHex, sha256TextHex } from '../crypto/hashBytes';
import { textToBytes } from '../export/textToBytes';
import {
  type BundleIndex,
  type BundleFileEntry,
  type BundleBuildOptions,
  type BundleContent,
  BUNDLE_FILES,
  getChainProofFilename,
} from './bundleTypes';
import { createReceiptTemplate, type FactoryReceipt } from '../receipt/factoryReceiptTypes';

// ============================================
// TYPES
// ============================================

export interface BuildBundleConfig {
  /** Job identifier */
  jobId: string;

  /** Manifest store */
  store: ManifestStore;

  /** Keyring for verification */
  keyring: Keyring;

  /** Export artifact content (filename → bytes) */
  artifactContent: Map<string, Uint8Array>;

  /** Build options */
  options?: BundleBuildOptions;
}

export type BuildBundleResult =
  | { ok: true; content: BundleContent; zipBlob: Blob }
  | { ok: false; reason: string };

// ============================================
// BUNDLE BUILDER
// ============================================

/**
 * Build export bundle
 *
 * @param config - Build configuration
 * @returns Bundle content and zip blob, or error
 */
export async function buildExportBundle(
  config: BuildBundleConfig
): Promise<BuildBundleResult> {
  const { jobId, store, keyring, artifactContent, options = {} } = config;
  const {
    includeChainProof = false,
    chainProofDepth = 10,
    createdBy,
    compressionLevel = 6,
  } = options;

  // 1. Load HEAD manifest
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: 'No HEAD manifest for job' };
  }

  const manifest = await store.loadByHash(headHash);
  if (!manifest) {
    return { ok: false, reason: 'HEAD manifest missing from store' };
  }

  // 2. Generate checklist
  const checklistResult = await generateFactoryChecklist({
    jobId,
    store,
    keyring,
    maxDepth: 25,
  });

  if (!checklistResult.ok) {
    return { ok: false, reason: `Checklist failed: ${checklistResult.reason}` };
  }

  const checklist = checklistResult.checklist;

  // 3. Load chain proof (if requested)
  let chainProof: SignedJobManifest[] = [];
  let reachedGenesis = false;

  if (includeChainProof) {
    chainProof = await loadChainProof({
      jobId,
      store,
      depth: chainProofDepth,
    });
    // Check if genesis reached
    if (chainProof.length > 0) {
      const oldest = chainProof[chainProof.length - 1];
      reachedGenesis = oldest.prevManifestHashHex === null;
    }
  }

  // 4. Build file entries
  const files: BundleFileEntry[] = [];
  let totalSizeBytes = 0;

  // 4a. Add artifacts
  const artifactRecords = manifest.exports ?? [];
  for (const artifact of artifactRecords) {
    const content = artifactContent.get(artifact.filename);
    if (!content) {
      return {
        ok: false,
        reason: `Missing artifact content: ${artifact.filename}`,
      };
    }

    // Verify hash matches
    const actualHash = await sha256BytesHex(content);
    if (actualHash !== artifact.contentHashHex) {
      return {
        ok: false,
        reason: `Hash mismatch for ${artifact.filename}: expected ${artifact.contentHashHex.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`,
      };
    }

    files.push({
      filename: artifact.filename,
      hashHex: artifact.contentHashHex,
      sizeBytes: content.length,
      category: 'artifact',
    });

    totalSizeBytes += content.length;
  }

  // 4b. Add manifest
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = textToBytes(manifestJson);
  const manifestHash = await sha256TextHex(manifestJson);

  files.push({
    filename: BUNDLE_FILES.MANIFEST,
    hashHex: manifestHash,
    sizeBytes: manifestBytes.length,
    mimeType: 'application/json',
    category: 'manifest',
  });

  totalSizeBytes += manifestBytes.length;

  // 4c. Add checklist
  const checklistJson = JSON.stringify(checklist, null, 2);
  const checklistBytes = textToBytes(checklistJson);
  const checklistHash = await sha256TextHex(checklistJson);

  files.push({
    filename: BUNDLE_FILES.CHECKLIST,
    hashHex: checklistHash,
    sizeBytes: checklistBytes.length,
    mimeType: 'application/json',
    category: 'checklist',
  });

  totalSizeBytes += checklistBytes.length;

  // 4d. Add factory receipt template
  // This template allows factory QC to create a signed acceptance receipt
  const trust = manifest.signedTrust?.trust;
  const receiptTemplate: FactoryReceipt = createReceiptTemplate({
    jobId,
    headManifestHashHex: manifest.manifestHashHex,
    snapshotHashHex: trust?.snapshotHashHex ?? '',
    bundleZipSha256Hex: 'TO_BE_COMPUTED_AFTER_BUNDLE_COMPLETE',
    stationId: 'FACTORY_STATION_1',
    inspector: 'QC-A',
  });

  const receiptTemplateJson = JSON.stringify(receiptTemplate, null, 2);
  const receiptTemplateBytes = textToBytes(receiptTemplateJson);
  const receiptTemplateHash = await sha256TextHex(receiptTemplateJson);

  files.push({
    filename: BUNDLE_FILES.RECEIPT_TEMPLATE,
    hashHex: receiptTemplateHash,
    sizeBytes: receiptTemplateBytes.length,
    mimeType: 'application/json',
    category: 'receipt-template',
  });

  totalSizeBytes += receiptTemplateBytes.length;

  // 4e. Add chain proof manifests
  for (let i = 0; i < chainProof.length; i++) {
    const m = chainProof[i];
    const filename = getChainProofFilename(i);
    const json = JSON.stringify(m, null, 2);
    const bytes = textToBytes(json);
    const hash = await sha256TextHex(json);

    files.push({
      filename,
      hashHex: hash,
      sizeBytes: bytes.length,
      mimeType: 'application/json',
      category: 'chain',
    });

    totalSizeBytes += bytes.length;
  }

  // 5. Build index
  const index: BundleIndex = {
    version: '1.0',
    jobId,
    createdIso: new Date().toISOString(),
    createdBy,
    headManifestHashHex: manifest.manifestHashHex,
    includesChainProof: includeChainProof,
    chainDepth: includeChainProof ? chainProof.length : undefined,
    reachedGenesis: includeChainProof ? reachedGenesis : undefined,
    files,
    totalSizeBytes,
    artifactCount: artifactRecords.length,
  };

  // Add index file entry (self-reference)
  const indexJson = JSON.stringify(index, null, 2);
  const indexBytes = textToBytes(indexJson);
  const indexHash = await sha256TextHex(indexJson);

  files.push({
    filename: BUNDLE_FILES.INDEX,
    hashHex: indexHash,
    sizeBytes: indexBytes.length,
    mimeType: 'application/json',
    category: 'index',
  });

  totalSizeBytes += indexBytes.length;

  // Update index with final size
  index.totalSizeBytes = totalSizeBytes;

  // 6. Build content object
  const content: BundleContent = {
    index,
    manifest,
    checklist,
    artifacts: artifactContent,
    chainProof,
  };

  // 7. Create zip using JSZip
  let zipBlob: Blob;
  try {
    // Dynamic import for JSZip (tree-shaking friendly)
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add artifacts
    for (const [filename, bytes] of artifactContent.entries()) {
      zip.file(filename, bytes, { compression: 'DEFLATE' });
    }

    // Add manifest
    zip.file(BUNDLE_FILES.MANIFEST, manifestJson);

    // Add checklist
    zip.file(BUNDLE_FILES.CHECKLIST, checklistJson);

    // Add receipt template
    zip.file(BUNDLE_FILES.RECEIPT_TEMPLATE, receiptTemplateJson);

    // Add chain proof
    for (let i = 0; i < chainProof.length; i++) {
      const filename = getChainProofFilename(i);
      const json = JSON.stringify(chainProof[i], null, 2);
      zip.file(filename, json);
    }

    // Add index (final, with updated hash)
    const finalIndexJson = JSON.stringify(index, null, 2);
    zip.file(BUNDLE_FILES.INDEX, finalIndexJson);

    // Generate zip
    zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  } catch (e) {
    return {
      ok: false,
      reason: `Zip creation failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }

  return { ok: true, content, zipBlob };
}

// ============================================
// BUNDLE FILENAME GENERATOR
// ============================================

/**
 * Generate bundle filename
 */
export function generateBundleFilename(jobId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `export_${safeJobId}_${timestamp}.zip`;
}

// ============================================
// BROWSER DOWNLOAD HELPER
// ============================================

/**
 * Download bundle in browser
 */
export function downloadBundle(zipBlob: Blob, filename: string): void {
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
