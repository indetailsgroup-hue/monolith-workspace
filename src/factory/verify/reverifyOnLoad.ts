/**
 * reverifyOnLoad.ts - Re-verification for Persisted Artifacts
 *
 * Provides functions to re-verify packets and CNC bundles loaded from IndexedDB.
 * Ensures trust chain integrity is maintained across browser sessions.
 *
 * STRICT POLICY: No persisted artifact is trusted without re-verification.
 *
 * @version 1.0.0 - Phase D3.3
 */

import { getPacketStore } from '../storage/indexedDbPacketStore';
import { getCncStore } from '../../cnc/cache/indexedDbCncStore';
import { unzipCncBundle } from '../../cnc/bundle/zipCncBundle';
import { isValidCncManifest, CNC_POST_VERSION, type CncManifest } from '../../cnc/bundle/cncManifest';
import { sha256Hex } from '../../crypto/sha256';
import { verifyPacket, type VerifyOptions } from '../packet/verifyPacket';
import type {
  ReverifyPacketOptions,
  ReverifyPacketResult,
  ReverifyCncBundleOptions,
  ReverifyCncBundleResult,
} from './types';

// ============================================================================
// Packet Re-verification
// ============================================================================

/**
 * Re-verify a packet loaded from IndexedDB.
 *
 * This ensures that persisted packet data has not been tampered with
 * and still passes all verification checks.
 *
 * @param jobId - Job ID to re-verify
 * @param options - Re-verification options
 * @returns Re-verification result
 */
export async function reverifyPacketFromIndexedDb(
  jobId: string,
  options: ReverifyPacketOptions = {}
): Promise<ReverifyPacketResult> {
  const { mode = 'fast', expectedContentHash } = options;
  const packetStore = getPacketStore();

  try {
    // Step 1: Load packet blob from IndexedDB
    const blob = await packetStore.loadBlob(jobId);
    if (!blob) {
      return {
        status: 'FAIL',
        code: 'E_PACKET_NOT_FOUND',
        message: `Packet not found in storage: ${jobId}`,
      };
    }

    // Step 2: Load stored metadata
    const metadata = await packetStore.loadMetadata(jobId);
    if (!metadata) {
      return {
        status: 'FAIL',
        code: 'E_PACKET_NOT_FOUND',
        message: `Packet metadata not found: ${jobId}`,
      };
    }

    // Step 3: Run verification
    const verifyOptions: VerifyOptions = {
      // Fast mode: skip content hash (just verify structure + file hashes)
      skipContentHash: mode === 'fast',
      // Always allow extra files on re-verify (focus on critical files)
      allowExtraFiles: true,
      // For re-verify, we trust the gate result from original verification
      allowFailedGate: true,
    };

    const result = await verifyPacket(blob, verifyOptions);

    if (!result.valid) {
      // Determine specific failure
      const hashFailed = result.hashMismatches.length > 0;
      const missingFiles = result.missingFiles.length > 0;

      if (hashFailed) {
        return {
          status: 'FAIL',
          code: 'E_PACKET_FILE_HASH_MISMATCH',
          message: `File hash verification failed`,
          failedFile: result.hashMismatches[0],
        };
      }

      if (missingFiles) {
        return {
          status: 'FAIL',
          code: 'E_PACKET_FILE_MISSING',
          message: `Missing files in packet`,
          failedFile: result.missingFiles[0],
        };
      }

      return {
        status: 'FAIL',
        code: 'E_PACKET_CORRUPT',
        message: 'Packet verification failed',
      };
    }

    // Step 4: Verify content hash if expected
    const actualContentHash = result.packet?.manifest.contentHash ?? null;

    if (expectedContentHash && actualContentHash !== expectedContentHash) {
      return {
        status: 'STALE',
        code: 'E_PACKET_HASH_MISMATCH',
        message: 'Content hash does not match expected value',
        reason: 'hash_mismatch',
      };
    }

    // Step 5: Check if stored metadata matches (optional staleness check)
    if (metadata.contentHash && actualContentHash && metadata.contentHash !== actualContentHash) {
      return {
        status: 'STALE',
        code: 'E_PACKET_HASH_MISMATCH',
        message: 'Content hash changed since storage',
        reason: 'hash_mismatch',
      };
    }

    // Success
    return {
      status: 'PASS',
      contentHash: actualContentHash ?? '',
      filesVerified: result.checks.find((c) => c.id === 'FILES_COMPLETE')?.message.match(/\d+/)?.[0]
        ? parseInt(result.checks.find((c) => c.id === 'FILES_COMPLETE')?.message.match(/\d+/)?.[0] ?? '0')
        : 0,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'FAIL',
      code: 'E_INTERNAL',
      message: error instanceof Error ? error.message : 'Internal error during re-verification',
    };
  }
}

// ============================================================================
// CNC Bundle Re-verification
// ============================================================================

/**
 * Re-verify a CNC bundle loaded from IndexedDB cache.
 *
 * This ensures that cached CNC output has not been tampered with
 * and is still valid for the current packet and post processor version.
 *
 * @param cacheKey - Cache key of the bundle to re-verify
 * @param options - Re-verification options
 * @returns Re-verification result
 */
export async function reverifyCncBundleFromIndexedDb(
  cacheKey: string,
  options: ReverifyCncBundleOptions = {}
): Promise<ReverifyCncBundleResult> {
  const {
    expectedPacketHash,
    currentPostVersion = CNC_POST_VERSION,
    treatVersionMismatchAsStale = true,
  } = options;

  const cncStore = getCncStore();

  try {
    // Step 1: Load bundle from cache
    const cached = await cncStore.get(cacheKey);
    if (!cached) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_NOT_FOUND',
        message: `CNC bundle not found in cache: ${cacheKey.slice(0, 8)}...`,
      };
    }

    const { metadata, zipBytes } = cached;

    // Step 2: Extract and parse manifest
    let files: Map<string, Uint8Array>;
    try {
      files = await unzipCncBundle(zipBytes);
    } catch {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_CORRUPT',
        message: 'Failed to extract CNC bundle ZIP',
      };
    }

    // Step 3: Read and validate manifest
    const manifestBytes = files.get('cnc-manifest.json');
    if (!manifestBytes) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_MANIFEST_INVALID',
        message: 'cnc-manifest.json not found in bundle',
      };
    }

    let manifest: CncManifest;
    try {
      const manifestJson = new TextDecoder().decode(manifestBytes);
      manifest = JSON.parse(manifestJson);
    } catch {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_MANIFEST_INVALID',
        message: 'Failed to parse cnc-manifest.json',
      };
    }

    if (!isValidCncManifest(manifest)) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_MANIFEST_INVALID',
        message: 'Invalid cnc-manifest.json schema',
      };
    }

    // Step 4: Verify G-code hash
    const gcodeFile = manifest.files.find((f) => f.path.endsWith('.nc') || f.path.startsWith('nc/'));
    if (!gcodeFile) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_GCODE_HASH_MISMATCH',
        message: 'G-code file not found in manifest',
      };
    }

    const gcodeBytes = files.get(gcodeFile.path);
    if (!gcodeBytes) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_GCODE_HASH_MISMATCH',
        message: `G-code file missing: ${gcodeFile.path}`,
      };
    }

    const gcodeHash = await sha256Hex(gcodeBytes);
    if (gcodeHash !== manifest.gcodeSha256) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_GCODE_HASH_MISMATCH',
        message: 'G-code hash verification failed',
      };
    }

    // Step 5: Verify opgraph hash
    const opGraphBytes = files.get('opgraph.json');
    if (!opGraphBytes) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_OPGRAPH_HASH_MISMATCH',
        message: 'opgraph.json not found in bundle',
      };
    }

    const opGraphHash = await sha256Hex(opGraphBytes);
    if (opGraphHash !== manifest.opGraphHash) {
      return {
        status: 'FAIL',
        code: 'E_BUNDLE_OPGRAPH_HASH_MISMATCH',
        message: 'OpGraph hash verification failed',
      };
    }

    // Step 6: Check packet hash linkage (if expected)
    if (expectedPacketHash && manifest.packetContentHash) {
      if (manifest.packetContentHash !== expectedPacketHash) {
        return {
          status: 'STALE',
          code: 'E_BUNDLE_PACKET_HASH_MISMATCH',
          message: 'Bundle was generated from a different packet version',
          reason: 'packet_hash_mismatch',
        };
      }
    }

    // Step 7: Check post processor version
    if (manifest.post.postVersion !== currentPostVersion) {
      if (treatVersionMismatchAsStale) {
        return {
          status: 'STALE',
          code: 'E_BUNDLE_POST_VERSION_MISMATCH',
          message: `Bundle was generated with post version ${manifest.post.postVersion}, current is ${currentPostVersion}`,
          reason: 'post_version_mismatch',
        };
      }
      // If not treating as stale, just continue (WARN would go here if we had it)
    }

    // Success
    return {
      status: 'PASS',
      gcodeSha256: manifest.gcodeSha256,
      opGraphHash: manifest.opGraphHash,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'FAIL',
      code: 'E_INTERNAL',
      message: error instanceof Error ? error.message : 'Internal error during re-verification',
    };
  }
}

// ============================================================================
// Quick Verification Helpers
// ============================================================================

/**
 * Quick check if a cached CNC bundle is valid and fresh.
 *
 * @param cacheKey - Cache key to check
 * @param expectedPacketHash - Expected packet content hash
 * @returns true if bundle passes verification
 */
export async function isCncBundleValid(
  cacheKey: string,
  expectedPacketHash?: string
): Promise<boolean> {
  const result = await reverifyCncBundleFromIndexedDb(cacheKey, {
    expectedPacketHash,
  });
  return result.status === 'PASS';
}

/**
 * Check if a packet in storage is valid.
 *
 * @param jobId - Job ID to check
 * @returns true if packet passes verification
 */
export async function isPacketValid(jobId: string): Promise<boolean> {
  const result = await reverifyPacketFromIndexedDb(jobId, { mode: 'fast' });
  return result.status === 'PASS';
}

/**
 * Invalidate CNC cache if bundle verification fails.
 * Call this after a failed verification to clean up invalid entries.
 *
 * @param cacheKey - Cache key to invalidate
 * @returns true if cache entry was deleted
 */
export async function invalidateIfVerifyFailed(cacheKey: string): Promise<boolean> {
  const cncStore = getCncStore();
  const exists = await cncStore.has(cacheKey);
  if (!exists) return false;

  const result = await reverifyCncBundleFromIndexedDb(cacheKey);
  if (result.status !== 'PASS') {
    await cncStore.delete(cacheKey);
    return true;
  }
  return false;
}
