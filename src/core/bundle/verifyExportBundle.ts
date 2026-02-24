/**
 * verifyExportBundle.ts - Export Bundle Verifier
 *
 * Verifies integrity of export bundle:
 * - Parse bundle_index.json
 * - Verify all file hashes
 * - Verify manifest chain
 * - Verify checklist matches manifest
 *
 * Works in both browser and Node.js environments.
 */

import type { Keyring } from '../crypto/keyring';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import { sha256BytesHex, sha256TextHex } from '../crypto/hashBytes';
import { verifyChain } from '../trust/verifyManifestChain';
import { bytesToText } from '../export/textToBytes';
import type { ManifestStore } from '../manifest/manifestStoreTypes';
import {
  type BundleIndex,
  type BundleVerificationResult,
  BUNDLE_FILES,
  getChainProofFilename,
} from './bundleTypes';

// ============================================
// TYPES
// ============================================

/**
 * Bundle file reader interface
 *
 * Abstracts file reading for browser/Node compatibility.
 */
export interface BundleFileReader {
  /** Read file as bytes */
  readFile(filename: string): Promise<Uint8Array | null>;

  /** List all files in bundle */
  listFiles(): Promise<string[]>;
}

/**
 * Verification options
 */
export interface VerifyBundleOptions {
  /** Skip file hash verification (faster but less secure) */
  skipHashVerification?: boolean;

  /** Skip chain verification (faster but less secure) */
  skipChainVerification?: boolean;
}

// ============================================
// IN-MEMORY MANIFEST STORE
// ============================================

/**
 * In-memory manifest store for bundle verification
 *
 * Stores manifests extracted from bundle for chain verification.
 */
class MemoryManifestStore implements ManifestStore {
  private manifests = new Map<string, SignedJobManifest>();
  private heads = new Map<string, string>();

  async put(manifest: SignedJobManifest): Promise<void> {
    this.manifests.set(manifest.manifestHashHex, manifest);
  }

  async loadByHash(hashHex: string): Promise<SignedJobManifest | null> {
    return this.manifests.get(hashHex) ?? null;
  }

  async setHead(jobId: string, headHashHex: string): Promise<void> {
    this.heads.set(jobId, headHashHex);
  }

  async getHead(jobId: string): Promise<string | null> {
    return this.heads.get(jobId) ?? null;
  }

  async listRecent(): Promise<SignedJobManifest[]> {
    return Array.from(this.manifests.values());
  }
}

// ============================================
// VERIFIER
// ============================================

/**
 * Verify export bundle
 *
 * @param reader - Bundle file reader
 * @param keyring - Keyring for signature verification
 * @param options - Verification options
 * @returns Verification result
 */
export async function verifyExportBundle(
  reader: BundleFileReader,
  keyring: Keyring,
  options: VerifyBundleOptions = {}
): Promise<BundleVerificationResult> {
  const { skipHashVerification = false, skipChainVerification = false } = options;

  const fileResults: BundleVerificationResult['fileResults'] = [];

  // 1. Read and parse bundle index
  const indexBytes = await reader.readFile(BUNDLE_FILES.INDEX);
  if (!indexBytes) {
    return {
      ok: false,
      reason: 'Missing bundle_index.json',
    };
  }

  let index: BundleIndex;
  try {
    const indexJson = bytesToText(indexBytes);
    index = JSON.parse(indexJson);
  } catch (e) {
    return {
      ok: false,
      reason: `Invalid bundle_index.json: ${e instanceof Error ? e.message : 'Parse error'}`,
    };
  }

  // Validate index structure
  if (!index.version || !index.jobId || !index.headManifestHashHex || !index.files) {
    return {
      ok: false,
      reason: 'Invalid bundle index structure',
    };
  }

  // 2. Read and parse manifest
  const manifestBytes = await reader.readFile(BUNDLE_FILES.MANIFEST);
  if (!manifestBytes) {
    return {
      ok: false,
      reason: 'Missing signed_manifest_head.json',
    };
  }

  let manifest: SignedJobManifest;
  try {
    const manifestJson = bytesToText(manifestBytes);
    manifest = JSON.parse(manifestJson);
  } catch (e) {
    return {
      ok: false,
      reason: `Invalid manifest: ${e instanceof Error ? e.message : 'Parse error'}`,
    };
  }

  // Verify manifest hash matches index
  if (manifest.manifestHashHex !== index.headManifestHashHex) {
    return {
      ok: false,
      reason: `Manifest hash mismatch: index says ${index.headManifestHashHex.slice(0, 16)}..., manifest has ${manifest.manifestHashHex.slice(0, 16)}...`,
    };
  }

  // 3. Verify file hashes
  if (!skipHashVerification) {
    for (const fileEntry of index.files) {
      // Skip index itself (can't hash itself)
      if (fileEntry.filename === BUNDLE_FILES.INDEX) {
        fileResults.push({
          filename: fileEntry.filename,
          ok: true,
          reason: 'Index file (skipped)',
        });
        continue;
      }

      const fileBytes = await reader.readFile(fileEntry.filename);
      if (!fileBytes) {
        fileResults.push({
          filename: fileEntry.filename,
          ok: false,
          reason: 'File not found in bundle',
        });
        continue;
      }

      // Verify hash
      const actualHash = await sha256BytesHex(fileBytes);
      if (actualHash !== fileEntry.hashHex) {
        fileResults.push({
          filename: fileEntry.filename,
          ok: false,
          reason: `Hash mismatch: expected ${fileEntry.hashHex.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`,
        });
        continue;
      }

      // Verify size
      if (fileBytes.length !== fileEntry.sizeBytes) {
        fileResults.push({
          filename: fileEntry.filename,
          ok: false,
          reason: `Size mismatch: expected ${fileEntry.sizeBytes}, got ${fileBytes.length}`,
        });
        continue;
      }

      fileResults.push({
        filename: fileEntry.filename,
        ok: true,
      });
    }

    // Check for any hash failures
    const hashFailures = fileResults.filter((f) => !f.ok);
    if (hashFailures.length > 0) {
      return {
        ok: false,
        reason: `${hashFailures.length} file(s) failed hash verification`,
        details: hashFailures.map((f) => `${f.filename}: ${f.reason}`),
        fileResults,
      };
    }
  }

  // 4. Verify manifest chain
  if (!skipChainVerification) {
    // Build in-memory store with chain proof manifests
    const memoryStore = new MemoryManifestStore();

    // Add HEAD manifest
    await memoryStore.put(manifest);
    await memoryStore.setHead(manifest.jobId, manifest.manifestHashHex);

    // Add chain proof manifests (if included)
    if (index.includesChainProof && index.chainDepth) {
      for (let i = 0; i < index.chainDepth; i++) {
        const filename = getChainProofFilename(i);
        const chainBytes = await reader.readFile(filename);
        if (chainBytes) {
          try {
            const chainJson = bytesToText(chainBytes);
            const chainManifest: SignedJobManifest = JSON.parse(chainJson);
            await memoryStore.put(chainManifest);
          } catch {
            // Skip invalid chain manifests
          }
        }
      }
    }

    // Verify chain
    const chainResult = await verifyChain({
      head: manifest,
      keyring,
      store: memoryStore,
      maxDepth: index.chainDepth ?? 10,
    });

    if (!chainResult.ok) {
      return {
        ok: false,
        reason: `Chain verification failed: ${chainResult.reason}`,
        jobId: index.jobId,
        headHash: index.headManifestHashHex,
        fileResults,
      };
    }
  }

  // 5. Verify exports in manifest match artifacts
  const manifestExports = manifest.exports ?? [];
  const artifactFiles = index.files.filter((f) => f.category === 'artifact');

  for (const exportRecord of manifestExports) {
    const artifactFile = artifactFiles.find((f) => f.filename === exportRecord.filename);
    if (!artifactFile) {
      return {
        ok: false,
        reason: `Missing artifact: ${exportRecord.filename}`,
        jobId: index.jobId,
        headHash: index.headManifestHashHex,
        fileResults,
      };
    }

    if (artifactFile.hashHex !== exportRecord.contentHashHex) {
      return {
        ok: false,
        reason: `Artifact hash mismatch: ${exportRecord.filename}`,
        jobId: index.jobId,
        headHash: index.headManifestHashHex,
        fileResults,
      };
    }
  }

  // All checks passed
  return {
    ok: true,
    jobId: index.jobId,
    headHash: index.headManifestHashHex,
    fileResults,
  };
}

// ============================================
// BROWSER ZIP READER
// ============================================

/**
 * Create bundle reader from JSZip instance
 */
export async function createJsZipReader(zipBlob: Blob): Promise<BundleFileReader> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);

  return {
    async readFile(filename: string): Promise<Uint8Array | null> {
      const file = zip.file(filename);
      if (!file) return null;
      return await file.async('uint8array');
    },

    async listFiles(): Promise<string[]> {
      return Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    },
  };
}

// ============================================
// QUICK VERIFY
// ============================================

/**
 * Quick verify bundle (browser)
 *
 * Convenience function for browser verification.
 */
export async function quickVerifyBundle(
  zipBlob: Blob,
  keyring: Keyring
): Promise<BundleVerificationResult> {
  const reader = await createJsZipReader(zipBlob);
  return verifyExportBundle(reader, keyring);
}
